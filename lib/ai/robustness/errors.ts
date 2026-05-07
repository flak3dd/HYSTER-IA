/**
 * Structured Error Types for AI System Robustness
 *
 * Provides comprehensive error classification with:
 * - Error categories for different failure modes
 * - Structured error context for debugging
 * - User-friendly error messages
 * - Error severity levels for alerting
 */

export enum ErrorSeverity {
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error',
  CRITICAL = 'critical',
}

export enum ErrorCategory {
  // Provider-related errors
  PROVIDER_UNAVAILABLE = 'provider_unavailable',
  PROVIDER_RATE_LIMIT = 'provider_rate_limit',
  PROVIDER_AUTH_ERROR = 'provider_auth_error',
  PROVIDER_TIMEOUT = 'provider_timeout',
  PROVIDER_CIRCUIT_OPEN = 'provider_circuit_open',

  // Request-related errors
  REQUEST_TIMEOUT = 'request_timeout',
  REQUEST_ABORTED = 'request_aborted',
  REQUEST_VALIDATION = 'request_validation',
  REQUEST_TOO_LARGE = 'request_too_large',

  // Response-related errors
  RESPONSE_PARSE = 'response_parse',
  RESPONSE_INVALID = 'response_invalid',
  RESPONSE_INCOMPLETE = 'response_incomplete',

  // Tool-related errors
  TOOL_NOT_FOUND = 'tool_not_found',
  TOOL_EXECUTION = 'tool_execution',
  TOOL_VALIDATION = 'tool_validation',
  TOOL_TIMEOUT = 'tool_timeout',

  // System errors
  INTERNAL_ERROR = 'internal_error',
  CONFIGURATION_ERROR = 'configuration_error',
  RESOURCE_EXHAUSTED = 'resource_exhausted',

  // Fallback errors
  FALLBACK_EXHAUSTED = 'fallback_exhausted',
  FALLBACK_DEGRADED = 'fallback_degraded',
}

export interface ErrorContext {
  // Request context
  provider?: string;
  model?: string;
  operation?: string;
  attemptNumber?: number;
  maxAttempts?: number;

  // Performance context
  latencyMs?: number;
  queuePosition?: number;

  // Resource context
  resourceType?: string;
  resourceId?: string;

  // Additional metadata
  metadata?: Record<string, unknown>;

  // Chain of errors (for wrapped errors)
  cause?: AiError;
}

export interface AiErrorDetails {
  category: ErrorCategory;
  severity: ErrorSeverity;
  message: string;
  code: string;
  context: ErrorContext;
  timestamp: number;
  recoverable: boolean;
  suggestedAction?: string;
}

export class AiError extends Error {
  readonly details: AiErrorDetails;

  constructor(details: Omit<AiErrorDetails, 'timestamp'>, cause?: Error) {
    super(details.message);
    this.name = 'AiError';
    this.details = {
      ...details,
      timestamp: Date.now(),
    };

    if (cause) {
      this.cause = cause;
      this.details.context.cause = cause instanceof AiError ? cause : undefined;
    }
  }

  /**
   * Check if this error is recoverable through retry
   */
  isRecoverable(): boolean {
    return this.details.recoverable;
  }

  /**
   * Check if this error warrants an alert
   */
  shouldAlert(): boolean {
    return this.details.severity === ErrorSeverity.ERROR ||
           this.details.severity === ErrorSeverity.CRITICAL;
  }

