/**
 * Graceful Degradation and Fallback Strategies
 *
 * Provides strategies for gracefully degrading service when:
 * - Primary providers fail
 * - Resources are constrained
 * - Request quality cannot be maintained
 *
 * Strategies:
 * - Provider fallback chain
 * - Feature degradation (reduce complexity)
 * - Response caching for resilience
 * - Queue-based request management
 */

import { AiError, AiErrors, ErrorCategory, ErrorSeverity } from './errors';
import { CircuitBreaker, CircuitBreakerRegistry } from './circuit-breaker';
import { withRetry, RetryResult, RetryStrategies } from './retry';
import { ProviderHealthMonitor, HealthStatus, getAvailableProviders } from './health-check';

export enum DegradationLevel {
  NONE = 'none',
  LIGHT = 'light',
  MODERATE = 'moderate',
  SEVERE = 'severe',
  CRITICAL = 'critical',
}

export interface DegradationStrategy {
  name: string;
  level: DegradationLevel;
  enabled: boolean;
  priority: number; // Higher = tried first
  canApply: (context: DegradationContext) => boolean;
  apply: <T>(fn: () => Promise<T>, context: DegradationContext) => Promise<T>;
}

export interface DegradationContext {
  originalProvider: string;
  attemptedProviders: string[];
  error: AiError;
  requestType: 'chat' | 'completion' | 'tool' | 'health_check';
  messageCount?: number;
  toolCount?: number;
  estimatedTokens?: number;
  startTime: number;
  timeoutMs: number;
}

export interface FallbackChainResult<T> {
  success: boolean;
  result?: T;
  error?: AiError;
  providerUsed: string | null;
  providersAttempted: string[];
  degradationLevel: DegradationLevel;
  totalTimeMs: number;
}

export interface DegradedRequestOptions {
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
  enableTools?: boolean;
  enableStreaming?: boolean;
  maxToolRounds?: number;
}

/**
 * Provider fallback chain strategy
 */
export class ProviderFallbackStrategy implements DegradationStrategy {
  name = 'provider_fallback';
  level = DegradationLevel.LIGHT;
  enabled = true;
  priority = 100;

  private healthMonitor: ProviderHealthMonitor;
  private circuitBreakers: CircuitBreakerRegistry;

  constructor(
    healthMonitor: ProviderHealthMonitor,
    circuitBreakers: CircuitBreakerRegistry
  ) {
    this.healthMonitor = healthMonitor;
    this.circuitBreakers = circuitBreakers;
  }

  canApply(context: DegradationContext): boolean {
    // Can apply if we have more providers to try
    const available = this.getAvailableProviders();
    const remaining = available.filter(p => !context.attemptedProviders.includes(p));
    return remaining.length > 0;
  }

  async apply<T>(fn: (provider: string) => Promise<T>, context: DegradationContext): Promise<T> {
    const available = this.getAvailableProviders();
    const remaining = available.filter(p => !context.attemptedProviders.includes(p));

    // Sort by health
    const sortedProviders = this.healthMonitor.getHealthyProviders(remaining);

    let lastError: AiError | undefined;

    for (const provider of sortedProviders) {
      try {
        const breaker = this.circuitBreakers.getBreaker(provider);

        if (!breaker.canExecute()) {
          continue;
        }

        const result = await breaker.execute(() => fn(provider));
        return result;
      } catch (error) {
        lastError = error instanceof AiError
          ? error
          : AiErrors.internal(String(error), { provider }, error instanceof Error ? error : undefined);
        context.attemptedProviders.push(provider);
      }
    }

    throw lastError || AiErrors.fallbackExhausted(context.attemptedProviders);
  }

  private getAvailableProviders(): string[] {
    return getAvailableProviders().map(p => p.name);
  }
}

/**
 * Request simplification strategy - reduce complexity
 */
export class RequestSimplificationStrategy implements DegradationStrategy {
  name = 'request_simplification';
  level = DegradationLevel.MODERATE;
  enabled = true;
  priority = 80;

