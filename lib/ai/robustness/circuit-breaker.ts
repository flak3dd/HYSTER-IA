/**
 * Circuit Breaker Pattern for AI Provider Resilience
 *
 * Implements the circuit breaker pattern to prevent cascading failures
 * when AI providers are experiencing issues.
 *
 * States:
 * - CLOSED: Normal operation, requests pass through
 * - OPEN: Failure threshold reached, requests fail fast
 * - HALF_OPEN: Testing if service has recovered
 *
 * Features:
 * - Configurable failure thresholds
 * - Exponential backoff for reset attempts
 * - Success rate tracking
 * - Automatic state transitions
 */

import { AiError, ErrorCategory, ErrorSeverity, AiErrors } from './errors';

export enum CircuitState {
  CLOSED = 'closed',
  OPEN = 'open',
  HALF_OPEN = 'half_open',
}

export interface CircuitBreakerConfig {
  // Number of failures before opening circuit
  failureThreshold: number;

  // Time in ms before attempting to close circuit
  resetTimeoutMs: number;

  // Number of consecutive successes needed to close circuit from half-open
  successThreshold: number;

  // Time window for tracking failures (sliding window)
  monitoringWindowMs: number;

  // Percentage of requests to allow through when half-open (0-1)
  halfOpenMaxCalls: number;
}

export interface CircuitBreakerStats {
  state: CircuitState;
  failureCount: number;
  successCount: number;
  lastFailureTime: number | null;
  lastSuccessTime: number | null;
  consecutiveSuccesses: number;
  consecutiveFailures: number;
  totalCalls: number;
  totalFailures: number;
  totalSuccesses: number;
  averageLatencyMs: number;
  currentFailureRate: number;
  nextResetTime: number | null;
}

interface CircuitBreakerRecord {
  state: CircuitState;
  failures: number[]; // timestamps
  successes: number[]; // timestamps
  consecutiveSuccesses: number;
  consecutiveFailures: number;
  totalCalls: number;
  totalFailures: number;
  totalSuccesses: number;
  latencies: number[];
  lastStateChange: number;
  halfOpenCallsRemaining: number;
}

const DEFAULT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  resetTimeoutMs: 30000, // 30 seconds
  successThreshold: 3,
  monitoringWindowMs: 60000, // 1 minute
  halfOpenMaxCalls: 3,
};

export class CircuitBreaker {
  private config: CircuitBreakerConfig;
  private record: CircuitBreakerRecord;
  private providerName: string;
  private onStateChange?: (from: CircuitState, to: CircuitState, provider: string) => void;

  constructor(
    providerName: string,
    config: Partial<CircuitBreakerConfig> = {},
    onStateChange?: (from: CircuitState, to: CircuitState, provider: string) => void
  ) {
    this.providerName = providerName;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.onStateChange = onStateChange;

    this.record = {
      state: CircuitState.CLOSED,
      failures: [],
      successes: [],
      consecutiveSuccesses: 0,
      consecutiveFailures: 0,
      totalCalls: 0,
      totalFailures: 0,
      totalSuccesses: 0,
      latencies: [],
      lastStateChange: Date.now(),
      halfOpenCallsRemaining: config.halfOpenMaxCalls ?? DEFAULT_CONFIG.halfOpenMaxCalls,
    };
  }

  /**
   * Get current circuit state
   */
  getState(): CircuitState {
    this.cleanupOldEntries();
    this.checkForStateTransition();
    return this.record.state;
  }

  /**
   * Check if the circuit allows requests through
   */
  canExecute(): boolean {
    const state = this.getState();

    switch (state) {
      case CircuitState.CLOSED:
        return true;

      case CircuitState.OPEN:
        return false;

      case CircuitState.HALF_OPEN:
        if (this.record.halfOpenCallsRemaining > 0) {
          this.record.halfOpenCallsRemaining--;
          return true;
        }
        return false;

      default:
        return false;
    }
  }

  /**
   * Record a successful execution
   */
  recordSuccess(latencyMs: number): void {
    const now = Date.now();
    this.record.successes.push(now);
    this.record.consecutiveSuccesses++;
    this.record.consecutiveFailures = 0;
    this.record.totalSuccesses++;
    this.record.totalCalls++;
    this.record.latencies.push(latencyMs);

    // Keep only last 100 latency measurements
    if (this.record.latencies.length > 100) {
      this.record.latencies = this.record.latencies.slice(-100);
    }

    // Check for state transition from HALF_OPEN to CLOSED
    if (this.record.state === CircuitState.HALF_OPEN) {
      if (this.record.consecutiveSuccesses >= this.config.successThreshold) {
        this.transitionTo(CircuitState.CLOSED);
      }
    }

    this.cleanupOldEntries();
  }

