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
import { getExtractorModel, getExtractorProviderName } from '@/lib/ai/reasoning/extractor-provider'
import logger from '@/lib/logger'

const log = logger.child({ module: 'ai-argument-extractor' })

// ============================================================
// EXTRACTION SCHEMAS — one per tool that needs argument extraction
// All schemas are designed for cross-provider structured output compatibility:
// - NO .optional() — use empty string defaults instead
// - NO z.record() — use explicit object properties instead
// - ALL fields have .describe() — required by OpenAI
// ============================================================

const DeployNodeArgsSchema = z.object({
  provider: z
    .enum(['azure', 'hetzner', 'digitalocean', 'vultr', 'lightsail', ''])
    .describe('Cloud provider name. Empty string if not specified.'),
  region: z
    .string()
    .describe('Cloud region (e.g., eastus, westeurope, fsn1, nyc3). Empty string if not specified.'),
  size: z
    .string()
    .describe('Server size SKU (e.g., Standard_B2s, cx22, s-1vcpu-1gb). Empty string if not specified.'),
  name: z
    .string()
    .describe('Node name/label. Empty string if not specified.'),
  resourceGroup: z
    .string()
    .describe('Azure resource group name (Azure only). Empty string if not specified.'),
  panelUrl: z
    .string()
    .describe('Publicly reachable panel URL (HTTPS preferred). Empty string if not specified.'),
  tags: z
    .array(z.string())
    .describe('Node tags for organization (e.g., ["c2", "azure", "eastus"]). Empty array if not specified.'),
})

const CheckPrerequisitesArgsSchema = z.object({
  operation: z
    .enum(['deploy_node', 'generate_payload', 'send_email', 'apply_config', 'start_server', 'general', ''])
    .describe('The operation to check prerequisites for. Empty string if not specified.'),
  provider: z
    .enum(['azure', 'hetzner', 'digitalocean', 'vultr', 'lightsail', ''])
    .describe('Cloud provider (for deploy_node prerequisite). Empty string if not specified.'),
  region: z
    .string()
    .describe('Cloud region (for deploy_node prerequisite). Empty string if not specified.'),
  resourceGroup: z
    .string()
    .describe('Azure resource group (for deploy_node prerequisite). Empty string if not specified.'),
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
  })).describe('Multiple-choice options. Empty array if no options.'),
})

const GeneratePayloadArgsSchema = z.object({
  description: z
    .string()
    .describe(
      'Natural language description of the payload (platform, format, obfuscation, signing). Empty string if not specified.',
    ),
})

const GenerateConfigArgsSchema = z.object({
  description: z
    .string()
    .describe(
      'Natural language description of the desired Hysteria2 config (obfuscation, masquerade, throughput, ports). Empty string if not specified.',
    ),
})

const NodeRefArgsSchema = z.object({
  nodeId: z
    .string()
    .describe('Node ID. Empty string if not specified.'),
  name: z
    .string()
    .describe('Node name (used to look up nodeId when ID is unknown). Empty string if not specified.'),
})

const TroubleshootArgsSchema = z.object({
  issue: z
    .string()
    .describe(
      'Short description of the issue to investigate (e.g., "node unhealthy", "connection failures"). Empty string if not specified.',
    ),
  nodeId: z
    .string()
    .describe('Specific node ID, if mentioned. Empty string if not specified.'),
})

const PayloadIntentSchema = z.object({
  intent: z
    .enum(['list_payloads', 'generate_payload', 'get_payload_status', 'none'])
    .describe('Detected payload-related intent'),
  description: z
    .string()
    .describe('Natural language description for payload generation. Empty string if not applicable.'),
  buildId: z
    .string()
    .describe('Specific build ID if referenced. Empty string if not specified.'),
  limit: z
    .number()
    .describe('Number of items to list. 0 if not applicable.'),
})

