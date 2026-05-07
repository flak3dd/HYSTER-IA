/**
 * Monitoring and Alerting Hooks for AI System
 *
 * Provides comprehensive monitoring capabilities:
 * - Event emission for key lifecycle events
 * - Metrics collection and aggregation
 * - Alert triggers for critical conditions
 * - Structured logging integration
 */

import { EventEmitter } from 'events';
import { AiError, ErrorSeverity, ErrorCategory } from './errors';
import { CircuitState } from './circuit-breaker';
import { HealthStatus } from './health-check';

// ============================================================================
// Event Types
// ============================================================================

export enum AiEventType {
  // Request lifecycle
  REQUEST_START = 'request:start',
  REQUEST_SUCCESS = 'request:success',
  REQUEST_FAILURE = 'request:failure',
  REQUEST_TIMEOUT = 'request:timeout',
  REQUEST_ABORTED = 'request:aborted',

  // Provider events
  PROVIDER_CALL_START = 'provider:call:start',
  PROVIDER_CALL_SUCCESS = 'provider:call:success',
  PROVIDER_CALL_FAILURE = 'provider:call:failure',
  PROVIDER_HEALTH_CHANGE = 'provider:health:change',
  PROVIDER_CIRCUIT_STATE_CHANGE = 'provider:circuit:state:change',

  // Retry events
  RETRY_ATTEMPT = 'retry:attempt',
  RETRY_EXHAUSTED = 'retry:exhausted',

  // Degradation events
  DEGRADATION_APPLIED = 'degradation:applied',
  FALLBACK_USED = 'fallback:used',

  // Error events
  ERROR_OCCURRED = 'error:occurred',
  CRITICAL_ERROR = 'error:critical',

  // System events
  SYSTEM_HEALTH_CHECK = 'system:health:check',
  SYSTEM_METRICS = 'system:metrics',
}

export interface AiEvent {
  type: AiEventType;
  timestamp: number;
  payload: Record<string, unknown>;
}

// ============================================================================
// Event Payloads
// ============================================================================

export interface RequestStartPayload {
  requestId: string;
  provider: string;
  model?: string;
  operation: string;
  estimatedTokens?: number;
  messageCount?: number;
  hasTools: boolean;
  timeoutMs: number;
}

export interface RequestSuccessPayload {
  requestId: string;
  provider: string;
  model?: string;
  latencyMs: number;
  tokenCount?: number;
  toolCalls?: number;
  cached?: boolean;
}

export interface RequestFailurePayload {
  requestId: string;
  provider: string;
  latencyMs: number;
  error: AiError;
  willRetry: boolean;
  retryAttempt?: number;
}

export interface ProviderHealthChangePayload {
  provider: string;
  previousStatus: HealthStatus;
  currentStatus: HealthStatus;
  healthScore: number;
  failureRate: number;
  averageLatencyMs: number;
}

export interface CircuitStateChangePayload {
  provider: string;
  previousState: CircuitState;
  currentState: CircuitState;
  failureCount: number;
  nextResetTime?: number;
}

export interface ErrorPayload {
  error: AiError;
  context: {
    provider?: string;
    requestId?: string;
    operation?: string;
  };
}

// ============================================================================
// Alert Types
// ============================================================================

export enum AlertLevel {
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error',
  CRITICAL = 'critical',
}

export interface Alert {
  level: AlertLevel;
  title: string;
  message: string;
  timestamp: number;
  source: string;
  metadata?: Record<string, unknown>;
  acknowledged?: boolean;
}

export type AlertHandler = (alert: Alert) => void | Promise<void>;

// ============================================================================
// Metrics
// ============================================================================

export interface RequestMetrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  timeoutCount: number;
  abortCount: number;
  averageLatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  successRate: number;
}

export interface ProviderMetrics {
  provider: string;
  requestMetrics: RequestMetrics;
  errorBreakdown: Record<ErrorCategory, number>;
  circuitBreakerState: CircuitState;
  healthStatus: HealthStatus;
}

export interface SystemMetrics {
  timestamp: number;
  requests: RequestMetrics;
  providers: Record<string, ProviderMetrics>;
  queueMetrics: {
    queueLength: number;
    processingCount: number;
    droppedCount: number;
  };
  errorRate: number;
  degradedRequestCount: number;
}