  canApply(context: DegradationContext): boolean {
    // Can apply if we have complex requests (many messages or tools)
    return (context.messageCount || 0) > 10 || (context.toolCount || 0) > 5;
  }

  async apply<T>(
    fn: (options: DegradedRequestOptions) => Promise<T>,
    context: DegradationContext
  ): Promise<T> {
    // Simplify the request
    const degradedOptions: DegradedRequestOptions = {
      maxTokens: 2000,
      temperature: 0.5,
      timeoutMs: 30000,
      enableTools: false,
      enableStreaming: false,
      maxToolRounds: 3,
    };

    return fn(degradedOptions);
  }
}

/**
 * Timeout reduction strategy
 */
export class TimeoutReductionStrategy implements DegradationStrategy {
  name = 'timeout_reduction';
  level = DegradationLevel.LIGHT;
  enabled = true;
  priority = 90;

  canApply(context: DegradationContext): boolean {
    // Can apply if we have a long timeout
    return context.timeoutMs > 30000;
  }

  async apply<T>(fn: (timeoutMs: number) => Promise<T>, context: DegradationContext): Promise<T> {
    // Reduce timeout
    const reducedTimeout = Math.min(context.timeoutMs, 20000);
    return fn(reducedTimeout);
  }
}

/**
 * Caching strategy - use cached responses when available
 */
export class CachingStrategy implements DegradationStrategy {
  name = 'response_caching';
  level = DegradationLevel.NONE;
  enabled = true;
  priority = 95;

  private cache: Map<string, CacheEntry> = new Map();
  private maxEntries = 100;
  private ttlMs = 5 * 60 * 1000; // 5 minutes

  canApply(context: DegradationContext): boolean {
    // Check if we have a cached response
    const key = this.generateCacheKey(context);
    const entry = this.cache.get(key);

    if (!entry) return false;

    // Check if cache is still valid
    if (Date.now() - entry.timestamp > this.ttlMs) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  async apply<T>(fn: () => Promise<T>, context: DegradationContext): Promise<T> {
    const key = this.generateCacheKey(context);
    const entry = this.cache.get(key);

    if (entry) {
      entry.hits++;
      return entry.value as T;
    }

    const result = await fn();

    // Cache the result
    this.setCache(key, result);

    return result;
  }

  private generateCacheKey(context: DegradationContext): string {
    // Simple hash of context
    return `${context.requestType}:${context.attemptedProviders.join(',')}`;
  }

  private setCache(key: string, value: unknown): void {
    // Evict oldest if at capacity
    if (this.cache.size >= this.maxEntries) {
      const oldest = Array.from(this.cache.entries())
        .sort((a, b) => a[1].timestamp - b[1].timestamp)[0];
      if (oldest) {
        this.cache.delete(oldest[0]);
      }
    }

    this.cache.set(key, {
      value,
      timestamp: Date.now(),
      hits: 0,
    });
  }
}

interface CacheEntry {
  value: unknown;
  timestamp: number;
  hits: number;
}

/**
 * Queue-based request management
 */
export class RequestQueue {
  private queue: Array<{
    id: string;
    fn: () => Promise<unknown>;
    resolve: (value: unknown) => void;
    reject: (error: unknown) => void;
    priority: number;
    timeoutMs: number;
    addedAt: number;
  }> = [];

  private running = 0;
  private maxConcurrency: number;
  private maxQueueSize: number;

  constructor(maxConcurrency: number = 5, maxQueueSize: number = 100) {
    this.maxConcurrency = maxConcurrency;
    this.maxQueueSize = maxQueueSize;
  }