  /**
   * Record a failed execution
   */
  recordFailure(latencyMs: number, error?: Error): void {
    const now = Date.now();
    this.record.failures.push(now);
    this.record.consecutiveFailures++;
    this.record.consecutiveSuccesses = 0;
    this.record.totalFailures++;
    this.record.totalCalls++;
    this.record.latencies.push(latencyMs);

    // Check for state transition from CLOSED to OPEN
    if (this.record.state === CircuitState.CLOSED) {
      // Count failures in monitoring window
      const windowFailures = this.getFailuresInWindow();
      if (windowFailures >= this.config.failureThreshold) {
        this.transitionTo(CircuitState.OPEN);
      }
    }

    // Check for state transition from HALF_OPEN to OPEN
    if (this.record.state === CircuitState.HALF_OPEN) {
      this.transitionTo(CircuitState.OPEN);
    }

    this.cleanupOldEntries();
  }

  /**
   * Execute a function with circuit breaker protection
   */
  async execute<T>(
    fn: () => Promise<T>,
    fallbackFn?: () => Promise<T>
  ): Promise<T> {
    // Check if circuit is open
    if (!this.canExecute()) {
      const resetTime = this.getNextResetTime();
      const waitTime = resetTime ? resetTime - Date.now() : this.config.resetTimeoutMs;

      const error = AiErrors.circuitOpen(this.providerName, Math.max(0, waitTime), {
        provider: this.providerName,
      });

      if (fallbackFn) {
        return fallbackFn();
      }

      throw error;
    }

    const startTime = Date.now();

    try {
      const result = await fn();
      const latency = Date.now() - startTime;
      this.recordSuccess(latency);
      return result;
    } catch (error) {
      const latency = Date.now() - startTime;
      this.recordFailure(latency, error instanceof Error ? error : undefined);
      throw error;
    }
  }

  /**
   * Get current statistics
   */
  getStats(): CircuitBreakerStats {
    this.cleanupOldEntries();

    const now = Date.now();
    const failuresInWindow = this.getFailuresInWindow();
    const successesInWindow = this.getSuccessesInWindow();
    const totalInWindow = failuresInWindow + successesInWindow;

    const avgLatency = this.record.latencies.length > 0
      ? this.record.latencies.reduce((a, b) => a + b, 0) / this.record.latencies.length
      : 0;

    return {
      state: this.record.state,
      failureCount: failuresInWindow,
      successCount: successesInWindow,
      lastFailureTime: this.record.failures[this.record.failures.length - 1] ?? null,
      lastSuccessTime: this.record.successes[this.record.successes.length - 1] ?? null,
      consecutiveSuccesses: this.record.consecutiveSuccesses,
      consecutiveFailures: this.record.consecutiveFailures,
      totalCalls: this.record.totalCalls,
      totalFailures: this.record.totalFailures,
      totalSuccesses: this.record.totalSuccesses,
      averageLatencyMs: Math.round(avgLatency),
      currentFailureRate: totalInWindow > 0 ? failuresInWindow / totalInWindow : 0,
      nextResetTime: this.getNextResetTime(),
    };
  }

  /**
   * Manually reset the circuit to CLOSED state
   */
  reset(): void {
    this.transitionTo(CircuitState.CLOSED);
    this.record.failures = [];
    this.record.successes = [];
    this.record.consecutiveSuccesses = 0;
    this.record.consecutiveFailures = 0;
    this.record.halfOpenCallsRemaining = this.config.halfOpenMaxCalls;
  }

  /**
   * Force the circuit to OPEN state
   */
  forceOpen(): void {
    this.transitionTo(CircuitState.OPEN);
  }

  /**
   * Get detailed health report
   */
  getHealthReport(): {
    healthy: boolean;
    state: CircuitState;
    recommendation: string;
    metrics: CircuitBreakerStats;
  } {
    const stats = this.getStats();

    let healthy = false;
    let recommendation = '';

    switch (stats.state) {
      case CircuitState.CLOSED:
        healthy = stats.currentFailureRate < 0.5;
        recommendation = healthy
          ? 'Circuit is healthy'
          : `High failure rate detected (${(stats.currentFailureRate * 100).toFixed(1)}%). Monitor closely.`;
        break;

      case CircuitState.OPEN:
        healthy = false;
        recommendation = `Circuit is open. Wait ${stats.nextResetTime ? Math.ceil((stats.nextResetTime - Date.now()) / 1000) : '?'} seconds before retry.`;
        break;

      case CircuitState.HALF_OPEN:
        healthy = false;
        recommendation = 'Circuit is in recovery mode. Testing service health.';
        break;
    }

    return { healthy, state: stats.state, recommendation, metrics: stats };
  }

  // Private methods

  private getFailuresInWindow(): number {
    const cutoff = Date.now() - this.config.monitoringWindowMs;
    return this.record.failures.filter(t => t > cutoff).length;
  }

  private getSuccessesInWindow(): number {
    const cutoff = Date.now() - this.config.monitoringWindowMs;
    return this.record.successes.filter(t => t > cutoff).length;
  }

  private getNextResetTime(): number | null {
    if (this.record.state !== CircuitState.OPEN) {
      return null;
    }
    return this.record.lastStateChange + this.config.resetTimeoutMs;
  }

