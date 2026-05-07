/**
 * Reasoning Pipeline
 *
 * Implements structured chain-of-thought reasoning without regex parsing.
 * Uses Zod schemas and structured output (generateObject) for all reasoning steps.
 *
 * This replaces the legacy regex-based JSON extraction with pure LLM reasoning
 * and structured validation.
 */

import { generateObject } from 'ai'
import { z } from 'zod'
import { serverEnv } from '@/lib/env'
import { createOpenAI } from '@ai-sdk/openai'
import { anthropic } from '@ai-sdk/anthropic'
import logger from '@/lib/logger'

const log = logger.child({ module: 'ai-reasoning-pipeline' })

// ============================================================
// REASONING STEP SCHEMAS
// ============================================================

const IntentAnalysisSchema = z.object({
  intent: z.enum([
    'deploy_infrastructure',
    'configure_node',
    'generate_payload',
    'analyze_traffic',
    'troubleshoot',
    'get_status',
    'list_resources',
    'update_resource',
    'delete_resource',
    'general_query',
  ]).describe('The primary intent of the user request'),
  confidence: z.number().min(0).max(1).describe('Confidence in the intent classification'),
  reasoning: z.string().describe('Why this intent was selected'),
  suggestedTools: z.array(z.string()).describe('Tools that should be called to fulfill this request'),
})

const ParameterExtractionSchema = z.object({
  parameterKeys: z.array(z.string()).describe('Names of extracted parameters. Empty array if none.'),
  parameterValues: z.array(z.string()).describe('String values for extracted parameters (same order as parameterKeys). Empty array if none.'),
  missingRequired: z.array(z.string()).describe('Required parameters that are missing'),
  userProvided: z.array(z.string()).describe('Parameters that were explicitly provided by the user'),
  inferred: z.array(z.string()).describe('Parameters that were inferred from context'),
})

const PlanningSchema = z.object({
  steps: z.array(z.object({
    order: z.number().describe('Step execution order (1-indexed)'),
    description: z.string().describe('What this step does'),
    toolName: z.string().describe('Tool to use for this step. Empty string if no tool needed.'),
    dependsOn: z.array(z.number()).describe('Step numbers this step depends on. Empty array if no dependencies.'),
  })).describe('Planned execution steps'),
  estimatedDuration: z.number().describe('Estimated time in seconds'),
  canParallelize: z.boolean().describe('Whether any steps can run in parallel'),
})

const ValidationSchema = z.object({
  isValid: z.boolean().describe('Whether the plan is valid'),
  issues: z.array(z.string()).describe('Issues found with the plan'),
  suggestions: z.array(z.string()).describe('Suggestions for improvement'),
  confidence: z.number().min(0).max(1).describe('Confidence that this plan will succeed'),
})

// ============================================================
// REASONING PIPELINE
// ============================================================

/**
 * Reconstruct a parameters Record from parallel key/value arrays.
 * Used because OpenAI structured output doesn't support z.record().
 */
function reconstructParams(keys: string[], values: string[]): Record<string, unknown> {
  const params: Record<string, unknown> = {}
  if (keys?.length && values?.length) {
    for (let i = 0; i < keys.length; i++) {
      if (keys[i]) params[keys[i]] = values[i] ?? ''
    }
  }
  return params
}

export type ReasoningContext = {
  userMessage: string
  conversationHistory: Array<{ role: string; content: string }>
  availableTools: string[]
  previousErrors?: string[]
}

export type ReasoningResult = {
  success: boolean
  intent: string
  confidence: number
  suggestedTools: string[]
  extractedParams: Record<string, unknown>
  missingParams: string[]
  executionPlan?: {
    steps: Array<{
      order: number
      description: string
      toolName?: string
      dependsOn?: number[]
    }>
    canParallelize: boolean
  }
  validation?: {
    isValid: boolean
    issues: string[]
    suggestions: string[]
  }
  error?: string
}

/**
 * Main reasoning pipeline that processes user input through multiple
 * structured reasoning stages without any regex parsing.
 */