// ============================================================================
// Monitoring System
// ============================================================================

export class AiMonitoringSystem extends EventEmitter {
  private alertHandlers: AlertHandler[] = [];
  private metricsWindow: number = 5 * 60 * 1000; // 5 minutes
  private requestHistory: Array<{
    timestamp: number;
    provider: string;
    success: boolean;
    latencyMs: number;
    errorCategory?: ErrorCategory;
  }> = [];

  private alertRules: Array<{
    name: string;
    condition: (metrics: SystemMetrics) => boolean;
    level: AlertLevel;
    message: string;
    cooldownMs: number;
    lastTriggered?: number;
  }> = [];

  constructor() {
    super();
    this.setupDefaultAlertRules();
    this.setupEventForwarding();
  }

  // Event emission methods

  emitRequestStart(payload: RequestStartPayload): void {
    this.emit(AiEventType.REQUEST_START, {
      type: AiEventType.REQUEST_START,
      timestamp: Date.now(),
      payload,
    });
  }

  emitRequestSuccess(payload: RequestSuccessPayload): void {
    this.recordRequest(payload.provider, true, payload.latencyMs);

    this.emit(AiEventType.REQUEST_SUCCESS, {
      type: AiEventType.REQUEST_SUCCESS,
      timestamp: Date.now(),
      payload,
    });
  }

  emitRequestFailure(payload: RequestFailurePayload): void {
    this.recordRequest(
      payload.provider,
      false,
      payload.latencyMs,
      payload.error.details.category
    );

    this.emit(AiEventType.REQUEST_FAILURE, {
      type: AiEventType.REQUEST_FAILURE,
      timestamp: Date.now(),
      payload,
    });

    // Emit error event
    this.emitError(payload.error, { provider: payload.provider });
  }

  emitProviderCallStart(provider: string, requestId: string): void {
    this.emit(AiEventType.PROVIDER_CALL_START, {
      type: AiEventType.PROVIDER_CALL_START,
      timestamp: Date.now(),
      payload: { provider, requestId },
    });
  }

  emitProviderCallSuccess(provider: string, requestId: string, latencyMs: number): void {
    this.emit(AiEventType.PROVIDER_CALL_SUCCESS, {
      type: AiEventType.PROVIDER_CALL_SUCCESS,
      timestamp: Date.now(),
      payload: { provider, requestId, latencyMs },
    });
  }

  emitProviderCallFailure(provider: string, requestId: string, error: AiError): void {
    this.emit(AiEventType.PROVIDER_CALL_FAILURE, {
      type: AiEventType.PROVIDER_CALL_FAILURE,
      timestamp: Date.now(),
      payload: { provider, requestId, error },
    });
  }

  emitProviderHealthChange(payload: ProviderHealthChangePayload): void {
    this.emit(AiEventType.PROVIDER_HEALTH_CHANGE, {
      type: AiEventType.PROVIDER_HEALTH_CHANGE,
      timestamp: Date.now(),
      payload,
    });

    // Alert on significant health changes
    if (payload.previousStatus === HealthStatus.HEALTHY &&
        payload.currentStatus !== HealthStatus.HEALTHY) {
      this.triggerAlert({
        level: payload.currentStatus === HealthStatus.UNHEALTHY
          ? AlertLevel.ERROR
          : AlertLevel.WARNING,
        title: `Provider ${payload.provider} health degraded`,
        message: `Health status changed from ${payload.previousStatus} to ${payload.currentStatus}. ` +
                 `Current health score: ${payload.healthScore}. Failure rate: ${(payload.failureRate * 100).toFixed(1)}%`,
        timestamp: Date.now(),
        source: 'health_monitor',
        metadata: payload,
      });
    }
  }

