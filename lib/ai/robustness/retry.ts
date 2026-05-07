/**
 * Exponential Backoff Retry Mechanism
 *
 * Provides configurable retry logic with exponential backoff, jitter,
 * and circuit breaker integration for resilient AI operations.
 *
 * Features:
 * - Exponential backoff with configurable base and max delay
 * - Jitter to prevent thundering herd
 * - Circuit breaker awareness
 * - Per-operation and global retry budgets
 * - Customizable retry strategies
 */

import { AiError, isTransientError, isFatalError, AiErrors } from './errors';
import { CircuitBreaker } from './circuit-breaker';

export interface RetryConfig {
  // Maximum number of retry attempts
  maxRetries: number;

  // Initial delay in milliseconds
  baseDelayMs: number;

  // Maximum delay in milliseconds
  maxDelayMs: number;

  // Exponential backoff factor
  backoffMultiplier: number;

  // Add jitter to prevent synchronized retries (0-1)
  jitterFactor: number;

  // Timeout for each individual attempt
  perAttemptTimeoutMs?: number;

  // Total timeout for all attempts combined
  totalTimeoutMs?: number;

  // Predicate to determine if an error is retryable
  retryablePredicate: (error: unknown, attempt: number) => boolean;

  // Callback for each retry attempt
  onRetry?: (error: unknown, attempt: number, nextDelayMs: number) => void;

  // Callback when all retries are exhausted
  onExhausted?: (error: unknown, attempts: number) => void;
}

export interface RetryContext {
  attemptNumber: number;
  maxAttempts: number;
  lastError: unknown;
  totalTimeMs: number;
  nextDelayMs: number;
  abortSignal?: AbortSignal;
}

export interface RetryResult<T> {
  success: boolean;
  result?: T;
  error?: AiError;
  attempts: number;
  totalTimeMs: number;
  wasCached?: boolean;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  jitterFactor: 0.3,
  perAttemptTimeoutMs: 60000,
  totalTimeoutMs: 120000,
  retryablePredicate: defaultRetryablePredicate,
};

/**
 * Default predicate for determining if an error is retryable
 */
function defaultRetryablePredicate(error: unknown, attempt: number): boolean {
  // Don't retry if it's a fatal error
  if (isFatalError(error)) {
    return false;
  }

  // Retry transient errors
  if (isTransientError(error)) {
    return true;
  }

  // If it's an AiError, check if it's recoverable
  if (error instanceof AiError) {
    return error.isRecoverable();
  }

  // Default: don't retry unknown errors
  return false;
}

/**
 * Calculate delay with exponential backoff and jitter
 */
export function calculateBackoffDelay(
  attempt: number,
  baseDelayMs: number,
  maxDelayMs: number,
  backoffMultiplier: number,
  jitterFactor: number
): number {
  // Calculate exponential delay
  const exponentialDelay = baseDelayMs * Math.pow(backoffMultiplier, attempt);

  // Cap at max delay
  const cappedDelay = Math.min(exponentialDelay, maxDelayMs);

  // Add jitter to prevent thundering herd
  if (jitterFactor > 0) {
    const jitter = cappedDelay * jitterFactor * (Math.random() * 2 - 1);
    return Math.max(0, Math.floor(cappedDelay + jitter));
  }

  return Math.floor(cappedDelay);
}

/**
 * Sleep with abort signal support
 */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(AiErrors.requestAborted('sleep', { operation: 'retry_delay' }));
      return;
    }

    const timeout = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);

    const onAbort = () => {
      cleanup();
      reject(AiErrors.requestAborted('sleep', { operation: 'retry_delay' }));
    };

    const cleanup = () => {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', onAbort);
    };

    signal?.addEventListener('abort', onAbort);
  });
}

/**
 * Execute a function with timeout
 */
async function withTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number,
  signal?: AbortSignal
): Promise<T> {
  if (!timeoutMs || timeoutMs <= 0) {
    return fn();
  }

  const effectiveSignal = signal
    ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)])
    : AbortSignal.timeout(timeoutMs);

  // Create a promise that rejects when the signal aborts
  const abortPromise = new Promise<never>((_, reject) => {
    if (effectiveSignal.aborted) {
      reject(AiErrors.requestAborted('withTimeout', { operation: 'timeout_execution' }));
      return;
    }

    const onAbort = () => {
      reject(AiErrors.requestAborted('withTimeout', { operation: 'timeout_execution' }));
    };

    effectiveSignal.addEventListener('abort', onAbort, { once: true });
  });

  return Promise.race([fn(), abortPromise]);
}

