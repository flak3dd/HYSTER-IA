/**
 * AI Provider Fallback System (Enhanced with Robustness)
 *
 * This module provides automatic fallback between different AI providers
 * when tool calling fails or returns errors.
 *
 * Features:
 * - Automatic provider fallback chain
 * - Retry with exponential backoff
 * - Circuit breaker integration
 * - Health-based provider selection
 * - Comprehensive error handling
 */

import { createOpenAI } from '@ai-sdk/openai';
import { anthropic } from '@ai-sdk/anthropic';
import { google } from '@ai-sdk/google';
import { generateText } from 'ai';
import { serverEnv } from '@/lib/env';

// Robustness imports
import {
  AiError,
  AiErrors,
  getGlobalCircuitBreakerRegistry,
  getGlobalHealthMonitor,
  getGlobalMonitoringSystem,
  withRetry,
  RetryStrategies,
  HealthStatus,
  CircuitState,
  executeWithFallbackChain,
} from './robustness';

type GenerateTextOptions = Parameters<typeof generateText>[0];
type GenerateTextModel = GenerateTextOptions['model'];
type GenerateTextTools = GenerateTextOptions['tools'];
type ProviderClient = (model: string) => GenerateTextModel;
type ProviderMessage = {
  role: string;
  content: string;
};

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
  client: ProviderClient;
}

export interface FallbackConfig {
  maxRetries: number;
  retryDelay: number;
  enableFallback: boolean;
  fallbackProviders: string[];
  timeoutMs?: number;
}

export interface ProviderResult {
  success: boolean;
  provider: string;
  data?: unknown;
  error?: string;
  attempts: number;
  retried?: boolean;
  retryCount?: number;
  latencyMs?: number;
}

