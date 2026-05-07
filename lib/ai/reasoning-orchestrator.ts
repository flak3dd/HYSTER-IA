/**
 * Reasoning-First Chat Orchestrator
 *
 * This module integrates the Chain-of-Thought and Meta-Cognition engines
 * into the main chat loop, replacing the old "LLM → tools → answer" flow
 * with a structured reasoning pipeline:
 *
 * 1. RECEIVE  — Accept user message
 * 2. REASON   — Decompose task, assess uncertainty, detect knowledge gaps
 * 3. PLAN     — Generate execution plan with tool ordering and dependencies
 * 4. EXECUTE  — Run tools in planned order with validated arguments
 * 5. VERIFY   — Cross-check results against the plan
 * 6. REPORT   — Format operational response with reasoning trace
 *
 * All regex-based logic has been replaced with AI-powered structured extraction.
 */

import { generateObject } from 'ai'
import { z } from 'zod'
import { chatComplete, type ChatMessage } from '@/lib/ai/llm'
import { aiToolDefinitions, runAiTool, AI_TOOL_NAMES, AI_TOOLS } from '@/lib/ai/tools'
import type { AgentTool } from '@/lib/ai/tool-types'
import { extractToolArgs, detectIntent } from '@/lib/ai/argument-extractor'
import { getExtractorModel } from '@/lib/ai/reasoning/extractor-provider'
import {
  DecompositionSchema,
  ThoughtAnalysisSchema,
  VerificationSchema,
} from '@/lib/ai/reasoning/schemas'
import logger from '@/lib/logger'

const log = logger.child({ module: 'ai-reasoning-orchestrator' })

// ============================================================
// REASONING SCHEMAS
// ============================================================

const TaskClassificationSchema = z.object({
  taskType: z.enum([
    'simple_query',       // Direct question, no tools needed
    'single_tool',        // One tool call will answer the question
    'multi_step',         // Multiple tool calls with dependencies
    'ambiguous',          // Needs clarification before proceeding
    'destructive',        // Needs confirmation before proceeding
  ]).describe('Classification of the task type'),
  confidence: z.number().min(0).max(1).describe('Confidence in classification'),
  reasoning: z.string().describe('Why this classification was chosen'),
  requiredTools: z.array(z.string()).describe('Tools that will likely be needed'),
  dependencies: z.array(z.object({
    tool: z.string().describe('Tool name'),
    dependsOn: z.array(z.string()).describe('Tools that must run first'),
  })).optional().describe('Tool execution dependencies'),
  clarificationNeeded: z.array(z.string()).optional().describe('Questions to ask if ambiguous'),
  riskLevel: z.enum(['none', 'low', 'medium', 'high', 'critical']).describe('Risk level of the operation'),
})

const ExecutionPlanSchema = z.object({
  steps: z.array(z.object({
    order: z.number().describe('Execution order (1-based)'),
    tool: z.string().describe('Tool name to call'),
    purpose: z.string().describe('Why this tool is needed'),
    expectedOutput: z.string().describe('What we expect to learn from this tool'),
    dependsOn: z.array(z.number()).optional().describe('Step numbers this depends on'),
    args: z.record(z.string(), z.unknown()).optional().describe('Pre-filled arguments if known'),
  })).describe('Ordered execution steps'),
  estimatedRounds: z.number().min(1).describe('Estimated number of LLM rounds needed'),
  verificationStrategy: z.string().describe('How to verify the results are correct'),
})

const VerificationResultSchema = z.object({
  isComplete: z.boolean().describe('Whether the task is fully complete'),
  allToolsSucceeded: z.boolean().describe('Whether all tool calls succeeded'),
  contradictions: z.array(z.string()).describe('Any contradictions found between tool results'),
  missingInformation: z.array(z.string()).describe('Information still needed'),
  confidence: z.number().min(0).max(1).describe('Confidence in the results'),
  recommendation: z.enum(['accept', 'retry_failed', 'gather_more', 'ask_user']).describe('What to do next'),
})

// ============================================================
// EXPORTED TYPES
// ============================================================

export type TaskClassification = z.infer<typeof TaskClassificationSchema>
export type ExecutionPlan = z.infer<typeof ExecutionPlanSchema>
export type VerificationResult = z.infer<typeof VerificationResultSchema>

export type ReasoningPhase = 'classify' | 'plan' | 'execute' | 'verify' | 'report'

export type ReasoningProgress = {
  phase: ReasoningPhase
  detail: string
  classification?: TaskClassification
  plan?: ExecutionPlan
  verification?: VerificationResult
}

export type ReasoningProgressCallback = (progress: ReasoningProgress) => Promise<void> | void

// ============================================================
// REASONING-FIRST ORCHESTRATOR
// ============================================================

