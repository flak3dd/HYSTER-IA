/**
 * Health Check System for AI Providers
 *
 * Provides comprehensive health monitoring with:
 * - Active health checks (ping tests)
 * - Passive health tracking (request metrics)
 * - Health scoring and trending
 * - Automatic unhealthy provider detection
 */

import { createOpenAI } from '@ai-sdk/openai';
import { anthropic } from '@ai-sdk/anthropic';
import { google } from '@ai-sdk/google';
import { generateText } from 'ai';
import { serverEnv } from '@/lib/env';
import { AiError, AiErrors, ErrorCategory, ErrorSeverity } from './errors';
import { withRetry, RetryStrategies } from './retry';

export enum HealthStatus {
  HEALTHY = 'healthy',
  DEGRADED = 'degraded',
  UNHEALTHY = 'unhealthy',
  UNKNOWN = 'unknown',
}

export interface ProviderHealthMetrics {
  // Request metrics
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  successRate: number;

  // Latency metrics (in ms)
  averageLatencyMs: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  minLatencyMs: number;
  maxLatencyMs: number;

  // Error metrics
  errorCount: number;
  lastError: string | null;
  lastErrorTime: number | null;
  errorTypes: Record<string, number>;

  // Time tracking
  lastRequestTime: number | null;
  lastSuccessTime: number | null;
  firstRequestTime: number | null;
}

export interface HealthCheckResult {
  provider: string;
  status: HealthStatus;
  healthy: boolean;
  checkTime: number;
  responseTimeMs: number;
  error?: string;
  metadata?: Record<string, unknown>;
}

export interface ProviderHealth {
  provider: string;
  status: HealthStatus;
  healthScore: number; // 0-100
  metrics: ProviderHealthMetrics;
  activeCheck: HealthCheckResult | null;
  lastUpdated: number;
  recommendation: string;
}

interface ProviderConfig {
  name: string;
  priority: number;
  isEnabled: boolean;
  model: string;
  client: (model: string) => any;
  healthCheckModel?: string;
  healthCheckTimeoutMs?: number;
}

const DEFAULT_HEALTH_CHECK_TIMEOUT_MS = 10000;
const HEALTH_CHECK_PROMPT = 'Say "OK" and nothing else.';

/**
 * Build available providers from environment configuration
 */
