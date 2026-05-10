/**
 * AI Tool Calling Debug Logger
 * 
 * Comprehensive logging system for AI tool calling diagnostics,
 * providing structured logs, performance metrics, and error tracking.
 */

import { createHash } from 'crypto';
import { serverEnv } from '@/lib/env';

export interface ToolCallLog {
  timestamp: number;
  sessionId: string;
  provider: string;
  toolName: string;
  originalToolName?: string;
  mappingSource?: string;
  arguments: any;
  success: boolean;
  executionTimeMs: number;
  errorMessage?: string;
  validationWarnings?: string[];
  validationErrors?: string[];
}

export interface SessionLog {
  sessionId: string;
  startTime: number;
  endTime?: number;
  totalToolCalls: number;
  successfulToolCalls: number;
  failedToolCalls: number;
  providerUsed: string;
  fallbackAttempts?: number;
  toolCalls: ToolCallLog[];
}

class DebugLogger {
  private sessions: Map<string, SessionLog> = new Map();
  private enableConsoleLogging: boolean = true;
  private logLevel: 'debug' | 'info' | 'warn' | 'error' = 'info';

  constructor() {
    // Set log level from environment
    const env = serverEnv();
    this.logLevel = env.AI_DEBUG_LOG_LEVEL;
    this.enableConsoleLogging = env.AI_DEBUG_CONSOLE;
  }

  /**
   * Generate a unique session ID for tracking a conversation
   */
  generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Start a new debugging session
   */
  startSession(provider: string): string {
    const sessionId = this.generateSessionId();
    const session: SessionLog = {
      sessionId,
      startTime: Date.now(),
      totalToolCalls: 0,
      successfulToolCalls: 0,
      failedToolCalls: 0,
      providerUsed: provider,
      toolCalls: [],
    };

    this.sessions.set(sessionId, session);
    this.log('debug', `[Session] Started session ${sessionId} with provider ${provider}`);

    return sessionId;
  }

  /**
   * End a debugging session and return summary
   */
  endSession(sessionId: string): SessionLog | null {
    const session = this.sessions.get(sessionId);
    if (!session) {
      this.log('warn', `[Session] Session ${sessionId} not found`);
      return null;
    }

    session.endTime = Date.now();
    const duration = session.endTime - session.startTime;

    this.log('info', `[Session] Ended session ${sessionId}`, {
      duration: `${duration}ms`,
      totalToolCalls: session.totalToolCalls,
      successfulToolCalls: session.successfulToolCalls,
      failedToolCalls: session.failedToolCalls,
      successRate: `${((session.successfulToolCalls / session.totalToolCalls) * 100).toFixed(1)}%`,
    });

    return session;
  }

