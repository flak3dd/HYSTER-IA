/**
 * Shared Extractor Model Provider
 *
 * Provides a consistent, fast LLM model for structured extraction
 * across all reasoning modules. Uses the cheapest/fastest available model
 * since extraction tasks don't need reasoning capability.
 */

import { createOpenAI } from '@ai-sdk/openai'
import { anthropic } from '@ai-sdk/anthropic'
import { serverEnv } from '@/lib/env'

let cachedModel: { name: string; model: any } | null = null

/**
 * Get the extractor model for structured output generation.
 * Caches the model instance for reuse across calls.
 */
export function getExtractorModel() {
  if (cachedModel) return cachedModel.model

  const env = serverEnv()

  // Prefer xAI/Grok for extraction (fast and cheap)
  if (env.XAI_API_KEY) {
    const client = createOpenAI({
      baseURL: env.XAI_BASE_URL,
      apiKey: env.XAI_API_KEY,
    })
    cachedModel = { name: 'xai', model: client(env.XAI_MODEL) }
    return cachedModel.model
  }

  // Fallback to OpenAI
  if (env.OPENAI_API_KEY) {
    const client = createOpenAI({ apiKey: env.OPENAI_API_KEY })
    cachedModel = { name: 'openai', model: client('gpt-4o-mini') }
    return cachedModel.model
  }

  // Fallback to Anthropic
  if (env.ANTHROPIC_API_KEY) {
    cachedModel = { name: 'anthropic', model: anthropic('claude-3-5-haiku-20241022') }
    return cachedModel.model
  }

  // Last resort: use whatever LLM_PROVIDER is configured
  if (env.LLM_PROVIDER_API_KEY) {
    const client = createOpenAI({
      baseURL: env.LLM_PROVIDER_BASE_URL,
      apiKey: env.LLM_PROVIDER_API_KEY,
    })
    cachedModel = { name: 'legacy', model: client(env.LLM_MODEL) }
    return cachedModel.model
  }

  throw new Error('No AI provider configured for structured extraction')
}

/**
 * Clear the cached model (useful when provider config changes)
 */
export function clearExtractorModelCache(): void {
  cachedModel = null
}