  /**
   * Get user-friendly error message
   */
  toUserMessage(): string {
    const { category, message, suggestedAction } = this.details;

    switch (category) {
      case ErrorCategory.PROVIDER_UNAVAILABLE:
        return `The AI service is temporarily unavailable. ${suggestedAction || 'Please try again in a moment.'}`;

      case ErrorCategory.PROVIDER_RATE_LIMIT:
        return `We're experiencing high demand right now. ${suggestedAction || 'Please wait a moment and try again.'}`;

      case ErrorCategory.PROVIDER_TIMEOUT:
        return `The request took too long to complete. ${suggestedAction || 'Please try with a shorter message or try again later.'}`;

      case ErrorCategory.REQUEST_TIMEOUT:
        return `Your request timed out. ${suggestedAction || 'Please try again or contact support if the issue persists.'}`;

      case ErrorCategory.REQUEST_TOO_LARGE:
        return `Your message is too long. ${suggestedAction || 'Please shorten your message and try again.'}`;

      case ErrorCategory.FALLBACK_EXHAUSTED:
        return `All AI services are currently unavailable. ${suggestedAction || 'Please try again in a few minutes.'}`;

      case ErrorCategory.TOOL_EXECUTION:
        return `An error occurred while executing a tool. ${message}`;

      case ErrorCategory.INTERNAL_ERROR:
        return `An internal error occurred. ${suggestedAction || 'Please try again or contact support.'}`;

      default:
        return message;
    }
  }

  /**
   * Get structured log entry for monitoring
   */
  toLogEntry(): Record<string, unknown> {
    return {
      errorType: 'AiError',
      errorName: this.name,
      category: this.details.category,
      severity: this.details.severity,
      code: this.details.code,
      message: this.details.message,
      recoverable: this.details.recoverable,
      timestamp: this.details.timestamp,
      context: this.details.context,
      stack: this.stack,
      cause: this.cause instanceof Error ? {
        name: this.cause.name,
        message: this.cause.message,
        stack: this.cause.stack,
      } : undefined,
    };
  }

