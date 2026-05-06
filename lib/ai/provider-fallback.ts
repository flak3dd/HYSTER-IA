/**
 * AI Provider Fallback System
 * 
 * This module provides automatic fallback between different AI providers
 * when tool calling fails or returns errors.
 */

import { createOpenAI } from '@ai-sdk/openai';
import { generateText } from 'ai';
import { serverEnv } from '@/lib/env';

// Default Grok client — replaces OpenAI as the primary provider
function createGrokClient(apiKey?: string) {
  const env = serverEnv();
  return createOpenAI({
    baseURL: env.XAI_BASE_URL,
    apiKey: apiKey || env.XAI_API_KEY,
  });
}

export interface ProviderConfig {
  name: string;
  priority: number;
  isEnabled: boolean;
  model: string;
  client: any;
}

export interface FallbackConfig {
  maxRetries: number;
  retryDelay: number;
  enableFallback: boolean;
  fallbackProviders: string[];
}

export interface ProviderResult {
  success: boolean;
  provider: string;
  data?: any;
  error?: string;
  attempts: number;
}

/**
 * Get available AI providers in priority order
 */
export function getAvailableProviders(): ProviderConfig[] {
  const env = serverEnv();
  const providers: ProviderConfig[] = [];

  // ShadowGrok/xAI (highest priority for ShadowGrok operations)
  if (env.SHADOWGROK_ENABLED && env.XAI_API_KEY) {
    providers.push({
      name: 'xai',
      priority: 1,
      isEnabled: true,
      model: env.XAI_MODEL,
      client: createOpenAI({
        baseURL: env.XAI_BASE_URL,
        apiKey: env.XAI_API_KEY,
      }),
    });
  }

  // Azure OpenAI (high priority)
  if (env.AZURE_OPENAI_ENDPOINT && env.AZURE_OPENAI_API_KEY) {
    providers.push({
      name: 'azure',
      priority: 2,
      isEnabled: true,
      model: env.AZURE_OPENAI_DEPLOYMENT,
      client: createOpenAI({
        baseURL: `${env.AZURE_OPENAI_ENDPOINT}/openai/deployments/${env.AZURE_OPENAI_DEPLOYMENT}`,
        apiKey: env.AZURE_OPENAI_API_KEY,
      }),
    });
  }

  // OpenRouter (medium priority)
  if (env.OPENROUTER_API_KEY) {
    providers.push({
      name: 'openrouter',
      priority: 3,
      isEnabled: true,
      model: env.OPENROUTER_MODEL,
      client: createOpenAI({
        baseURL: env.OPENROUTER_BASE_URL,
        apiKey: env.OPENROUTER_API_KEY,
      }),
    });
  }

  // Legacy LLM configuration (fallback)
  if (env.LLM_PROVIDER_API_KEY) {
    providers.push({
      name: 'legacy',
      priority: 4,
      isEnabled: true,
      model: env.LLM_MODEL,
      client: createOpenAI({
        baseURL: env.LLM_PROVIDER_BASE_URL,
        apiKey: env.LLM_PROVIDER_API_KEY,
      }),
    });
  }

  // Default Grok/xAI (last resort — replaces OpenAI)
  providers.push({
    name: 'grok',
    priority: 5,
    isEnabled: true,
    model: env.XAI_MODEL,
    client: createGrokClient(),
  });

  // Sort by priority
  return providers.sort((a, b) => a.priority - b.priority);
}

/**
 * Try to execute a chat request with fallback providers
 */
export async function executeWithFallback(
  messages: any[],
  tools: any[],
  options: {
    temperature?: number;
    signal?: AbortSignal;
    useShadowGrok?: boolean;
    fallbackConfig?: FallbackConfig;
  } = {}
): Promise<ProviderResult> {
  const {
    temperature = 0.7,
    signal,
    useShadowGrok = false,
    fallbackConfig = {
      maxRetries: 3,
      retryDelay: 1000,
      enableFallback: true,
      fallbackProviders: ['xai', 'grok', 'azure', 'openrouter', 'legacy'],
    },
  } = options;

  const providers = getAvailableProviders();
  console.log(`[ProviderFallback] Available providers:`, providers.map(p => p.name));

  // Filter providers based on useShadowGrok flag
  const targetProviders = useShadowGrok
    ? providers.filter(p => p.name === 'xai')
    : providers.filter(p => p.name !== 'xai');

  console.log(`[ProviderFallback] Target providers for ${useShadowGrok ? 'ShadowGrok' : 'regular'} mode:`, targetProviders.map(p => p.name));

  let lastError: string | null = null;
  let totalAttempts = 0;

  for (const provider of targetProviders) {
    if (!provider.isEnabled) {
      console.log(`[ProviderFallback] Skipping disabled provider: ${provider.name}`);
      continue;
    }

    for (let attempt = 1; attempt <= fallbackConfig.maxRetries; attempt++) {
      totalAttempts++;
      console.log(`[ProviderFallback] Attempt ${attempt}/${fallbackConfig.maxRetries} with provider: ${provider.name}`);

      try {
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
          model: provider.client(provider.model),
          system: systemMessages || undefined,
          messages: filteredMessages,
          temperature,
          tools: tools as any,
          abortSignal: signal,
        });

        console.log(`[ProviderFallback] Success with provider: ${provider.name}`);

        return {
          success: true,
          provider: provider.name,
          data: result,
          attempts: totalAttempts,
        };
      } catch (error: any) {
        lastError = error.message || String(error);
        console.error(`[ProviderFallback] Error with provider ${provider.name} (attempt ${attempt}):`, lastError);

        // Check if this is a fatal error that shouldn't be retried
        if (error.message?.includes('401') || error.message?.includes('authentication')) {
          console.log(`[ProviderFallback] Fatal authentication error with ${provider.name}, skipping to next provider`);
          break;
        }

        // Wait before retry (unless this is the last attempt)
        if (attempt < fallbackConfig.maxRetries) {
          await new Promise(resolve => setTimeout(resolve, fallbackConfig.retryDelay));
        }
      }

      // If fallback is disabled, break after first provider
      if (!fallbackConfig.enableFallback) {
        break;
      }
    }
  }

  console.error(`[ProviderFallback] All providers failed after ${totalAttempts} attempts`);

  return {
    success: false,
    provider: 'none',
    error: lastError || 'All providers failed',
    attempts: totalAttempts,
  };
}

/**
 * Get health status of all providers
 */
export async function getProviderHealth(): Promise<Record<string, { healthy: boolean; error?: string }>> {
  const providers = getAvailableProviders();
  const healthStatus: Record<string, { healthy: boolean; error?: string }> = {};

  for (const provider of providers) {
    try {
      // Simple health check - try to generate a minimal response
      await generateText({
        model: provider.client(provider.model),
        messages: [{ role: 'user', content: 'Hi' }],
      });

      healthStatus[provider.name] = { healthy: true };
    } catch (error: any) {
      healthStatus[provider.name] = {
        healthy: false,
        error: error.message || String(error),
      };
    }
  }

  return healthStatus;
}