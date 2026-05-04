import { openai, createOpenAI } from '@ai-sdk/openai'
import { generateText } from 'ai'
import { serverEnv } from '@/lib/env'
import { validateToolCalls } from './tool-validator'
import { executeWithFallback } from './provider-fallback'
import { normalizeToolCalls } from './tool-normalizer'
import { createHash } from 'crypto'

// ============================================================
// OPTIMIZED LOGGING UTILITY
// ============================================================

const AI_DEBUG = process.env.AI_DEBUG === 'true' || serverEnv().AI_DEBUG

function aiLog(message: string, ...args: any[]) {
  if (AI_DEBUG) {
    console.log(`[AI] ${message}`, ...args)
  }
}

function aiWarn(message: string, ...args: any[]) {
  if (AI_DEBUG) {
    console.warn(`[AI] ${message}`, ...args)
  }
}

// ============================================================
// OPTIMIZED RESPONSE CACHING LAYER (LRU)
// ============================================================

interface CacheEntry {
  response: any
  timestamp: number
  hits: number
  accessOrder: number
}

class ResponseCache {
  private cache: Map<string, CacheEntry> = new Map()
  private maxEntries: number = 1000
  private ttl: number = 5 * 60 * 1000 // 5 minutes TTL
  private hits: number = 0
  private misses: number = 0
  private accessCounter: number = 0

  constructor(maxEntries: number = 1000, ttl: number = 5 * 60 * 1000) {
    this.maxEntries = maxEntries
    this.ttl = ttl
  }

  private generateKey(messages: any[], temperature: number, model?: string): string {
    const keyData = {
      messages: messages.map(m => ({ role: m.role, content: m.content })),
      temperature,
      model,
    }
    return createHash('sha256').update(JSON.stringify(keyData)).digest('hex')
  }

  get(messages: any[], temperature: number, model?: string): any | null {
    const key = this.generateKey(messages, temperature, model)
    const entry = this.cache.get(key)

    if (!entry) {
      this.misses++
      return null
    }

    // Check TTL
    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key)
      this.misses++
      return null
    }

    // Update access order for LRU
    entry.accessOrder = ++this.accessCounter
    entry.hits++
    this.hits++
    return entry.response
  }

  set(messages: any[], temperature: number, response: any, model?: string): void {
    const key = this.generateKey(messages, temperature, model)

    // Evict least recently used entry if cache is full (O(1) with accessOrder)
    if (this.cache.size >= this.maxEntries) {
      let lruKey: string | null = null
      let minAccessOrder = Infinity

      for (const [k, entry] of this.cache.entries()) {
        if (entry.accessOrder < minAccessOrder) {
          minAccessOrder = entry.accessOrder
          lruKey = k
        }
      }

      if (lruKey) {
        this.cache.delete(lruKey)
      }
    }

    this.cache.set(key, {
      response,
      timestamp: Date.now(),
      hits: 0,
      accessOrder: ++this.accessCounter,
    })
  }

  clear(): void {
    this.cache.clear()
    this.hits = 0
    this.misses = 0
    this.accessCounter = 0
  }

  getStats() {
    return {
      size: this.cache.size,
      hits: this.hits,
      misses: this.misses,
      hitRate: this.hits + this.misses > 0 ? this.hits / (this.hits + this.misses) : 0,
    }
  }
}

// Global cache instance
const responseCache = new ResponseCache(1000, 5 * 60 * 1000)

// ============================================================
// TOOL MAPPING HELPER (extracted to avoid duplication)
// ============================================================

interface ToolCallMappingResult {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
  _metadata?: {
    originalToolName: string
    mappingSource: string
  }
}