  emitCircuitStateChange(payload: CircuitStateChangePayload): void {
    this.emit(AiEventType.PROVIDER_CIRCUIT_STATE_CHANGE, {
      type: AiEventType.PROVIDER_CIRCUIT_STATE_CHANGE,
      timestamp: Date.now(),
      payload,
    });

    // Alert on circuit breaker events
    if (payload.currentState === CircuitState.OPEN) {
      this.triggerAlert({
        level: AlertLevel.WARNING,
        title: `Circuit breaker opened for ${payload.provider}`,
        message: `Circuit breaker opened after ${payload.failureCount} failures. ` +
                 `Will reset at ${payload.nextResetTime ? new Date(payload.nextResetTime).toISOString() : 'unknown'}`,
        timestamp: Date.now(),
        source: 'circuit_breaker',
        metadata: payload,
      });
    }
  }

  emitRetryAttempt(provider: string, attempt: number, maxAttempts: number, delayMs: number): void {
    this.emit(AiEventType.RETRY_ATTEMPT, {
      type: AiEventType.RETRY_ATTEMPT,
      timestamp: Date.now(),
      payload: { provider, attempt, maxAttempts, delayMs },
    });
  }

  emitRetryExhausted(provider: string, attempts: number, error: AiError): void {
    this.emit(AiEventType.RETRY_EXHAUSTED, {
      type: AiEventType.RETRY_EXHAUSTED,
      timestamp: Date.now(),
      payload: { provider, attempts, error },
    });
  }

  emitDegradationApplied(level: string, strategy: string, context: Record<string, unknown>): void {
    this.emit(AiEventType.DEGRADATION_APPLIED, {
      type: AiEventType.DEGRADATION_APPLIED,
      timestamp: Date.now(),
      payload: { level, strategy, context },
    });
  }

  emitFallbackUsed(fromProvider: string, toProvider: string, reason: string): void {
    this.emit(AiEventType.FALLBACK_USED, {
      type: AiEventType.FALLBACK_USED,
      timestamp: Date.now(),
      payload: { fromProvider, toProvider, reason },
    });
  }

  emitError(error: AiError, context: { provider?: string; requestId?: string; operation?: string }): void {
    const event: AiEvent = {
      type: AiEventType.ERROR_OCCURRED,
      timestamp: Date.now(),
      payload: { error, context },
    };

    this.emit(AiEventType.ERROR_OCCURRED, event);

    // Alert on critical errors
    if (error.details.severity === ErrorSeverity.CRITICAL) {
      this.emit(AiEventType.CRITICAL_ERROR, {
        ...event,
        type: AiEventType.CRITICAL_ERROR,
      });

      this.triggerAlert({
        level: AlertLevel.CRITICAL,
        title: `Critical AI Error: ${error.details.category}`,
        message: error.message,
        timestamp: Date.now(),
        source: 'ai_system',
        metadata: { error: error.toLogEntry(), context },
      });
    }
  }

  // Alert management

  addAlertHandler(handler: AlertHandler): void {
    this.alertHandlers.push(handler);
  }

  removeAlertHandler(handler: AlertHandler): void {
    const index = this.alertHandlers.indexOf(handler);
    if (index > -1) {
      this.alertHandlers.splice(index, 1);
    }
  }

  private triggerAlert(alert: Alert): void {
    // Check cooldown
    const rule = this.alertRules.find(r => r.name === alert.source);
    if (rule?.lastTriggered) {
      const timeSinceLast = Date.now() - rule.lastTriggered;
      if (timeSinceLast < rule.cooldownMs) {
        return; // Still in cooldown
      }
    }

    if (rule) {
      rule.lastTriggered = Date.now();
    }

    // Call all handlers
    for (const handler of this.alertHandlers) {
      try {
        const result = handler(alert);
        if (result instanceof Promise) {
          result.catch(err => {
            console.error('Alert handler failed:', err);
          });
        }
      } catch (err) {
        console.error('Alert handler failed:', err);
      }
    }
  }

  // Metrics

  private recordRequest(
    provider: string,
    success: boolean,
    latencyMs: number,
    errorCategory?: ErrorCategory
  ): void {
    this.requestHistory.push({
      timestamp: Date.now(),
      provider,
      success,
      latencyMs,
      errorCategory,
    });

    // Clean up old entries
    const cutoff = Date.now() - this.metricsWindow;
    this.requestHistory = this.requestHistory.filter(r => r.timestamp > cutoff);
  }