function hasConfigValue(value: string | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function fallbackLog(message: string, ...args: unknown[]) {
  if (serverEnv().AI_DEBUG) {
    console.log(`[ProviderFallback] ${message}`, ...args);
  }
}

function fallbackWarn(message: string, ...args: unknown[]) {
  if (serverEnv().AI_DEBUG) {
    console.warn(`[ProviderFallback] ${message}`, ...args);
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isAbortLike(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return error.name === 'AbortError' || message.includes('aborted') || message.includes('abort');
}

function isFatalProviderError(error: unknown): boolean {
  const message = errorMessage(error).toLowerCase();
  return (
    message.includes('401') ||
    message.includes('403') ||
    message.includes('authentication') ||
    message.includes('unauthorized') ||
    message.includes('invalid api key')
  );
}

function orderProviders(
  providers: ProviderConfig[],
  fallbackProviders: string[],
  useShadowGrok: boolean,
): ProviderConfig[] {
  const byName = new Map(providers.map(provider => [provider.name, provider]));
  const configuredOrder = fallbackProviders
    .map(name => byName.get(name))
    .filter((provider): provider is ProviderConfig => Boolean(provider));
  const remaining = providers.filter(provider => !fallbackProviders.includes(provider.name));
  const ordered = [...configuredOrder, ...remaining];

  if (!useShadowGrok) {
    return ordered.filter(provider => provider.name !== 'xai');
  }

  const shadowNames = new Set(['xai', 'grok']);
  const shadowPreferred = ordered.filter(provider => shadowNames.has(provider.name));
  const fallback = ordered.filter(provider => !shadowNames.has(provider.name));
  return [...shadowPreferred, ...fallback];
}

/**
 * Get available AI providers in priority order
 * Enhanced with health monitoring integration
 * ANTHROPIC/CLAUDE is PRIMARY (priority 1)
 */
export function getAvailableProviders(): ProviderConfig[] {
  const env = serverEnv();
  const providers: ProviderConfig[] = [];
  const healthMonitor = getGlobalHealthMonitor();

  // ANTHROPIC/CLAUDE - PRIMARY PROVIDER (highest priority)
  if (hasConfigValue(env.ANTHROPIC_API_KEY)) {
    providers.push({
      name: 'anthropic',
      priority: 1,
      isEnabled: true,
      model: env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001',
      client: anthropic,
    });
  }

  // OpenAI (secondary priority)
  if (hasConfigValue(env.OPENAI_API_KEY)) {
    providers.push({
      name: 'openai',
      priority: 2,
      isEnabled: true,
      model: 'gpt-4o',
      client: createOpenAI({
        apiKey: env.OPENAI_API_KEY,
      }),
    });
  }

  // ShadowGrok/xAI (third priority for ShadowGrok operations)
  if (env.SHADOWGROK_ENABLED && hasConfigValue(env.XAI_API_KEY)) {
    providers.push({
      name: 'xai',
      priority: 3,
      isEnabled: true,
      model: env.XAI_MODEL,
      client: createOpenAI({
        baseURL: env.XAI_BASE_URL,
        apiKey: env.XAI_API_KEY,
      }),
    });
  }

  // Azure OpenAI (fourth priority)
  if (hasConfigValue(env.AZURE_OPENAI_ENDPOINT) && hasConfigValue(env.AZURE_OPENAI_API_KEY)) {
    providers.push({
      name: 'azure',
      priority: 4,
      isEnabled: true,
      model: env.AZURE_OPENAI_DEPLOYMENT,
      client: createOpenAI({
        baseURL: `${env.AZURE_OPENAI_ENDPOINT}/openai/deployments/${env.AZURE_OPENAI_DEPLOYMENT}`,
        apiKey: env.AZURE_OPENAI_API_KEY,
      }),
    });
  }

  // Google (fifth priority)
  if (hasConfigValue(env.GOOGLE_API_KEY)) {
    providers.push({
      name: 'google',
      priority: 5,
      isEnabled: true,
      model: 'gemini-1.5-pro',
      client: google,
    });
  }

  // OpenRouter (sixth priority)
  if (hasConfigValue(env.OPENROUTER_API_KEY)) {
    providers.push({
      name: 'openrouter',
      priority: 6,
      isEnabled: true,
      model: env.OPENROUTER_MODEL,
      client: createOpenAI({
        baseURL: env.OPENROUTER_BASE_URL,
        apiKey: env.OPENROUTER_API_KEY,
      }),
    });
  }

  // Legacy LLM configuration (fallback)
  if (hasConfigValue(env.LLM_PROVIDER_API_KEY)) {
    providers.push({
      name: 'legacy',
      priority: 7,
      isEnabled: true,
      model: env.LLM_MODEL,
      client: createOpenAI({
        baseURL: env.LLM_PROVIDER_BASE_URL,
        apiKey: env.LLM_PROVIDER_API_KEY,
      }),
    });
  }

  // Grok as final fallback (non-ShadowGrok mode)
  if (!env.SHADOWGROK_ENABLED && hasConfigValue(env.XAI_API_KEY)) {
    providers.push({
      name: 'grok',
      priority: 8,
      isEnabled: true,
      model: env.XAI_MODEL,
      client: createGrokClient(),
    });
  }

  // Sort by health first, then by priority
  const health = healthMonitor.getAllHealth();
  const healthMap = new Map(health.map(h => [h.provider, h]));

  return providers.sort((a, b) => {
    const aHealth = healthMap.get(a.name);
    const bHealth = healthMap.get(b.name);

    // Status priority (healthy > degraded > unknown > unhealthy)
    const statusOrder = {
      [HealthStatus.HEALTHY]: 0,
      [HealthStatus.DEGRADED]: 1,
      [HealthStatus.UNKNOWN]: 2,
      [HealthStatus.UNHEALTHY]: 3,
    };

    const aStatus = aHealth ? statusOrder[aHealth.status] : 2;
    const bStatus = bHealth ? statusOrder[bHealth.status] : 2;

    if (aStatus !== bStatus) {
      return aStatus - bStatus;
    }

    // Within same status, use configured priority
    return a.priority - b.priority;
  });
}

/**
 * Execute a chat request with provider fallback using robustness system
 */
export async function executeWithFallback(
  messages: ProviderMessage[],
  tools: unknown,
  options: {
    temperature?: number;
    signal?: AbortSignal;
    useShadowGrok?: boolean;
    fallbackConfig?: FallbackConfig;
    preferredProvider?: string;
    timeoutMs?: number;
    enableRetry?: boolean;
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
    preferredProvider,
    timeoutMs = 60000,
    enableRetry = true,
  } = options;

  const providers = getAvailableProviders();
  const monitor = getGlobalMonitoringSystem();
  const startTime = Date.now();

  fallbackLog('Available providers:', providers.map(p => p.name));

  const orderedProviders = orderProviders(
    providers,
    fallbackConfig.fallbackProviders,
    useShadowGrok,
  );
  const targetProviders = fallbackConfig.enableFallback
    ? orderedProviders
    : orderedProviders.slice(0, 1);
  fallbackLog(
    `Target providers for ${useShadowGrok ? 'ShadowGrok' : 'regular'} mode:`,
    targetProviders.map(p => p.name),
  );

  // Use the new robust fallback chain
  const providerNames = targetProviders.map(p => p.name);

  if (targetProviders.length === 0) {
    return {
      success: false,
      provider: 'none',
      error: 'No configured AI providers available',
      attempts: 0,
      latencyMs: 0,
    };
  }

  // Execute with robustness framework
  const result = await executeWithFallbackChain(
    async (providerName: string, degradedOptions?: any) => {
      const provider = targetProviders.find(p => p.name === providerName);
      if (!provider) {
        throw new Error(`Provider ${providerName} not found`);
      }

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

      const effectiveTimeout = degradedOptions?.timeoutMs || timeoutMs;
      const timeoutSignal = AbortSignal.timeout(effectiveTimeout);
      const effectiveSignal = signal
        ? AbortSignal.any([signal, timeoutSignal])
        : timeoutSignal;

      const callStart = Date.now();
      const requestId = `fallback_${providerName}_${callStart}`;

      monitor.emitProviderCallStart(providerName, requestId);

      try {
        const result = await generateText({
          model: provider.client(provider.model),
          system: systemMessages || undefined,
          messages: filteredMessages,
          temperature,
          tools: tools as GenerateTextTools,
          abortSignal: effectiveSignal,
        });

        const latency = Date.now() - callStart;
        monitor.emitProviderCallSuccess(providerName, requestId, latency);

        return {
          text: result.text,
          toolCalls: result.toolCalls,
          finishReason: result.finishReason,
        };
      } catch (error) {
        const latency = Date.now() - callStart;
        const aiError = error instanceof AiError
          ? error
          : AiErrors.internal(String(error), { provider: providerName }, error instanceof Error ? error : undefined);

        monitor.emitProviderCallFailure(providerName, requestId, aiError);
        throw error;
      }
    },
    {
      preferredProvider: preferredProvider || targetProviders[0]?.name,
      availableProviders: providerNames,
      healthMonitor: getGlobalHealthMonitor(),
      circuitBreakers: getGlobalCircuitBreakerRegistry(),
      requestType: 'chat',
      timeoutMs,
      enableRetry,
    }
  );

  const totalTime = Date.now() - startTime;

  if (result.success) {
    fallbackLog(`Success with provider: ${result.providerUsed}`);

    // Emit fallback event if we used a fallback
    if (result.providerUsed !== preferredProvider && preferredProvider) {
      monitor.emitFallbackUsed(preferredProvider, result.providerUsed || 'unknown', 'primary_failed');
    }

    return {
      success: true,
      provider: result.providerUsed || 'unknown',
      data: result.result,
      attempts: result.providersAttempted?.length || 1,
      latencyMs: totalTime,
    };
  } else {
    fallbackWarn(`All providers failed after ${result.providersAttempted?.length || 0} attempts`);

    return {
      success: false,
      provider: 'none',
      error: result.error?.message || 'All providers failed',
      attempts: result.providersAttempted?.length || 0,
      latencyMs: totalTime,
    };
  }
}

/**
 * Get health status of all providers
 * Enhanced with health monitor integration
 */
export async function getProviderHealthStatus(): Promise<Record<string, { healthy: boolean; error?: string }>> {
  const providers = getAvailableProviders();
  const healthMonitor = getGlobalHealthMonitor();
  const circuitBreakers = getGlobalCircuitBreakerRegistry();
  const healthStatus: Record<string, { healthy: boolean; error?: string }> = {};

  // Use health monitor data if available
  const monitoredHealth = healthMonitor.getAllHealth();
  const monitoredMap = new Map(monitoredHealth.map(h => [h.provider, h]));

  for (const provider of providers) {
    const monitored = monitoredMap.get(provider.name);
    const circuitStatus = circuitBreakers.getBreaker(provider.name).getStats();

    if (monitored) {
      // Use health monitor data
      const healthy = monitored.status === HealthStatus.HEALTHY ||
                      monitored.status === HealthStatus.DEGRADED;

      healthStatus[provider.name] = {
        healthy: healthy && circuitStatus.state !== 'open',
        error: monitored.status === HealthStatus.UNHEALTHY
          ? 'Provider is unhealthy'
          : circuitStatus.state === 'open'
            ? 'Circuit breaker is open'
            : undefined,
      };
    } else {
      // No monitoring data, do a simple active check
      try {
        await withRetry(
          async () => {
            await generateText({
              model: provider.client(provider.model),
              messages: [{ role: 'user', content: 'Hi' }],
            });
          },
          RetryStrategies.fast(),
          circuitBreakers.getBreaker(provider.name),
          AbortSignal.timeout(10000)
        );

        healthStatus[provider.name] = { healthy: true };
      } catch (error) {
        healthStatus[provider.name] = {
          healthy: false,
          error: errorMessage(error),
        };
      }
    }
  }

  return healthStatus;
}

/**
 * Get detailed provider status including circuit breaker and health
 */
export function getDetailedProviderStatus(provider: string): {
  health: ReturnType<typeof getGlobalHealthMonitor['prototype']['getHealth']>;
  circuitBreaker: ReturnType<typeof getGlobalCircuitBreakerRegistry['prototype']['getBreaker']>['getStats'];
  available: boolean;
} | null {
  const health = getGlobalHealthMonitor().getHealth(provider);
  const circuitStats = getGlobalCircuitBreakerRegistry().getBreaker(provider).getStats();

  if (!health && circuitStats.totalCalls === 0) {
    return null;
  }

  return {
    health,
    circuitBreaker: circuitStats,
    available: health?.status !== HealthStatus.UNHEALTHY && circuitStats.state !== 'open',
  };
}

/**
 * Reset all provider health and circuit breaker state
 */
export function resetAllProviderState(): void {
  getGlobalHealthMonitor().resetAll();
  getGlobalCircuitBreakerRegistry().resetAll();
}

/**
 * Reset a specific provider's state
 */
export function resetProviderState(provider: string): void {
  getGlobalHealthMonitor().resetProvider(provider);
  getGlobalCircuitBreakerRegistry().resetProvider(provider);
}
