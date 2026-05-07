import { chatComplete, type ChatMessage } from "@/lib/ai/llm"
import { aiToolDefinitions, runAiTool, AI_TOOL_NAMES, AI_TOOLS } from "@/lib/ai/tools"
import type { AgentTool } from "@/lib/ai/tool-types"
import { appendMessages, getConversationForUser } from "@/lib/ai/conversations"
import type { AiMessage } from "@/lib/ai/types"
import { buildSystemPrompt, Role, buildDynamicContext } from "@/lib/ai/system-prompt"
import { extractToolArgs, detectIntent } from "@/lib/ai/argument-extractor"
import { runReasoningChat, type ReasoningProgress } from "@/lib/ai/reasoning-orchestrator"
import { sanitizeMessageContent } from "@/lib/ai/robustness"
import logger from "@/lib/logger"
import { serverEnv } from "@/lib/env"

const MAX_TOOL_ROUNDS = 50
const DEFAULT_CHAT_TIMEOUT_MS = 120_000
const IDEMPOTENCY_TTL_MS = 10 * 60 * 1000

const log = logger.child({ module: "ai-chat" })

type RunChatErrorCode =
  | "not_found"
  | "timeout"
  | "llm_failed"
  | "max_rounds_exceeded"
  | "tool_failed"
  | "internal_error"

type ProgressCallback = (progress: {
  type: "step" | "tool_start" | "tool_complete" | "tool_error"
  step?: string
  toolName?: string
  toolArgs?: string
  toolResult?: string
}) => Promise<void> | void

type RunChatResult = {
  messages: AiMessage[]
  error?: string
  errorCode?: RunChatErrorCode
  fromIdempotency?: boolean
}

type RunChatOptions = {
  clientMessageId?: string
  requestId?: string
  timeoutMs?: number
}

type ToolExecutionSummary = {
  toolName: string
  success: boolean
  error?: string
  retried?: boolean
  retrySuccess?: boolean
}

type CompletionStatus = "COMPLETE" | "PARTIAL" | "BLOCKED" | "FAILED"

const idempotencyCache = new Map<string, { result: RunChatResult; timestamp: number }>()
const inFlightByKey = new Map<string, Promise<RunChatResult>>()

function isTimeoutError(err: unknown): boolean {
  if (!(err instanceof Error)) return false
  const msg = err.message.toLowerCase()
  return (
    err.name === "TimeoutError" ||
    msg.includes("timeout") ||
    msg.includes("aborted") ||
    msg.includes("aborterror")
  )
}