/**
 * Retry a function with exponential backoff
 */
export async function withRetry<T>(
  fn: (context: RetryContext) => Promise<T>,
  config: Partial<RetryConfig> = {},
  circuitBreaker?: CircuitBreaker,
  signal?: AbortSignal
): Promise<RetryResult<T>> {
  const finalConfig: RetryConfig = { ...DEFAULT_RETRY_CONFIG, ...config };
  const startTime = Date.now();

  let lastError: unknown;

  // Calculate effective max attempts
  const maxAttempts = finalConfig.maxRetries + 1; // +1 for initial attempt

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    // Check for abort
    if (signal?.aborted) {
      const abortError = AiErrors.requestAborted('withRetry', {
        operation: 'retry_loop',
        attemptNumber: attempt,
        maxAttempts,
      });

      return {
        success: false,
        error: abortError,
        attempts: attempt,
        totalTimeMs: Date.now() - startTime,
      };
    }

    // Check total timeout
    if (finalConfig.totalTimeoutMs) {
      const elapsed = Date.now() - startTime;
      if (elapsed >= finalConfig.totalTimeoutMs) {
        const timeoutError = AiErrors.requestTimeout(
          'withRetry',
          finalConfig.totalTimeoutMs,
          {
            operation: 'retry_loop',
            attemptNumber: attempt,
            maxAttempts,
          }
        );

        return {
          success: false,
          error: timeoutError,
          attempts: attempt,
          totalTimeMs: elapsed,
        };
      }
    }

    // Check circuit breaker
    if (circuitBreaker && !circuitBreaker.canExecute()) {
      const circuitError = AiErrors.circuitOpen(
        'unknown',
        0,
        {
          operation: 'retry_loop',
          attemptNumber: attempt,
          maxAttempts,
        }
      );

      return {
        success: false,
        error: circuitError,
        attempts: attempt,
        totalTimeMs: Date.now() - startTime,
      };
    }

    // Calculate next delay (for logging purposes)
    const nextDelayMs = attempt > 0
      ? calculateBackoffDelay(
          attempt - 1,
          finalConfig.baseDelayMs,
          finalConfig.maxDelayMs,
          finalConfig.backoffMultiplier,
          finalConfig.jitterFactor
        )
      : 0;

    const context: RetryContext = {
      attemptNumber: attempt,
      maxAttempts,
      lastError,
      totalTimeMs: Date.now() - startTime,
      nextDelayMs,
      abortSignal: signal,
    };

    try {
      // Execute with timeout if configured
      const result = finalConfig.perAttemptTimeoutMs
        ? await withTimeout(() => fn(context), finalConfig.perAttemptTimeoutMs!, signal)
        : await fn(context);

      // Success!
      if (circuitBreaker) {
        const latency = Date.now() - startTime;
        circuitBreaker.recordSuccess(latency);
      }

      return {
        success: true,
        result,
        attempts: attempt + 1,
        totalTimeMs: Date.now() - startTime,
      };
    } catch (error) {
      lastError = error;

      // Check if we should retry
      if (!finalConfig.retryablePredicate(error, attempt)) {
        // Not retryable, fail immediately
        if (circuitBreaker) {
          circuitBreaker.recordFailure(Date.now() - startTime, error instanceof Error ? error : undefined);
        }

        const aiError = error instanceof AiError
          ? error
          : new AiError({
              category: 'internal_error',
              severity: 'error',
              message: error instanceof Error ? error.message : String(error),
              code: 'AI_RETRY_FAILED',
              context: {
                attemptNumber: attempt,
                maxAttempts,
              },
              recoverable: false,
            });

        return {
          success: false,
          error: aiError,
          attempts: attempt + 1,
          totalTimeMs: Date.now() - startTime,
        };
      }

      // Record failure in circuit breaker
      if (circuitBreaker) {
        circuitBreaker.recordFailure(Date.now() - startTime, error instanceof Error ? error : undefined);
      }

      // Check if this is the last attempt
      if (attempt >= maxAttempts - 1) {
        break;
      }

      // Calculate and wait for backoff delay
      const delayMs = calculateBackoffDelay(
        attempt,
        finalConfig.baseDelayMs,
        finalConfig.maxDelayMs,
        finalConfig.backoffMultiplier,
        finalConfig.jitterFactor
      );

      // Notify about retry
      if (finalConfig.onRetry) {
        try {
          finalConfig.onRetry(error, attempt + 1, delayMs);
        } catch {
          // Ignore callback errors
        }
      }

      // Wait before retry
      try {
        await sleep(delayMs, signal);
      } catch (sleepError) {
        // Sleep was aborted
        return {
          success: false,
          error: sleepError instanceof AiError ? sleepError : AiErrors.requestAborted('withRetry', {
            operation: 'retry_delay',
            attemptNumber: attempt,
            maxAttempts,
          }),
          attempts: attempt + 1,
          totalTimeMs: Date.now() - startTime,
        };
      }
    }
  }

  // All retries exhausted
  if (finalConfig.onExhausted) {
    try {
      finalConfig.onExhausted(lastError, maxAttempts);
    } catch {
      // Ignore callback errors
    }
  }

  const finalError = lastError instanceof AiError
    ? lastError
    : new AiError({
        category: 'internal_error',
        severity: 'error',
        message: lastError instanceof Error ? lastError.message : String(lastError),
        code: 'AI_RETRY_EXHAUSTED',
        context: {
          attemptNumber: maxAttempts - 1,
          maxAttempts,
        },
        recoverable: true,
        suggestedAction: 'Please try again later.',
      });

  return {
    success: false,
    error: finalError,
    attempts: maxAttempts,
    totalTimeMs: Date.now() - startTime,
  };
}