  private checkForStateTransition(): void {
    if (this.record.state !== CircuitState.OPEN) {
      return;
    }

    const nextResetTime = this.getNextResetTime();
    if (nextResetTime && Date.now() >= nextResetTime) {
      this.transitionTo(CircuitState.HALF_OPEN);
      this.record.halfOpenCallsRemaining = this.config.halfOpenMaxCalls;
    }
  }

  private transitionTo(newState: CircuitState): void {
    const oldState = this.record.state;

    if (oldState === newState) {
      return;
    }

    this.record.state = newState;
    this.record.lastStateChange = Date.now();
    this.record.consecutiveSuccesses = 0;
    this.record.consecutiveFailures = 0;

    if (this.onStateChange) {
      try {
        this.onStateChange(oldState, newState, this.providerName);
      } catch {
        // Ignore callback errors
      }
    }
  }

  private cleanupOldEntries(): void {
    const cutoff = Date.now() - this.config.monitoringWindowMs;
    this.record.failures = this.record.failures.filter(t => t > cutoff);
    this.record.successes = this.record.successes.filter(t => t > cutoff);
  }
}

/**
 * Registry for managing circuit breakers across multiple providers
 */
export class CircuitBreakerRegistry {
  private breakers: Map<string, CircuitBreaker> = new Map();
  private defaultConfig: Partial<CircuitBreakerConfig>;
  private onStateChange?: (from: CircuitState, to: CircuitState, provider: string) => void;

  constructor(
    defaultConfig: Partial<CircuitBreakerConfig> = {},
    onStateChange?: (from: CircuitState, to: CircuitState, provider: string) => void
  ) {
    this.defaultConfig = defaultConfig;
    this.onStateChange = onStateChange;
  }

  /**
   * Get or create a circuit breaker for a provider
   */
  getBreaker(provider: string): CircuitBreaker {
    if (!this.breakers.has(provider)) {
      const breaker = new CircuitBreaker(provider, this.defaultConfig, this.onStateChange);
      this.breakers.set(provider, breaker);
    }
    return this.breakers.get(provider)!;
  }

  /**
   * Check if a provider's circuit is healthy
   */
  isHealthy(provider: string): boolean {
    const breaker = this.getBreaker(provider);
    const health = breaker.getHealthReport();
    return health.healthy;
  }

  /**
   * Get all circuit breaker stats
   */
  getAllStats(): Record<string, CircuitBreakerStats> {
    const stats: Record<string, CircuitBreakerStats> = {};
    for (const [provider, breaker] of this.breakers) {
      stats[provider] = breaker.getStats();
    }
    return stats;
  }

  /**
   * Get all health reports
   */
  getAllHealthReports(): Record<string, { healthy: boolean; state: CircuitState; recommendation: string; metrics: CircuitBreakerStats }> {
    const reports: Record<string, ReturnType<CircuitBreaker['getHealthReport']>> = {};
    for (const [provider, breaker] of this.breakers) {
      reports[provider] = breaker.getHealthReport();
    }
    return reports;
  }

  /**
   * Get providers sorted by health (healthiest first)
   */
  getHealthyProviders(providers: string[]): string[] {
    return providers
      .map(p => ({ provider: p, breaker: this.getBreaker(p) }))
      .sort((a, b) => {
        const aHealth = a.breaker.getHealthReport();
        const bHealth = b.breaker.getHealthReport();

        // Priority: CLOSED > HALF_OPEN > OPEN
        const statePriority = { [CircuitState.CLOSED]: 0, [CircuitState.HALF_OPEN]: 1, [CircuitState.OPEN]: 2 };
        const aPriority = statePriority[aHealth.state];
        const bPriority = statePriority[bHealth.state];

        if (aPriority !== bPriority) {
          return aPriority - bPriority;
        }

        // Within same state, prefer lower failure rate
        return aHealth.metrics.currentFailureRate - bHealth.metrics.currentFailureRate;
      })
      .map(({ provider }) => provider);
  }

  /**
   * Reset all circuit breakers
   */
  resetAll(): void {
    for (const breaker of this.breakers.values()) {
      breaker.reset();
    }
  }

  /**
   * Reset a specific provider's circuit breaker
   */
  resetProvider(provider: string): void {
    const breaker = this.breakers.get(provider);
    if (breaker) {
      breaker.reset();
    }
  }

  /**
   * Clear all circuit breakers (useful for testing)
   */
  clear(): void {
    this.breakers.clear();
  }
}

// Global registry instance
let globalRegistry: CircuitBreakerRegistry | null = null;

export function getGlobalCircuitBreakerRegistry(
  config?: Partial<CircuitBreakerConfig>,
  onStateChange?: (from: CircuitState, to: CircuitState, provider: string) => void
): CircuitBreakerRegistry {
  if (!globalRegistry) {
    globalRegistry = new CircuitBreakerRegistry(config, onStateChange);
  }
  return globalRegistry;
}

export function resetGlobalCircuitBreakerRegistry(): void {
  globalRegistry = null;
}
