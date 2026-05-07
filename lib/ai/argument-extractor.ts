/**
 * AI-Powered Argument Extractor
 *
 * Replaces all regex-based argument injection (injectMissingArgs, detectPayloadIntent)
 * with structured LLM extraction using generateObject() + Zod schemas.
 *
 * Instead of pattern-matching user messages with regex, this module uses a small,
 * fast LLM call to extract structured tool arguments from natural language.
 */

import { generateObject } from 'ai'
import { z } from 'zod'
import { serverEnv } from '@/lib/env'
import { createOpenAI } from '@ai-sdk/openai'
import { anthropic } from '@ai-sdk/anthropic'
import logger from '@/lib/logger'

const log = logger.child({ module: 'ai-argument-extractor' })

// ============================================================
// EXTRACTION SCHEMAS — one per tool that needs argument extraction
// ============================================================

const DeployNodeArgsSchema = z.object({
  provider: z
    .enum(['azure', 'hetzner', 'digitalocean', 'vultr', 'lightsail'])
    .optional()
    .describe('Cloud provider name'),
  region: z
    .string()
    .optional()
    .describe('Cloud region (e.g., eastus, westeurope, fsn1, nyc3)'),
  size: z
    .string()
    .optional()
    .describe('Server size SKU (e.g., Standard_B2s, cx22, s-1vcpu-1gb)'),
  name: z
    .string()
    .optional()
    .describe('Node name/label'),
  resourceGroup: z
    .string()
    .optional()
    .describe('Azure resource group name (Azure only)'),
  panelUrl: z
    .string()
    .url()
    .optional()
    .describe('Publicly reachable panel URL (HTTPS preferred)'),
})

const CheckPrerequisitesArgsSchema = z.object({
  operation: z
    .enum(['deploy_node', 'generate_payload', 'send_email', 'apply_config', 'start_server', 'general'])
    .optional()
    .describe('The operation to check prerequisites for'),
  provider: z
    .enum(['azure', 'hetzner', 'digitalocean', 'vultr', 'lightsail'])
    .optional()
    .describe('Cloud provider (for deploy_node prerequisite)'),
  region: z
    .string()
    .optional()
    .describe('Cloud region (for deploy_node prerequisite)'),
  resourceGroup: z
    .string()
    .optional()
    .describe('Azure resource group (for deploy_node prerequisite)'),
})

const GeneratePlanArgsSchema = z.object({
  goal: z
    .string()
    .min(1)
    .describe('The goal or task to plan for'),
})

const PromptUserArgsSchema = z.object({
  question: z.string().min(1).describe('Question to ask the user'),
  options: z.array(z.object({
    label: z.string().describe('Display label'),
    value: z.string().describe('Value to return if selected'),
  })).optional().describe('Multiple-choice options'),
})

const PayloadIntentSchema = z.object({
  intent: z
    .enum(['list_payloads', 'generate_payload', 'get_payload_status', 'none'])
    .describe('Detected payload-related intent'),
  description: z
    .string()
    .optional()
    .describe('Natural language description for payload generation'),
  buildId: z
    .string()
    .optional()
    .describe('Specific build ID if referenced'),
  limit: z
    .number()
    .optional()
    .describe('Number of items to list'),
})

// Map tool names to their extraction schemas
const EXTRACTION_SCHEMAS: Record<string, z.ZodType> = {
  deploy_node: DeployNodeArgsSchema,
  check_prerequisites: CheckPrerequisitesArgsSchema,
  generate_plan: GeneratePlanArgsSchema,
  prompt_user: PromptUserArgsSchema,
}

// ============================================================
// EXTRACTION PROMPT
// ============================================================

const EXTRACTION_SYSTEM_PROMPT = `You are a precise argument extractor for an AI assistant tool system.
Given a user's natural language message and a tool name with its parameter schema, extract the relevant arguments.

RULES:
- Only extract values that are explicitly stated or clearly implied by the user's message
- Do NOT guess or fabricate values — if the user didn't specify something, leave it undefined
- For provider names: map common variations (e.g., "aws" → "lightsail", "digital ocean" → "digitalocean")
- For regions: use the exact cloud provider region codes (e.g., "East US" → "eastus")
- For URLs: extract the full URL including protocol
- Be precise — wrong values are worse than missing values
- Output ONLY the extracted arguments as a JSON object matching the schema`

// ============================================================
// EXTRACTION RESULT
// ============================================================

export type ExtractionResult = {
  success: boolean
  args: Record<string, unknown>
  error?: string
  extractedFields: string[]
  missingFields: string[]
}

// ============================================================
// MAIN EXTRACTION FUNCTION
// ============================================================

/**
 * Extract tool arguments from a user message using AI-powered structured output.
 * Replaces the old regex-based injectMissingArgs() function.
 */
