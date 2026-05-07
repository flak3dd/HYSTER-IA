/**
 * AI System Robustness Module
 *
 * Comprehensive resilience features for the AI assistant system:
 *
 * - Error handling with structured error types
 * - Circuit breaker pattern for failing providers
 * - Exponential backoff retry mechanism
 * - Input validation without regex
 * - Health checks and monitoring
 * - Graceful degradation strategies
 * - Monitoring and alerting hooks
 *
 * @example
 * ```typescript
 * import {
 *   withRobustness,
 *   AiErrors,
 *   CircuitBreaker,
 *   getGlobalHealthMonitor,
 * } from '@/lib/ai/robustness';
 *
 * // Wrap any AI call with full robustness
 * const result = await withRobustness(
 *   () => generateText({ model, messages }),
 *   { provider: 'openai', operation: 'chat' }
 * );
 * ```
 */

// Error handling
export {
  AiError,
  AiErrors,
  ErrorCategory,
  ErrorSeverity,
  toAiError,
  isTransientError,
  isFatalError,
  type ErrorContext,
  type AiErrorDetails,
} from './errors';

// Circuit breaker
export {
  CircuitBreaker,
  CircuitBreakerRegistry,
  CircuitState,
  getGlobalCircuitBreakerRegistry,
  resetGlobalCircuitBreakerRegistry,
  type CircuitBreakerConfig,
  type CircuitBreakerStats,
} from './circuit-breaker';

// Retry mechanism
export {
  withRetry,
  calculateBackoffDelay,
  createRetryStrategy,
  RetryStrategies,
  RetryBudget,
  GlobalRetryBudget,
  getGlobalRetryBudget,
  resetGlobalRetryBudget,
  type RetryConfig,
  type RetryContext,
  type RetryResult,
} from './retry';

// Validation
export {
  validateNonEmpty,
  validateLength,
  validateAllowedChars,
  validateNoControlChars,
  validateProviderName,
  validateModelName,
  validateApiKey,
  validateTimeoutMs,
  validateRetryCount,
  validateTemperature,
  validateMessageContent,
  validateToolName,
  validateConversationId,
  validateUserId,
  validateJson,
  validateJsonSize,
  validateUrl,
  validateArray,
  validateRequiredFields,
  validateNoExtraFields,
  sanitizeRemoveControlChars,
  sanitizeNormalizeWhitespace,
  sanitizeTruncate,
  sanitizeMessageContent,
  validateOrThrow,
  composeValidators,
  Validators,
  combineResults,
  type ValidationResult,
  type Validator,
} from './validation';

// Health checks
export {
  ProviderHealthMonitor,
  checkProviderHealth,
  runHealthChecks,
  getAvailableProviders,
  getGlobalHealthMonitor,
  resetGlobalHealthMonitor,
  HealthStatus,
  type ProviderHealth,
  type ProviderHealthMetrics,
  type HealthCheckResult,
} from './health-check';

// Degradation strategies
export {
  ProviderFallbackStrategy,
  RequestSimplificationStrategy,
  TimeoutReductionStrategy,
  CachingStrategy,
  RequestQueue,
  withDegradation,
  executeWithFallbackChain,
  getGlobalRequestQueue,
  resetGlobalRequestQueue,
  DegradationLevel,
  type DegradationStrategy,
  type DegradationContext,
  type FallbackChainResult,
  type DegradedRequestOptions,
} from './degradation';

// Monitoring
export {
  AiMonitoringSystem,
  AiEventType,
  AlertLevel,
  createConsoleAlertHandler,
  getGlobalMonitoringSystem,
  resetGlobalMonitoringSystem,
  withMonitoring,
  createHealthReporter,
  type AiEvent,
  type Alert,
  type AlertHandler,
  type RequestMetrics,
  type ProviderMetrics,
  type SystemMetrics,
  type RequestStartPayload,
  type RequestSuccessPayload,
  type RequestFailurePayload,
  type ProviderHealthChangePayload,
  type CircuitStateChangePayload,
  type ErrorPayload,
} from './monitoring';

// High-level convenience exports
import { withRetry, RetryStrategies } from './retry';
import { getGlobalCircuitBreakerRegistry } from './circuit-breaker';
import { getGlobalHealthMonitor } from './health-check';
import { getGlobalMonitoringSystem } from './monitoring';
import { executeWithFallbackChain } from './degradation';
import { toAiError, AiError } from './errors';

