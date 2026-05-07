import { createOpenAI } from '@ai-sdk/openai'
import { anthropic } from '@ai-sdk/anthropic'
import { google } from '@ai-sdk/google'
import { generateText } from 'ai'
import { serverEnv } from '@/lib/env'
import { validateToolCalls } from './tool-validator'
import { executeWithFallback } from './provider-fallback'
import { normalizeToolCalls } from './tool-normalizer'
import { createHash } from 'crypto'

// Robustness imports
import {
  AiErrors,
  toAiError,
  getGlobalCircuitBreakerRegistry,
  getGlobalHealthMonitor,
  getGlobalMonitoringSystem,
  withRetry,
  RetryStrategies,
  HealthStatus,
  validateMessageContent,
  validateTemperature,
  validateTimeoutMs,
  validateProviderName,
} from './robustness'

  // Default Claude client — Anthropic is the primary provider
function createClaudeClient(apiKey?: string) {
  const env = serverEnv()
  return anthropic(apiKey || env.ANTHROPIC_API_KEY)
}

// Default Grok client — fallback provider
function createGrokClient(apiKey?: string) {
  const env = serverEnv()
  return createOpenAI({
    baseURL: env.XAI_BASE_URL,
    apiKey: apiKey || env.XAI_API_KEY,
  })
}

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
    // Uses Number.isInteger() instead of regex for validation
    const numericIndex = Number(toolName)
    if (
      typeof toolName === 'string' &&
      !isNaN(numericIndex) &&
      Number.isInteger(numericIndex) &&
      tools &&
      Array.isArray(tools)
    ) {
      aiLog(`Detected numeric tool index: ${numericIndex}, mapping to tool name...`)

      if (numericIndex >= 0 && numericIndex < tools.length) {
        const toolDef = tools[numericIndex]
        if (toolDef && typeof toolDef === 'object') {
          if (toolDef.type === 'function' && toolDef.function?.name) {
            toolName = toolDef.function.name
            mappingSource = `numeric_index_${numericIndex}`
          } else if (toolDef.name) {
            toolName = toolDef.name
            mappingSource = `numeric_index_${numericIndex}`
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

// ============================================================
// PROVIDER HEALTH MONITOR (enhanced with robustness)
// ============================================================

export function getProviderHealth() {
  return getGlobalHealthMonitor().getAllHealth()
}

export function resetProviderHealth(provider: string) {
  getGlobalHealthMonitor().resetProvider(provider)
  getGlobalCircuitBreakerRegistry().resetProvider(provider)
}

export function getBestProvider(availableProviders: string[]): string | null {
  return getGlobalHealthMonitor().getBestProvider(availableProviders)
}

export function isProviderHealthy(provider: string): boolean {
  const health = getGlobalHealthMonitor().getHealth(provider)
  return health.status === HealthStatus.HEALTHY || health.status === HealthStatus.DEGRADED
}

// ============================================================
// CHAT COMPLETION WITH FULL ROBUSTNESS
// ============================================================

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

export interface ChatCompleteOptions {
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
  timeoutMs?: number
  enableRetry?: boolean
  validateInput?: boolean
}

export interface ChatCompleteResult {
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
  _model?: string
  _validation?: {
    allValid: boolean
    totalWarnings: number
    totalErrors: number
  }
  _sessionId?: string
  _cached?: boolean
  _cacheStats?: any
  _health?: any
  _robustness?: {
    retried: boolean
    retryCount: number
    fallbackUsed: boolean
    originalProvider?: string
  }
}

export async function chatComplete(options: ChatCompleteOptions): Promise<ChatCompleteResult> {
  const {
    messages,
    temperature = 0.7,
    model,
    tools,
    signal,
    useShadowGrok = false,
    enableFallback = false,
    sessionId,
    enableCache = true,
    preferredProvider,
    timeoutMs = 120000,
    enableRetry = true,
    validateInput = true,
  } = options

  const env = serverEnv()
  const monitor = getGlobalMonitoringSystem()
  const effectiveSessionId = sessionId || `chat-${Date.now()}`
  const requestStartTime = Date.now()

  // Input validation
  if (validateInput) {
    // Validate messages
    for (const msg of messages) {
      const contentValidation = validateMessageContent(msg.content || '', 50000)
      if (!contentValidation.valid) {
        throw AiErrors.requestValidation('message.content', contentValidation.errors.join('; '))
      }
    }

    // Validate temperature
    const tempValidation = validateTemperature(temperature)
    if (!tempValidation.valid) {
      throw AiErrors.requestValidation('temperature', tempValidation.errors.join('; '))
    }

    // Validate timeout
    const timeoutValidation = validateTimeoutMs(timeoutMs)
    if (!timeoutValidation.valid) {
      throw AiErrors.requestValidation('timeout', timeoutValidation.errors.join('; '))
    }
  }

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

  // Emit request start
  monitor.emitRequestStart({
    requestId: effectiveSessionId,
    provider: preferredProvider || 'auto',
    model,
    operation: 'chatComplete',
    messageCount: messages.length,
    hasTools: !!tools,
    timeoutMs,
  })

  // Build list of available providers - ANTHROPIC is PRIMARY
  const availableProviders: string[] = []
  if (env.ANTHROPIC_API_KEY) availableProviders.push('anthropic') // PRIMARY: Claude first
  if (env.OPENAI_API_KEY) availableProviders.push('openai')
  if (useShadowGrok && env.SHADOWGROK_ENABLED && env.XAI_API_KEY) availableProviders.push('xai')
  if (env.GOOGLE_API_KEY) availableProviders.push('google')
  if (env.AZURE_OPENAI_ENDPOINT && env.AZURE_OPENAI_API_KEY) availableProviders.push('azure')
  if (env.OPENROUTER_API_KEY) availableProviders.push('openrouter')
  if (env.LLM_PROVIDER_API_KEY) availableProviders.push('legacy')
  availableProviders.push('grok') // Always available as fallback

  // Select provider based on preference, health, or priority
  let selectedProvider = preferredProvider
  if (!selectedProvider || !availableProviders.includes(selectedProvider)) {
    selectedProvider = getBestProvider(availableProviders) || availableProviders[0]
  }

  // Validate provider name
  const providerValidation = validateProviderName(selectedProvider)
  if (!providerValidation.valid) {
    throw AiErrors.requestValidation('provider', providerValidation.errors.join('; '))
  }

  aiLog(`Selected provider: ${selectedProvider} (available: ${availableProviders.join(', ')})`)

  let providerUsed = selectedProvider
  let retried = false
  let retryCount = 0
  let fallbackUsed = false
  const originalProvider = selectedProvider

  try {
    let result: ChatCompleteResult

    // Use fallback system if enabled and multiple providers available
    if (enableFallback && availableProviders.length > 1) {
      aiLog('Using provider fallback system')
      fallbackUsed = true

      const fallbackResult = await executeWithFallback(messages, tools || [], {
        temperature,
        signal,
        useShadowGrok,
        preferredProvider: selectedProvider,
        fallbackConfig: {
          maxRetries: 2,
          retryDelay: 500,
          enableFallback: true,
          fallbackProviders: availableProviders.filter(p => p !== selectedProvider),
        },
        timeoutMs,
        enableRetry,
      })

      if (!fallbackResult.success) {
        throw AiErrors.fallbackExhausted(
          [selectedProvider, ...availableProviders.filter(p => p !== selectedProvider)],
          { metadata: { error: fallbackResult.error } }
        )
      }

      providerUsed = fallbackResult.provider
      retryCount = fallbackResult.attempts - 1
      retried = retryCount > 0

      // Process the successful result
      result = processGenerateTextResult(
        fallbackResult.data,
        providerUsed,
        model,
        tools,
        effectiveSessionId
      )
    } else {
      // Single provider with retry
      const breaker = getGlobalCircuitBreakerRegistry().getBreaker(selectedProvider)

      // Check circuit breaker
      if (!breaker.canExecute()) {
        const health = breaker.getHealthReport()
        throw AiErrors.circuitOpen(selectedProvider, health.metrics.nextResetTime
          ? health.metrics.nextResetTime - Date.now()
          : 0)
      }

      // Execute with retry
      const retryResult = await withRetry(
        async () => {
          const modelResult = await executeSingleProvider(
            selectedProvider,
            messages,
            temperature,
            model,
            tools,
            signal,
            useShadowGrok,
            timeoutMs
          )
          return modelResult
        },
        {
          ...RetryStrategies.forProvider(selectedProvider),
          onRetry: (error, attempt, delayMs) => {
            retryCount = attempt
            retried = true
            monitor.emitRetryAttempt(selectedProvider, attempt, 3, delayMs)
            aiLog(`Retry ${attempt} for ${selectedProvider} after ${delayMs}ms`)
          },
        },
        breaker,
        signal
      )

      if (!retryResult.success) {
        throw retryResult.error || new Error('Request failed')
      }

      result = retryResult.result!
      providerUsed = result._provider || selectedProvider
    }

    // Cache the response if no tools were involved
    if (enableCache && !tools) {
      responseCache.set(messages, temperature, result, model)
    }

    // Record success metrics
    const latency = Date.now() - requestStartTime
    getGlobalHealthMonitor().recordSuccess(providerUsed, latency)

    // Emit success
    monitor.emitRequestSuccess({
      requestId: effectiveSessionId,
      provider: providerUsed,
      model: result._model,
      latencyMs: latency,
      toolCalls: result.toolCalls?.length,
      cached: false,
    })

    // Add robustness metadata
    result._robustness = {
      retried,
      retryCount,
      fallbackUsed,
      originalProvider,
    }

    return result
  } catch (error) {
    const latency = Date.now() - requestStartTime
    const aiError = toAiError(error)

    // Record failure metrics
    getGlobalHealthMonitor().recordFailure(
      providerUsed,
      latency,
      error instanceof Error ? error : undefined,
      aiError.details.category
    )

    // Emit failure
    monitor.emitRequestFailure({
      requestId: effectiveSessionId,
      provider: providerUsed,
      latencyMs: latency,
      error: aiError,
      willRetry: false,
      retryAttempt: retryCount,
    })

    throw aiError
  }
}

// Execute with a single provider
async function executeSingleProvider(
  provider: string,
  messages: ChatMessage[],
  temperature: number,
  model: string | undefined,
  tools: any,
  signal: AbortSignal | undefined,
  useShadowGrok: boolean,
  timeoutMs: number
): Promise<ChatCompleteResult> {
  const env = serverEnv()
  const monitor = getGlobalMonitoringSystem()
  const startTime = Date.now()

  let selectedModel: any
  let selectedModelName: string = model || env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001'
  let providerUsed = provider

  // Build provider client - ANTHROPIC is PRIMARY
  switch (provider) {
    case 'anthropic':
      if (env.ANTHROPIC_API_KEY) {
        selectedModel = anthropic(model || env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001')
        selectedModelName = model || env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001'
        providerUsed = 'anthropic'
      }
      break
    case 'openai':
      if (env.OPENAI_API_KEY) {
        const openaiClient = createOpenAI({
          apiKey: env.OPENAI_API_KEY,
        })
        selectedModel = openaiClient(model || 'gpt-4o')
        selectedModelName = model || 'gpt-4o'
        providerUsed = 'openai'
      }
      break
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
    case 'grok':
    default:
      const grokClient = createGrokClient()
      selectedModel = grokClient(model || env.XAI_MODEL)
      selectedModelName = model || env.XAI_MODEL
      providerUsed = 'grok'
  }

  // Fallback if selected provider not available
  if (!selectedModel) {
    aiWarn(`Provider ${provider} not available, falling back to Grok`)
    const grokClient = createGrokClient()
    selectedModel = grokClient(model || env.XAI_MODEL)
    selectedModelName = model || env.XAI_MODEL
    providerUsed = 'grok'
  }

  aiLog('Using provider:', providerUsed)
  aiLog('Tools being passed to AI SDK:', JSON.stringify(tools, null, 2))

  // Emit provider call start
  const requestId = `req_${startTime}`
  monitor.emitProviderCallStart(providerUsed, requestId)

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

  // Create timeout signal
  const timeoutSignal = AbortSignal.timeout(timeoutMs)
  const effectiveSignal = signal
    ? AbortSignal.any([signal, timeoutSignal])
    : timeoutSignal

  try {
    const result = await generateText({
      model: selectedModel,
      system: systemMessages || undefined,
      messages: filteredMessages,
      temperature,
      tools,
      abortSignal: effectiveSignal,
    })

    const latency = Date.now() - startTime
    monitor.emitProviderCallSuccess(providerUsed, requestId, latency)

    return processGenerateTextResult(result, providerUsed, selectedModelName, tools, requestId)
  } catch (error) {
    const latency = Date.now() - startTime
    monitor.emitProviderCallFailure(providerUsed, requestId, toAiError(error))
    throw error
  }
}

// Process generateText result into ChatCompleteResult
function processGenerateTextResult(
  result: any,
  providerUsed: string,
  modelName: string,
  tools: any,
  sessionId: string
): ChatCompleteResult {
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
  let finalToolCalls: any[] = []
  let validationInfo = { allValid: true, totalWarnings: 0, totalErrors: 0 }

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

    finalToolCalls = validation.validatedCalls
    validationInfo = {
      allValid: validation.allValid,
      totalWarnings: validation.totalWarnings,
      totalErrors: validation.totalErrors,
    }

    aiLog('Final validated toolCalls:', JSON.stringify(finalToolCalls, null, 2))
  } else {
    finalToolCalls = normalizedCalls.map(nc => ({
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
    }))
  }

  return {
    content: result.text,
    finishReason: result.finishReason,
    toolCalls: finalToolCalls,
    _provider: providerUsed,
    _model: modelName,
    _validation: validationInfo,
    _sessionId: sessionId,
    _health: getGlobalHealthMonitor().getHealth(providerUsed),
  }
}

// ============================================================
// UTILITY EXPORTS
// ============================================================

export function getProviderHealthStatus(provider: string) {
  return getGlobalHealthMonitor().getHealth(provider)
}

export function getAllProviderHealth() {
  return getGlobalHealthMonitor().getAllHealth()
}

export function getCircuitBreakerStatus(provider: string) {
  return getGlobalCircuitBreakerRegistry().getBreaker(provider).getStats()
}

export function getAllCircuitBreakerStatuses() {
  return getGlobalCircuitBreakerRegistry().getAllHealth()
}

export function getMonitoringMetrics() {
  return getGlobalMonitoringSystem().getMetrics()
}

export function resetAllRobustnessState(): void {
  clearAllCaches()
  getGlobalHealthMonitor().resetAll()
  getGlobalCircuitBreakerRegistry().resetAll()
}