  /**
   * Create a JSON-serializable representation
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      details: this.details,
    };
  }
}

/**
 * Factory functions for common error types
 */
export const AiErrors = {
  providerUnavailable: (
    provider: string,
    context?: Partial<ErrorContext>,
    cause?: Error
  ): AiError => new AiError({
    category: ErrorCategory.PROVIDER_UNAVAILABLE,
    severity: ErrorSeverity.ERROR,
    message: `Provider ${provider} is currently unavailable`,
    code: 'AI_PROVIDER_UNAVAILABLE',
    context: { provider, ...context },
    recoverable: true,
    suggestedAction: 'The system will try an alternative provider.',
  }, cause),

  providerRateLimit: (
    provider: string,
    retryAfterMs?: number,
    context?: Partial<ErrorContext>,
    cause?: Error
  ): AiError => new AiError({
    category: ErrorCategory.PROVIDER_RATE_LIMIT,
    severity: ErrorSeverity.WARNING,
    message: `Provider ${provider} rate limit exceeded`,
    code: 'AI_RATE_LIMIT',
    context: { provider, metadata: { retryAfterMs }, ...context },
    recoverable: true,
    suggestedAction: retryAfterMs
      ? `Please wait ${Math.ceil(retryAfterMs / 1000)} seconds before retrying.`
      : 'Please try again shortly.',
  }, cause),

  providerAuthError: (
    provider: string,
    context?: Partial<ErrorContext>,
    cause?: Error
  ): AiError => new AiError({
    category: ErrorCategory.PROVIDER_AUTH_ERROR,
    severity: ErrorSeverity.CRITICAL,
    message: `Authentication failed for provider ${provider}`,
    code: 'AI_AUTH_ERROR',
    context: { provider, ...context },
    recoverable: false,
    suggestedAction: 'Please check your API key configuration.',
  }, cause),

  providerTimeout: (
    provider: string,
    timeoutMs: number,
    context?: Partial<ErrorContext>,
    cause?: Error
  ): AiError => new AiError({
    category: ErrorCategory.PROVIDER_TIMEOUT,
    severity: ErrorSeverity.WARNING,
    message: `Provider ${provider} request timed out after ${timeoutMs}ms`,
    code: 'AI_TIMEOUT',
    context: { provider, metadata: { timeoutMs }, ...context },
    recoverable: true,
    suggestedAction: 'Please try with a shorter request or try again later.',
  }, cause),

  circuitOpen: (
    provider: string,
    resetTimeMs: number,
    context?: Partial<ErrorContext>
  ): AiError => new AiError({
    category: ErrorCategory.PROVIDER_CIRCUIT_OPEN,
    severity: ErrorSeverity.WARNING,
    message: `Circuit breaker is open for provider ${provider}`,
    code: 'AI_CIRCUIT_OPEN',
    context: { provider, metadata: { resetTimeMs }, ...context },
    recoverable: true,
    suggestedAction: `Circuit will reset in ${Math.ceil(resetTimeMs / 1000)} seconds.`,
  }),

  requestTimeout: (
    operation: string,
    timeoutMs: number,
    context?: Partial<ErrorContext>,
    cause?: Error
  ): AiError => new AiError({
    category: ErrorCategory.REQUEST_TIMEOUT,
    severity: ErrorSeverity.ERROR,
    message: `Request timed out after ${timeoutMs}ms`,
    code: 'AI_REQUEST_TIMEOUT',
    context: { operation, metadata: { timeoutMs }, ...context },
    recoverable: true,
    suggestedAction: 'Please try again or use a more specific request.',
  }, cause),

  requestAborted: (
    operation: string,
    context?: Partial<ErrorContext>,
    cause?: Error
  ): AiError => new AiError({
    category: ErrorCategory.REQUEST_ABORTED,
    severity: ErrorSeverity.INFO,
    message: `Request was aborted`,
    code: 'AI_REQUEST_ABORTED',
    context: { operation, ...context },
    recoverable: true,
  }, cause),

  requestValidation: (
    field: string,
    reason: string,
    context?: Partial<ErrorContext>
  ): AiError => new AiError({
    category: ErrorCategory.REQUEST_VALIDATION,
    severity: ErrorSeverity.WARNING,
    message: `Validation failed for ${field}: ${reason}`,
    code: 'AI_VALIDATION_ERROR',
    context: { metadata: { field, reason }, ...context },
    recoverable: false,
    suggestedAction: `Please correct the ${field} and try again.`,
  }),

  requestTooLarge: (
    size: number,
    maxSize: number,
    context?: Partial<ErrorContext>
  ): AiError => new AiError({
    category: ErrorCategory.REQUEST_TOO_LARGE,
    severity: ErrorSeverity.WARNING,
    message: `Request size ${size} exceeds maximum ${maxSize}`,
    code: 'AI_REQUEST_TOO_LARGE',
    context: { metadata: { size, maxSize }, ...context },
    recoverable: false,
    suggestedAction: 'Please shorten your message and try again.',
  }),

  responseParse: (
    reason: string,
    context?: Partial<ErrorContext>,
    cause?: Error
  ): AiError => new AiError({
    category: ErrorCategory.RESPONSE_PARSE,
    severity: ErrorSeverity.ERROR,
    message: `Failed to parse AI response: ${reason}`,
    code: 'AI_PARSE_ERROR',
    context: context || {},
    recoverable: true,
    suggestedAction: 'Please try again.',
  }, cause),

  toolNotFound: (
    toolName: string,
    context?: Partial<ErrorContext>
  ): AiError => new AiError({
    category: ErrorCategory.TOOL_NOT_FOUND,
    severity: ErrorSeverity.ERROR,
    message: `Tool "${toolName}" not found`,
    code: 'AI_TOOL_NOT_FOUND',
    context: { metadata: { toolName }, ...context },
    recoverable: false,
    suggestedAction: 'Please check the tool name and try again.',
  }),

  toolExecution: (
    toolName: string,
    reason: string,
    context?: Partial<ErrorContext>,
    cause?: Error
  ): AiError => new AiError({
    category: ErrorCategory.TOOL_EXECUTION,
    severity: ErrorSeverity.ERROR,
    message: `Tool "${toolName}" execution failed: ${reason}`,
    code: 'AI_TOOL_ERROR',
    context: { metadata: { toolName }, ...context },
    recoverable: true,
  }, cause),

  fallbackExhausted: (
    attemptedProviders: string[],
    context?: Partial<ErrorContext>
  ): AiError => new AiError({
    category: ErrorCategory.FALLBACK_EXHAUSTED,
    severity: ErrorSeverity.CRITICAL,
    message: `All AI providers failed after trying: ${attemptedProviders.join(', ')}`,
    code: 'AI_FALLBACK_EXHAUSTED',
    context: { metadata: { attemptedProviders }, ...context },
    recoverable: true,
    suggestedAction: 'Please try again in a few minutes.',
  }),

  internal: (
    message: string,
    context?: Partial<ErrorContext>,
    cause?: Error
  ): AiError => new AiError({
    category: ErrorCategory.INTERNAL_ERROR,
    severity: ErrorSeverity.ERROR,
    message,
    code: 'AI_INTERNAL_ERROR',
    context: context || {},
    recoverable: true,
    suggestedAction: 'Please try again or contact support.',
  }, cause),

  configuration: (
    configKey: string,
    reason: string,
    context?: Partial<ErrorContext>
  ): AiError => new AiError({
    category: ErrorCategory.CONFIGURATION_ERROR,
    severity: ErrorSeverity.CRITICAL,
    message: `Configuration error for ${configKey}: ${reason}`,
    code: 'AI_CONFIG_ERROR',
    context: { metadata: { configKey, reason }, ...context },
    recoverable: false,
    suggestedAction: 'Please check your configuration settings.',
  }),

  resourceExhausted: (
    resourceType: string,
    context?: Partial<ErrorContext>
  ): AiError => new AiError({
    category: ErrorCategory.RESOURCE_EXHAUSTED,
    severity: ErrorSeverity.ERROR,
    message: `Resource exhausted: ${resourceType}`,
    code: 'AI_RESOURCE_EXHAUSTED',
    context: { resourceType, ...context },
    recoverable: true,
    suggestedAction: 'Please try again later.',
  }),
};

/**
 * Convert any error to an AiError
 */
export function toAiError(error: unknown, defaultCategory: ErrorCategory = ErrorCategory.INTERNAL_ERROR): AiError {
  if (error instanceof AiError) {
    return error;
  }

  if (error instanceof Error) {
    // Check for common error patterns
    const message = error.message.toLowerCase();

    if (message.includes('timeout') || message.includes('timed out')) {
      return AiErrors.requestTimeout('unknown', 0, {}, error);
    }

    if (message.includes('abort') || message.includes('aborted')) {
      return AiErrors.requestAborted('unknown', {}, error);
    }

    if (message.includes('rate limit') || message.includes('too many requests')) {
      return AiErrors.providerRateLimit('unknown', undefined, {}, error);
    }

    if (message.includes('401') || message.includes('403') || message.includes('unauthorized') || message.includes('authentication')) {
      return AiErrors.providerAuthError('unknown', {}, error);
    }

    return new AiError({
      category: defaultCategory,
      severity: ErrorSeverity.ERROR,
      message: error.message,
      code: 'AI_UNKNOWN_ERROR',
      context: {},
      recoverable: true,
    }, error);
  }

  return new AiError({
    category: defaultCategory,
    severity: ErrorSeverity.ERROR,
    message: String(error),
    code: 'AI_UNKNOWN_ERROR',
    context: {},
    recoverable: true,
  });
}

/**
 * Check if an error indicates a transient failure that can be retried
 */
export function isTransientError(error: unknown): boolean {
  if (error instanceof AiError) {
    return error.isRecoverable();
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes('timeout') ||
      message.includes('timed out') ||
      message.includes('rate limit') ||
      message.includes('too many requests') ||
      message.includes('econnrefused') ||
      message.includes('econnreset') ||
      message.includes('etimedout') ||
      message.includes('socket hang up') ||
      message.includes('network error')
    );
  }

  return false;
}

/**
 * Check if an error is a fatal error that should not be retried
 */
export function isFatalError(error: unknown): boolean {
  if (error instanceof AiError) {
    return !error.isRecoverable();
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes('401') ||
      message.includes('403') ||
      message.includes('authentication') ||
      message.includes('unauthorized') ||
      message.includes('invalid api key') ||
      message.includes('not found') && message.includes('model')
    );
  }

  return false;
}