// Map tool names to their extraction schemas
const EXTRACTION_SCHEMAS: Record<string, z.ZodType> = {
  deploy_node: DeployNodeArgsSchema,
  check_prerequisites: CheckPrerequisitesArgsSchema,
  generate_plan: GeneratePlanArgsSchema,
  prompt_user: PromptUserArgsSchema,
  generate_payload: GeneratePayloadArgsSchema,
  generate_config: GenerateConfigArgsSchema,
  get_node: NodeRefArgsSchema,
  update_node: NodeRefArgsSchema,
  delete_node: NodeRefArgsSchema,
  troubleshoot: TroubleshootArgsSchema,
}

// Tools where a missing required string-description argument should fall back
// to the raw user message rather than failing. This guarantees forward progress
// when the LLM planner forgot to include the description.
const DESCRIPTION_FALLBACK_TOOLS = new Set<string>([
  'generate_payload',
  'generate_config',
])

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
    const result = await generateObject({
      model: getExtractorModel(),
      schema: schema as z.ZodObject<any>,
      system: EXTRACTION_SYSTEM_PROMPT,
      prompt: `Tool: ${toolName}\nMissing parameters: ${missingFields.join(', ')}\nUser message: "${userMessage}"\n\nExtract the missing arguments from the user's message. Only fill in values that are clearly stated or implied.`,
      temperature: 0,
      abortSignal: signal,
    })

    const extractedArgs = result.object as Record<string, unknown>

    // Filter out empty-string values (they represent "not specified" in our schema)
    const meaningfulArgs: Record<string, unknown> = {}
    const extractedFields: string[] = []
    for (const [key, value] of Object.entries(extractedArgs)) {
      // Skip empty strings (our "not specified" marker), empty arrays, and 0 for limit
      if (value === '' || value === undefined || value === null) continue
      if (Array.isArray(value) && value.length === 0) continue
      if (key === 'limit' && value === 0) continue
      meaningfulArgs[key] = value
      extractedFields.push(key)
    }

    // Merge extracted args with existing args (existing takes precedence)
    const mergedArgs = { ...meaningfulArgs, ...existingArgs }

    // Description fallback: if the tool requires a description (e.g. generate_payload,
    // generate_config) and the planner/extractor didn't produce one, use the raw user
    // message so the call doesn't fail with a Zod "expected string, received undefined".
    if (
      DESCRIPTION_FALLBACK_TOOLS.has(toolName) &&
      (typeof mergedArgs.description !== 'string' || mergedArgs.description.length === 0) &&
      typeof userMessage === 'string' &&
      userMessage.trim().length > 0
    ) {
      mergedArgs.description = userMessage.trim()
      if (!extractedFields.includes('description')) extractedFields.push('description')
    }

    log.info(
      {
        toolName,
        missingFields,
        extractedFields,
        provider: getExtractorProviderName(),
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

    // Apply description fallback even when extraction fails, so simple
    // single-arg tools still make forward progress.
    const fallbackArgs: Record<string, unknown> = { ...existingArgs }
    const fallbackFields: string[] = []
    if (
      DESCRIPTION_FALLBACK_TOOLS.has(toolName) &&
      (typeof fallbackArgs.description !== 'string' || fallbackArgs.description.length === 0) &&
      typeof userMessage === 'string' &&
      userMessage.trim().length > 0
    ) {
      fallbackArgs.description = userMessage.trim()
      fallbackFields.push('description')
    }

    return {
      success: false,
      args: fallbackArgs,
      error: errorMsg,
      extractedFields: fallbackFields,
      missingFields: missingFields.filter((f) => !fallbackFields.includes(f)),
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
    const result = await generateObject({
      model: getExtractorModel(),
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
        args.limit = intent.limit > 0 ? intent.limit : 20
        break
      case 'generate_payload':
        args.description = intent.description || userMessage
        break
      case 'get_payload_status':
        if (intent.buildId) args.buildId = intent.buildId
        break
    }

    log.info(
      { intent: intent.intent, toolName, provider: getExtractorProviderName() },
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


