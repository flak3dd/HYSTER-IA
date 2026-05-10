/**
 * OpenRouter stack — shared OpenAI-compatible client + model resolution.
 *
 * Matches OpenRouter quickstart: Bearer auth on base URL `/api/v1`, optional
 * `HTTP-Referer` and `X-OpenRouter-Title` for attribution.
 * @see https://openrouter.ai/docs/quickstart.md
 */

import { createOpenAI } from '@ai-sdk/openai'
import type { LanguageModel } from 'ai'
import { serverEnv, type ServerEnv } from '@/lib/env'

export type OpenRouterModelKind = 'chat_tooling' | 'reasoning_json' | 'cheap'

function nonempty(s: string | undefined): s is string {
  return typeof s === 'string' && s.trim().length > 0
}

/** Resolve model slug for chat vs structured reasoning. */
export function getOpenRouterModelId(
  env: Pick<
    ServerEnv,
    | 'OPENROUTER_MODEL'
    | 'OPENROUTER_MODEL_CHAT_DEFAULT'
    | 'OPENROUTER_MODEL_REASONING_JSON'
    | 'OPENROUTER_MODEL_CHEAP'
  >,
  kind: OpenRouterModelKind,
): string {
  const canonical = env.OPENROUTER_MODEL
  switch (kind) {
    case 'chat_tooling':
      return nonempty(env.OPENROUTER_MODEL_CHAT_DEFAULT)
        ? env.OPENROUTER_MODEL_CHAT_DEFAULT
        : canonical
    case 'reasoning_json':
      return nonempty(env.OPENROUTER_MODEL_REASONING_JSON)
        ? env.OPENROUTER_MODEL_REASONING_JSON
        : canonical
    case 'cheap':
      return nonempty(env.OPENROUTER_MODEL_CHEAP)
        ? env.OPENROUTER_MODEL_CHEAP
        : nonempty(env.OPENROUTER_MODEL_CHAT_DEFAULT)
          ? env.OPENROUTER_MODEL_CHAT_DEFAULT
          : canonical
    default:
      return canonical
  }
}

/** @ai-sdk/openai provider configured for OpenRouter (OpenAI-compat). */
export function createOpenRouterOpenAICompat(env: Pick<ServerEnv, 'OPENROUTER_API_KEY' | 'OPENROUTER_BASE_URL' | 'NEXT_PUBLIC_APP_URL' | 'OPENROUTER_APP_TITLE'>) {
  const key = env.OPENROUTER_API_KEY?.trim()
  if (!key) {
    throw new Error('OPENROUTER_API_KEY is required for OpenRouter client')
  }

  const title =
    nonempty(env.OPENROUTER_APP_TITLE)
      ? env.OPENROUTER_APP_TITLE!.trim()
      : 'Hysteria2 Panel'

  return createOpenAI({
    baseURL: env.OPENROUTER_BASE_URL,
    apiKey: key,
    headers: {
      'HTTP-Referer': env.NEXT_PUBLIC_APP_URL,
      'X-OpenRouter-Title': title,
    },
  })
}

/** Language model instance for chat/tooling defaults. */
export function getOpenRouterChatModel(env = serverEnv()): LanguageModel {
  const client = createOpenRouterOpenAICompat(env)
  return client(getOpenRouterModelId(env, 'chat_tooling'))
}

/** Language model instance for reasoning / JSON schema calls. */
export function getOpenRouterReasoningJsonModel(env = serverEnv()): LanguageModel {
  const client = createOpenRouterOpenAICompat(env)
  return client(getOpenRouterModelId(env, 'reasoning_json'))
}

/** Provider order helpers for deterministic OpenRouter-first lists (tests + llm routing). */
export function hasOpenRouterKey(env: Pick<ServerEnv, 'OPENROUTER_API_KEY'>): boolean {
  return nonempty(env.OPENROUTER_API_KEY)
}

/**
 * Canonical provider name order used by chatComplete / fallback tails.
 * Only includes logical providers; callers filter by configured keys.
 */
export const PROVIDER_FALLBACK_SEQUENCE = [
  'openrouter',
  'anthropic',
  'openai',
  'google',
  'azure',
  'legacy',
  'xai',
  'grok',
] as const

export type ProviderName = string

/** Ordered list filtered to configured providers (excluding `preferred` if omitPreferred). */
export function buildConfiguredProviderOrder(
  env: Pick<
    ServerEnv,
    | 'OPENROUTER_API_KEY'
    | 'ANTHROPIC_API_KEY'
    | 'OPENAI_API_KEY'
    | 'GOOGLE_API_KEY'
    | 'AZURE_OPENAI_ENDPOINT'
    | 'AZURE_OPENAI_API_KEY'
    | 'LLM_PROVIDER_API_KEY'
    | 'XAI_API_KEY'
    | 'SHADOWGROK_ENABLED'
  >,
  options: {
    useShadowGrok: boolean
    omitPreferred?: string
  },
): ProviderName[] {
  const configured = new Set<ProviderName>()

  if (hasOpenRouterKey(env)) configured.add('openrouter')
  if (nonempty(env.ANTHROPIC_API_KEY)) configured.add('anthropic')
  if (nonempty(env.OPENAI_API_KEY)) configured.add('openai')
  if (nonempty(env.GOOGLE_API_KEY)) configured.add('google')
  if (
    nonempty(env.AZURE_OPENAI_ENDPOINT) &&
    nonempty(env.AZURE_OPENAI_API_KEY)
  ) {
    configured.add('azure')
  }
  if (nonempty(env.LLM_PROVIDER_API_KEY)) configured.add('legacy')
  if (options.useShadowGrok && env.SHADOWGROK_ENABLED && nonempty(env.XAI_API_KEY)) {
    configured.add('xai')
  }

  configured.add('grok')

  const omit = options.omitPreferred ?? ''
  return PROVIDER_FALLBACK_SEQUENCE.filter(
    name => configured.has(name) && name !== omit,
  )
}