function toErrorString(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

function cacheGet(key: string): RunChatResult | null {
  const entry = idempotencyCache.get(key)
  if (!entry) return null
  if (Date.now() - entry.timestamp > IDEMPOTENCY_TTL_MS) {
    idempotencyCache.delete(key)
    return null
  }
  return entry.result
}

function cacheSetSuccess(key: string, result: RunChatResult): void {
  if (result.error) return
  idempotencyCache.set(key, { result, timestamp: Date.now() })
}

function toolSignal(base: AbortSignal, timeoutMs: number): AbortSignal {
  return AbortSignal.any([base, AbortSignal.timeout(timeoutMs)])
}

function truncateSummaryText(value: string, maxLength = 500): string {
  const trimmed = value.replace(/\s+/g, " ").trim()
  if (trimmed.length <= maxLength) return trimmed
  return `${trimmed.slice(0, maxLength - 1)}…`
}

function hasOperationalSections(content: string): boolean {
  const lower = content.toLowerCase()
  return (
    lower.includes("actions taken") &&
    lower.includes("errors") &&
    lower.includes("requirements") &&
    lower.includes("result") &&
    lower.includes("next steps")
  )
}

function formatList(items: string[]): string {
  return items.map((item) => `- ${item}`).join("\n")
}

function determineCompletionStatus(
  toolExecutions: ToolExecutionSummary[],
  errors: string[],
  resultText: string,
): CompletionStatus {
  if (errors.length > 0 && !toolExecutions.some((t) => t.success)) return "FAILED"
  if (errors.length > 0) return "PARTIAL"
  if (resultText.toLowerCase().includes("blocked") || resultText.toLowerCase().includes("waiting for"))
    return "BLOCKED"
  if (toolExecutions.length > 0 && toolExecutions.every((t) => t.success)) return "COMPLETE"
  if (toolExecutions.some((t) => t.success)) return "PARTIAL"
  return "COMPLETE"
}

function formatCompletionStatus(status: CompletionStatus, toolExecutions: ToolExecutionSummary[]): string {
  const total = toolExecutions.length
  const successful = toolExecutions.filter((t) => t.success).length
  const retried = toolExecutions.filter((t) => t.retried).length
  const retrySuccessful = toolExecutions.filter((t) => t.retrySuccess).length

  let pct = ""
  if (total > 0) {
    pct = ` — ${Math.round((successful / total) * 100)}% complete (${successful}/${total} tools)`
  }
  if (retried > 0) {
    pct += `, ${retrySuccessful}/${retried} auto-retries succeeded`
  }

  return `${status}${pct}`
}

function attemptAutoRetry(toolName: string, error: string, args: unknown): { shouldRetry: boolean; correctedArgs?: unknown; retryMessage?: string } {
  const errorLower = error.toLowerCase()

  // Missing required argument — try to add defaults
  if (errorLower.includes("required") && errorLower.includes("argument")) {
    // For deploy_node with missing args, use empty object to trigger defaults
    if (toolName === "deploy_node") {
      return { shouldRetry: true, correctedArgs: {}, retryMessage: "Retrying deploy_node with auto-selected defaults" }
    }
    // For generate_payload with missing description, try with user message as description
    if (toolName === "generate_payload") {
      return { shouldRetry: true, correctedArgs: { ...((typeof args === "object" && args !== null) ? args : {}), description: "auto-generated payload" }, retryMessage: "Retrying payload generation with default description" }
    }
  }

  // Invalid argument type — common for boolean/number coercion
  if (errorLower.includes("invalid") || errorLower.includes("expected")) {
    if (toolName === "create_node" && errorLower.includes("hostname")) {
      const argsObj = (typeof args === "object" && args !== null) ? args as Record<string, unknown> : {}
      return { shouldRetry: true, correctedArgs: { ...argsObj, hostname: argsObj.hostname || "auto-generated" }, retryMessage: "Retrying with auto-generated hostname" }
    }
  }

  // Not found errors — suggest search
  if (errorLower.includes("not found") || errorLower.includes("unknown")) {
    return { shouldRetry: false, retryMessage: `Resource not found. Use search_system to locate the correct ID before retrying.` }
  }

  return { shouldRetry: false }
}

function formatOperationalResponse(options: {
  resultText: string
  toolExecutions?: ToolExecutionSummary[]
  errors?: string[]
  requirements?: string[]
  nextSteps?: string[]
  complete?: boolean
}): string {
  const resultText = options.resultText.trim()
  const toolExecutions = options.toolExecutions ?? []
  const hasFailures =
    toolExecutions.some((tool) => !tool.success) || Boolean(options.errors?.length)
  if (resultText && hasOperationalSections(resultText) && !hasFailures) return resultText

  const toolErrors = toolExecutions
    .filter((tool) => !tool.success)
    .map((tool) => `${tool.toolName}: ${truncateSummaryText(tool.error ?? "failed")}${tool.retried ? " (auto-retry attempted)" : ""}`)
  const errors = [...toolErrors, ...(options.errors ?? []).map((error) => truncateSummaryText(error))]
  const completionStatus = determineCompletionStatus(toolExecutions, errors, resultText)

  const actions =
    toolExecutions.length > 0
      ? toolExecutions.map((tool) => {
          if (tool.retried && tool.retrySuccess) return `Ran ${tool.toolName} successfully after auto-retry.`
          if (tool.retried && !tool.retrySuccess) return `Ran ${tool.toolName} but auto-retry also failed.`
          return tool.success
            ? `Ran ${tool.toolName} successfully.`
            : `Attempted ${tool.toolName}, but it failed.`
        })
      : ["Answered directly without running tools."]

  const requirements =
    options.requirements && options.requirements.length > 0
      ? options.requirements
      : errors.length > 0
        ? ["Resolve the errors above or provide corrected inputs before continuing."]
        : ["None."]

  const nextSteps =
    options.nextSteps && options.nextSteps.length > 0
      ? options.nextSteps
      : completionStatus === "COMPLETE"
        ? ["No further action is required unless you want me to continue."]
        : completionStatus === "FAILED"
          ? ["Fix the listed errors and retry, or provide more specific requirements."]
          : completionStatus === "BLOCKED"
            ? ["Provide the missing requirement or approval to continue."]
            : ["Continue with the remaining steps or tell me which step to retry."]

  return [
    "Actions taken:",
    formatList(actions),
    "",
    "Errors:",
    formatList(errors.length > 0 ? errors : ["None."]),
    "",
    "Requirements:",
    formatList(requirements),
    "",
    "Result:",
    resultText || (completionStatus === "COMPLETE" ? "The request completed without additional output." : "The request did not complete."),
    "",
    "Completion status:",
    formatCompletionStatus(completionStatus, toolExecutions),
    "",
    "Next steps:",
    formatList(nextSteps),
  ].join("\n")
}

function parseToolArguments(rawArguments: string): { ok: true; value: unknown } | { ok: false; error: string } {
  if (!rawArguments) return { ok: true, value: {} }
  try {
    return { ok: true, value: JSON.parse(rawArguments) }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

function validateRequiredParameters(toolName: string, args: unknown): { ok: true } | { ok: false; error: string; missing: string[] } {
  const tool = (AI_TOOLS as Record<string, AgentTool<unknown, unknown>>)[toolName]
  if (!tool) {
    return { ok: false, error: `Tool ${toolName} not found`, missing: [] }
  }

  const jsonSchema = tool.jsonSchema
  if (!jsonSchema || !jsonSchema.required || jsonSchema.required.length === 0) {
    return { ok: true }
  }

  if (typeof args !== "object" || args === null) {
    return { ok: false, error: "Arguments must be an object", missing: jsonSchema.required }
  }

  const argsObj = args as Record<string, unknown>
  const missing: string[] = []

  for (const requiredParam of jsonSchema.required) {
    if (!(requiredParam in argsObj) || argsObj[requiredParam] === undefined || argsObj[requiredParam] === null) {
      missing.push(requiredParam)
    }
  }

  if (missing.length > 0) {
    return {
      ok: false,
      error: `Missing required parameter(s): ${missing.join(", ")}. You MUST provide these parameters when calling ${toolName}.`,
      missing,
    }
  }

  return { ok: true }
}

/**
 * DEPRECATED: injectMissingArgs has been replaced by extractToolArgs()
 * which uses AI-powered structured extraction instead of regex patterns.
 * 
 * This function is kept as a thin wrapper that delegates to the new
 * AI-powered extractor for backward compatibility during migration.
 */
async function injectMissingArgs(
  toolName: string,
  args: Record<string, unknown>,
  userMessage: string,
  signal?: AbortSignal,
): Promise<Record<string, unknown>> {
  const result = await extractToolArgs(toolName, args, userMessage, signal)
  return result.args
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return []
  const results = new Array<R>(items.length)
  let nextIndex = 0
  const workerCount = Math.min(Math.max(1, concurrency), items.length)

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < items.length) {
        const index = nextIndex
        nextIndex += 1
        results[index] = await mapper(items[index], index)
      }
    }),
  )

  return results
}

