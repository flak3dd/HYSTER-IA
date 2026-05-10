/**
 * Advanced LLM Reasoning Orchestrator
 *
 * Replaces static pre-planning with dynamic, LLM-driven reasoning:
 *
 * 1. RECEIVE  — Accept user message
 * 2. REASON   — LLM classifies intent and assesses requirements
 * 3. EXECUTE  — Iterative LLM tool calling with result feedback
 * 4. VERIFY   — LLM validates completion against original goal
 * 5. REPORT   — Synthesize final response with reasoning trace
 *
 * Key change: No static arg pre-planning. The LLM dynamically decides
 * tool arguments based on conversation context and previous results.
 */

import { generateObject } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { createOpenAI } from '@ai-sdk/openai'
import { z } from 'zod'
import { chatComplete, type ChatMessage } from '@/lib/ai/llm'
import { aiToolDefinitions, runAiTool, AI_TOOL_NAMES, AI_TOOLS } from '@/lib/ai/tools'
import type { AgentTool } from '@/lib/ai/tool-types'
import { getExtractorModel } from '@/lib/ai/reasoning/extractor-provider'
import logger from '@/lib/logger'
import { sanitizeMessageContent } from '@/lib/ai/robustness'
import { serverEnv } from '@/lib/env'
import {
  createOpenRouterOpenAICompat,
  getOpenRouterModelId,
  hasOpenRouterKey,
} from '@/lib/ai/openrouter/stack'

const log = logger.child({ module: 'ai-reasoning-orchestrator' })

// ============================================================
// MODEL PROVIDER - Anthropic Primary
// ============================================================

function getReasoningModel() {
  const env = serverEnv()
  if (hasOpenRouterKey(env)) {
    const client = createOpenRouterOpenAICompat(env)
    return client(getOpenRouterModelId(env, 'reasoning_json'))
  }
  if (env.ANTHROPIC_API_KEY) {
    return anthropic(env.ANTHROPIC_MODEL || 'claude-sonnet-4-5-20251001')
  }
  if (env.XAI_API_KEY) {
    const client = createOpenAI({
      baseURL: env.XAI_BASE_URL,
      apiKey: env.XAI_API_KEY,
    })
    return client(env.XAI_MODEL)
  }
  return getExtractorModel()
}

function safeStringifyForContent(value: unknown): string {
  if (typeof value === 'string') {
    return sanitizeMessageContent(value)
  }
  try {
    return sanitizeMessageContent(JSON.stringify(value))
  } catch {
    return sanitizeMessageContent(String(value))
  }
}

// ============================================================
// REASONING SCHEMAS
// ============================================================

const TaskClassificationSchema = z.object({
  taskType: z.enum([
    'simple_query',
    'action_required',
    'ambiguous',
    'destructive',
  ]).describe('Classification of the task'),
  confidence: z.number().min(0).max(1).describe('Confidence in classification'),
  reasoning: z.string().describe('Why this classification was chosen'),
  likelyTools: z.array(z.string()).describe('Tools likely needed'),
  clarificationNeeded: z.array(z.string()).describe('Questions if ambiguous'),
  riskLevel: z.enum(['none', 'low', 'medium', 'high', 'critical']).describe('Risk level'),
})

const VerificationResultSchema = z.object({
  isComplete: z.boolean().describe('Whether the task is fully complete'),
  allToolsSucceeded: z.boolean().describe('Whether all tool calls succeeded'),
  contradictions: z.array(z.string()).describe('Any contradictions found'),
  missingInformation: z.array(z.string()).describe('Information still needed'),
  confidence: z.number().min(0).max(1).describe('Confidence in results'),
  recommendation: z.enum(['accept', 'retry_failed', 'gather_more', 'ask_user']).describe('Next step'),
})

// ============================================================
// EXPORTED TYPES
// ============================================================

export type TaskClassification = z.infer<typeof TaskClassificationSchema>
export type VerificationResult = z.infer<typeof VerificationResultSchema>
export type ReasoningPhase = 'classify' | 'execute' | 'verify' | 'report'

export type ReasoningProgress = {
  phase: ReasoningPhase
  detail: string
  classification?: TaskClassification
  verification?: VerificationResult
}