  async enqueue<T>(
    fn: () => Promise<T>,
    options: { priority?: number; timeoutMs?: number } = {}
  ): Promise<T> {
    // Check queue size
    if (this.queue.length >= this.maxQueueSize) {
      throw AiErrors.resourceExhausted('request_queue', {
        metadata: { queueSize: this.queue.length, maxQueueSize: this.maxQueueSize },
      });
    }

    return new Promise((resolve, reject) => {
      const id = `req_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

      this.queue.push({
        id,
        fn: fn as () => Promise<unknown>,
        resolve: resolve as (value: unknown) => void,
        reject,
        priority: options.priority ?? 0,
        timeoutMs: options.timeoutMs ?? 60000,
        addedAt: Date.now(),
      });

      // Sort by priority (higher first), then by time
      this.queue.sort((a, b) => {
        if (a.priority !== b.priority) {
          return b.priority - a.priority;
        }
        return a.addedAt - b.addedAt;
      });

      this.processQueue();
    });
  }

  private async processQueue(): Promise<void> {
    if (this.running >= this.maxConcurrency || this.queue.length === 0) {
      return;
    }

    const item = this.queue.shift();
    if (!item) return;

    this.running++;

    // Check if request has been waiting too long
    const waitTime = Date.now() - item.addedAt;
    if (waitTime > item.timeoutMs) {
      item.reject(AiErrors.requestTimeout('queue', waitTime, {
        operation: 'queued_request',
        metadata: { queuePosition: this.queue.length, waitTimeMs: waitTime },
      }));
      this.running--;
      this.processQueue();
      return;
    }

    try {
      // Apply remaining timeout
      const remainingTimeout = item.timeoutMs - waitTime;

      const result = await Promise.race([
        item.fn(),
        new Promise<never>((_, reject) => {
          setTimeout(() => {
            reject(AiErrors.requestTimeout('queue', remainingTimeout));
          }, remainingTimeout);
        }),
      ]);

      item.resolve(result);
    } catch (error) {
      item.reject(error);
    } finally {
      this.running--;
      this.processQueue();
    }
  }

  getStats(): {
    queueLength: number;
    running: number;
    maxConcurrency: number;
    utilization: number;
  } {
    return {
      queueLength: this.queue.length,
      running: this.running,
      maxConcurrency: this.maxConcurrency,
      utilization: this.running / this.maxConcurrency,
    };
  }

  clear(): void {
    // Reject all pending requests
    for (const item of this.queue) {
      item.reject(AiErrors.requestAborted('queue', { operation: 'clear_queue' }));
    }
    this.queue = [];
  }
}

/**
 * Execute with graceful degradation
 */
export async function withDegradation<T>(
  primaryFn: () => Promise<T>,
  context: Omit<DegradationContext, 'attemptedProviders' | 'startTime'>,
  strategies: DegradationStrategy[],
  signal?: AbortSignal
): Promise<FallbackChainResult<T>> {
  const startTime = Date.now();
  const fullContext: DegradationContext = {
    ...context,
    attemptedProviders: [],
    startTime,
  };

  // Try primary first
  try {
    const result = await primaryFn();
    return {
      success: true,
      result,
      providerUsed: context.originalProvider,
      providersAttempted: [context.originalProvider],
      degradationLevel: DegradationLevel.NONE,
      totalTimeMs: Date.now() - startTime,
    };
  } catch (error) {
    const aiError = error instanceof AiError
      ? error
      : AiErrors.internal(String(error), {}, error instanceof Error ? error : undefined);

    fullContext.error = aiError;

    // Try degradation strategies in priority order
    const sortedStrategies = strategies
      .filter(s => s.enabled)
      .sort((a, b) => b.priority - a.priority);

    for (const strategy of sortedStrategies) {
      if (signal?.aborted) {
        return {
          success: false,
          error: AiErrors.requestAborted('withDegradation', { operation: 'degradation' }),
          providerUsed: null,
          providersAttempted: fullContext.attemptedProviders,
          degradationLevel: strategy.level,
          totalTimeMs: Date.now() - startTime,
        };
      }

      if (!strategy.canApply(fullContext)) {
        continue;
      }

      try {
        // Note: This is a simplified implementation
        // In practice, each strategy would have a specific apply signature
        // and you'd need to adapt the primaryFn accordingly
        const result = await strategy.apply<T>(primaryFn as () => Promise<T>, fullContext);

        return {
          success: true,
          result,
          providerUsed: context.originalProvider,
          providersAttempted: fullContext.attemptedProviders,
          degradationLevel: strategy.level,
          totalTimeMs: Date.now() - startTime,
        };
      } catch (strategyError) {
        // Continue to next strategy
        continue;
      }
    }

    // All strategies failed
    return {
      success: false,
      error: aiError,
      providerUsed: null,
      providersAttempted: fullContext.attemptedProviders,
      degradationLevel: DegradationLevel.CRITICAL,
      totalTimeMs: Date.now() - startTime,
    };
  }
}

/**
 * Execute with full fallback chain
 */
export async function executeWithFallbackChain<T>(
  fn: (provider: string, options?: DegradedRequestOptions) => Promise<T>,
  options: {
    preferredProvider?: string;
    availableProviders: string[];
    healthMonitor: ProviderHealthMonitor;
    circuitBreakers: CircuitBreakerRegistry;
    requestType: DegradationContext['requestType'];
    timeoutMs: number;
    enableRetry?: boolean;
  }
): Promise<FallbackChainResult<T>> {
  const startTime = Date.now();
  const attemptedProviders: string[] = [];

  // Get providers sorted by health
  let providers = options.healthMonitor.getHealthyProviders(options.availableProviders);

  // If preferred provider is specified and healthy, put it first
  if (options.preferredProvider && !attemptedProviders.includes(options.preferredProvider)) {
    providers = providers.filter(p => p !== options.preferredProvider);
    providers.unshift(options.preferredProvider);
  }

  // Filter out unhealthy providers
  const healthyProviders = providers.filter(p => {
    const health = options.healthMonitor.getHealth(p);
    return health.status === HealthStatus.HEALTHY || health.status === HealthStatus.DEGRADED;
  });

  const providersToTry = healthyProviders.length > 0 ? healthyProviders : providers;

  for (const provider of providersToTry) {
    // Check circuit breaker
    const breaker = options.circuitBreakers.getBreaker(provider);
    if (!breaker.canExecute()) {
      attemptedProviders.push(provider);
      continue;
    }

    try {
      const executeFn = async () => {
        const result = await fn(provider);
        return result;
      };

      const result = options.enableRetry !== false
        ? await withRetry(
            executeFn,
            RetryStrategies.forProvider(provider),
            breaker
          )
        : { success: true, result: await breaker.execute(executeFn), attempts: 1, totalTimeMs: 0 };

      if (result.success) {
        // Record success in health monitor
        options.healthMonitor.recordSuccess(provider, Date.now() - startTime);

        return {
          success: true,
          result: result.result,
          providerUsed: provider,
          providersAttempted: [...attemptedProviders, provider],
          degradationLevel: attemptedProviders.length > 0
            ? DegradationLevel.LIGHT
            : DegradationLevel.NONE,
          totalTimeMs: Date.now() - startTime,
        };
      } else {
        throw result.error || new Error('Retry failed without error');
      }
    } catch (error) {
      attemptedProviders.push(provider);

      // Record failure in health monitor
      const latency = Date.now() - startTime;
      options.healthMonitor.recordFailure(
        provider,
        latency,
        error instanceof Error ? error : undefined,
        error instanceof AiError ? error.details.category : undefined
      );
    }
  }

  // All providers failed
  return {
    success: false,
    error: AiErrors.fallbackExhausted(attemptedProviders, {
      metadata: { totalProviders: options.availableProviders.length },
    }),
    providerUsed: null,
    providersAttempted: attemptedProviders,
    degradationLevel: DegradationLevel.CRITICAL,
    totalTimeMs: Date.now() - startTime,
  };
}

// Global request queue instance
let globalRequestQueue: RequestQueue | null = null;

export function getGlobalRequestQueue(maxConcurrency?: number, maxQueueSize?: number): RequestQueue {
  if (!globalRequestQueue) {
    globalRequestQueue = new RequestQueue(maxConcurrency, maxQueueSize);
  }
  return globalRequestQueue;
}

export function resetGlobalRequestQueue(): void {
  globalRequestQueue = null;
}