  /**
   * Log a tool call attempt
   */
  logToolCall(sessionId: string, toolCall: Partial<ToolCallLog>): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      this.log('warn', `[Session] Cannot log tool call - session ${sessionId} not found`);
      return;
    }

    const logEntry: ToolCallLog = {
      timestamp: Date.now(),
      sessionId,
      provider: session.providerUsed,
      toolName: toolCall.toolName || 'unknown',
      originalToolName: toolCall.originalToolName,
      mappingSource: toolCall.mappingSource,
      arguments: toolCall.arguments,
      success: toolCall.success ?? false,
      executionTimeMs: toolCall.executionTimeMs || 0,
      errorMessage: toolCall.errorMessage,
      validationWarnings: toolCall.validationWarnings,
      validationErrors: toolCall.validationErrors,
    };

    session.toolCalls.push(logEntry);
    session.totalToolCalls++;

    if (logEntry.success) {
      session.successfulToolCalls++;
    } else {
      session.failedToolCalls++;
    }

    this.log('debug', `[ToolCall] ${logEntry.toolName}`, {
      success: logEntry.success,
      executionTime: `${logEntry.executionTimeMs}ms`,
      mappingSource: logEntry.mappingSource,
      errorMessage: logEntry.errorMessage,
    });
  }

  /**
   * Log provider fallback attempt
   */
  logProviderFallback(sessionId: string, fromProvider: string, toProvider: string, reason: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      this.log('warn', `[Session] Cannot log fallback - session ${sessionId} not found`);
      return;
    }

    session.fallbackAttempts = (session.fallbackAttempts || 0) + 1;

    this.log('warn', `[Fallback] ${fromProvider} -> ${toProvider}`, {
      reason,
      fallbackAttempt: session.fallbackAttempts,
    });
  }

  /**
   * Get session summary
   */
  getSessionSummary(sessionId: string): SessionLog | null {
    return this.sessions.get(sessionId) || null;
  }

  /**
   * Get all active sessions
   */
  getActiveSessions(): SessionLog[] {
    return Array.from(this.sessions.values()).filter(s => !s.endTime);
  }

  /**
   * Get recent sessions (within last hour)
   */
  getRecentSessions(hours: number = 1): SessionLog[] {
    const cutoff = Date.now() - (hours * 60 * 60 * 1000);
    return Array.from(this.sessions.values())
      .filter(s => s.startTime >= cutoff)
      .sort((a, b) => b.startTime - a.startTime);
  }

  /**
   * Get aggregated statistics across all sessions
   */
  getStatistics(): {
    totalSessions: number;
    totalToolCalls: number;
    totalSuccessfulCalls: number;
    totalFailedCalls: number;
    averageExecutionTime: number;
    providerBreakdown: Record<string, number>;
    mostUsedTools: Array<{ toolName: string; count: number }>;
  } {
    const sessions = Array.from(this.sessions.values());
    const totalToolCalls = sessions.reduce((sum, s) => sum + s.totalToolCalls, 0);
    const totalSuccessfulCalls = sessions.reduce((sum, s) => sum + s.successfulToolCalls, 0);
    const totalFailedCalls = sessions.reduce((sum, s) => sum + s.failedToolCalls, 0);

    const allToolCalls = sessions.flatMap(s => s.toolCalls);
    const averageExecutionTime = allToolCalls.length > 0
      ? allToolCalls.reduce((sum, tc) => sum + tc.executionTimeMs, 0) / allToolCalls.length
      : 0;

    const providerBreakdown: Record<string, number> = {};
    sessions.forEach(s => {
      providerBreakdown[s.providerUsed] = (providerBreakdown[s.providerUsed] || 0) + 1;
    });

    const toolUsage: Record<string, number> = {};
    allToolCalls.forEach(tc => {
      toolUsage[tc.toolName] = (toolUsage[tc.toolName] || 0) + 1;
    });

    const mostUsedTools = Object.entries(toolUsage)
      .map(([toolName, count]) => ({ toolName, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      totalSessions: sessions.length,
      totalToolCalls,
      totalSuccessfulCalls,
      totalFailedCalls,
      averageExecutionTime,
      providerBreakdown,
      mostUsedTools,
    };
  }

  /**
   * Export logs in JSON format
   */
  exportLogs(sessionId?: string): string {
    if (sessionId) {
      const session = this.sessions.get(sessionId);
      return JSON.stringify(session, null, 2);
    }

    return JSON.stringify(Array.from(this.sessions.values()), null, 2);
  }

  /**
   * Clear old sessions to prevent memory leaks
   */
  clearOldSessions(maxAge: number = 24 * 60 * 60 * 1000): void {
    const cutoff = Date.now() - maxAge;
    let cleared = 0;

    for (const [sessionId, session] of this.sessions.entries()) {
      if (session.startTime < cutoff) {
        this.sessions.delete(sessionId);
        cleared++;
      }
    }

    if (cleared > 0) {
      this.log('info', `[Cleanup] Cleared ${cleared} old sessions`);
    }
  }

  /**
   * Internal logging method
   */
  private log(level: string, message: string, data?: any): void {
    const shouldLog = this.shouldLog(level);
    if (!shouldLog || !this.enableConsoleLogging) {
      return;
    }

    const timestamp = new Date().toISOString();
    const logEntry = { timestamp, level, message, ...(data && { data }) };

    switch (level) {
      case 'debug':
        console.debug(`[AI-Debug] ${message}`, data || '');
        break;
      case 'info':
        console.info(`[AI-Info] ${message}`, data || '');
        break;
      case 'warn':
        console.warn(`[AI-Warn] ${message}`, data || '');
        break;
      case 'error':
        console.error(`[AI-Error] ${message}`, data || '');
        break;
    }
  }

  /**
   * Check if a log level should be logged based on current log level
   */
  private shouldLog(level: string): boolean {
    const levels = ['debug', 'info', 'warn', 'error'];
    const currentLevelIndex = levels.indexOf(this.logLevel);
    const requestedLevelIndex = levels.indexOf(level);
    return requestedLevelIndex >= currentLevelIndex;
  }
}

// Singleton instance (globalThis-guarded to survive HMR)
const gDL = globalThis as typeof globalThis & { __debugLogger?: DebugLogger; __debugLoggerCleanupInterval?: NodeJS.Timeout }
export const debugLogger = gDL.__debugLogger ?? new DebugLogger()
if (!gDL.__debugLogger) gDL.__debugLogger = debugLogger

// Auto-cleanup old sessions every hour (only once per process)
if (!gDL.__debugLoggerCleanupInterval) {
  gDL.__debugLoggerCleanupInterval = setInterval(() => {
    debugLogger.clearOldSessions()
  }, 60 * 60 * 1000)
}