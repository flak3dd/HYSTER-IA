import { jest } from '@jest/globals'

const AI_ENV_KEYS = [
  'SHADOWGROK_ENABLED',
  'XAI_API_KEY',
  'AZURE_OPENAI_ENDPOINT',
  'AZURE_OPENAI_API_KEY',
  'AZURE_OPENAI_DEPLOYMENT',
  'OPENROUTER_API_KEY',
  'LLM_PROVIDER_API_KEY',
  'ANTHROPIC_API_KEY',
  'GOOGLE_API_KEY',
] as const

const originalEnv = AI_ENV_KEYS.reduce<Record<string, string | undefined>>((acc, key) => {
  acc[key] = process.env[key]
  return acc
}, {})

function resetAiEnv() {
  for (const key of AI_ENV_KEYS) {
    delete process.env[key]
  }
}

async function importProviderFallbackWithMocks() {
  const generateText = jest.fn(async () => ({
    text: 'ok',
    toolCalls: [],
    finishReason: 'stop',
  }))
  const createOpenAI = jest.fn((config?: { baseURL?: string; apiKey?: string }) => {
    return jest.fn((model: string) => ({
      provider: 'openai-compatible',
      baseURL: config?.baseURL,
      hasApiKey: Boolean(config?.apiKey),
      model,
    }))
  })
  const anthropic = jest.fn((model: string) => ({ provider: 'anthropic', model }))
  const google = jest.fn((model: string) => ({ provider: 'google', model }))

  jest.doMock('ai', () => ({ generateText }))
  jest.doMock('@ai-sdk/openai', () => ({ createOpenAI }))
  jest.doMock('@ai-sdk/anthropic', () => ({ anthropic }))
  jest.doMock('@ai-sdk/google', () => ({ google }))

  const providerFallback = await import('@/lib/ai/provider-fallback')
  return { ...providerFallback, generateText, createOpenAI, anthropic, google }
}

describe('AI robustness hardening', () => {
  beforeEach(() => {
    jest.resetModules()
    jest.clearAllMocks()
    resetAiEnv()
  })

  afterAll(() => {
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = value
      }
    }
  })

  describe('provider fallback', () => {
    it('omits providers that do not have required credentials', async () => {
      const { getAvailableProviders } = await importProviderFallbackWithMocks()

      expect(getAvailableProviders()).toEqual([])
    })

    it('falls back to configured providers when ShadowGrok is requested but xAI is unavailable', async () => {
      process.env.SHADOWGROK_ENABLED = 'true'
      process.env.AZURE_OPENAI_ENDPOINT = 'https://example.openai.azure.com'
      process.env.AZURE_OPENAI_API_KEY = 'test-azure-key'
      process.env.AZURE_OPENAI_DEPLOYMENT = 'test-deployment'

      const { executeWithFallback, generateText } = await importProviderFallbackWithMocks()

      const result = await executeWithFallback(
        [{ role: 'user', content: 'hello' }],
        [],
        {
          useShadowGrok: true,
          fallbackConfig: {
            maxRetries: 1,
            retryDelay: 0,
            enableFallback: true,
            fallbackProviders: ['xai', 'azure'],
          },
        },
      )

      expect(result.success).toBe(true)
      expect(result.provider).toBe('azure')
      expect(result.attempts).toBe(1)
      expect(generateText).toHaveBeenCalledTimes(1)
    })
  })

  describe('tool validation', () => {
    it('returns validation errors instead of throwing when a tool name is missing', async () => {
      const { validateToolCall } = await import('@/lib/ai/tool-validator')

      const result = validateToolCall(
        { id: 'call_1', function: { arguments: '{}' } },
        [
          {
            type: 'function',
            function: {
              name: 'known_tool',
              parameters: { type: 'object', properties: {}, required: [] },
            },
          },
        ],
      )

      expect(result.isValid).toBe(false)
      expect(result.errors).toContain('Tool name is missing')
    })

    it('validates arguments against the provided tool definitions', async () => {
      const { validateToolCall } = await import('@/lib/ai/tool-validator')

      const result = validateToolCall(
        { id: 'call_1', function: { name: 'known_tool', arguments: '{}' } },
        [
          {
            type: 'function',
            function: {
              name: 'known_tool',
              parameters: {
                type: 'object',
                properties: {
                  requiredParam: { type: 'string' },
                },
                required: ['requiredParam'],
              },
            },
          },
        ],
      )

      expect(result.correctedCall._metadata?.validationWarnings).toContain(
        'Missing required parameter "requiredParam" for tool "known_tool"',
      )
    })
  })
})