function hasConfigValue(value: string | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function getAvailableProviders(): ProviderConfig[] {
  const env = serverEnv();
  const providers: ProviderConfig[] = [];

  // xAI / Grok
  if (env.XAI_API_KEY) {
    const client = createOpenAI({
      baseURL: env.XAI_BASE_URL,
      apiKey: env.XAI_API_KEY,
    });
    providers.push({
      name: 'xai',
      priority: 1,
      isEnabled: true,
      model: env.XAI_MODEL,
      client,
      healthCheckModel: env.XAI_MODEL,
    });
  }

  // Azure OpenAI
  if (hasConfigValue(env.AZURE_OPENAI_ENDPOINT) && hasConfigValue(env.AZURE_OPENAI_API_KEY)) {
    const client = createOpenAI({
      baseURL: `${env.AZURE_OPENAI_ENDPOINT}/openai/deployments/${env.AZURE_OPENAI_DEPLOYMENT}`,
      apiKey: env.AZURE_OPENAI_API_KEY,
    });
    providers.push({
      name: 'azure',
      priority: 2,
      isEnabled: true,
      model: env.AZURE_OPENAI_DEPLOYMENT,
      client,
      healthCheckModel: env.AZURE_OPENAI_DEPLOYMENT,
    });
  }

  // OpenRouter
  if (hasConfigValue(env.OPENROUTER_API_KEY)) {
    const client = createOpenAI({
      baseURL: env.OPENROUTER_BASE_URL,
      apiKey: env.OPENROUTER_API_KEY,
    });
    providers.push({
      name: 'openrouter',
      priority: 3,
      isEnabled: true,
      model: env.OPENROUTER_MODEL,
      client,
    });
  }

  // Legacy LLM
  if (hasConfigValue(env.LLM_PROVIDER_API_KEY)) {
    const client = createOpenAI({
      baseURL: env.LLM_PROVIDER_BASE_URL,
      apiKey: env.LLM_PROVIDER_API_KEY,
    });
    providers.push({
      name: 'legacy',
      priority: 4,
      isEnabled: true,
      model: env.LLM_MODEL,
      client,
    });
  }

  // Anthropic
  if (hasConfigValue(env.ANTHROPIC_API_KEY)) {
    providers.push({
      name: 'anthropic',
      priority: 5,
      isEnabled: true,
      model: 'claude-haiku-4-5-20251001',
      client: anthropic,
    });
  }

  // Google
  if (hasConfigValue(env.GOOGLE_API_KEY)) {
    providers.push({
      name: 'google',
      priority: 6,
      isEnabled: true,
      model: 'gemini-1.5-pro',
      client: google,
    });
  }

  // Grok fallback (always enabled if xAI key exists)
  if (env.XAI_API_KEY) {
    const client = createOpenAI({
      baseURL: env.XAI_BASE_URL,
      apiKey: env.XAI_API_KEY,
    });
    providers.push({
      name: 'grok',
      priority: 7,
      isEnabled: true,
      model: env.XAI_MODEL,
      client,
      healthCheckModel: env.XAI_MODEL,
    });
  }

  return providers.sort((a, b) => a.priority - b.priority);
}

/**
 * Execute health check for a single provider
 */
export async function checkProviderHealth(
  provider: ProviderConfig,
  timeoutMs: number = DEFAULT_HEALTH_CHECK_TIMEOUT_MS
): Promise<HealthCheckResult> {
  const startTime = Date.now();

  try {
    const checkPromise = generateText({
      model: provider.client(provider.healthCheckModel || provider.model),
      messages: [{ role: 'user', content: HEALTH_CHECK_PROMPT }],
      temperature: 0,
    });

    const result = await Promise.race([
      checkPromise,
      new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Health check timeout after ${timeoutMs}ms`));
        }, timeoutMs);
      }),
    ]);

    const responseTime = Date.now() - startTime;

    // Simple validation of response
    const content = result.text?.toLowerCase().trim() || '';
    const isValid = content.includes('ok');

    if (!isValid) {
      return {
        provider: provider.name,
        status: HealthStatus.DEGRADED,
        healthy: false,
        checkTime: startTime,
        responseTimeMs: responseTime,
        error: 'Health check returned unexpected response',
        metadata: { response: result.text },
      };
    }

    return {
      provider: provider.name,
      status: HealthStatus.HEALTHY,
      healthy: true,
      checkTime: startTime,
      responseTimeMs: responseTime,
    };
  } catch (error) {
    const responseTime = Date.now() - startTime;
    const errorMsg = error instanceof Error ? error.message : String(error);

    // Determine if error is transient or critical
    const status = errorMsg.toLowerCase().includes('timeout')
      ? HealthStatus.DEGRADED
      : HealthStatus.UNHEALTHY;

    return {
      provider: provider.name,
      status,
      healthy: false,
      checkTime: startTime,
      responseTimeMs: responseTime,
      error: errorMsg,
    };
  }
}

/**
 * Health monitor for tracking provider metrics over time
 */
export class ProviderHealthMonitor {
  private metrics: Map<string, ProviderHealthMetrics> = new Map();
  private lastActiveCheck: Map<string, HealthCheckResult> = new Map();
  private maxLatencySamples = 100;

  /**
   * Record a successful request
   */
  recordSuccess(provider: string, latencyMs: number): void {
    const metrics = this.getOrCreateMetrics(provider);

    metrics.totalRequests++;
    metrics.successfulRequests++;
    metrics.lastRequestTime = Date.now();
    metrics.lastSuccessTime = Date.now();

    if (!metrics.firstRequestTime) {
      metrics.firstRequestTime = metrics.lastRequestTime;
    }

    // Update latency tracking
    this.addLatencySample(metrics, latencyMs);
    this.updateSuccessRate(metrics);
  }

  /**
   * Record a failed request
   */
  recordFailure(provider: string, latencyMs: number, error?: Error, errorCategory?: string): void {
    const metrics = this.getOrCreateMetrics(provider);

    metrics.totalRequests++;
    metrics.failedRequests++;
    metrics.errorCount++;
    metrics.lastRequestTime = Date.now();
    metrics.lastError = error?.message || 'Unknown error';
    metrics.lastErrorTime = Date.now();

    if (!metrics.firstRequestTime) {
      metrics.firstRequestTime = metrics.lastRequestTime;
    }

    // Track error type
    const errorType = errorCategory || this.classifyError(error);
    metrics.errorTypes[errorType] = (metrics.errorTypes[errorType] || 0) + 1;

    // Update latency tracking
    this.addLatencySample(metrics, latencyMs);
    this.updateSuccessRate(metrics);
  }

  /**
   * Update active health check result
   */
  updateActiveCheck(provider: string, result: HealthCheckResult): void {
    this.lastActiveCheck.set(provider, result);
  }

  /**
   * Get health metrics for a provider
   */
  getMetrics(provider: string): ProviderHealthMetrics | null {
    return this.metrics.get(provider) || null;
  }

  /**
   * Get comprehensive health status for a provider
   */
  getHealth(provider: string): ProviderHealth {
    const metrics = this.getOrCreateMetrics(provider);
    const activeCheck = this.lastActiveCheck.get(provider) || null;

    // Calculate health score (0-100)
    const healthScore = this.calculateHealthScore(metrics, activeCheck);

    // Determine status
    let status = HealthStatus.UNKNOWN;
    if (metrics.totalRequests > 0 || activeCheck) {
      status = this.determineStatus(healthScore, metrics, activeCheck);
    }

    // Generate recommendation
    const recommendation = this.generateRecommendation(status, metrics, activeCheck);

    return {
      provider,
      status,
      healthScore,
      metrics,
      activeCheck,
      lastUpdated: Date.now(),
      recommendation,
    };
  }

  /**
   * Get all provider health statuses
   */
  getAllHealth(): ProviderHealth[] {
    const providers = Array.from(this.metrics.keys());
    const activeCheckProviders = Array.from(this.lastActiveCheck.keys());
    const allProviders = new Set([...providers, ...activeCheckProviders]);

    return Array.from(allProviders).map(p => this.getHealth(p));
  }

  /**
   * Get healthy providers sorted by priority
   */
  getHealthyProviders(availableProviders: string[]): string[] {
    return availableProviders
      .map(p => ({ provider: p, health: this.getHealth(p) }))
      .sort((a, b) => {
        // Sort by health status priority, then by health score
        const statusPriority = {
          [HealthStatus.HEALTHY]: 0,
          [HealthStatus.DEGRADED]: 1,
          [HealthStatus.UNKNOWN]: 2,
          [HealthStatus.UNHEALTHY]: 3,
        };

        const aPriority = statusPriority[a.health.status];
        const bPriority = statusPriority[b.health.status];

        if (aPriority !== bPriority) {
          return aPriority - bPriority;
        }

        // Within same status, prefer higher health score
        return b.health.healthScore - a.health.healthScore;
      })
      .map(({ provider }) => provider);
  }

  /**
   * Get the best available provider
   */
  getBestProvider(availableProviders: string[]): string | null {
    const healthy = this.getHealthyProviders(availableProviders);
    return healthy[0] || availableProviders[0] || null;
  }

  /**
   * Check if a provider is healthy enough to use
   */
  isHealthy(provider: string): boolean {
    const health = this.getHealth(provider);
    return health.status === HealthStatus.HEALTHY || health.status === HealthStatus.DEGRADED;
  }

  /**
   * Reset metrics for a provider
   */
  resetProvider(provider: string): void {
    this.metrics.delete(provider);
    this.lastActiveCheck.delete(provider);
  }

  /**
   * Reset all metrics
   */
  resetAll(): void {
    this.metrics.clear();
    this.lastActiveCheck.clear();
  }

  // Private methods

  private getOrCreateMetrics(provider: string): ProviderHealthMetrics {
    if (!this.metrics.has(provider)) {
      this.metrics.set(provider, {
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        successRate: 1.0,
        averageLatencyMs: 0,
        p50LatencyMs: 0,
        p95LatencyMs: 0,
        p99LatencyMs: 0,
        minLatencyMs: Infinity,
        maxLatencyMs: 0,
        errorCount: 0,
        lastError: null,
        lastErrorTime: null,
        errorTypes: {},
        lastRequestTime: null,
        lastSuccessTime: null,
        firstRequestTime: null,
      });
    }
    return this.metrics.get(provider)!;
  }

  private addLatencySample(metrics: ProviderHealthMetrics, latencyMs: number): void {
    // Track min/max
    metrics.minLatencyMs = Math.min(metrics.minLatencyMs, latencyMs);
    metrics.maxLatencyMs = Math.max(metrics.maxLatencyMs, latencyMs);

    // For percentiles, we would need to store samples. For now, use exponential moving average
    const alpha = 0.1; // Smoothing factor
    metrics.averageLatencyMs = metrics.averageLatencyMs === 0
      ? latencyMs
      : metrics.averageLatencyMs * (1 - alpha) + latencyMs * alpha;

    // Estimate percentiles based on average (rough approximation)
    metrics.p50LatencyMs = metrics.averageLatencyMs;
    metrics.p95LatencyMs = metrics.averageLatencyMs * 1.5;
    metrics.p99LatencyMs = metrics.averageLatencyMs * 2;
  }

  private updateSuccessRate(metrics: ProviderHealthMetrics): void {
    if (metrics.totalRequests > 0) {
      metrics.successRate = metrics.successfulRequests / metrics.totalRequests;
    }
  }

  private classifyError(error?: Error): string {
    if (!error) return 'unknown';

    const message = error.message.toLowerCase();

    if (message.includes('timeout') || message.includes('timed out')) {
      return 'timeout';
    }
    if (message.includes('rate limit') || message.includes('too many requests')) {
      return 'rate_limit';
    }
    if (message.includes('401') || message.includes('403') || message.includes('auth')) {
      return 'auth';
    }
    if (message.includes('network') || message.includes('connection')) {
      return 'network';
    }

    return 'other';
  }

  private calculateHealthScore(metrics: ProviderHealthMetrics, activeCheck: HealthCheckResult | null): number {
    let score = 100;

    // Factor 1: Success rate (weight: 40%)
    if (metrics.totalRequests > 0) {
      score -= (1 - metrics.successRate) * 40;
    }

    // Factor 2: Active check status (weight: 30%)
    if (activeCheck) {
      if (activeCheck.status === HealthStatus.UNHEALTHY) {
        score -= 30;
      } else if (activeCheck.status === HealthStatus.DEGRADED) {
        score -= 15;
      }
    } else {
      // No active check data
      score -= 10;
    }

    // Factor 3: Latency (weight: 20%)
    if (metrics.averageLatencyMs > 5000) {
      score -= 20;
    } else if (metrics.averageLatencyMs > 2000) {
      score -= 10;
    } else if (metrics.averageLatencyMs > 1000) {
      score -= 5;
    }

    // Factor 4: Recent errors (weight: 10%)
    const hasRecentErrors = metrics.lastErrorTime &&
      (Date.now() - metrics.lastErrorTime) < 5 * 60 * 1000; // 5 minutes
    if (hasRecentErrors) {
      score -= 10;
    }

    return Math.max(0, Math.min(100, Math.round(score)));
  }

  private determineStatus(
    healthScore: number,
    metrics: ProviderHealthMetrics,
    activeCheck: HealthCheckResult | null
  ): HealthStatus {
    // Active check takes precedence
    if (activeCheck?.status === HealthStatus.UNHEALTHY) {
      return HealthStatus.UNHEALTHY;
    }

    // Health score based
    if (healthScore >= 80) {
      return HealthStatus.HEALTHY;
    } else if (healthScore >= 50) {
      return HealthStatus.DEGRADED;
    } else {
      return HealthStatus.UNHEALTHY;
    }
  }

  private generateRecommendation(
    status: HealthStatus,
    metrics: ProviderHealthMetrics,
    activeCheck: HealthCheckResult | null
  ): string {
    switch (status) {
      case HealthStatus.HEALTHY:
        return 'Provider is operating normally.';

      case HealthStatus.DEGRADED:
        if (activeCheck?.error?.includes('timeout')) {
          return 'Provider is responding slowly. Consider using a different provider for time-sensitive requests.';
        }
        if (metrics.successRate < 0.9) {
          return `Provider has elevated error rate (${(metrics.successRate * 100).toFixed(1)}% success). Monitor closely.`;
        }
        return 'Provider is experiencing minor issues. Consider using a fallback provider for critical requests.';

      case HealthStatus.UNHEALTHY:
        if (activeCheck?.error?.includes('auth')) {
          return 'Provider authentication failed. Please check API key configuration.';
        }
        if (activeCheck?.error?.includes('timeout')) {
          return 'Provider is not responding. Using fallback providers is recommended.';
        }
        return 'Provider is unavailable. Using fallback providers.';

      case HealthStatus.UNKNOWN:
        return 'No recent data available for this provider.';

      default:
        return 'Status unknown.';
    }
  }
}

/**
 * Run health checks for all configured providers
 */
export async function runHealthChecks(
  providers?: ProviderConfig[]
): Promise<HealthCheckResult[]> {
  const configs = providers || getAvailableProviders();

  const checkPromises = configs.map(async (provider) => {
    // Use retry for health checks
    const result = await withRetry(
      async () => checkProviderHealth(provider),
      RetryStrategies.fast(),
      undefined,
      AbortSignal.timeout(30000)
    );

    if (result.success) {
      return result.result!;
    } else {
      return {
        provider: provider.name,
        status: HealthStatus.UNHEALTHY,
        healthy: false,
        checkTime: Date.now(),
        responseTimeMs: result.totalTimeMs,
        error: result.error?.message || 'Health check failed',
      };
    }
  });

  return Promise.all(checkPromises);
}

// Global health monitor instance
let globalHealthMonitor: ProviderHealthMonitor | null = null;

export function getGlobalHealthMonitor(): ProviderHealthMonitor {
  if (!globalHealthMonitor) {
    globalHealthMonitor = new ProviderHealthMonitor();
  }
  return globalHealthMonitor;
}

export function resetGlobalHealthMonitor(): void {
  globalHealthMonitor = null;
}