// Format tool results for human-readable summary
function formatToolResultSummary(toolName: string, result: unknown): string {
  if (toolName === "generate_payload") {
    const r = result as { buildId: string; preview: { name: string; type: string; status: string }; explanation: string }
    return [
      "Payload build started.",
      `Build ID: ${r.buildId}`,
      `Name: ${r.preview.name}`,
      `Type: ${r.preview.type.replace("_", " ").toUpperCase()}`,
      `Status: ${r.preview.status}`,
      r.explanation,
      `Use "Check status of ${r.buildId}" to see when it is ready for download.`,
    ].join("\n")
  }
  
  if (toolName === "list_payloads") {
    const r = result as { payloads: Array<{ id: string; name: string; type: string; status: string; sizeBytes?: number }>; total: number }
    if (r.payloads.length === 0) {
      return "No payload builds found. Generate one with: \"Build a Windows EXE payload\""
    }
    const list = r.payloads.map(p => 
      `- ${p.name} (${p.id.slice(0, 8)}) — ${p.type.replace("_", " ").toUpperCase()} — ${p.status}${p.sizeBytes ? ` — ${(p.sizeBytes / 1024 / 1024).toFixed(1)} MB` : ""}`
    ).join("\n")
    return `Payload builds (${r.total} total):\n${list}`
  }
  
  return `Tool ${toolName} executed successfully.`
}