function mapToolCalls(toolCalls: any[], tools?: any[]): ToolCallMappingResult[] {
  return toolCalls.map(tc => {
    let toolName = tc.toolName
    let mappingSource = 'original'

    // Check if the tool name is a numeric index (xAI Grok behavior)
    if (/^\d+$/.test(toolName) && tools && Array.isArray(tools)) {
      const index = parseInt(toolName, 10)
      aiLog(`Detected numeric tool index: ${index}, mapping to tool name...`)

      if (index >= 0 && index < tools.length) {
        const toolDef = tools[index]
        if (toolDef && typeof toolDef === 'object') {
          if (toolDef.type === 'function' && toolDef.function?.name) {
            toolName = toolDef.function.name
            mappingSource = `numeric_index_${index}`
          } else if (toolDef.name) {
            toolName = toolDef.name
            mappingSource = `numeric_index_${index}`
          }
        }
      }
    }

    // Additional validation: ensure the mapped tool name exists in our known tools
    if (tools && Array.isArray(tools)) {
      const knownToolNames = tools
        .map(t => t.type === 'function' ? t.function?.name : t.name)
        .filter(Boolean)

      if (!knownToolNames.includes(toolName)) {
        aiWarn(`Mapped tool name "${toolName}" not found in known tools:`, knownToolNames)

        // Try to find a similar tool name using fuzzy matching
        const similarTool = knownToolNames.find(name =>
          name.toLowerCase().includes(toolName.toLowerCase()) ||
          toolName.toLowerCase().includes(name.toLowerCase())
        )

        if (similarTool) {
          aiLog(`Found similar tool name: "${similarTool}", using instead of "${toolName}"`)
          toolName = similarTool
          mappingSource = `${mappingSource}_fuzzy_match`
        }
      }
    }

    const mappedCall: ToolCallMappingResult = {
      id: tc.toolCallId,
      type: 'function',
      function: {
        name: toolName,
        arguments: JSON.stringify(tc.input || {}),
      },
      _metadata: {
        originalToolName: tc.toolName,
        mappingSource,
      }
    }

    aiLog(`Mapped tool call: ${tc.toolName} -> ${toolName} (${mappingSource})`)

    return mappedCall
  })
}

export function getCacheStats() {
  return responseCache.getStats()
}

export function clearResponseCache() {
  responseCache.clear()
}

export function getAllCacheStats() {
  return {
    llm: getCacheStats(),
    systemPrompt: null,
    dynamicContext: null,
    toolResults: null,
  }
}

export function clearAllCaches() {
  clearResponseCache()
}

export type ChatMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  tool_calls?: Array<{
    id: string
    type: 'function'
    function: {
      name: string
      arguments: string
    }
  }>
  tool_call_id?: string
}

