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
import { anthropic } from '@ai-sdk/anthropic'
import { createOpenAI } from '@ai-sdk/openai'
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
import { sanitizeMessageContent } from '@/lib/ai/robustness'
import { serverEnv } from '@/lib/env'

const log = logger.child({ module: 'ai-reasoning-orchestrator' })

// ============================================================
// MODEL PROVIDER - xAI/Grok as primary (Anthropic may have invalid keys)
// ============================================================

function getReasoningOrchestratorModel() {
  const env = serverEnv()
  // Primary: xAI/Grok (most reliably available — Anthropic keys may be invalid/expired)
  if (env.XAI_API_KEY) {
    const client = createOpenAI({
      baseURL: env.XAI_BASE_URL,
      apiKey: env.XAI_API_KEY,
    })
    return client(env.XAI_MODEL)
  }
  // Fallback to getExtractorModel for other providers (OpenAI, Anthropic, etc.)
  return getExtractorModel()
}

// Also provide Anthropic as an option for the extractor when xAI is unavailable
function getAnthropicFallbackModel() {
  const env = serverEnv()
  if (env.ANTHROPIC_API_KEY) {
    return anthropic(env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001')
  }
  return getExtractorModel()
}

// ============================================================
// CONTROL CHARACTER SANITIZER
// The Vercel AI SDK validates message content and rejects
// control characters (\n, \t, \r, etc.). Tool results often
// contain JSON with these characters, so we must sanitize
// before passing content to the AI SDK.
// Uses the project's existing sanitizeMessageContent from
// the robustness module.
// ============================================================

/**
 * Safely stringify a tool result for AI SDK message content.
 * Handles objects by first JSON-stringifying, then sanitizing
 * control characters that would cause validation failures.
 */
/**
 * Normalize argument values that the LLM planner is known to mis-spell or
 * mis-case relative to the strict Zod enums on real tools. Keeps validation
 * strict downstream while absorbing trivial natural-language variations
 * ("Azure" → "azure", "node unhealthy" → "general", etc.).
 */
function normalizePlannerArgs(
  toolName: string,
  args: Record<string, unknown>,
): Record<string, unknown> {
  const out = { ...args }

  // Cloud provider canonicalization (used by deploy_node, check_prerequisites)
  if (typeof out.provider === 'string') {
    const p = out.provider.trim().toLowerCase().replace(/[\s_-]+/g, '')
    const map: Record<string, string> = {
      azure: 'azure',
      microsoftazure: 'azure',
      aws: 'lightsail',
      amazon: 'lightsail',
      amazonwebservices: 'lightsail',
      lightsail: 'lightsail',
      hetzner: 'hetzner',
      hetznercloud: 'hetzner',
      digitalocean: 'digitalocean',
      do: 'digitalocean',
      vultr: 'vultr',
    }
    if (map[p]) out.provider = map[p]
  }

  // Region casing: cloud SDKs always want lowercase / no spaces
  if (typeof out.region === 'string') {
    out.region = out.region.trim().toLowerCase().replace(/\s+/g, '')
  }

  // tags: the planner often emits a single string instead of an array
  if (typeof out.tags === 'string') {
    const trimmed = (out.tags as string).trim()
    out.tags = trimmed.length > 0 ? trimmed.split(/\s*,\s*/).filter(Boolean) : []
  }

  // Cloud VM size: the planner often emits descriptive natural-language
  // values like "smallest_cheap" / "smallest cheap" / "tiny" instead of a
  // real SKU. Drop those so the tool's per-provider default kicks in.
  if (toolName === 'deploy_node' && typeof out.size === 'string') {
    const s = out.size.trim().toLowerCase().replace(/[\s-]+/g, '_')
    const looksLikeRealSku =
      /^standard_/.test(s) || // Azure
      /^cx\d/.test(s) || /^cpx\d/.test(s) || /^ccx\d/.test(s) || // Hetzner
      /^s-\d|^c-\d|^g-\d/.test(s) || // DigitalOcean
      /^vc2-|^vhf-|^vhp-/.test(s) || // Vultr
      /^nano_|^micro_|^small_|^medium_|^large_|^xlarge_/.test(s) // Lightsail
    if (!looksLikeRealSku) {
      delete out.size
    }
  }

  // troubleshoot.issue is a strict enum; map free-form descriptions to the
  // closest bucket so the call doesn't fail on an enum mismatch.
  if (toolName === 'troubleshoot' && typeof out.issue === 'string') {
    const raw = out.issue.toLowerCase()
    const allowed = ['tls', 'throughput', 'connectivity', 'auth', 'general']
    if (!allowed.includes(raw)) {
      if (/(tls|cert|handshake|ssl)/.test(raw)) out.issue = 'tls'
      else if (/(throughput|slow|bandwidth|speed|latency|perf)/.test(raw)) out.issue = 'throughput'
      else if (/(connect|reach|timeout|offline|down|unhealthy|dns|network)/.test(raw)) out.issue = 'connectivity'
      else if (/(auth|password|token|login|key|credential)/.test(raw)) out.issue = 'auth'
      else out.issue = 'general'
    }
  }

  // check_prerequisites.operation is also a strict enum
  if (toolName === 'check_prerequisites' && typeof out.operation === 'string') {
    const raw = out.operation.toLowerCase().trim()
    const allowed = ['deploy_node', 'generate_payload', 'send_email', 'apply_config', 'start_server', 'general']
    if (!allowed.includes(raw)) {
      if (/deploy/.test(raw)) out.operation = 'deploy_node'
      else if (/payload|build/.test(raw)) out.operation = 'generate_payload'
      else if (/email|mail/.test(raw)) out.operation = 'send_email'
      else if (/config/.test(raw)) out.operation = 'apply_config'
      else if (/start|boot/.test(raw)) out.operation = 'start_server'
      else out.operation = 'general'
    }
  }

  return out
}

/**
 * Returns the list of `required` jsonSchema fields for `toolName` that are
 * still missing from `args`. Used to short-circuit calls the LLM planner
 * can't fully populate (typically secrets like sshPrivateKey, or chained
 * results like profileId).
 */
function collectMissingRequired(
  toolName: string,
  args: Record<string, unknown>,
): string[] {
  const tool = (AI_TOOLS as Record<string, AgentTool<unknown, unknown>>)[toolName]
  const required = tool?.jsonSchema?.required
  if (!Array.isArray(required) || required.length === 0) return []
  return required.filter((k) => {
    const v = args[k]
    return v === undefined || v === null || v === ''
  })
}

const NODE_ID_REQUIRED_TOOLS = new Set([
  'get_node',
  'update_node',
  'delete_node',
  'apply_node_config',
])

/**
 * If the planner emitted a tool call that needs a `nodeId` but only a node
 * name was available (e.g. user said "node edge-01"), call `list_nodes` to
 * resolve the name → id, and patch the args. No-op when nodeId is already
 * present or no candidate name can be inferred.
 */
async function resolveNodeIdIfMissing(
  toolName: string,
  args: Record<string, unknown>,
  userMessage: string,
  invokerUid: string,
  signal?: AbortSignal,
): Promise<Record<string, unknown>> {
  if (!NODE_ID_REQUIRED_TOOLS.has(toolName)) return args
  if (typeof args.nodeId === 'string' && args.nodeId.length > 0) return args

  // Determine candidate name: explicit `name` arg from planner, otherwise
  // best-effort heuristic — pull the first quoted token from the user message.
  let candidate: string | null = null
  if (typeof args.name === 'string' && args.name.length > 0) {
    candidate = args.name
  } else {
    const m = userMessage.match(/['"`]([^'"`]{1,64})['"`]/) ||
              userMessage.match(/\bnode\s+([A-Za-z0-9_-]{2,64})\b/i)
    if (m) candidate = m[1]
  }
  if (!candidate) return args

  try {
    const list = await runAiTool(
      'list_nodes',
      {},
      {
        signal: signal
          ? AbortSignal.any([signal, AbortSignal.timeout(15_000)])
          : AbortSignal.timeout(15_000),
        invokerUid,
      },
    ) as { nodes?: Array<{ id: string; name: string }> }

    const nodes = Array.isArray(list?.nodes) ? list.nodes : []
    const cand = candidate.toLowerCase()
    const exact = nodes.find((n) => n.name?.toLowerCase() === cand)
    const partial = exact ?? nodes.find((n) => n.name?.toLowerCase().includes(cand))
    if (partial) {
      return { ...args, nodeId: partial.id }
    }
    log.warn({ toolName, candidate, available: nodes.map((n) => n.name) }, 'No matching node for name')
    // Pass the candidate as the nodeId so the tool can return a clean
    // `found:false` instead of crashing on a Zod validation error.
    return { ...args, nodeId: candidate }
  } catch (err) {
    log.warn({ toolName, candidate, error: err instanceof Error ? err.message : String(err) },
      'Failed to resolve node name to id')
    return { ...args, nodeId: candidate }
  }
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
// All schemas are designed for OpenAI structured output compatibility:
// - NO .optional() — use defaults (empty arrays/strings) instead
// - NO z.record() — use explicit object properties instead
// - ALL fields have .describe() — required by OpenAI
// ============================================================

const TaskClassificationSchema = z.object({
  taskType: z.enum([
    'simple_query',       // Direct question, no tools needed
    'single_tool',        // One tool call will answer the question
    'multi_step',         // Multiple tool calls with dependencies
    'ambiguous',          // Needs clarification before proceeding
    'destructive',        // Needs confirmation before proceeding
  ]).describe('Classification of the task type'),
  confidence: z.number().min(0).max(1).describe('Confidence in classification from 0 to 1'),
  reasoning: z.string().describe('Why this classification was chosen'),
  requiredTools: z.array(z.string()).describe('Tools that will likely be needed. Empty array if no tools needed.'),
  dependencies: z.array(z.object({
    tool: z.string().describe('Tool name'),
    dependsOn: z.array(z.string()).describe('Tools that must run first. Empty array if no dependencies.'),
  })).describe('Tool execution dependencies. Empty array if no dependencies.'),
  clarificationNeeded: z.array(z.string()).describe('Questions to ask if ambiguous. Empty array if not ambiguous.'),
  riskLevel: z.enum(['none', 'low', 'medium', 'high', 'critical']).describe('Risk level of the operation'),
})

const ExecutionPlanStepSchema = z.object({
  order: z.number().describe('Execution order (1-based)'),
  tool: z.string().describe('Tool name to call'),
  purpose: z.string().describe('Why this tool is needed'),
  expectedOutput: z.string().describe('What we expect to learn from this tool'),
  dependsOn: z.array(z.number()).describe('Step numbers this depends on. Empty array if no dependencies.'),
  argKeys: z.array(z.string()).describe('Names of known argument keys. Empty array if no args known.'),
  argValues: z.array(z.string()).describe('String values for known arguments (same order as argKeys). Empty array if no args known.'),
})

const ExecutionPlanSchema = z.object({
  steps: z.array(ExecutionPlanStepSchema).describe('Ordered execution steps. Empty array if no tools needed.'),
  estimatedRounds: z.number().min(1).describe('Estimated number of LLM rounds needed'),
  verificationStrategy: z.string().describe('How to verify the results are correct'),
})

const VerificationResultSchema = z.object({
  isComplete: z.boolean().describe('Whether the task is fully complete'),
  allToolsSucceeded: z.boolean().describe('Whether all tool calls succeeded'),
  contradictions: z.array(z.string()).describe('Any contradictions found between tool results. Empty array if none.'),
  missingInformation: z.array(z.string()).describe('Information still needed. Empty array if none.'),
  confidence: z.number().min(0).max(1).describe('Confidence in the results from 0 to 1'),
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
    // Check if dependencies are met. A "met" dep is one that ran AND succeeded;
    // dependents on a failed step must be skipped, otherwise they fan-out into
    // additional argument-validation failures.
    if (step.dependsOn?.length) {
      const unmetDeps = step.dependsOn.filter(dep => {
        if (!completedSteps.has(dep)) return true
        const r = toolResults.get(dep)
        return !r || !r.success
      })
      if (unmetDeps.length > 0) {
        log.warn(
          { step: step.order, unmetDeps, tool: step.tool },
          'Skipping step due to unmet or failed dependencies',
        )
        toolResults.set(step.order, {
          success: false,
          result: null,
          error: `Dependencies not met or failed: steps ${unmetDeps.join(', ')}`,
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

    // Reconstruct args from argKeys/argValues (OpenAI-compatible schema format)
    let args: Record<string, unknown> = {}
    if (step.argKeys?.length && step.argValues?.length) {
      for (let i = 0; i < step.argKeys.length; i++) {
        const k = step.argKeys[i]
        const v = step.argValues[i]
        // Drop empty placeholder values produced by the planner so the
        // extractor / fallback layer can fill them in instead of letting
        // them collide with strict enum validators downstream.
        if (v === undefined || v === null || v === '') continue
        args[k] = v
      }
    }

    // Extract additional arguments using AI-powered extraction (no regex)
    try {
      const extractionResult = await extractToolArgs(step.tool, args, userMessage, signal)
      args = extractionResult.args
    } catch {
      // If extraction fails, use whatever args we have
    }

    // Normalize common LLM-planner mistakes against strict tool enums so
    // we don't fail a whole step on a casing / phrasing nit.
    args = normalizePlannerArgs(step.tool, args)

    // Resolve node-by-name to nodeId for tools that require nodeId. This
    // covers the very common natural-language pattern "show me node edge-01"
    // where the user references a node by its display name.
    args = await resolveNodeIdIfMissing(step.tool, args, userMessage, invokerUid, signal)

    // Pre-flight: if required parameters are still missing after extraction +
    // normalization + resolution, skip the step with an actionable note rather
    // than letting it die on a Zod stack the user can't interpret. This is
    // common for tools that require secrets (sshPrivateKey, apiKey) or
    // results from earlier steps the planner forgot to wire (profileId).
    const missingRequired = collectMissingRequired(step.tool, args)
    if (missingRequired.length > 0) {
      const note = `Skipped ${step.tool}: missing required input(s): ${missingRequired.join(', ')}. Provide these and re-run.`
      log.warn({ step: step.order, tool: step.tool, missingRequired }, 'Skipping step due to missing required args')
      toolResults.set(step.order, { success: false, result: null, error: note })
      const toolCallIdSkip = `step-${step.order}-${Date.now()}`
      resultMessages.push({
        role: 'assistant',
        content: null,
        toolCalls: [{ id: toolCallIdSkip, name: step.tool, arguments: JSON.stringify(args) }],
      })
      resultMessages.push({
        role: 'tool',
        content: null,
        toolResult: {
          toolCallId: toolCallIdSkip,
          name: step.tool,
          content: safeStringifyForContent({ skipped: true, reason: note, missing: missingRequired }),
        },
      })
      continue
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
          content: safeStringifyForContent(toolResult),
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
          content: safeStringifyForContent({ error: errorMsg }),
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
        ? `Step ${step} (${stepInfo?.tool ?? 'unknown'}): SUCCESS — ${safeStringifyForContent(result.result).slice(0, 500)}`
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
      { role: 'user', content: sanitizeMessageContent(userMessage) },
      { role: 'assistant', content: sanitizeMessageContent(`I've analyzed your request and executed the following plan:\n${plan.steps.map(s => `${s.order}. ${s.tool} — ${s.purpose}`).join('\n')}\n\nNow synthesizing the results...`) },
      { role: 'user', content: sanitizeMessageContent(reportPrompt) },
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
      .map(m => `${m.role}: ${sanitizeMessageContent(m.content?.slice(0, 200) ?? '')}`)
      .join('\\n')

    const result = await generateObject({
      model: getReasoningOrchestratorModel(),
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
      prompt: sanitizeMessageContent(`Recent conversation:\n${recentContext}\n\nUser's latest message: "${userMessage}"`),
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
      dependencies: [],
      clarificationNeeded: [],
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
      model: getReasoningOrchestratorModel(),
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
      prompt: sanitizeMessageContent(`User's request: "${userMessage}"

Task classification: ${classification.taskType}
Required tools: ${classification.requiredTools.join(', ')}
Risk level: ${classification.riskLevel}
Reasoning: ${classification.reasoning}`),
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
        dependsOn: index > 0 ? [index] : [] as number[],
        argKeys: [] as string[],
        argValues: [] as string[],
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
      model: getReasoningOrchestratorModel(),
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