// AI-powered intent detection (replaces regex-based detectPayloadIntent)
// Now handled by detectIntent() from argument-extractor.ts

async function getSystemPrompt(): Promise<string> {
  const basePrompt = buildSystemPrompt(Role.Chat)
  const context = await buildDynamicContext({
    toolListSummary: AI_TOOL_NAMES.join(", "),
    enableCache: true,
  })
  return `${basePrompt}\n\n${context}`
}

/**
 * Run a multi-turn chat with tool calling. Appends the user message and all
 * assistant/tool messages to the conversation in Firestore, then returns the
 * full list of new messages produced in this turn.
 */
export async function runChat(
  conversationId: string,
  userMessage: string,
  invokerUid: string,
  onProgress?: ProgressCallback,
  options: RunChatOptions = {},
): Promise<RunChatResult> {
  const adminIdSafe = invokerUid.slice(0, 8)
  const requestId = options.requestId ?? `chat-${Date.now()}`
  const timeoutMs = options.timeoutMs ?? DEFAULT_CHAT_TIMEOUT_MS
  const clientMessageId = options.clientMessageId ?? null
  const idempotencyKey = options.clientMessageId
    ? `${invokerUid}:${conversationId}:${options.clientMessageId}`
    : null

  const cachedResult = idempotencyKey ? cacheGet(idempotencyKey) : null
  if (cachedResult) {
    log.info(
      { requestId, conversationId, adminIdSafe, clientMessageId },
      "chat idempotency cache hit",
    )
    return { ...cachedResult, fromIdempotency: true }
  }

  if (idempotencyKey) {
    const inFlight = inFlightByKey.get(idempotencyKey)
    if (inFlight) {
      log.info(
        { requestId, conversationId, adminIdSafe, clientMessageId },
        "joining in-flight chat request",
      )
      const result = await inFlight
      return { ...result, fromIdempotency: true }
    }
  }

  const execute = async (): Promise<RunChatResult> => {
    const startedAt = Date.now()
    log.info({ requestId, conversationId, adminIdSafe, clientMessageId }, "chat run started")

    const conversation = await getConversationForUser(conversationId, invokerUid)
    if (!conversation) {
      return { messages: [], error: "conversation not found", errorCode: "not_found" }
    }

    const now = Date.now()
    const userMsg: AiMessage = {
      role: "user",
      content: userMessage,
      timestamp: now,
    }

    const systemPrompt = await getSystemPrompt()
    const llmMessages: ChatMessage[] = [{ role: "system", content: systemPrompt }]
    const providersUsed = new Set<string>()
    const modelsUsed = new Set<string>()

    const recentMessages = conversation.messages.slice(-40)
    for (const msg of recentMessages) {
      if (msg.role === "user" || msg.role === "assistant") {
        const chatMsg: ChatMessage = {
          role: msg.role,
          content: sanitizeMessageContent(msg.content ?? ""),
        }
        if (msg.toolCalls && msg.toolCalls.length > 0) {
          chatMsg.tool_calls = msg.toolCalls.map((tc) => ({
            id: tc.id,
            type: "function" as const,
            function: { name: tc.name, arguments: tc.arguments },
          }))
        }
        llmMessages.push(chatMsg)
      } else if (msg.role === "tool" && msg.toolResult) {
        llmMessages.push({
          role: "tool",
          content: sanitizeMessageContent(msg.toolResult.content),
          tool_call_id: msg.toolResult.toolCallId,
        })
      }
    }

    llmMessages.push({ role: "user", content: sanitizeMessageContent(userMessage) })
    const tools = aiToolDefinitions()
    const newMessages: AiMessage[] = [userMsg]
    const turnSignal = AbortSignal.timeout(timeoutMs)
    const maxConcurrentTools = serverEnv().SHADOWGROK_MAX_CONCURRENT_TOOLS
    const toolExecutions: ToolExecutionSummary[] = []

    // ============================================================
    // REASONING-FIRST PATH (primary)
    // Uses the reasoning orchestrator to classify, plan, execute, and verify
    // before falling back to the direct LLM tool-calling loop.
    // ============================================================
    const useReasoningFirst = serverEnv().AI_REASONING_FIRST
    
    if (useReasoningFirst) {
      try {
        await onProgress?.({ type: "step", step: "Reasoning about your request..." })

        const reasoningProgressAdapter = onProgress
          ? (progress: ReasoningProgress) => {
              // Adapt reasoning progress to the existing progress callback format
              switch (progress.phase) {
                case 'classify':
                  return onProgress({ type: 'step', step: progress.detail })
                case 'plan':
                  return onProgress({ type: 'step', step: progress.detail })
                case 'execute':
                  if (progress.plan) {
                    const currentStep = progress.plan.steps.find(
                      s => progress.detail.includes(s.tool)
                    )
                    if (currentStep) {
                      // Reconstruct args from argKeys/argValues (OpenAI-compatible schema)
                      const stepArgs: Record<string, unknown> = {}
                      if (currentStep.argKeys?.length && currentStep.argValues?.length) {
                        for (let i = 0; i < currentStep.argKeys.length; i++) {
                          stepArgs[currentStep.argKeys[i]] = currentStep.argValues[i] ?? ''
                        }
                      }
                      return onProgress({
                        type: 'tool_start',
                        toolName: currentStep.tool,
                        toolArgs: JSON.stringify(stepArgs),
                      })
                    }
                  }
                  return onProgress({ type: 'step', step: progress.detail })
                case 'verify':
                  return onProgress({ type: 'step', step: progress.detail })
                case 'report':
                  return onProgress({ type: 'step', step: progress.detail })
              }
            }
          : undefined

        const reasoningResult = await runReasoningChat(
          llmMessages,
          userMessage,
          {
            signal: turnSignal,
            invokerUid,
            onProgress: reasoningProgressAdapter,
            maxToolRounds: MAX_TOOL_ROUNDS,
          },
        )

        // Convert reasoning result messages to AiMessage format
        const reasoningAiMessages: AiMessage[] = reasoningResult.messages.map((msg) => {
          if (msg.role === 'assistant') {
            const aiMsg: AiMessage = {
              role: 'assistant',
              content: msg.content,
              timestamp: Date.now(),
            }
            if (msg.toolCalls?.length) {
              aiMsg.toolCalls = msg.toolCalls.map(tc => ({
                id: tc.id,
                name: tc.name,
                arguments: tc.arguments,
              }))
            }
            return aiMsg
          } else if (msg.role === 'tool' && msg.toolResult) {
            return {
              role: 'tool',
              content: null,
              toolResult: {
                toolCallId: msg.toolResult.toolCallId,
                name: msg.toolResult.name,
                content: msg.toolResult.content,
              },
              timestamp: Date.now(),
            }
          }
          // Skip system/user messages (already in conversation)
          return null
        }).filter((msg): msg is AiMessage => msg !== null)

        // Add all reasoning messages to the conversation
        newMessages.push(...reasoningAiMessages)
        await appendMessages(conversationId, newMessages)

        // Build tool execution summaries from reasoning results
        for (const msg of reasoningAiMessages) {
          if (msg.role === 'tool' && msg.toolResult) {
            const isSuccess = !msg.toolResult.content.includes('"error"')
            toolExecutions.push({
              toolName: msg.toolResult.name,
              success: isSuccess,
            })
          }
        }

        log.info(
          {
            requestId,
            conversationId,
            adminIdSafe,
            clientMessageId,
            durationMs: Date.now() - startedAt,
            taskType: reasoningResult.classification?.taskType,
            planSteps: reasoningResult.plan?.steps.length,
            verificationRecommendation: reasoningResult.verification?.recommendation,
            providers: [...reasoningResult.providersUsed],
            models: [...reasoningResult.modelsUsed],
            outcome: 'success',
          },
          'chat run completed via reasoning-first orchestrator',
        )

        const successResult: RunChatResult = { messages: newMessages }
        return successResult
      } catch (reasoningErr) {
        // If reasoning orchestrator fails, fall through to the direct LLM path
        log.warn(
          {
            requestId,
            error: reasoningErr instanceof Error ? reasoningErr.message : String(reasoningErr),
          },
          'Reasoning-first orchestrator failed, falling back to direct LLM path',
        )
        await onProgress?.({ type: "step", step: "Switching to direct processing..." })
      }
    }

    // ============================================================
    // DIRECT LLM PATH (fallback)
    // Original tool-calling loop — used when reasoning orchestrator fails
    // ============================================================
    try {
      await onProgress?.({ type: "step", step: "Thinking about your request..." })

      let terminatedWithFinalAnswer = false
      for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        let result: {
          content: string | null
          toolCalls: { id: string; type: "function"; function: { name: string; arguments: string } }[]
          finishReason: string | null
          _provider?: string
          _model?: string
        }

        try {
          result = await chatComplete({
            messages: llmMessages,
            tools,
            temperature: 0.3,
            useShadowGrok: true,
            enableFallback: true,
            signal: turnSignal,
          })
          if (result._provider) providersUsed.add(result._provider)
          if (result._model) modelsUsed.add(result._model)
        } catch (llmErr) {
          const payloadIntent = await detectIntent(userMessage, turnSignal)
          if (payloadIntent) {
            await onProgress?.({
              type: "tool_start",
              toolName: payloadIntent.toolName,
              toolArgs: JSON.stringify(payloadIntent.args),
            })

            const toolResult = await runAiTool(payloadIntent.toolName, payloadIntent.args, {
              signal: toolSignal(turnSignal, 60_000),
              invokerUid,
            })

            await onProgress?.({
              type: "tool_complete",
              toolName: payloadIntent.toolName,
              toolResult: JSON.stringify(toolResult),
            })

            const fallbackToolCallId = `fallback-${Date.now()}`
            const assistantMsg: AiMessage = {
              role: "assistant",
              content: `I'll help you with that. Executing ${payloadIntent.toolName}...`,
              toolCalls: [
                {
                  id: fallbackToolCallId,
                  name: payloadIntent.toolName,
                  arguments: JSON.stringify(payloadIntent.args),
                },
              ],
              timestamp: Date.now(),
            }
            newMessages.push(assistantMsg)

            const toolMsg: AiMessage = {
              role: "tool",
              content: null,
              toolResult: {
                toolCallId: fallbackToolCallId,
                name: payloadIntent.toolName,
                content: JSON.stringify(toolResult),
              },
              timestamp: Date.now(),
            }
            newMessages.push(toolMsg)

            const summaryMsg: AiMessage = {
              role: "assistant",
              content: formatOperationalResponse({
                resultText: formatToolResultSummary(payloadIntent.toolName, toolResult),
                toolExecutions: [{ toolName: payloadIntent.toolName, success: true }],
                complete: true,
              }),
              timestamp: Date.now(),
            }
            newMessages.push(summaryMsg)

            await appendMessages(conversationId, newMessages)
            const successResult: RunChatResult = { messages: newMessages }
            log.info(
              {
                requestId,
                conversationId,
                adminIdSafe,
                clientMessageId,
                durationMs: Date.now() - startedAt,
                rounds: round + 1,
                fallbackRuleUsed: payloadIntent.toolName,
                providers: ["rule-fallback"],
                models: [],
                outcome: "success",
              },
              "chat run completed via rule fallback",
            )
            return successResult
          }

          if (isTimeoutError(llmErr)) {
            throw new Error("chat request timed out")
          }
          throw llmErr
        }

        if (result.toolCalls.length > 0) {
          const assistantMsg: AiMessage = {
            role: "assistant",
            content: result.content,
            toolCalls: result.toolCalls.map((tc) => ({
              id: tc.id,
              name: tc.function.name,
              arguments: tc.function.arguments,
            })),
            timestamp: Date.now(),
          }
          newMessages.push(assistantMsg)
          llmMessages.push({
            role: "assistant",
            content: result.content ?? "",
            tool_calls: result.toolCalls,
          })

          const toolResults = await mapWithConcurrency(result.toolCalls, maxConcurrentTools, async (call) => {
            await onProgress?.({
              type: "tool_start",
              toolName: call.function.name,
              toolArgs: call.function.arguments,
            })
            const toolStartedAt = Date.now()
            const parsedArgs = parseToolArguments(call.function.arguments)

            let resultContent: string = ''
            let toolSuccess = true
            let retried = false
            let retrySuccess = false

            async function executeTool(args: unknown): Promise<string> {
              const toolResult = await runAiTool(call.function.name, args, {
                signal: toolSignal(turnSignal, 90_000),
                invokerUid,
              })
              return JSON.stringify(toolResult)
            }

            if (!parsedArgs.ok) {
              toolSuccess = false
              resultContent = JSON.stringify({
                error: `invalid JSON arguments for ${call.function.name}: ${parsedArgs.error}`,
              })
              await onProgress?.({
                type: "tool_error",
                toolName: call.function.name,
                toolResult: resultContent,
              })
            } else {
              // Validate required parameters — try to inject missing args from user message first
              let effectiveArgs = parsedArgs.value as Record<string, unknown>
              const preValidation = validateRequiredParameters(call.function.name, effectiveArgs)
              if (!preValidation.ok && preValidation.missing.length > 0) {
                // Try to inject missing arguments from the user message
                const injectedArgs = await injectMissingArgs(call.function.name, effectiveArgs, userMessage, turnSignal)
                const postValidation = validateRequiredParameters(call.function.name, injectedArgs)
                if (postValidation.ok) {
                  // Injection succeeded — use the injected args
                  log.info(
                    { requestId, toolName: call.function.name, missingParams: preValidation.missing },
                    "injected missing tool args from user message",
                  )
                  effectiveArgs = injectedArgs
                } else {
                  // Injection didn't help — report the error
                  toolSuccess = false
                  resultContent = JSON.stringify({
                    error: postValidation.error,
                    missing: postValidation.missing,
                  })
                  await onProgress?.({
                    type: "tool_error",
                    toolName: call.function.name,
                    toolResult: resultContent,
                  })
                }
              }

              // Only execute if we have valid args (no validation error set above)
              if (toolSuccess) {
                try {
                  resultContent = await executeTool(effectiveArgs)
                  await onProgress?.({
                    type: "tool_complete",
                    toolName: call.function.name,
                    toolResult: resultContent,
                  })
                } catch (err) {
                  const errorMsg = err instanceof Error ? err.message : String(err)
                  toolSuccess = false
                  resultContent = JSON.stringify({ error: errorMsg })

                  // Attempt auto-retry for recoverable errors
                  const retryDecision = attemptAutoRetry(call.function.name, errorMsg, parsedArgs.value)
                  if (retryDecision.shouldRetry && retryDecision.correctedArgs !== undefined) {
                    retried = true
                    log.info(
                      { requestId, toolName: call.function.name, reason: retryDecision.retryMessage },
                      "auto-retrying tool execution",
                    )
                    try {
                      resultContent = await executeTool(retryDecision.correctedArgs)
                      toolSuccess = true
                      retrySuccess = true
                      await onProgress?.({
                        type: "tool_complete",
                        toolName: call.function.name,
                        toolResult: resultContent,
                      })
                    } catch (retryErr) {
                      retrySuccess = false
                      resultContent = JSON.stringify({
                        error: err instanceof Error ? err.message : String(err),
                        retryError: retryErr instanceof Error ? retryErr.message : String(retryErr),
                      })
                      await onProgress?.({
                        type: "tool_error",
                        toolName: call.function.name,
                        toolResult: resultContent,
                      })
                    }
                  } else {
                    await onProgress?.({
                      type: "tool_error",
                      toolName: call.function.name,
                      toolResult: resultContent,
                    })
                  }
                }
              }
            }

            log.info(
              {
                requestId,
                conversationId,
                adminIdSafe,
                clientMessageId,
                toolName: call.function.name,
                durationMs: Date.now() - toolStartedAt,
                success: toolSuccess,
                retried,
                retrySuccess,
              },
              "chat tool execution",
            )

            return {
              toolMsg: {
                role: "tool" as const,
                content: null,
                toolResult: {
                  toolCallId: call.id,
                  name: call.function.name,
                  content: resultContent,
                },
                timestamp: Date.now(),
              },
              llmMsg: {
                role: "tool" as const,
                content: sanitizeMessageContent(resultContent),
                tool_call_id: call.id,
              },
              summary: {
                toolName: call.function.name,
                success: toolSuccess,
                error: toolSuccess ? undefined : JSON.parse(resultContent).error,
                retried,
                retrySuccess,
              } satisfies ToolExecutionSummary,
            }
          })

          for (const { toolMsg, llmMsg, summary } of toolResults) {
            newMessages.push(toolMsg)
            llmMessages.push(llmMsg)
            toolExecutions.push(summary)
          }

          continue
        }

        const finalMsg: AiMessage = {
          role: "assistant",
          content: formatOperationalResponse({
            resultText: result.content ?? "",
            toolExecutions,
            complete: !toolExecutions.some((tool) => !tool.success),
          }),
          timestamp: Date.now(),
        }
        newMessages.push(finalMsg)
        terminatedWithFinalAnswer = true
        break
      }

      if (!terminatedWithFinalAnswer) {
        const maxRoundsMsg: AiMessage = {
          role: "assistant",
          content: formatOperationalResponse({
            resultText: `Stopped after ${MAX_TOOL_ROUNDS} tool rounds without reaching a final answer.`,
            toolExecutions,
            errors: ["Maximum tool rounds exceeded."],
            requirements: ["Narrow the request or choose fewer tool actions before retrying."],
            nextSteps: ["Tell me the specific action you want me to retry or continue with."],
            complete: false,
          }),
          timestamp: Date.now(),
        }
        newMessages.push(maxRoundsMsg)
        await appendMessages(conversationId, newMessages)
        const completionStatus = determineCompletionStatus(
          toolExecutions,
          ["Maximum tool rounds exceeded."],
          maxRoundsMsg.content ?? "",
        )
        log.warn(
          {
            requestId,
            conversationId,
            adminIdSafe,
            clientMessageId,
            durationMs: Date.now() - startedAt,
            rounds: MAX_TOOL_ROUNDS,
            providers: [...providersUsed],
            models: [...modelsUsed],
            completionStatus,
            errorCode: "max_rounds_exceeded",
            outcome: "error",
          },
          "chat run stopped after max tool rounds",
        )
        return {
          messages: newMessages,
          error: "maximum tool rounds exceeded",
          errorCode: "max_rounds_exceeded",
        }
      }

      await appendMessages(conversationId, newMessages)
      const completionStatus = determineCompletionStatus(
        toolExecutions,
        [],
        newMessages[newMessages.length - 1]?.content ?? "",
      )
      const successResult: RunChatResult = { messages: newMessages }
      log.info(
        {
          requestId,
          conversationId,
          adminIdSafe,
          clientMessageId,
          durationMs: Date.now() - startedAt,
          rounds: Math.min(MAX_TOOL_ROUNDS, newMessages.length),
          providers: [...providersUsed],
          models: [...modelsUsed],
          completionStatus,
          toolExecutions: toolExecutions.map((t) => ({
            name: t.toolName,
            success: t.success,
            retried: t.retried,
            retrySuccess: t.retrySuccess,
          })),
          outcome: "success",
        },
        "chat run completed",
      )
      return successResult
    } catch (err) {
      const errorText = toErrorString(err)
      const errorCode: RunChatErrorCode = isTimeoutError(err)
        ? "timeout"
        : errorText.includes("Failed to complete chat request")
          ? "llm_failed"
          : "internal_error"

      const errorRequirements =
        errorCode === "timeout"
          ? ["Retry with a narrower request or fewer tool actions."]
          : errorCode === "llm_failed"
            ? ["Check AI provider configuration, API keys, rate limits, or fallback provider availability."]
            : ["Review server logs for the internal error details before retrying."]

      const completionStatus = determineCompletionStatus(toolExecutions, [errorText], "")
      const errorMsg: AiMessage = {
        role: "assistant",
        content: formatOperationalResponse({
          resultText: "The request failed before a final answer was produced.",
          toolExecutions,
          errors: [errorText],
          requirements: errorRequirements,
          nextSteps: ["Fix the listed requirement, then ask me to retry the request."],
          complete: false,
        }),
        timestamp: Date.now(),
      }
      newMessages.push(errorMsg)

      if (newMessages.length > 0) {
        await appendMessages(conversationId, newMessages).catch(() => {})
      }

      log.error(
        {
          requestId,
          conversationId,
          adminIdSafe,
          clientMessageId,
          durationMs: Date.now() - startedAt,
          error: errorText,
          errorCode,
          completionStatus,
          providers: [...providersUsed],
          models: [...modelsUsed],
          outcome: "error",
        },
        "chat run failed",
      )

      return {
        messages: newMessages,
        error:
          errorCode === "timeout"
            ? "chat request timed out"
            : errorCode === "llm_failed"
              ? "language model request failed"
              : "chat request failed",
        errorCode,
      }
    }
  }

  if (!idempotencyKey) {
    return execute()
  }

  const execPromise = execute().finally(() => {
    inFlightByKey.delete(idempotencyKey)
  })
  inFlightByKey.set(idempotencyKey, execPromise)

  const result = await execPromise
  cacheSetSuccess(idempotencyKey, result)
  return result
}