export async function chatComplete(options: {
  messages: ChatMessage[]
  temperature?: number
  model?: string
  tools?: any
  signal?: AbortSignal
  useShadowGrok?: boolean
  enableFallback?: boolean
  sessionId?: string
  enableCache?: boolean
}): Promise<{ 
  content: string | null
  finishReason: string | null
  toolCalls: Array<{
    id: string
    type: 'function'
    function: {
      name: string
      arguments: string
    }
  }>
  _provider?: string
  _validation?: {
    allValid: boolean
    totalWarnings: number
    totalErrors: number
  }
  _sessionId?: string
  _cached?: boolean
  _cacheStats?: any
}> {
  const { messages, temperature = 0.7, model, tools, signal, useShadowGrok = false, enableFallback = false, sessionId, enableCache = true } = options
  const env = serverEnv()

  // Check cache for non-tool calls (tool calls shouldn't be cached as they may have side effects)
  if (enableCache && !tools) {
    const cachedResponse = responseCache.get(messages, temperature, model)
    if (cachedResponse) {
      aiLog('Cache hit - returning cached response')
      return {
        ...cachedResponse,
        _cached: true,
        _cacheStats: responseCache.getStats(),
      }
    }
  }

  // Start debug session if not provided
  const effectiveSessionId = sessionId || 'unknown-session';
  let providerUsed = 'unknown';

  let selectedModel: any
  let selectedModelName: string

  // Use fallback system if enabled
  if (enableFallback) {
    aiLog('Using provider fallback system')
    // debugLoggerlogProviderFallback(effectiveSessionId, 'initial', 'fallback_system', 'Automatic fallback enabled');

    const fallbackResult = await executeWithFallback(messages, tools || [], {
      temperature,
      signal,
      useShadowGrok,
      fallbackConfig: {
        maxRetries: 2,
        retryDelay: 500,
        enableFallback: true,
        fallbackProviders: ['azure', 'openrouter', 'legacy', 'openai'],
      },
    })

    if (!fallbackResult.success) {
      // debugLoggerlogToolCall(effectiveSessionId, {
      //   toolName: 'fallback_system',
      //   success: false,
      //   executionTimeMs: 0,
      //   errorMessage: fallbackResult.error,
      // });
      throw new Error(`Fallback system failed: ${fallbackResult.error}`)
    }

    providerUsed = fallbackResult.provider
    aiLog(`Fallback system succeeded with provider: ${providerUsed}`)
    // debugLoggerlogProviderFallback(effectiveSessionId, 'fallback_system', providerUsed, 'Fallback successful');

    // Process the successful result
    const result = fallbackResult.data
    aiLog('Raw toolCalls from AI SDK:', JSON.stringify(result.toolCalls, null, 2))
    
    // Update session with actual provider used
    // const session = debugLogger.getSessionSummary(effectiveSessionId);
    // if (session) {
    //   session.providerUsed = providerUsed;
    // }

    // Use helper function to map tool calls
    const mappedToolCalls = mapToolCalls(result.toolCalls || [], tools)

    aiLog('Final mapped toolCalls:', JSON.stringify(mappedToolCalls, null, 2))

    // Normalize tool calls to standard format
    aiLog('Normalizing tool calls...')
    const normalization = normalizeToolCalls(mappedToolCalls, tools)
    
    if (!normalization.success) {
      aiWarn(`Tool normalization failed: ${normalization.errors.join(', ')}`)
    }
    
    if (normalization.warnings.length > 0) {
      aiLog(`Tool normalization warnings: ${normalization.warnings.join(', ')}`)
    }
    
    const normalizedCalls = normalization.normalizedCalls
    aiLog('Normalized toolCalls:', JSON.stringify(normalizedCalls.map(nc => ({
      id: nc.id,
      name: nc.function.name,
      steps: nc.normalizationSteps,
    })), null, 2))

    // Validate and correct tool calls
    if (normalizedCalls.length > 0) {
      aiLog('Running tool call validation...')
      const validation = validateToolCalls(normalizedCalls.map(nc => ({
        id: nc.id,
        function: {
          name: nc.function.name,
          arguments: JSON.stringify(nc.function.arguments),
        },
      })), tools)
      
      if (!validation.allValid) {
        aiWarn(`Tool validation failed: ${validation.totalErrors} errors, ${validation.totalWarnings} warnings`)
      }
      
      if (validation.totalWarnings > 0) {
        aiLog(`Tool validation warnings: ${validation.totalWarnings}`)
      }
      
      // Use validated calls
      const finalToolCalls = validation.validatedCalls
      aiLog('Final validated toolCalls:', JSON.stringify(finalToolCalls, null, 2))

      // Log each tool call with normalization info
      finalToolCalls.forEach(tc => {
        const originalNormalized = normalizedCalls.find(nc => nc.id === tc.id);
        // debugLoggerlogToolCall(effectiveSessionId, {
          toolName: tc.function.name,
          originalToolName: tc._metadata?.originalToolName || originalNormalized?.originalFormat?.function?.name,
          mappingSource: tc._metadata?.mappingSource || originalNormalized?.normalizationSteps.join(', '),
          arguments: JSON.parse(tc.function.arguments),
          success: true,
          executionTimeMs: 0,
          validationWarnings: tc._metadata?.validationWarnings,
          
        });
      });

      // debugLoggerendSession(effectiveSessionId);

      const response = {
        content: result.text,
        finishReason: result.finishReason,
        toolCalls: finalToolCalls,
        _provider: providerUsed,
        _validation: {
          allValid: validation.allValid,
          totalWarnings: validation.totalWarnings,
          totalErrors: validation.totalErrors,
        },
        _sessionId: effectiveSessionId,
      }

      // Cache the response if no tools were involved
      if (enableCache && !tools) {
        responseCache.set(messages, temperature, response, model)
      }

      return response
    }

    // Return normalized calls even if no validation was needed
    const finalNormalizedCalls = normalizedCalls.map(nc => ({
      id: nc.id,
      type: 'function' as const,
      function: {
        name: nc.function.name,
        arguments: JSON.stringify(nc.function.arguments),
      },
      _metadata: {
        originalToolName: nc.originalFormat?.function?.name,
        mappingSource: nc.normalizationSteps.join(', '),
      },
    }));

    // debugLoggerendSession(effectiveSessionId);

    const response = {
      content: result.text,
      finishReason: result.finishReason,
      toolCalls: finalNormalizedCalls,
      _provider: providerUsed,
      _sessionId: effectiveSessionId,
    }

    // Cache the response if no tools were involved
    if (enableCache && !tools) {
      responseCache.set(messages, temperature, response, model)
    }

    return response
  }

  // Original logic without fallback
  // Priority: ShadowGrok/xAI > Azure OpenAI > OpenRouter > Legacy LLM > Default OpenAI
  if (useShadowGrok && env.SHADOWGROK_ENABLED && env.XAI_API_KEY) {
    // Use xAI Grok for ShadowGrok operations
    const xaiClient = createOpenAI({
      baseURL: env.XAI_BASE_URL,
      apiKey: env.XAI_API_KEY,
    })
    selectedModel = xaiClient(model || env.XAI_MODEL)
    selectedModelName = model || env.XAI_MODEL
    providerUsed = 'xai'
  } else if (env.AZURE_OPENAI_ENDPOINT && env.AZURE_OPENAI_API_KEY) {
    // Use Azure OpenAI (highest priority for non-ShadowGrok)
    const azureClient = createOpenAI({
      baseURL: `${env.AZURE_OPENAI_ENDPOINT}/openai/deployments/${env.AZURE_OPENAI_DEPLOYMENT}`,
      apiKey: env.AZURE_OPENAI_API_KEY,
    })
    selectedModel = azureClient(env.AZURE_OPENAI_DEPLOYMENT)
    selectedModelName = env.AZURE_OPENAI_DEPLOYMENT
    providerUsed = 'azure'
  } else if (env.OPENROUTER_API_KEY) {
    // Use OpenRouter (second priority)
    const openRouterClient = createOpenAI({
      baseURL: env.OPENROUTER_BASE_URL,
      apiKey: env.OPENROUTER_API_KEY,
    })
    selectedModel = openRouterClient(model || env.OPENROUTER_MODEL)
    selectedModelName = model || env.OPENROUTER_MODEL
    providerUsed = 'openrouter'
  } else if (env.LLM_PROVIDER_API_KEY) {
    // Use legacy LLM configuration (fallback)
    const legacyClient = createOpenAI({
      baseURL: env.LLM_PROVIDER_BASE_URL,
      apiKey: env.LLM_PROVIDER_API_KEY,
    })
    selectedModel = legacyClient(model || env.LLM_MODEL)
    selectedModelName = model || env.LLM_MODEL
    providerUsed = 'legacy'
  } else {
    // Default to OpenAI
    selectedModel = openai(model || 'gpt-4o-mini')
    selectedModelName = model || 'gpt-4o-mini'
    providerUsed = 'openai'
  }

  try {
    aiLog('Using provider:', providerUsed)
    aiLog('Tools being passed to AI SDK:', JSON.stringify(tools, null, 2))

    const result = await generateText({
      model: selectedModel,
      messages: messages
        .filter(m => m.role !== 'tool') // Filter out tool messages for simple implementation
        .map(m => ({
        role: m.role as 'system' | 'user' | 'assistant',
        content: m.content,
      })),
      temperature,
      tools,
      abortSignal: signal,
    })

    aiLog('Raw toolCalls from AI SDK:', JSON.stringify(result.toolCalls, null, 2))

    // Use helper function to map tool calls
    const mappedToolCalls = mapToolCalls(result.toolCalls || [], tools)

    aiLog('Final mapped toolCalls:', JSON.stringify(mappedToolCalls, null, 2))

    // Normalize tool calls to standard format
    aiLog('Normalizing tool calls...')
    const normalization = normalizeToolCalls(mappedToolCalls, tools)
    
    if (!normalization.success) {
      aiWarn(`Tool normalization failed: ${normalization.errors.join(', ')}`)
    }
    
    if (normalization.warnings.length > 0) {
      aiLog(`Tool normalization warnings: ${normalization.warnings.join(', ')}`)
    }
    
    const normalizedCalls = normalization.normalizedCalls
    aiLog('Normalized toolCalls:', JSON.stringify(normalizedCalls.map(nc => ({
      id: nc.id,
      name: nc.function.name,
      steps: nc.normalizationSteps,
    })), null, 2))

    // Validate and correct tool calls
    if (normalizedCalls.length > 0) {
      aiLog('Running tool call validation...')
      const validation = validateToolCalls(normalizedCalls.map(nc => ({
        id: nc.id,
        function: {
          name: nc.function.name,
          arguments: JSON.stringify(nc.function.arguments),
        },
      })), tools)
      
      if (!validation.allValid) {
        aiWarn(`Tool validation failed: ${validation.totalErrors} errors, ${validation.totalWarnings} warnings`)
      }
      
      if (validation.totalWarnings > 0) {
        aiLog(`Tool validation warnings: ${validation.totalWarnings}`)
      }
      
      // Use validated calls
      const finalToolCalls = validation.validatedCalls
      aiLog('Final validated toolCalls:', JSON.stringify(finalToolCalls, null, 2))

      // Log each tool call with normalization info
      finalToolCalls.forEach(tc => {
        const originalNormalized = normalizedCalls.find(nc => nc.id === tc.id);
        // debugLoggerlogToolCall(effectiveSessionId, {
          toolName: tc.function.name,
          originalToolName: tc._metadata?.originalToolName || originalNormalized?.originalFormat?.function?.name,
          mappingSource: tc._metadata?.mappingSource || originalNormalized?.normalizationSteps.join(', '),
          arguments: JSON.parse(tc.function.arguments),
          success: true,
          executionTimeMs: 0,
          validationWarnings: tc._metadata?.validationWarnings,
          
        });
      });

      // debugLoggerendSession(effectiveSessionId);

      const response = {
        content: result.text,
        finishReason: result.finishReason,
        toolCalls: finalToolCalls,
        _provider: providerUsed,
        _validation: {
          allValid: validation.allValid,
          totalWarnings: validation.totalWarnings,
          totalErrors: validation.totalErrors,
        },
        _sessionId: effectiveSessionId,
      }

      // Cache the response if no tools were involved
      if (enableCache && !tools) {
        responseCache.set(messages, temperature, response, model)
      }

      return response
    }

    // Return normalized calls even if no validation was needed
    const finalNormalizedCalls = normalizedCalls.map(nc => ({
      id: nc.id,
      type: 'function' as const,
      function: {
        name: nc.function.name,
        arguments: JSON.stringify(nc.function.arguments),
      },
      _metadata: {
        originalToolName: nc.originalFormat?.function?.name,
        mappingSource: nc.normalizationSteps.join(', '),
      },
    }));

    // debugLoggerendSession(effectiveSessionId);

    const response = {
      content: result.text,
      finishReason: result.finishReason,
      toolCalls: finalNormalizedCalls,
      _provider: providerUsed,
      _sessionId: effectiveSessionId,
    }

    // Cache the response if no tools were involved
    if (enableCache && !tools) {
      responseCache.set(messages, temperature, response, model)
    }

    return response
  } catch (error) {
    console.error('LLM API error:', error)
    throw new Error('Failed to complete chat request')
  }
}