/**
 * Create a retry strategy for specific error types
 */
export function createRetryStrategy(options: {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  retryableErrors?: string[];
  nonRetryableErrors?: string[];
}): Partial<RetryConfig> {
  return {
    maxRetries: options.maxRetries ?? DEFAULT_RETRY_CONFIG.maxRetries,
    baseDelayMs: options.baseDelayMs ?? DEFAULT_RETRY_CONFIG.baseDelayMs,
    maxDelayMs: options.maxDelayMs ?? DEFAULT_RETRY_CONFIG.maxDelayMs,
    retryablePredicate: (error: unknown) => {
      const errorMessage = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();

      // Check non-retryable errors first
      if (options.nonRetryableErrors) {
        for (const nonRetryable of options.nonRetryableErrors) {
          if (errorMessage.includes(nonRetryable.toLowerCase())) {
            return false;
          }
        }
      }

      // Check retryable errors
      if (options.retryableErrors) {
        for (const retryable of options.retryableErrors) {
          if (errorMessage.includes(retryable.toLowerCase())) {
            return true;
          }
        }
        // If we specified retryable errors but none matched, don't retry
        return false;
      }

      // Default behavior
      return defaultRetryablePredicate(error, 0);
    },
  };
}

/**
 * Pre-configured retry strategies for common scenarios
 */
export const RetryStrategies = {
  /**
   * Conservative strategy: few retries, longer delays
   * Best for: Non-critical operations, cost-sensitive scenarios
   */
  conservative: (): Partial<RetryConfig> => ({
    maxRetries: 2,
    baseDelayMs: 2000,
    maxDelayMs: 10000,
    backoffMultiplier: 2,
    jitterFactor: 0.2,
  }),

  /**
   * Aggressive strategy: more retries, shorter delays
   * Best for: Critical operations, user-facing requests
   */
  aggressive: (): Partial<RetryConfig> => ({
    maxRetries: 5,
    baseDelayMs: 500,
    maxDelayMs: 15000,
    backoffMultiplier: 1.5,
    jitterFactor: 0.4,
  }),

  /**
   * Fast strategy: minimal delays, moderate retries
   * Best for: Health checks, status polling
   */
  fast: (): Partial<RetryConfig> => ({
    maxRetries: 3,
    baseDelayMs: 250,
    maxDelayMs: 2000,
    backoffMultiplier: 1.5,
    jitterFactor: 0.3,
  }),

  /**
   * No retry strategy: fail fast
   * Best for: Operations where retry isn't appropriate
   */
  none: (): Partial<RetryConfig> => ({
    maxRetries: 0,
    retryablePredicate: () => false,
  }),

  /**
   * Provider-specific strategy with error classification
   */
  forProvider: (provider: string): Partial<RetryConfig> => {
    const baseConfig: Partial<RetryConfig> = {
      maxRetries: 3,
      baseDelayMs: 1000,
      maxDelayMs: 30000,
      backoffMultiplier: 2,
      jitterFactor: 0.3,
    };

    // Provider-specific adjustments
    switch (provider.toLowerCase()) {
      case 'xai':
      case 'grok':
        // xAI has rate limits but is generally reliable
        return {
          ...baseConfig,
          maxRetries: 2,
          baseDelayMs: 1500,
        };

      case 'anthropic':
        // Claude is reliable but slower
        return {
          ...baseConfig,
          maxRetries: 2,
          baseDelayMs: 2000,
          maxDelayMs: 45000,
          perAttemptTimeoutMs: 90000,
        };

      case 'openai':
        // OpenAI has strict rate limits
        return {
          ...baseConfig,
          maxRetries: 3,
          baseDelayMs: 2000,
          jitterFactor: 0.5, // More jitter for OpenAI
        };

      case 'azure':
        // Azure is generally reliable but can have regional issues
        return {
          ...baseConfig,
          maxRetries: 2,
          baseDelayMs: 1000,
        };

      default:
        return baseConfig;
    }
  },
};