  getMetrics(): SystemMetrics {
    const cutoff = Date.now() - this.metricsWindow;
    const recentRequests = this.requestHistory.filter(r => r.timestamp > cutoff);

    const totalRequests = recentRequests.length;
    const successfulRequests = recentRequests.filter(r => r.success).length;
    const failedRequests = totalRequests - successfulRequests;
    const timeoutCount = recentRequests.filter(r => r.errorCategory === ErrorCategory.PROVIDER_TIMEOUT).length;

    const latencies = recentRequests.map(r => r.latencyMs).sort((a, b) => a - b);
    const avgLatency = latencies.length > 0
      ? latencies.reduce((a, b) => a + b, 0) / latencies.length
      : 0;
    const p95Index = Math.floor(latencies.length * 0.95);
    const p99Index = Math.floor(latencies.length * 0.99);

    // Group by provider
    const providerMetrics: Record<string, ProviderMetrics> = {};
    const providers = new Set(recentRequests.map(r => r.provider));

    for (const provider of providers) {
      const providerRequests = recentRequests.filter(r => r.provider === provider);
      const providerSuccess = providerRequests.filter(r => r.success);
      const providerLatencies = providerRequests.map(r => r.latencyMs);

      const errorBreakdown: Record<ErrorCategory, number> = {} as Record<ErrorCategory, number>;
      for (const req of providerRequests.filter(r => !r.success)) {
        if (req.errorCategory) {
          errorBreakdown[req.errorCategory] = (errorBreakdown[req.errorCategory] || 0) + 1;
        }
      }

      providerMetrics[provider] = {
        provider,
        requestMetrics: {
          totalRequests: providerRequests.length,
          successfulRequests: providerSuccess.length,
          failedRequests: providerRequests.length - providerSuccess.length,
          timeoutCount: providerRequests.filter(r => r.errorCategory === ErrorCategory.PROVIDER_TIMEOUT).length,
          abortCount: 0,
          averageLatencyMs: providerLatencies.length > 0
            ? providerLatencies.reduce((a, b) => a + b, 0) / providerLatencies.length
            : 0,
          p95LatencyMs: 0,
          p99LatencyMs: 0,
          successRate: providerRequests.length > 0
            ? providerSuccess.length / providerRequests.length
            : 1,
        },
        errorBreakdown,
        circuitBreakerState: CircuitState.CLOSED,
        healthStatus: HealthStatus.UNKNOWN,
      };
    }

    return {
      timestamp: Date.now(),
      requests: {
        totalRequests,
        successfulRequests,
        failedRequests,
        timeoutCount,
        abortCount: 0,
        averageLatencyMs: avgLatency,
        p95LatencyMs: latencies[p95Index] || 0,
        p99LatencyMs: latencies[p99Index] || 0,
        successRate: totalRequests > 0 ? successfulRequests / totalRequests : 1,
      },
      providers: providerMetrics,
      queueMetrics: {
        queueLength: 0,
        processingCount: 0,
        droppedCount: 0,
      },
      errorRate: totalRequests > 0 ? failedRequests / totalRequests : 0,
      degradedRequestCount: 0,
    };
  }

  // Alert rules

  addAlertRule(rule: {
    name: string;
    condition: (metrics: SystemMetrics) => boolean;
    level: AlertLevel;
    message: string;
    cooldownMs: number;
  }): void {
    this.alertRules.push(rule);
  }

  private setupDefaultAlertRules(): void {
    // High error rate alert
    this.addAlertRule({
      name: 'high_error_rate',
      condition: (metrics) => metrics.errorRate > 0.5,
      level: AlertLevel.ERROR,
      message: 'AI system error rate exceeds 50%',
      cooldownMs: 60000, // 1 minute
    });

    // High latency alert
    this.addAlertRule({
      name: 'high_latency',
      condition: (metrics) => metrics.requests.p95LatencyMs > 30000,
      level: AlertLevel.WARNING,
      message: 'AI system P95 latency exceeds 30 seconds',
      cooldownMs: 300000, // 5 minutes
    });

    // All providers failing
    this.addAlertRule({
      name: 'all_providers_failing',
      condition: (metrics) => {
        const providers = Object.values(metrics.providers);
        return providers.length > 0 &&
               providers.every(p => p.requestMetrics.successRate < 0.5);
      },
      level: AlertLevel.CRITICAL,
      message: 'All AI providers are experiencing high failure rates',
      cooldownMs: 300000, // 5 minutes
    });
  }