export async function runReasoningPipeline(
  context: ReasoningContext,
  signal?: AbortSignal
): Promise<ReasoningResult> {
  const startTime = Date.now()

  try {
    // Step 1: Intent Analysis
    const intentResult = await analyzeIntent(context, signal)
    if (!intentResult.success) {
      return {
        success: false,
        intent: 'unknown',
        confidence: 0,
        suggestedTools: [],
        extractedParams: {},
        missingParams: [],
        error: intentResult.error,
      }
    }

    // Step 2: Parameter Extraction
    const paramsResult = await extractParameters(context, intentResult, signal)

    // Step 3: Planning (if we have high-confidence intent)
    let executionPlan: ReasoningResult['executionPlan'] | undefined
    if (intentResult.confidence > 0.7 && paramsResult.missingRequired.length === 0) {
      const planResult = await createExecutionPlan(context, intentResult, paramsResult, signal)
      if (planResult.success) {
        executionPlan = planResult.plan
      }
    }

    // Step 4: Validation (if we have a plan)
    let validation: ReasoningResult['validation'] | undefined
    if (executionPlan) {
      const validationResult = await validatePlan(context, intentResult, executionPlan, signal)
      if (validationResult.success) {
        validation = validationResult.validation
      }
    }

    const duration = Date.now() - startTime
    log.info(
      {
        intent: intentResult.intent,
        confidence: intentResult.confidence,
        tools: intentResult.suggestedTools,
        missingParams: paramsResult.missingRequired.length,
        hasPlan: !!executionPlan,
        duration,
      },
      'Reasoning pipeline completed'
    )

    return {
      success: true,
      intent: intentResult.intent,
      confidence: intentResult.confidence,
      suggestedTools: intentResult.suggestedTools,
      extractedParams: reconstructParams(paramsResult.parameterKeys, paramsResult.parameterValues),
      missingParams: paramsResult.missingRequired,
      executionPlan,
      validation,
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    log.error({ error: errorMsg }, 'Reasoning pipeline failed')

    return {
      success: false,
      intent: 'unknown',
      confidence: 0,
      suggestedTools: [],
      extractedParams: {},
      missingParams: [],
      error: errorMsg,
    }
  }
}

// ============================================================
// REASONING STAGES
// ============================================================

async function analyzeIntent(
  context: ReasoningContext,
  signal?: AbortSignal
): Promise<{ success: true } & z.infer<typeof IntentAnalysisSchema> | { success: false; error: string }> {
  try {
    const provider = getReasoningProvider()

    const result = await generateObject({
      model: provider.model,
      schema: IntentAnalysisSchema,
      system: `You are an intent analysis engine for an AI assistant.

Available tools: ${context.availableTools.join(', ')}

Analyze the user's message and determine:
1. The primary intent (what they want to accomplish)
2. Confidence level (0.0-1.0)
3. Which tools should be called

Be precise. If uncertain, use 'general_query' with lower confidence.`,
      prompt: buildContextPrompt(context),
      temperature: 0,
      abortSignal: signal,
    })

    return { success: true, ...result.object }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

async function extractParameters(
  context: ReasoningContext,
  intentResult: { intent: string; suggestedTools: string[] },
  signal?: AbortSignal
): Promise<z.infer<typeof ParameterExtractionSchema>> {
  try {
    const provider = getReasoningProvider()

    const result = await generateObject({
      model: provider.model,
      schema: ParameterExtractionSchema,
      system: `You are a parameter extraction engine.

Given the user's intent (${intentResult.intent}) and suggested tools (${intentResult.suggestedTools.join(', ')}),
extract all relevant parameters from the user's message.

Rules:
- Only extract parameters that are explicitly stated or clearly implied
- Do NOT guess or fabricate values
- Mark which parameters the user provided vs which were inferred
- List any required parameters that are missing`,
      prompt: buildContextPrompt(context),
      temperature: 0,
      abortSignal: signal,
    })

    return result.object
  } catch (err) {
    log.warn({ error: err }, 'Parameter extraction failed, returning empty')
    return {
      parameterKeys: [],
      parameterValues: [],
      missingRequired: [],
      userProvided: [],
      inferred: [],
    }
  }
}

async function createExecutionPlan(
  context: ReasoningContext,
  intentResult: { intent: string; suggestedTools: string[] },
  paramsResult: { parameterKeys: string[]; parameterValues: string[] },
  signal?: AbortSignal
): Promise<{ success: true; plan: NonNullable<ReasoningResult['executionPlan']> } | { success: false }> {
  try {
    const provider = getReasoningProvider()

    const result = await generateObject({
      model: provider.model,
      schema: PlanningSchema,
      system: `You are a planning engine for AI assistant task execution.

Given the intent, tools, and parameters, create a step-by-step execution plan.

Each step should:
- Have a clear description
- Specify which tool to use (if any)
- Indicate dependencies on previous steps
- Be ordered logically

Consider which steps can run in parallel.`,
      prompt: `${buildContextPrompt(context)}

Intent: ${intentResult.intent}
Tools: ${intentResult.suggestedTools.join(', ')}
Parameters: ${JSON.stringify(reconstructParams(paramsResult.parameterKeys, paramsResult.parameterValues), null, 2)}`,
      temperature: 0.1,
      abortSignal: signal,
    })

    const plan = result.object

    return {
      success: true,
      plan: {
        steps: plan.steps.map(s => ({
          order: s.order,
          description: s.description,
          toolName: s.toolName,
          dependsOn: s.dependsOn,
        })),
        canParallelize: plan.canParallelize,
      },
    }
  } catch (err) {
    log.warn({ error: err }, 'Plan creation failed')
    return { success: false }
  }
}

async function validatePlan(
  context: ReasoningContext,
  intentResult: { intent: string },
  plan: NonNullable<ReasoningResult['executionPlan']>,
  signal?: AbortSignal
): Promise<{ success: true; validation: NonNullable<ReasoningResult['validation']> } | { success: false }> {
  try {
    const provider = getReasoningProvider()

    const result = await generateObject({
      model: provider.model,
      schema: ValidationSchema,
      system: `You are a validation engine for AI assistant execution plans.

Review the proposed plan and identify:
- Potential issues or risks
- Missing steps or dependencies
- Improvements that could be made
- Confidence level that the plan will succeed`,
      prompt: `${buildContextPrompt(context)}

Intent: ${intentResult.intent}
Plan Steps:
${plan.steps.map(s => `${s.order}. ${s.description}${s.toolName ? ` [${s.toolName}]` : ''}`).join('\n')}`,
      temperature: 0,
      abortSignal: signal,
    })

    const validation = result.object

    return {
      success: true,
      validation: {
        isValid: validation.isValid,
        issues: validation.issues,
        suggestions: validation.suggestions,
      },
    }
  } catch (err) {
    log.warn({ error: err }, 'Plan validation failed')
    return { success: false }
  }
}

// ============================================================
// HELPERS
// ============================================================

function buildContextPrompt(context: ReasoningContext): string {
  let prompt = `User Message: "${context.userMessage}"\n\n`

  if (context.conversationHistory.length > 0) {
    prompt += 'Conversation History:\n'
    context.conversationHistory.slice(-5).forEach((msg, i) => {
      prompt += `${i + 1}. ${msg.role}: ${msg.content.slice(0, 100)}${msg.content.length > 100 ? '...' : ''}\n`
    })
    prompt += '\n'
  }

  if (context.previousErrors && context.previousErrors.length > 0) {
    prompt += 'Previous Errors:\n'
    context.previousErrors.forEach((err, i) => {
      prompt += `${i + 1}. ${err}\n`
    })
    prompt += '\n'
  }

  return prompt
}

type ReasoningProvider = {
  name: string
  model: any
}

function getReasoningProvider(): ReasoningProvider {
  const env = serverEnv()

  // PRIMARY: Anthropic/Claude for reasoning (best structured output quality)
  if (env.ANTHROPIC_API_KEY) {
    return { name: 'anthropic', model: anthropic(env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001') }
  }

  // Fallback to OpenAI
  if (env.OPENAI_API_KEY) {
    const client = createOpenAI({ apiKey: env.OPENAI_API_KEY })
    return { name: 'openai', model: client('gpt-4o-mini') }
  }

  // Fallback to xAI/Grok
  if (env.XAI_API_KEY) {
    const client = createOpenAI({
      baseURL: env.XAI_BASE_URL,
      apiKey: env.XAI_API_KEY,
    })
    return { name: 'xai', model: client('grok-2-1212') }
  }

  // Last resort: use whatever LLM_PROVIDER is configured
  if (env.LLM_PROVIDER_API_KEY) {
    const client = createOpenAI({
      baseURL: env.LLM_PROVIDER_BASE_URL,
      apiKey: env.LLM_PROVIDER_API_KEY,
    })
    return { name: 'legacy', model: client(env.LLM_MODEL) }
  }

  throw new Error('No AI provider configured for reasoning pipeline')
}

// ============================================================
// DIRECT REASONING EXPORTS (for backward compatibility)
// ============================================================

export { IntentAnalysisSchema, ParameterExtractionSchema, PlanningSchema, ValidationSchema }