export interface RobustnessOptions {
  provider?: string;
  availableProviders?: string[];
  operation: string;
  requestId?: string;
  enableRetry?: boolean;
  enableCircuitBreaker?: boolean;
  enableHealthCheck?: boolean;
  enableMonitoring?: boolean;
  enableFallback?: boolean;
  timeoutMs?: number;
  retryStrategy?: Parameters<typeof withRetry>[1];
}

export interface RobustnessResult<T> {
  success: boolean;
  result?: T;
  error?: AiError;
  providerUsed?: string;
  providersAttempted?: string[];
  totalTimeMs: number;
}

/**
 * Execute a function with full robustness features
 */
export async function withRobustness<T>(
  fn: (provider: string) => Promise<T>,
  options: RobustnessOptions
): Promise<RobustnessResult<T>> {
  const startTime = Date.now();

  const {
    provider = 'unknown',
    availableProviders = [provider],
    operation,
    requestId = `req_${Date.now()}`,
    enableRetry = true,
    enableCircuitBreaker = true,
    enableMonitoring = true,
    enableFallback = true,
    timeoutMs = 60000,
    retryStrategy = RetryStrategies.forProvider(provider),
  } = options;

  const monitor = getGlobalMonitoringSystem();

  // Emit request start
  if (enableMonitoring) {
    monitor.emitRequestStart({
      requestId,
      provider,
      operation,
      hasTools: false,
      timeoutMs,
    });
  }

  try {
    const result = enableFallback && availableProviders.length > 1
      ? await executeWithFallbackChain(
          fn,
          {
            preferredProvider: provider,
            availableProviders,
            healthMonitor: getGlobalHealthMonitor(),
            circuitBreakers: getGlobalCircuitBreakerRegistry(),
            requestType: operation.includes('chat') ? 'chat' : 'completion',
            timeoutMs,
            enableRetry,
          }
        )
      : await withRetry(
          async () => fn(provider),
          retryStrategy,
          enableCircuitBreaker ? getGlobalCircuitBreakerRegistry().getBreaker(provider) : undefined
        ).then(r => ({
          success: r.success,
          result: r.result,
          error: r.error,
          providerUsed: r.success ? provider : null,
          providersAttempted: [provider],
          totalTimeMs: r.totalTimeMs,
        }));

    // Emit success
    if (enableMonitoring && result.success) {
      monitor.emitRequestSuccess({
        requestId,
        provider: result.providerUsed || provider,
        latencyMs: result.totalTimeMs || (Date.now() - startTime),
      });
    }

    return {
      success: result.success,
      result: result.result,
      error: result.error,
      providerUsed: result.providerUsed || provider,
      providersAttempted: result.providersAttempted || [provider],
      totalTimeMs: Date.now() - startTime,
    };
  } catch (error) {
    const aiError = toAiError(error);
    const totalTimeMs = Date.now() - startTime;

    // Emit failure
    if (enableMonitoring) {
      monitor.emitRequestFailure({
        requestId,
        provider,
        latencyMs: totalTimeMs,
        error: aiError,
        willRetry: false,
      });
    }

    return {
      success: false,
      error: aiError,
      providerUsed: provider,
      providersAttempted: [provider],
      totalTimeMs,
    };
  }
}

/**
 * Initialize the robustness system with default configuration
 */
export function initializeRobustness(options: {
  consoleAlerts?: boolean;
  circuitBreakerConfig?: Parameters<typeof getGlobalCircuitBreakerRegistry>[0];
  onCircuitStateChange?: Parameters<typeof getGlobalCircuitBreakerRegistry>[1];
} = {}): void {
  const { consoleAlerts = true, circuitBreakerConfig, onCircuitStateChange } = options;

  // Initialize circuit breaker registry
  getGlobalCircuitBreakerRegistry(circuitBreakerConfig, onCircuitStateChange);

  // Initialize health monitor
  getGlobalHealthMonitor();

  // Initialize monitoring system
  const monitor = getGlobalMonitoringSystem();

  if (consoleAlerts) {
    monitor.addAlertHandler(createConsoleAlertHandler());
  }
}

// Import createConsoleAlertHandler for internal use
import { createConsoleAlertHandler as _createConsoleAlertHandler } from './monitoring';
const createConsoleAlertHandler = _createConsoleAlertHandler;