/**
 * Retry budget manager to prevent cascading retries
 */
export class RetryBudget {
  private budget: number;
  private used: number = 0;
  private lastReset: number;
  private resetIntervalMs: number;

  constructor(budget: number, resetIntervalMs: number = 60000) {
    this.budget = budget;
    this.resetIntervalMs = resetIntervalMs;
    this.lastReset = Date.now();
  }

  /**
   * Check if we have budget for a retry
   */
  hasBudget(): boolean {
    this.checkAndReset();
    return this.used < this.budget;
  }

  /**
   * Consume budget for a retry
   */
  consume(amount: number = 1): boolean {
    this.checkAndReset();

    if (this.used + amount > this.budget) {
      return false;
    }

    this.used += amount;
    return true;
  }

  /**
   * Get current budget status
   */
  getStatus(): { budget: number; used: number; remaining: number; percentUsed: number } {
    this.checkAndReset();
    return {
      budget: this.budget,
      used: this.used,
      remaining: this.budget - this.used,
      percentUsed: (this.used / this.budget) * 100,
    };
  }

  /**
   * Reset the budget
   */
  reset(): void {
    this.used = 0;
    this.lastReset = Date.now();
  }

  private checkAndReset(): void {
    const now = Date.now();
    if (now - this.lastReset >= this.resetIntervalMs) {
      this.reset();
    }
  }
}

/**
 * Global retry budget manager
 */
export class GlobalRetryBudget {
  private budgets: Map<string, RetryBudget> = new Map();
  private defaultBudget: number;
  private resetIntervalMs: number;

  constructor(defaultBudget: number = 100, resetIntervalMs: number = 60000) {
    this.defaultBudget = defaultBudget;
    this.resetIntervalMs = resetIntervalMs;
  }

  /**
   * Get or create a budget for an operation type
   */
  getBudget(operationType: string, customBudget?: number): RetryBudget {
    if (!this.budgets.has(operationType)) {
      this.budgets.set(
        operationType,
        new RetryBudget(customBudget ?? this.defaultBudget, this.resetIntervalMs)
      );
    }
    return this.budgets.get(operationType)!;
  }

  /**
   * Check if operation can proceed
   */
  canProceed(operationType: string): boolean {
    return this.getBudget(operationType).hasBudget();
  }

  /**
   * Get all budget statuses
   */
  getAllStatuses(): Record<string, ReturnType<RetryBudget['getStatus']>> {
    const statuses: Record<string, ReturnType<RetryBudget['getStatus']>> = {};
    for (const [type, budget] of this.budgets) {
      statuses[type] = budget.getStatus();
    }
    return statuses;
  }
}

// Global instance
let globalRetryBudget: GlobalRetryBudget | null = null;

export function getGlobalRetryBudget(defaultBudget?: number, resetIntervalMs?: number): GlobalRetryBudget {
  if (!globalRetryBudget) {
    globalRetryBudget = new GlobalRetryBudget(defaultBudget, resetIntervalMs);
  }
  return globalRetryBudget;
}

export function resetGlobalRetryBudget(): void {
  globalRetryBudget = null;
}