export type ReasoningProgressCallback = (progress: ReasoningProgress) => Promise<void> | void

// ============================================================
// MAIN ORCHESTRATOR
// ============================================================

/**
 * Run a reasoning-first chat interaction using advanced LLM reasoning.
 *
 * Key architectural changes from previous version:
 * - No static pre-planning with argKeys/argValues
 * - LLM dynamically decides tool calls based on context
 * - Tool results fed back to LLM for next-step reasoning
 * - Natural parameter chaining (e.g., deploymentId from deploy_node → get_deployment_status)
 */
export async function runReasoningChat(
  conversationMessages: ChatMessage[],
  userMessage: string,
  options: {
    signal?: AbortSignal
    invokerUid?: string
    onProgress?: ReasoningProgressCallback
    maxToolRounds?: number
  } = {},
): Promise<{
  messages: Array<{
    role: 'system' | 'user' | 'assistant' | 'tool'
    content: string | null
    toolCalls?: Array<{ id: string; name: string; arguments: string }>
    toolResult?: { toolCallId: string; name: string; content: string }
  }>
  classification: TaskClassification
  verification: VerificationResult | null
  providersUsed: string[]
  modelsUsed: string[]
}> {
  const { signal, invokerUid, onProgress, maxToolRounds = 15 } = options
  const providersUsed = new Set<string>()
  const modelsUsed = new Set<string>()
  const resultMessages: Array<{
    role: 'system' | 'user' | 'assistant' | 'tool'
    content: string | null
    toolCalls?: Array<{ id: string; name: string; arguments: string }>
    toolResult?: { toolCallId: string; name: string; content: string }
  }> = []

  // ============================================================
  // PHASE 1: CLASSIFY
  // ============================================================
  await onProgress?.({ phase: 'classify', detail: 'Analyzing your request...' })

  const classification = await classifyTask(userMessage, conversationMessages, signal)

  await onProgress?.({
    phase: 'classify',
    detail: `Task classified: ${classification.taskType} (${Math.round(classification.confidence * 100)}% confidence)`,
    classification,
  })

  log.info({
    taskType: classification.taskType,
    confidence: classification.confidence,
    likelyTools: classification.likelyTools,
    riskLevel: classification.riskLevel,
  }, 'Task classified')

  // Handle simple queries — no tools needed
  if (classification.taskType === 'simple_query') {
    const llmResult = await chatComplete({
      messages: conversationMessages,
      temperature: 0.3,
      signal,
    })
    if (llmResult._provider) providersUsed.add(llmResult._provider)
    if (llmResult._model) modelsUsed.add(llmResult._model)

    resultMessages.push({ role: 'assistant', content: llmResult.content ?? '' })

    return {
      messages: resultMessages,
      classification,
      verification: null,
      providersUsed: [...providersUsed],
      modelsUsed: [...modelsUsed],
    }
  }

  // Handle ambiguous requests
  if (classification.taskType === 'ambiguous' && classification.clarificationNeeded.length > 0) {
    const clarificationText = `I need some clarification before proceeding:\n\n${
      classification.clarificationNeeded.map((q, i) => `${i + 1}. ${q}`).join('\n')
    }`
    resultMessages.push({ role: 'assistant', content: clarificationText })

    return {
      messages: resultMessages,
      classification,
      verification: null,
      providersUsed: [...providersUsed],
      modelsUsed: [...modelsUsed],
    }
  }

  // ============================================================
  // PHASE 2: DYNAMIC EXECUTION WITH LLM REASONING
  // ============================================================
  await onProgress?.({ phase: 'execute', detail: 'Starting dynamic execution with LLM reasoning...' })

  // Build system prompt for reasoning agent
  const systemPrompt = buildReasoningSystemPrompt(classification)

  // Initialize conversation for this reasoning session
  const reasoningMessages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: `User request: "${userMessage}"\n\nStart by analyzing what needs to be done, then use the available tools to accomplish the task. After each tool result, decide the next step.` },
  ]

  const toolExecutions: Array<{ toolName: string; success: boolean; result?: unknown; error?: string }> = []
  let rounds = 0

  while (rounds < maxToolRounds) {
    if (signal?.aborted) break
    rounds++

    await onProgress?.({
      phase: 'execute',
      detail: `Round ${rounds}: Asking LLM to reason next steps...`,
    })

    // Get tool definitions for this round
    const tools = aiToolDefinitions()

    // Call LLM with tools to get its reasoning and next action
    const llmResponse = await chatComplete({
      messages: reasoningMessages,
      tools,
      temperature: 0.2,
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(90_000)]) : AbortSignal.timeout(90_000),
    })

    if (llmResponse._provider) providersUsed.add(llmResponse._provider)
    if (llmResponse._model) modelsUsed.add(llmResponse._model)

    // Check if LLM wants to use a tool
    const toolCalls = llmResponse.toolCalls

    if (!toolCalls || toolCalls.length === 0) {
      // No tool call - LLM provided final answer or reasoning
      const content = llmResponse.content || 'No response from LLM'

      resultMessages.push({
        role: 'assistant',
        content: content,
      })

      reasoningMessages.push({ role: 'assistant', content })

      // Check if task appears complete
      if (content.toLowerCase().includes('complete') ||
          content.toLowerCase().includes('finished') ||
          content.toLowerCase().includes('done') ||
          content.toLowerCase().includes('deployed') ||
          toolExecutions.length > 0) {
        break
      }

      // If no tools executed yet and no tool call, we might be stuck
      if (toolExecutions.length === 0 && rounds > 3) {
        break
      }
    } else {
      // Process each tool call (typically just one in reasoning mode)
      for (const call of toolCalls) {
        const toolName = call.function.name
        let args: Record<string, unknown> = {}
        try {
          args = JSON.parse(call.function.arguments)
        } catch {
          args = { _raw: call.function.arguments }
        }

        await onProgress?.({
          phase: 'execute',
          detail: `Executing ${toolName}...`,
        })

        log.info({ round: rounds, tool: toolName, args }, 'LLM requested tool execution')

        // Execute the tool
        let toolResult: unknown
        let toolSuccess = false
        let toolError: string | undefined

        try {
          toolResult = await runAiTool(toolName, args, {
            signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(90_000)]) : AbortSignal.timeout(90_000),
            invokerUid,
          })
          toolSuccess = true

          // Track for result messages
          const toolCallId = `reasoning-${rounds}-${Date.now()}`
          resultMessages.push({
            role: 'assistant',
            content: null,
            toolCalls: [{ id: toolCallId, name: toolName, arguments: call.function.arguments }],
          })
          resultMessages.push({
            role: 'tool',
            content: null,
            toolResult: {
              toolCallId,
              name: toolName,
              content: safeStringifyForContent(toolResult),
            },
          })
        } catch (err) {
          toolError = err instanceof Error ? err.message : String(err)
          toolSuccess = false
          toolResult = { error: toolError }

          const toolCallId = `reasoning-${rounds}-${Date.now()}`
          resultMessages.push({
            role: 'assistant',
            content: null,
            toolCalls: [{ id: toolCallId, name: toolName, arguments: call.function.arguments }],
          })
          resultMessages.push({
            role: 'tool',
            content: null,
            toolResult: {
              toolCallId,
              name: toolName,
              content: safeStringifyForContent({ error: toolError }),
            },
          })
        }

        toolExecutions.push({ toolName, success: toolSuccess, result: toolResult, error: toolError })

        log.info({ round: rounds, tool: toolName, success: toolSuccess }, 'Tool execution completed')

        // Add assistant's tool request to reasoning context
        reasoningMessages.push({
          role: 'assistant',
          content: llmResponse.content || '',
          tool_calls: toolCalls,
        })

        // Add tool result to reasoning context - CRITICAL for parameter chaining
        reasoningMessages.push({
          role: 'tool',
          content: safeStringifyForContent(toolResult),
        })
      }

      // Add summary prompt to help LLM decide next step
      reasoningMessages.push({
        role: 'user',
        content: `Based on the tool results above, decide: continue with another tool, or provide final response if complete.`,
      })
    }
  }

  // ============================================================
  // PHASE 3: VERIFY
  // ============================================================
  await onProgress?.({ phase: 'verify', detail: 'Verifying completion...' })

  const verification = await verifyWithLLM(
    userMessage,
    toolExecutions,
    reasoningMessages,
    signal,
  )

  await onProgress?.({
    phase: 'verify',
    detail: `Verification: ${verification.recommendation} (${Math.round(verification.confidence * 100)}% confidence)`,
    verification,
  })

  // ============================================================
  // PHASE 4: REPORT
  // ============================================================
  await onProgress?.({ phase: 'report', detail: 'Generating final response...' })

  // Generate final operational response
  const finalResponse = await generateFinalResponse(
    userMessage,
    toolExecutions,
    verification,
    reasoningMessages,
    signal,
  )

  if (finalResponse._provider) providersUsed.add(finalResponse._provider)
  if (finalResponse._model) modelsUsed.add(finalResponse._model)

  // Only add if we haven't already captured a final assistant message
  const lastResultMsg = resultMessages[resultMessages.length - 1]
  if (!lastResultMsg || lastResultMsg.role !== 'assistant' || !lastResultMsg.content) {
    resultMessages.push({
      role: 'assistant',
      content: finalResponse.content,
    })
  }

  return {
    messages: resultMessages,
    classification,
    verification,
    providersUsed: [...providersUsed],
    modelsUsed: [...modelsUsed],
  }
}

