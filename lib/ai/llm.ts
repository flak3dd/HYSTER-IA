import { openai, createOpenAI } from '@ai-sdk/openai'
import { generateText } from 'ai'
import { serverEnv } from '@/lib/env'
import { validateToolCalls } from './tool-validator'
import { executeWithFallback } from './provider-fallback'
import { debugLogger } from './debug-logger'
import { normalizeToolCalls } from './tool-normalizer'

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
}> {
  const { messages, temperature = 0.7, model, tools, signal, useShadowGrok = false, enableFallback = false, sessionId } = options
  const env = serverEnv()

  // Start debug session if not provided
  const effectiveSessionId = sessionId || debugLogger.startSession('unknown');
  let providerUsed = 'unknown';

  let selectedModel: any
  let selectedModelName: string

  // Use fallback system if enabled
  if (enableFallback) {
    console.log('[LLM] Using provider fallback system')
    debugLogger.logProviderFallback(effectiveSessionId, 'initial', 'fallback_system', 'Automatic fallback enabled');

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
      debugLogger.logToolCall(effectiveSessionId, {
        toolName: 'fallback_system',
        success: false,
        executionTimeMs: 0,
        errorMessage: fallbackResult.error,
      });
      throw new Error(`Fallback system failed: ${fallbackResult.error}`)
    }

    providerUsed = fallbackResult.provider
    console.log(`[LLM] Fallback system succeeded with provider: ${providerUsed}`)
    debugLogger.logProviderFallback(effectiveSessionId, 'fallback_system', providerUsed, 'Fallback successful');

    // Process the successful result
    const result = fallbackResult.data
    console.log('[LLM] Raw toolCalls from AI SDK:', JSON.stringify(result.toolCalls, null, 2))
    
    // Update session with actual provider used
    const session = debugLogger.getSessionSummary(effectiveSessionId);
    if (session) {
      session.providerUsed = providerUsed;
    }

    // Enhanced tool name mapping to handle various provider formats
    const mappedToolCalls = result.toolCalls?.map((tc: any) => {
      let toolName = tc.toolName
      let mappingSource = 'original'
      
      // Check if the tool name is a numeric index (xAI Grok behavior)
      if (/^\d+$/.test(toolName) && tools && Array.isArray(tools)) {
        const index = parseInt(toolName, 10)
        console.log(`[LLM] Detected numeric tool index: ${index}, mapping to tool name...`)
        
        if (index >= 0 && index < tools.length) {
          const toolDef = tools[index]
          if (toolDef && typeof toolDef === 'object') {
            // Handle different tool definition formats
            if (toolDef.type === 'function' && toolDef.function?.name) {
              toolName = toolDef.function.name
              mappingSource = `numeric_index_${index}`
            } else if (toolDef.name) {
              toolName = toolDef.name
              mappingSource = `numeric_index_${index}`
            } else {
              console.warn(`[LLM] Tool at index ${index} has no recognizable name structure`)
            }
          }
        } else {
          console.warn(`[LLM] Tool index ${index} is out of bounds (tools array length: ${tools.length})`)
        }
      }
      
      // Additional validation: ensure the mapped tool name exists in our known tools
      if (tools && Array.isArray(tools)) {
        const knownToolNames = tools
          .map(t => t.type === 'function' ? t.function?.name : t.name)
          .filter(Boolean)
        
        if (!knownToolNames.includes(toolName)) {
          console.warn(`[LLM] Mapped tool name "${toolName}" not found in known tools:`, knownToolNames)
          console.warn(`[LLM] Mapping source: ${mappingSource}, original tool name: ${tc.toolName}`)
          
          // Try to find a similar tool name using fuzzy matching
          const similarTool = knownToolNames.find(name => 
            name.toLowerCase().includes(toolName.toLowerCase()) ||
            toolName.toLowerCase().includes(name.toLowerCase())
          )
          
          if (similarTool) {
            console.log(`[LLM] Found similar tool name: "${similarTool}", using instead of "${toolName}"`)
            toolName = similarTool
            mappingSource = `${mappingSource}_fuzzy_match`
          }
        }
      }
      
      const mappedCall = {
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
      
      console.log(`[LLM] Mapped tool call: ${tc.toolName} -> ${toolName} (${mappingSource})`)
      
      return mappedCall
    }) || []

    console.log('[LLM] Final mapped toolCalls:', JSON.stringify(mappedToolCalls, null, 2))

    // Normalize tool calls to standard format
    console.log('[LLM] Normalizing tool calls...')
    const normalization = normalizeToolCalls(mappedToolCalls, tools)
    
    if (!normalization.success) {
      console.warn(`[LLM] Tool normalization failed: ${normalization.errors.join(', ')}`)
    }
    
    if (normalization.warnings.length > 0) {
      console.log(`[LLM] Tool normalization warnings: ${normalization.warnings.join(', ')}`)
    }
    
    const normalizedCalls = normalization.normalizedCalls
    console.log('[LLM] Normalized toolCalls:', JSON.stringify(normalizedCalls.map(nc => ({
      id: nc.id,
      name: nc.function.name,
      steps: nc.normalizationSteps,
    })), null, 2))

    // Validate and correct tool calls
    if (normalizedCalls.length > 0) {
      console.log('[LLM] Running tool call validation...')
      const validation = validateToolCalls(normalizedCalls.map(nc => ({
        id: nc.id,
        function: {
          name: nc.function.name,
          arguments: JSON.stringify(nc.function.arguments),
        },
      })), tools)
      
      if (!validation.allValid) {
        console.warn(`[LLM] Tool validation failed: ${validation.totalErrors} errors, ${validation.totalWarnings} warnings`)
      }
      
      if (validation.totalWarnings > 0) {
        console.log(`[LLM] Tool validation warnings: ${validation.totalWarnings}`)
      }
      
      // Use validated calls
      const finalToolCalls = validation.validatedCalls
      console.log('[LLM] Final validated toolCalls:', JSON.stringify(finalToolCalls, null, 2))

      // Log each tool call with normalization info
      finalToolCalls.forEach(tc => {
        const originalNormalized = normalizedCalls.find(nc => nc.id === tc.id);
        debugLogger.logToolCall(effectiveSessionId, {
          toolName: tc.function.name,
          originalToolName: tc._metadata?.originalToolName || originalNormalized?.originalFormat?.function?.name,
          mappingSource: tc._metadata?.mappingSource || originalNormalized?.normalizationSteps.join(', '),
          arguments: JSON.parse(tc.function.arguments),
          success: true,
          executionTimeMs: 0,
          validationWarnings: tc._metadata?.validationWarnings,
          
        });
      });

      debugLogger.endSession(effectiveSessionId);

      return {
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

    debugLogger.endSession(effectiveSessionId);

    return {
      content: result.text,
      finishReason: result.finishReason,
      toolCalls: finalNormalizedCalls,
      _provider: providerUsed,
      _sessionId: effectiveSessionId,
    }
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
    console.log('[LLM] Using provider:', providerUsed)
    console.log('[LLM] Tools being passed to AI SDK:', JSON.stringify(tools, null, 2))

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

    console.log('[LLM] Raw toolCalls from AI SDK:', JSON.stringify(result.toolCalls, null, 2))

    // Enhanced tool name mapping to handle various provider formats
    const mappedToolCalls = result.toolCalls?.map(tc => {
      let toolName = tc.toolName
      let mappingSource = 'original'
      
      // Check if the tool name is a numeric index (xAI Grok behavior)
      if (/^\d+$/.test(toolName) && tools && Array.isArray(tools)) {
        const index = parseInt(toolName, 10)
        console.log(`[LLM] Detected numeric tool index: ${index}, mapping to tool name...`)
        
        if (index >= 0 && index < tools.length) {
          const toolDef = tools[index]
          if (toolDef && typeof toolDef === 'object') {
            // Handle different tool definition formats
            if (toolDef.type === 'function' && toolDef.function?.name) {
              toolName = toolDef.function.name
              mappingSource = `numeric_index_${index}`
            } else if (toolDef.name) {
              toolName = toolDef.name
              mappingSource = `numeric_index_${index}`
            } else {
              console.warn(`[LLM] Tool at index ${index} has no recognizable name structure`)
            }
          }
        } else {
          console.warn(`[LLM] Tool index ${index} is out of bounds (tools array length: ${tools.length})`)
        }
      }
      
      // Additional validation: ensure the mapped tool name exists in our known tools
      if (tools && Array.isArray(tools)) {
        const knownToolNames = tools
          .map(t => t.type === 'function' ? t.function?.name : t.name)
          .filter(Boolean)
        
        if (!knownToolNames.includes(toolName)) {
          console.warn(`[LLM] Mapped tool name "${toolName}" not found in known tools:`, knownToolNames)
          console.warn(`[LLM] Mapping source: ${mappingSource}, original tool name: ${tc.toolName}`)
          
          // Try to find a similar tool name using fuzzy matching
          const similarTool = knownToolNames.find(name => 
            name.toLowerCase().includes(toolName.toLowerCase()) ||
            toolName.toLowerCase().includes(name.toLowerCase())
          )
          
          if (similarTool) {
            console.log(`[LLM] Found similar tool name: "${similarTool}", using instead of "${toolName}"`)
            toolName = similarTool
            mappingSource = `${mappingSource}_fuzzy_match`
          }
        }
      }
      
      const mappedCall = {
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
      
      console.log(`[LLM] Mapped tool call: ${tc.toolName} -> ${toolName} (${mappingSource})`)
      
      return mappedCall
    }) || []

    console.log('[LLM] Final mapped toolCalls:', JSON.stringify(mappedToolCalls, null, 2))

    // Normalize tool calls to standard format
    console.log('[LLM] Normalizing tool calls...')
    const normalization = normalizeToolCalls(mappedToolCalls, tools)
    
    if (!normalization.success) {
      console.warn(`[LLM] Tool normalization failed: ${normalization.errors.join(', ')}`)
    }
    
    if (normalization.warnings.length > 0) {
      console.log(`[LLM] Tool normalization warnings: ${normalization.warnings.join(', ')}`)
    }
    
    const normalizedCalls = normalization.normalizedCalls
    console.log('[LLM] Normalized toolCalls:', JSON.stringify(normalizedCalls.map(nc => ({
      id: nc.id,
      name: nc.function.name,
      steps: nc.normalizationSteps,
    })), null, 2))

    // Validate and correct tool calls
    if (normalizedCalls.length > 0) {
      console.log('[LLM] Running tool call validation...')
      const validation = validateToolCalls(normalizedCalls.map(nc => ({
        id: nc.id,
        function: {
          name: nc.function.name,
          arguments: JSON.stringify(nc.function.arguments),
        },
      })), tools)
      
      if (!validation.allValid) {
        console.warn(`[LLM] Tool validation failed: ${validation.totalErrors} errors, ${validation.totalWarnings} warnings`)
      }
      
      if (validation.totalWarnings > 0) {
        console.log(`[LLM] Tool validation warnings: ${validation.totalWarnings}`)
      }
      
      // Use validated calls
      const finalToolCalls = validation.validatedCalls
      console.log('[LLM] Final validated toolCalls:', JSON.stringify(finalToolCalls, null, 2))

      // Log each tool call with normalization info
      finalToolCalls.forEach(tc => {
        const originalNormalized = normalizedCalls.find(nc => nc.id === tc.id);
        debugLogger.logToolCall(effectiveSessionId, {
          toolName: tc.function.name,
          originalToolName: tc._metadata?.originalToolName || originalNormalized?.originalFormat?.function?.name,
          mappingSource: tc._metadata?.mappingSource || originalNormalized?.normalizationSteps.join(', '),
          arguments: JSON.parse(tc.function.arguments),
          success: true,
          executionTimeMs: 0,
          validationWarnings: tc._metadata?.validationWarnings,
          
        });
      });

      debugLogger.endSession(effectiveSessionId);

      return {
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

    debugLogger.endSession(effectiveSessionId);

    return {
      content: result.text,
      finishReason: result.finishReason,
      toolCalls: finalNormalizedCalls,
      _provider: providerUsed,
      _sessionId: effectiveSessionId,
    }
  } catch (error) {
    console.error('LLM API error:', error)
    throw new Error('Failed to complete chat request')
  }
}