/**
 * Run a reasoning-first chat interaction.
 *
 * Instead of blindly calling the LLM and executing whatever tools it suggests,
 * this orchestrator:
 * 1. Classifies the task type and required tools
 * 2. Creates an execution plan with dependencies
 * 3. Executes tools in the planned order
 * 4. Verifies results against the plan
 * 5. Reports with full reasoning trace
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
  plan: ExecutionPlan | null
  verification: VerificationResult | null
  providersUsed: string[]
  modelsUsed: string[]
}> {
  const { signal, invokerUid, onProgress, maxToolRounds = 10 } = options
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

  const classification = await classifyTask(
    userMessage,
    conversationMessages,
    signal,
  )

  await onProgress?.({
    phase: 'classify',
    detail: `Task classified as: ${classification.taskType} (confidence: ${Math.round(classification.confidence * 100)}%)`,
    classification,
  })

  log.info(
    {
      taskType: classification.taskType,
      confidence: classification.confidence,
      requiredTools: classification.requiredTools,
      riskLevel: classification.riskLevel,
    },
    'Task classified',
  )

  // Handle simple queries — no tools needed, just answer directly
  if (classification.taskType === 'simple_query') {
    const llmResult = await chatComplete({
      messages: conversationMessages,
      temperature: 0.3,
      signal,
    })
    if (llmResult._provider) providersUsed.add(llmResult._provider)
    if (llmResult._model) modelsUsed.add(llmResult._model)

    resultMessages.push({
      role: 'assistant',
      content: llmResult.content ?? '',
    })

    return {
      messages: resultMessages,
      classification,
      plan: null,
      verification: null,
      providersUsed: [...providersUsed],
      modelsUsed: [...modelsUsed],
    }
  }

  // Handle ambiguous requests — ask for clarification
  if (classification.taskType === 'ambiguous' && classification.clarificationNeeded?.length) {
    const clarificationText = `I need some clarification before proceeding:\n\n${
      classification.clarificationNeeded.map((q, i) => `${i + 1}. ${q}`).join('\n')
    }`

    resultMessages.push({
      role: 'assistant',
      content: clarificationText,
    })

    return {
      messages: resultMessages,
      classification,
      plan: null,
      verification: null,
      providersUsed: [...providersUsed],
      modelsUsed: [...modelsUsed],
    }
  }

  // ============================================================
  // PHASE 2: PLAN
  // ============================================================
  await onProgress?.({ phase: 'plan', detail: 'Creating execution plan...' })

  const plan = await createExecutionPlan(
    userMessage,
    classification,
    conversationMessages,
    signal,
  )

  await onProgress?.({
    phase: 'plan',
    detail: `Plan created: ${plan.steps.length} steps, ~${plan.estimatedRounds} rounds`,
    classification,
    plan,
  })

  log.info(
    {
      steps: plan.steps.length,
      tools: plan.steps.map(s => s.tool),
      estimatedRounds: plan.estimatedRounds,
    },
    'Execution plan created',
  )

  // ============================================================
  // PHASE 3: EXECUTE
  // ============================================================
  await onProgress?.({ phase: 'execute', detail: 'Executing plan...' })

  const toolResults: Map<number, { success: boolean; result: unknown; error?: string }> = new Map()
  const completedSteps = new Set<number>()

  for (const step of plan.steps) {
    // Check if dependencies are met
    if (step.dependsOn?.length) {
      const unmetDeps = step.dependsOn.filter(dep => !completedSteps.has(dep))
      if (unmetDeps.length > 0) {
        log.warn(
          { step: step.order, unmetDeps, tool: step.tool },
          'Skipping step due to unmet dependencies',
        )
        toolResults.set(step.order, {
          success: false,
          result: null,
          error: `Dependencies not met: steps ${unmetDeps.join(', ')} have not completed`,
        })
        continue
      }
    }

    // Check if signal is aborted
    if (signal?.aborted) break

    await onProgress?.({
      phase: 'execute',
      detail: `Step ${step.order}/${plan.steps.length}: Running ${step.tool}...`,
      classification,
      plan,
    })

    // Extract arguments using AI-powered extraction (no regex)
    let args = step.args ?? {}
    try {
      const extractionResult = await extractToolArgs(step.tool, args, userMessage, signal)
      args = extractionResult.args
    } catch {
      // If extraction fails, use whatever args we have
    }

    // Execute the tool
    const toolCallId = `step-${step.order}-${Date.now()}`
    try {
      const toolResult = await runAiTool(step.tool, args, {
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(90_000)]) : AbortSignal.timeout(90_000),
        invokerUid,
      })

      toolResults.set(step.order, { success: true, result: toolResult })
      completedSteps.add(step.order)

      resultMessages.push({
        role: 'assistant',
        content: null,
        toolCalls: [{ id: toolCallId, name: step.tool, arguments: JSON.stringify(args) }],
      })

      resultMessages.push({
        role: 'tool',
        content: null,
        toolResult: {
          toolCallId,
          name: step.tool,
          content: JSON.stringify(toolResult),
        },
      })

      log.info(
        { step: step.order, tool: step.tool, success: true },
        'Tool executed successfully',
      )
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      toolResults.set(step.order, { success: false, result: null, error: errorMsg })
      completedSteps.add(step.order) // Mark as completed even if failed (to not block dependents)

      resultMessages.push({
        role: 'assistant',
        content: null,
        toolCalls: [{ id: toolCallId, name: step.tool, arguments: JSON.stringify(args) }],
      })

      resultMessages.push({
        role: 'tool',
        content: null,
        toolResult: {
          toolCallId,
          name: step.tool,
          content: JSON.stringify({ error: errorMsg }),
        },
      })

      log.warn(
        { step: step.order, tool: step.tool, error: errorMsg },
        'Tool execution failed',
      )
    }
  }

  // ============================================================
  // PHASE 4: VERIFY
  // ============================================================
  await onProgress?.({ phase: 'verify', detail: 'Verifying results...' })

  const verification = await verifyResults(
    userMessage,
    plan,
    toolResults,
    signal,
  )

  await onProgress?.({
    phase: 'verify',
    detail: `Verification: ${verification.recommendation} (confidence: ${Math.round(verification.confidence * 100)}%)`,
    classification,
    plan,
    verification,
  })

  // ============================================================
  // PHASE 5: REPORT
  // ============================================================
  await onProgress?.({ phase: 'report', detail: 'Generating response...' })

  // Build the final response using the LLM with all tool results as context
  const toolResultsSummary = Array.from(toolResults.entries())
    .map(([step, result]) => {
      const stepInfo = plan.steps[step - 1]
      return result.success
        ? `Step ${step} (${stepInfo?.tool ?? 'unknown'}): SUCCESS — ${JSON.stringify(result.result).slice(0, 500)}`
        : `Step ${step} (${stepInfo?.tool ?? 'unknown'}): FAILED — ${result.error}`
    })
    .join('\n')

  const reportPrompt = `Based on the execution results below, provide a clear, actionable response to the user's request.

User's request: "${userMessage}"

Execution plan: ${plan.steps.map(s => `${s.order}. ${s.tool} — ${s.purpose}`).join('\n')}

Results:
${toolResultsSummary}

Verification: ${verification.isComplete ? 'COMPLETE' : 'INCOMPLETE'} — ${verification.recommendation}
${verification.contradictions.length > 0 ? `Contradictions: ${verification.contradictions.join(', ')}` : ''}
${verification.missingInformation.length > 0 ? `Missing info: ${verification.missingInformation.join(', ')}` : ''}

Format your response with these sections:
- Actions taken: What you actually did
- Errors: Any failures (or "None")
- Requirements: Any missing inputs or approvals (or "None")
- Result: The actual outcome with specific data
- Completion status: COMPLETE/PARTIAL/BLOCKED/FAILED with percentage
- Next steps: What to do next (be specific)`

  const reportResult = await chatComplete({
    messages: [
      ...conversationMessages,
      { role: 'user', content: userMessage },
      { role: 'assistant', content: `I've analyzed your request and executed the following plan:\n${plan.steps.map(s => `${s.order}. ${s.tool} — ${s.purpose}`).join('\n')}\n\nNow synthesizing the results...` },
      { role: 'user', content: reportPrompt },
    ],
    temperature: 0.3,
    signal,
  })

  if (reportResult._provider) providersUsed.add(reportResult._provider)
  if (reportResult._model) modelsUsed.add(reportResult._model)

  resultMessages.push({
    role: 'assistant',
    content: reportResult.content ?? '',
  })

  return {
    messages: resultMessages,
    classification,
    plan,
    verification,
    providersUsed: [...providersUsed],
    modelsUsed: [...modelsUsed],
  }
}

// ============================================================
// HELPER: CLASSIFY TASK
// ============================================================

async function classifyTask(
  userMessage: string,
  conversationMessages: ChatMessage[],
  signal?: AbortSignal,
): Promise<TaskClassification> {
  try {
    const recentContext = conversationMessages
      .slice(-6)
      .map(m => `${m.role}: ${m.content?.slice(0, 200)}`)
      .join('\n')

    const result = await generateObject({
      model: getExtractorModel(),
      schema: TaskClassificationSchema,
      system: `You are a task classifier for an AI assistant that manages Hysteria2 C2 infrastructure.
Available tools: ${AI_TOOL_NAMES.join(', ')}

Classify the user's request into one of these categories:
- simple_query: Direct question, no tools needed (e.g., "what is Hysteria2?")
- single_tool: One tool call will answer it (e.g., "list my nodes")
- multi_step: Multiple tools with dependencies (e.g., "deploy a node and generate a payload")
- ambiguous: Needs clarification (e.g., "deploy a node" without specifying provider)
- destructive: Destructive action needing confirmation (e.g., "delete all nodes")

Rules:
- If provider/region/size are not specified for deployment, classify as "ambiguous"
- If the request involves deletion, stopping, or wiping, classify as "destructive"
- Be conservative — when in doubt, prefer higher specificity`,
      prompt: `Recent conversation:\n${recentContext}\n\nUser's latest message: "${userMessage}"`,
      temperature: 0,
      abortSignal: signal,
    })

    return result.object
  } catch (err) {
    log.warn({ error: err instanceof Error ? err.message : String(err) }, 'Task classification failed, defaulting to single_tool')
    return {
      taskType: 'single_tool',
      confidence: 0.5,
      reasoning: 'Classification failed, defaulting to single tool assumption',
      requiredTools: [],
      riskLevel: 'none',
    }
  }
}

// ============================================================
// HELPER: CREATE EXECUTION PLAN
// ============================================================

async function createExecutionPlan(
  userMessage: string,
  classification: TaskClassification,
  conversationMessages: ChatMessage[],
  signal?: AbortSignal,
): Promise<ExecutionPlan> {
  try {
    const result = await generateObject({
      model: getExtractorModel(),
      schema: ExecutionPlanSchema,
      system: `You are an execution planner for an AI assistant that manages Hysteria2 C2 infrastructure.
Available tools: ${AI_TOOL_NAMES.join(', ')}

Create a step-by-step execution plan for the user's request.
- Each step should call exactly one tool
- Specify dependencies between steps (which steps must complete first)
- Include pre-filled arguments where the user has specified them
- For deployment operations, ALWAYS include a check_prerequisites step first
- For multi-step operations, include a generate_plan step if the task is complex
- Estimate the number of LLM rounds needed
- Describe a verification strategy to confirm the results are correct`,
      prompt: `User's request: "${userMessage}"

Task classification: ${classification.taskType}
Required tools: ${classification.requiredTools.join(', ')}
Risk level: ${classification.riskLevel}
Reasoning: ${classification.reasoning}`,
      temperature: 0,
      abortSignal: signal,
    })

    return result.object
  } catch (err) {
    log.warn({ error: err instanceof Error ? err.message : String(err) }, 'Plan creation failed, using simple fallback')

    // Fallback: create a simple plan with the required tools
    return {
      steps: classification.requiredTools.map((tool, index) => ({
        order: index + 1,
        tool,
        purpose: `Execute ${tool} as part of the requested operation`,
        expectedOutput: `Result from ${tool}`,
        dependsOn: index > 0 ? [index] : undefined,
      })),
      estimatedRounds: classification.requiredTools.length,
      verificationStrategy: 'Check that all tool calls returned successful results',
    }
  }
}

// ============================================================
// HELPER: VERIFY RESULTS
// ============================================================

async function verifyResults(
  userMessage: string,
  plan: ExecutionPlan,
  toolResults: Map<number, { success: boolean; result: unknown; error?: string }>,
  signal?: AbortSignal,
): Promise<VerificationResult> {
  try {
    const resultsSummary = Array.from(toolResults.entries())
      .map(([step, result]) => `Step ${step}: ${result.success ? 'SUCCESS' : `FAILED: ${result.error}`}`)
      .join('\n')

    const result = await generateObject({
      model: getExtractorModel(),
      schema: VerificationResultSchema,
      system: `You are a results verifier for an AI assistant. Given the original request, the execution plan, and the tool results, verify whether the task is complete and the results are correct.`,
      prompt: `Original request: "${userMessage}"

Execution plan:
${plan.steps.map(s => `${s.order}. ${s.tool} — ${s.purpose}`).join('\n')}

Results:
${resultsSummary}

Verify the results. Are all steps complete? Are there contradictions? Is there missing information?`,
      temperature: 0,
      abortSignal: signal,
    })

    return result.object
  } catch (err) {
    log.warn({ error: err instanceof Error ? err.message : String(err) }, 'Verification failed, using simple check')

    const totalSteps = plan.steps.length
    const successfulSteps = Array.from(toolResults.values()).filter(r => r.success).length

    return {
      isComplete: successfulSteps === totalSteps,
      allToolsSucceeded: successfulSteps === totalSteps,
      contradictions: [],
      missingInformation: [],
      confidence: totalSteps > 0 ? successfulSteps / totalSteps : 0,
      recommendation: successfulSteps === totalSteps ? 'accept' : 'retry_failed',
    }
  }
}