// ============================================================
// HELPER FUNCTIONS
// ============================================================

function buildReasoningSystemPrompt(classification: TaskClassification): string {
  const toolDescriptions = Object.entries(AI_TOOLS as Record<string, AgentTool<unknown, unknown>>)
    .map(([name, tool]) => `- ${name}: ${tool.description}`)
    .join('\n')

  return `You are an expert AI assistant managing Hysteria2 C2 infrastructure.

AVAILABLE TOOLS:
${toolDescriptions}

TASK CONTEXT:
- Task type: ${classification.taskType}
- Risk level: ${classification.riskLevel}
- Likely tools needed: ${classification.likelyTools.join(', ') || 'unknown'}

REASONING INSTRUCTIONS:
1. Analyze the user's request and available tools
2. Determine the sequence of tool calls needed to accomplish the task
3. When calling tools, extract arguments from the user's request or previous tool results
4. For dependent operations (e.g., deploy followed by status check):
   - Call the first tool (e.g., deploy_node)
   - Wait for its result
   - Extract key values (e.g., deploymentId) from the result
   - Use those values in subsequent tool calls (e.g., get_deployment_status with deploymentId)
5. Continue until the task is complete
6. Provide a clear summary of what was accomplished

PARAMETER CHAINING GUIDE:
- deploy_node returns: { deploymentId, status, message, defaultsApplied }
- get_deployment_status requires: { deploymentId }
- Always extract deploymentId from deploy_node result before calling get_deployment_status

RULES:
- Only call tools when necessary
- Use exact tool names and valid arguments
- Wait for tool results before deciding next steps
- If a tool fails, decide whether to retry, try alternative, or report failure`
}

