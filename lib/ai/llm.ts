import { openai, createOpenAI } from '@ai-sdk/openai'
import { anthropic } from '@ai-sdk/anthropic'
import { google } from '@ai-sdk/google'
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
// PROVIDER HEALTH MONITORING
// ============================================================

interface ProviderHealth {
  provider: string
  healthy: boolean
  lastCheck: number
  consecutiveFailures: number
  averageLatency: number
  totalRequests: number
  failedRequests: number
}

class ProviderHealthMonitor {
  private healthMap: Map<string, ProviderHealth> = new Map()
  private checkInterval: number = 60 * 1000 // 1 minute
  private maxFailures: number = 3

  recordRequest(provider: string, success: boolean, latency: number): void {
    const health = this.healthMap.get(provider) || {
      provider,
      healthy: true,
      lastCheck: Date.now(),
      consecutiveFailures: 0,
      averageLatency: 0,
      totalRequests: 0,
      failedRequests: 0,
    }

    health.totalRequests++
    health.lastCheck = Date.now()

    if (success) {
      health.consecutiveFailures = 0
      health.healthy = true
      // Update moving average latency
      health.averageLatency = (health.averageLatency * 0.9) + (latency * 0.1)
    } else {
      health.failedRequests++
      health.consecutiveFailures++
      
      if (health.consecutiveFailures >= this.maxFailures) {
        health.healthy = false
        aiWarn(`Provider ${provider} marked as unhealthy after ${health.consecutiveFailures} consecutive failures`)
      }
    }

    this.healthMap.set(provider, health)
  }

  isHealthy(provider: string): boolean {
    const health = this.healthMap.get(provider)
    return health ? health.healthy : true // Assume healthy if no data
  }

  getHealth(provider: string): ProviderHealth | undefined {
    return this.healthMap.get(provider)
  }

  getAllHealth(): ProviderHealth[] {
    return Array.from(this.healthMap.values())
  }

  getBestProvider(availableProviders: string[]): string | null {
    const healthyProviders = availableProviders.filter(p => this.isHealthy(p))
    
    if (healthyProviders.length === 0) {
      return availableProviders[0] || null // Return first available if none healthy
    }

    // Select based on lowest latency
    return healthyProviders.reduce((best, current) => {
      const bestHealth = this.healthMap.get(best)
      const currentHealth = this.healthMap.get(current)
      
      if (!bestHealth) return current
      if (!currentHealth) return best
      
      return bestHealth.averageLatency < currentHealth.averageLatency ? best : current
    })
  }

  reset(provider: string): void {
    this.healthMap.delete(provider)
  }
}

const providerHealthMonitor = new ProviderHealthMonitor()

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

export function getProviderHealth() {
  return providerHealthMonitor.getAllHealth()
}

