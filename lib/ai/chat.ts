import { chatComplete, type ChatMessage } from "@/lib/ai/llm"
import { aiToolDefinitions, runAiTool } from "@/lib/ai/tools"
import { appendMessages, getConversationForUser } from "@/lib/ai/conversations"
import type { AiMessage } from "@/lib/ai/types"
import { buildSystemPrompt, Role } from "@/lib/ai/system-prompt"
import logger from "@/lib/logger"

const MAX_TOOL_ROUNDS = 15
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

// Format tool results for human-readable summary
function formatToolResultSummary(toolName: string, result: unknown): string {
  if (toolName === "generate_payload") {
    const r = result as { buildId: string; preview: { name: string; type: string; status: string }; explanation: string }
    return `**Payload Build Started**

**Build ID**: \`${r.buildId}\`
**Name**: ${r.preview.name}
**Type**: ${r.preview.type.replace("_", " ").toUpperCase()}
**Status**: ${r.preview.status}

${r.explanation}

The build is now in progress. Use "Check status of ${r.buildId}" to see when it's ready for download.`
  }
  
  if (toolName === "list_payloads") {
    const r = result as { payloads: Array<{ id: string; name: string; type: string; status: string; sizeBytes?: number }>; total: number }
    if (r.payloads.length === 0) {
      return "No payload builds found. Generate one with: \"Build a Windows EXE payload\""
    }
    const list = r.payloads.map(p => 
      `- **${p.name}** (\`${p.id.slice(0, 8)}\`) — ${p.type.replace("_", " ").toUpperCase()} — ${p.status}${p.sizeBytes ? ` — ${(p.sizeBytes / 1024 / 1024).toFixed(1)} MB` : ""}`
    ).join("\n")
    return `**Your Payload Builds** (${r.total} total)\n\n${list}`
  }
  
  return `Tool \`${toolName}\` executed successfully.`
}

// Simple rule-based payload intent detection (used when LLM unavailable)
function detectPayloadIntent(message: string): { toolName: string; args: Record<string, unknown> } | null {
  const lower = message.toLowerCase()
  
  // List payloads intent
  if (lower.includes("list") && (lower.includes("payload") || lower.includes("build"))) {
    return { toolName: "list_payloads", args: { limit: 20 } }
  }
  
  // Generate payload intent
  if (lower.includes("generate") || lower.includes("build") || lower.includes("create")) {
    if (lower.includes("payload") || lower.includes("exe") || lower.includes("elf") || 
        lower.includes("powershell") || lower.includes("python") || lower.includes("script")) {
      return { toolName: "generate_payload", args: { description: message } }
    }
  }
  
  // Get payload status intent
  if ((lower.includes("status") || lower.includes("ready") || lower.includes("done")) && 
      (lower.includes("payload") || lower.includes("build"))) {
    return { toolName: "list_payloads", args: { limit: 10 } }
  }
  
  return null
}

const SYSTEM_PROMPT = buildSystemPrompt(Role.Chat)

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

    const llmMessages: ChatMessage[] = [{ role: "system", content: SYSTEM_PROMPT }]
    const providersUsed = new Set<string>()
    const modelsUsed = new Set<string>()

    const recentMessages = conversation.messages.slice(-40)
    for (const msg of recentMessages) {
      if (msg.role === "user" || msg.role === "assistant") {
        const chatMsg: ChatMessage = {
          role: msg.role,
          content: msg.content ?? "",
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
          content: msg.toolResult.content,
          tool_call_id: msg.toolResult.toolCallId,
        })
      }
    }

    llmMessages.push({ role: "user", content: userMessage })
    const tools = aiToolDefinitions()
    const newMessages: AiMessage[] = [userMsg]
    const turnSignal = AbortSignal.timeout(timeoutMs)

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
          const payloadIntent = detectPayloadIntent(userMessage)
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
              content: formatToolResultSummary(payloadIntent.toolName, toolResult),
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

          const toolExecutionPromises = result.toolCalls.map(async (call) => {
            await onProgress?.({
              type: "tool_start",
              toolName: call.function.name,
              toolArgs: call.function.arguments,
            })
            const toolStartedAt = Date.now()
            let parsedArgs: unknown = {}
            try {
              parsedArgs = call.function.arguments ? JSON.parse(call.function.arguments) : {}
            } catch {
              parsedArgs = {}
            }

            let resultContent: string
            let toolSuccess = true
            try {
              const toolResult = await runAiTool(call.function.name, parsedArgs, {
                signal: toolSignal(turnSignal, 90_000),
                invokerUid,
              })
              resultContent = JSON.stringify(toolResult)
              await onProgress?.({
                type: "tool_complete",
                toolName: call.function.name,
                toolResult: resultContent,
              })
            } catch (err) {
              toolSuccess = false
              resultContent = JSON.stringify({
                error: err instanceof Error ? err.message : String(err),
              })
              await onProgress?.({
                type: "tool_error",
                toolName: call.function.name,
                toolResult: resultContent,
              })
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
                content: resultContent,
                tool_call_id: call.id,
              },
            }
          })

          const toolResults = await Promise.all(toolExecutionPromises)

          for (const { toolMsg, llmMsg } of toolResults) {
            newMessages.push(toolMsg)
            llmMessages.push(llmMsg)
          }

          continue
        }

        const finalMsg: AiMessage = {
          role: "assistant",
          content: result.content,
          timestamp: Date.now(),
        }
        newMessages.push(finalMsg)
        terminatedWithFinalAnswer = true
        break
      }

      if (!terminatedWithFinalAnswer) {
        const maxRoundsMsg: AiMessage = {
          role: "assistant",
          content:
            "I reached the maximum number of tool-execution rounds for this request. Please refine the prompt or split this into smaller steps.",
          timestamp: Date.now(),
        }
        newMessages.push(maxRoundsMsg)
        await appendMessages(conversationId, newMessages)
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
            outcome: "max_rounds_exceeded",
          },
          "chat run reached max rounds",
        )
        return {
          messages: newMessages,
          error: "max tool rounds exceeded",
          errorCode: "max_rounds_exceeded",
        }
      }

      await appendMessages(conversationId, newMessages)
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