export async function extractToolArgs(
  toolName: string,
  existingArgs: Record<string, unknown>,
  userMessage: string,
  signal?: AbortSignal,
): Promise<ExtractionResult> {
  const schema = EXTRACTION_SCHEMAS[toolName]
  if (!schema) {
    // No schema registered for this tool — return existing args unchanged
    return {
      success: true,
      args: existingArgs,
      extractedFields: [],
      missingFields: [],
    }
  }

  // Determine which fields are missing from existing args
  const schemaShape = schema instanceof z.ZodObject ? schema.shape : {}
  const missingFields = Object.keys(schemaShape).filter(
    (key) => existingArgs[key] === undefined || existingArgs[key] === null
  )

  // If nothing is missing, no extraction needed
  if (missingFields.length === 0) {
    return {
      success: true,
      args: existingArgs,
      extractedFields: [],
      missingFields: [],
    }
  }

  try {
    const provider = getExtractorProvider()
    const result = await generateObject({
      model: provider.model,
      schema: schema as z.ZodObject<any>,
      system: EXTRACTION_SYSTEM_PROMPT,
      prompt: `Tool: ${toolName}\nMissing parameters: ${missingFields.join(', ')}\nUser message: "${userMessage}"\n\nExtract the missing arguments from the user's message. Only fill in values that are clearly stated or implied.`,
      temperature: 0,
      abortSignal: signal,
    })

    const extractedArgs = result.object as Record<string, unknown>
    const extractedFields = Object.keys(extractedArgs).filter(
      (key) => extractedArgs[key] !== undefined && extractedArgs[key] !== null
    )

    // Merge extracted args with existing args (existing takes precedence)
    const mergedArgs = { ...extractedArgs, ...existingArgs }

    log.info(
      {
        toolName,
        missingFields,
        extractedFields,
        provider: provider.name,
      },
      'AI argument extraction completed',
    )

    return {
      success: true,
      args: mergedArgs,
      extractedFields,
      missingFields: missingFields.filter((f) => !extractedFields.includes(f)),
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    log.warn(
      { toolName, missingFields, error: errorMsg },
      'AI argument extraction failed, returning existing args',
    )

    return {
      success: false,
      args: existingArgs,
      error: errorMsg,
      extractedFields: [],
      missingFields,
    }
  }
}

// ============================================================
// INTENT DETECTION — replaces detectPayloadIntent()
// ============================================================

const INTENT_SYSTEM_PROMPT = `You are an intent classifier for an AI assistant.
Given a user's message, determine if they want to perform a payload-related action.

INTENT TYPES:
- "list_payloads": User wants to see/list existing payload builds
- "generate_payload": User wants to create/build a new payload
- "get_payload_status": User wants to check the status of an existing payload build
- "none": The message is not about payloads

RULES:
- Only classify as a payload intent if the user clearly mentions payloads, builds, or specific payload formats (EXE, ELF, PS1, Python)
- If the message is ambiguous, classify as "none"
- For "generate_payload", include a description field summarizing what the user wants built
- For "list_payloads", set limit to 20 by default
- For "get_payload_status", extract any build ID if mentioned`

/**
 * Detect payload-related intent from a user message using AI.
 * Replaces the old regex/keyword-based detectPayloadIntent() function.
 */
export async function detectIntent(
  userMessage: string,
  signal?: AbortSignal,
): Promise<{ toolName: string; args: Record<string, unknown> } | null> {
  try {
    const provider = getExtractorProvider()
    const result = await generateObject({
      model: provider.model,
      schema: PayloadIntentSchema,
      system: INTENT_SYSTEM_PROMPT,
      prompt: `User message: "${userMessage}"`,
      temperature: 0,
      abortSignal: signal,
    })

    const intent = result.object

    if (intent.intent === 'none') {
      return null
    }

    const toolName = intent.intent
    const args: Record<string, unknown> = {}

    switch (intent.intent) {
      case 'list_payloads':
        args.limit = intent.limit ?? 20
        break
      case 'generate_payload':
        args.description = intent.description ?? userMessage
        break
      case 'get_payload_status':
        if (intent.buildId) args.buildId = intent.buildId
        break
    }

    log.info(
      { intent: intent.intent, toolName, provider: provider.name },
      'AI intent detection completed',
    )

    return { toolName, args }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    log.warn(
      { error: errorMsg },
      'AI intent detection failed, returning null',
    )
    return null
  }
}

// ============================================================
// PROVIDER SELECTION — uses fastest available model for extraction
// ============================================================

type ExtractorProvider = {
  name: string
  model: any
}

function getExtractorProvider(): ExtractorProvider {
  const env = serverEnv()

  // Prefer Grok/xAI for extraction (fast and cheap)
  if (env.XAI_API_KEY) {
    const client = createOpenAI({
      baseURL: env.XAI_BASE_URL,
      apiKey: env.XAI_API_KEY,
    })
    return { name: 'xai', model: client(env.XAI_MODEL) }
  }

  // Fallback to OpenAI
  if (env.OPENAI_API_KEY) {
    const client = createOpenAI({ apiKey: env.OPENAI_API_KEY })
    return { name: 'openai', model: client('gpt-4o-mini') }
  }

  // Fallback to Anthropic
  if (env.ANTHROPIC_API_KEY) {
    return { name: 'anthropic', model: anthropic('claude-3-5-haiku-20241022') }
  }

  // Last resort: use whatever LLM_PROVIDER is configured
  if (env.LLM_PROVIDER_API_KEY) {
    const client = createOpenAI({
      baseURL: env.LLM_PROVIDER_BASE_URL,
      apiKey: env.LLM_PROVIDER_API_KEY,
    })
    return { name: 'legacy', model: client(env.LLM_MODEL) }
  }

  // This should never happen in production
  throw new Error('No AI provider configured for argument extraction')
}