export function resetProviderHealth(provider: string) {
  providerHealthMonitor.reset(provider)
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
  preferredProvider?: string
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
  _health?: ProviderHealth
}> {
  const { messages, temperature = 0.7, model, tools, signal, useShadowGrok = false, enableFallback = false, sessionId, enableCache = true, preferredProvider } = options
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
  const requestStartTime = Date.now()

  let selectedModel: any
  let selectedModelName: string

  // Build list of available providers
  const availableProviders: string[] = []
  if (useShadowGrok && env.SHADOWGROK_ENABLED && env.XAI_API_KEY) availableProviders.push('xai')
  if (env.ANTHROPIC_API_KEY) availableProviders.push('anthropic')
  if (env.GOOGLE_API_KEY) availableProviders.push('google')
  if (env.AZURE_OPENAI_ENDPOINT && env.AZURE_OPENAI_API_KEY) availableProviders.push('azure')
  if (env.OPENROUTER_API_KEY) availableProviders.push('openrouter')
  if (env.LLM_PROVIDER_API_KEY) availableProviders.push('legacy')
  availableProviders.push('openai') // Always available as fallback

  // Select provider based on preference, health, or priority
  let selectedProvider = preferredProvider
  if (!selectedProvider || !availableProviders.includes(selectedProvider)) {
    selectedProvider = providerHealthMonitor.getBestProvider(availableProviders) || availableProviders[0]
  }

  aiLog(`Selected provider: ${selectedProvider} (available: ${availableProviders.join(', ')})`)

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
        fallbackProviders: ['azure', 'openrouter', 'legacy', 'openai', 'anthropic', 'google'],
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
        // debugLogger.logToolCall(effectiveSessionId, {
        //   toolName: tc.function.name,
        //   originalToolName: tc._metadata?.originalToolName || originalNormalized?.originalFormat?.function?.name,
        //   mappingSource: tc._metadata?.mappingSource || originalNormalized?.normalizationSteps.join(', '),
        //   arguments: JSON.parse(tc.function.arguments),
        //   success: true,
        //   executionTimeMs: 0,
        //   validationWarnings: tc._metadata?.validationWarnings,
        // });
      });

      // debugLogger.endSession(effectiveSessionId);

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
        _health: providerHealthMonitor.getHealth(providerUsed),
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

    // debugLogger.endSession(effectiveSessionId);

    const response = {
      content: result.text,
      finishReason: result.finishReason,
      toolCalls: finalNormalizedCalls,
      _provider: providerUsed,
      _sessionId: effectiveSessionId,
      _health: providerHealthMonitor.getHealth(providerUsed),
    }

    // Cache the response if no tools were involved
    if (enableCache && !tools) {
      responseCache.set(messages, temperature, response, model)
    }

    return response
  }

  // Enhanced provider selection with health monitoring
  try {
    switch (selectedProvider) {
      case 'xai':
        if (useShadowGrok && env.SHADOWGROK_ENABLED && env.XAI_API_KEY) {
          const xaiClient = createOpenAI({
            baseURL: env.XAI_BASE_URL,
            apiKey: env.XAI_API_KEY,
          })
          selectedModel = xaiClient(model || env.XAI_MODEL)
          selectedModelName = model || env.XAI_MODEL
          providerUsed = 'xai'
        }
        break
      case 'anthropic':
        if (env.ANTHROPIC_API_KEY) {
          selectedModel = anthropic(model || 'claude-3-5-sonnet-20241022')
          selectedModelName = model || 'claude-3-5-sonnet-20241022'
          providerUsed = 'anthropic'
        }
        break
      case 'google':
        if (env.GOOGLE_API_KEY) {
          selectedModel = google(model || 'gemini-1.5-pro')
          selectedModelName = model || 'gemini-1.5-pro'
          providerUsed = 'google'
        }
        break
      case 'azure':
        if (env.AZURE_OPENAI_ENDPOINT && env.AZURE_OPENAI_API_KEY) {
          const azureClient = createOpenAI({
            baseURL: `${env.AZURE_OPENAI_ENDPOINT}/openai/deployments/${env.AZURE_OPENAI_DEPLOYMENT}`,
            apiKey: env.AZURE_OPENAI_API_KEY,
          })
          selectedModel = azureClient(env.AZURE_OPENAI_DEPLOYMENT)
          selectedModelName = env.AZURE_OPENAI_DEPLOYMENT
          providerUsed = 'azure'
        }
        break
      case 'openrouter':
        if (env.OPENROUTER_API_KEY) {
          const openRouterClient = createOpenAI({
            baseURL: env.OPENROUTER_BASE_URL,
            apiKey: env.OPENROUTER_API_KEY,
          })
          selectedModel = openRouterClient(model || env.OPENROUTER_MODEL)
          selectedModelName = model || env.OPENROUTER_MODEL
          providerUsed = 'openrouter'
        }
        break
      case 'legacy':
        if (env.LLM_PROVIDER_API_KEY) {
          const legacyClient = createOpenAI({
            baseURL: env.LLM_PROVIDER_BASE_URL,
            apiKey: env.LLM_PROVIDER_API_KEY,
          })
          selectedModel = legacyClient(model || env.LLM_MODEL)
          selectedModelName = model || env.LLM_MODEL
          providerUsed = 'legacy'
        }
        break
      case 'openai':
      default:
        selectedModel = openai(model || 'gpt-4o-mini')
        selectedModelName = model || 'gpt-4o-mini'
        providerUsed = 'openai'
    }

    // Fallback if selected provider not available
    if (!selectedModel) {
      aiWarn(`Provider ${selectedProvider} not available, falling back to OpenAI`)
      selectedModel = openai(model || 'gpt-4o-mini')
      selectedModelName = model || 'gpt-4o-mini'
      providerUsed = 'openai'
    }
  } catch (error) {
    aiWarn(`Provider selection failed: ${error}, falling back to OpenAI`)
    selectedModel = openai(model || 'gpt-4o-mini')
    selectedModelName = model || 'gpt-4o-mini'
    providerUsed = 'openai'
  }

  try {
    aiLog('Using provider:', providerUsed)
    aiLog('Tools being passed to AI SDK:', JSON.stringify(tools, null, 2))

    const requestStartTime = Date.now()

    // Extract system messages for security (use dedicated system option)
    const systemMessages = messages
      .filter(m => m.role === 'system')
      .map(m => m.content)
      .join('\n\n')

    // Filter out tool and system messages, keep only user/assistant
    const filteredMessages = messages
      .filter(m => m.role !== 'tool' && m.role !== 'system')
      .map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }))

    const result = await generateText({
      model: selectedModel,
      system: systemMessages || undefined,
      messages: filteredMessages,
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
        // debugLogger.logToolCall(effectiveSessionId, {
        //   toolName: tc.function.name,
        //   originalToolName: tc._metadata?.originalToolName || originalNormalized?.originalFormat?.function?.name,
        //   mappingSource: tc._metadata?.mappingSource || originalNormalized?.normalizationSteps.join(', '),
        //   arguments: JSON.parse(tc.function.arguments),
        //   success: true,
        //   executionTimeMs: 0,
        //   validationWarnings: tc._metadata?.validationWarnings,
        // });
      });

      // debugLogger.endSession(effectiveSessionId);

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
        _health: providerHealthMonitor.getHealth(providerUsed),
      }

      // Record successful request
      const latency = Date.now() - requestStartTime
      providerHealthMonitor.recordRequest(providerUsed, true, latency)

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

    // debugLogger.endSession(effectiveSessionId);

    const response = {
      content: result.text,
      finishReason: result.finishReason,
      toolCalls: finalNormalizedCalls,
      _provider: providerUsed,
      _sessionId: effectiveSessionId,
      _health: providerHealthMonitor.getHealth(providerUsed),
    }

    // Record successful request
    const latency = Date.now() - requestStartTime
    providerHealthMonitor.recordRequest(providerUsed, true, latency)

    // Cache the response if no tools were involved
    if (enableCache && !tools) {
      responseCache.set(messages, temperature, response, model)
    }

    return response
  } catch (error) {
    console.error('LLM API error:', error)
    
    // Record failed request
    const latency = Date.now() - requestStartTime
    providerHealthMonitor.recordRequest(providerUsed, false, latency)
    
    throw new Error('Failed to complete chat request')
  }
}