async function classifyTask(
  userMessage: string,
  conversationMessages: ChatMessage[],
  signal?: AbortSignal,
): Promise<TaskClassification> {
  try {
    const recentContext = conversationMessages
      .slice(-4)
      .map(m => `${m.role}: ${m.content?.slice(0, 150) ?? ''}`)
      .join('\n')

    const result = await generateObject({
      model: getReasoningModel(),
      schema: TaskClassificationSchema,
      system: `You are a task classifier for an AI assistant that manages Hysteria2 C2 infrastructure.

Available tools: ${AI_TOOL_NAMES.join(', ')}

Classify the user's request:
- simple_query: Direct question, no tools needed
- action_required: Requires tool calls to complete (deploy, configure, query, etc.)
- ambiguous: Missing required information (provider, region, etc.)
- destructive: Destructive action needing confirmation

Rules:
- If provider/region not specified for deployment, classify as ambiguous
- Deletion/stopping/wiping = destructive
- Prefer action_required when tools might help`,
      prompt: `Recent conversation:\n${recentContext}\n\nUser's latest message: "${userMessage}"`,
      temperature: 0,
      abortSignal: signal,
    })

    return result.object
  } catch (err) {
    log.warn({ error: err instanceof Error ? err.message : String(err) }, 'Classification failed, using fallback')
    return {
      taskType: 'action_required',
      confidence: 0.7,
      reasoning: 'Classification failed, assuming action required',
      likelyTools: [],
      clarificationNeeded: [],
      riskLevel: 'none',
    }
  }
}