  private setupEventForwarding(): void {
    // Forward all events to console in debug mode
    this.on(AiEventType.ERROR_OCCURRED, (event: AiEvent) => {
      if (process.env.AI_DEBUG === 'true') {
        console.error('[AI Monitor]', event.type, event.payload);
      }
    });

    this.on(AiEventType.CRITICAL_ERROR, (event: AiEvent) => {
      console.error('[AI Monitor] CRITICAL:', event.type, event.payload);
    });
  }
}

// ============================================================================
// Console Alert Handler
// ============================================================================

export function createConsoleAlertHandler(): AlertHandler {
  return (alert: Alert) => {
    const prefix = `[ALERT:${alert.level.toUpperCase()}]`;
    const message = `${prefix} ${alert.title}: ${alert.message}`;

    switch (alert.level) {
      case AlertLevel.INFO:
        console.log(message);
        break;
      case AlertLevel.WARNING:
        console.warn(message);
        break;
      case AlertLevel.ERROR:
      case AlertLevel.CRITICAL:
        console.error(message);
        break;
    }
  };
}

// ============================================================================
// Global Instance
// ============================================================================

let globalMonitoringSystem: AiMonitoringSystem | null = null;

export function getGlobalMonitoringSystem(): AiMonitoringSystem {
  if (!globalMonitoringSystem) {
    globalMonitoringSystem = new AiMonitoringSystem();

    // Add console handler by default
    globalMonitoringSystem.addAlertHandler(createConsoleAlertHandler());
  }
  return globalMonitoringSystem;
}

export function resetGlobalMonitoringSystem(): void {
  globalMonitoringSystem = null;
}

// ============================================================================
// Utility Hooks for Integration
// ============================================================================

/**
 * Wrap a function with monitoring
 */
export function withMonitoring<T>(
  fn: () => Promise<T>,
  options: {
    operation: string;
    provider: string;
    requestId: string;
  }
): Promise<T> {
  const monitor = getGlobalMonitoringSystem();
  const startTime = Date.now();

  monitor.emitRequestStart({
    requestId: options.requestId,
    provider: options.provider,
    operation: options.operation,
    hasTools: false,
    timeoutMs: 60000,
  });

  monitor.emitProviderCallStart(options.provider, options.requestId);

  return fn()
    .then(result => {
      const latencyMs = Date.now() - startTime;

      monitor.emitRequestSuccess({
        requestId: options.requestId,
        provider: options.provider,
        latencyMs,
      });

      monitor.emitProviderCallSuccess(options.provider, options.requestId, latencyMs);

      return result;
    })
    .catch(error => {
      const latencyMs = Date.now() - startTime;
      const aiError = error instanceof AiError
        ? error
        : new AiError({
            category: ErrorCategory.INTERNAL_ERROR,
            severity: ErrorSeverity.ERROR,
            message: String(error),
            code: 'MONITORED_ERROR',
            context: {},
            recoverable: true,
          }, error instanceof Error ? error : undefined);

      monitor.emitRequestFailure({
        requestId: options.requestId,
        provider: options.provider,
        latencyMs,
        error: aiError,
        willRetry: false,
      });

      monitor.emitProviderCallFailure(options.provider, options.requestId, aiError);

      throw error;
    });
}

/**
 * Create a health check reporter
 */
export function createHealthReporter(
  provider: string,
  checkIntervalMs: number = 60000
): { start: () => void; stop: () => void } {
  const monitor = getGlobalMonitoringSystem();
  let intervalId: NodeJS.Timeout | null = null;

  return {
    start: () => {
      if (intervalId) return;

      intervalId = setInterval(() => {
        monitor.emit(AiEventType.SYSTEM_HEALTH_CHECK, {
          type: AiEventType.SYSTEM_HEALTH_CHECK,
          timestamp: Date.now(),
          payload: { provider, checkIntervalMs },
        });
      }, checkIntervalMs);
    },
    stop: () => {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
    },
  };
}