async function verifyWithLLM(
  userMessage: string,
  toolExecutions: Array<{ toolName: string; success: boolean; result?: unknown; error?: string }>,
  reasoningMessages: Array<{ role: string; content: string }>,
  signal?: AbortSignal,
): Promise<VerificationResult> {
  try {
    const executionSummary = toolExecutions
      .map((t, i) => `${i + 1}. ${t.toolName}: ${t.success ? 'SUCCESS' : `FAILED: ${t.error}`}`)
      .join('\n')

    const result = await generateObject({
      model: getReasoningModel(),
      schema: VerificationResultSchema,
      system: 'You verify task completion. Analyze execution results against the original goal.',
      prompt: `Original request: "${userMessage}"

Tool executions:
${executionSummary}

Was the task completed successfully? Are there any contradictions or missing steps?`,
      temperature: 0,
      abortSignal: signal,
    })

    return result.object
  } catch (err) {
    log.warn({ error: err instanceof Error ? err.message : String(err) }, 'LLM verification failed')

    const successful = toolExecutions.filter(t => t.success).length
    const total = toolExecutions.length

    return {
      isComplete: successful === total && total > 0,
      allToolsSucceeded: successful === total,
      contradictions: [],
      missingInformation: [],
      confidence: total > 0 ? successful / total : 0,
      recommendation: successful === total ? 'accept' : 'retry_failed',
    }
  }
}

async function generateFinalResponse(
  userMessage: string,
  toolExecutions: Array<{ toolName: string; success: boolean; result?: unknown; error?: string }>,
  verification: VerificationResult,
  reasoningMessages: ChatMessage[],
  signal?: AbortSignal,
): Promise<{ content: string; _provider?: string; _model?: string }> {
  try {
    // Build execution summary
    const actions = toolExecutions.map(t =>
      t.success
        ? `${t.toolName}: SUCCESS`
        : `${t.toolName}: FAILED - ${t.error}`,
    )

    const results = toolExecutions
      .filter(t => t.success && t.result)
      .map(t => {
        const resultStr = typeof t.result === 'object'
          ? JSON.stringify(t.result).slice(0, 300)
          : String(t.result).slice(0, 300)
        return `${t.toolName}: ${resultStr}`
      })
      .join('\n\n')

    const completionStatus = verification.isComplete
      ? 'COMPLETE'
      : verification.allToolsSucceeded
        ? 'PARTIAL'
        : 'FAILED'

    const systemPrompt = `You are an AI assistant reporting on completed infrastructure operations.

Format your response with:
- Actions taken: List of what was done
- Errors: Any failures (or "None")
- Requirements: Any missing inputs (or "None")
- Result: The actual outcome with specific data
- Completion status: ${completionStatus}
- Next steps: What to do next

Be specific, actionable, and professional.`

    const userPrompt = `Original request: "${userMessage}"

Actions executed:
${actions.join('\n') || 'None'}

Results:
${results || 'No results'}

Verification: ${verification.isComplete ? 'COMPLETE' : 'INCOMPLETE'} - ${verification.recommendation}
${verification.missingInformation.length > 0 ? `Missing: ${verification.missingInformation.join(', ')}` : ''}

Provide a clear operational response.`

    const result = await chatComplete({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.3,
      signal,
    })

    return {
      content: result.content || 'No response generated',
      _provider: result._provider,
      _model: result._model,
    }
  } catch (err) {
    log.warn({ error: err instanceof Error ? err.message : String(err) }, 'Final response generation failed')

    // Fallback summary
    const successCount = toolExecutions.filter(t => t.success).length
    return {
      content: `Actions: ${successCount}/${toolExecutions.length} tools executed successfully.
Verification: ${verification.recommendation}
Completion: ${verification.isComplete ? 'COMPLETE' : 'INCOMPLETE'}`,
    }
  }
}
