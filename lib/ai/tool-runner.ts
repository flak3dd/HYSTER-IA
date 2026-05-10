/**
 * Robust tool execution wrapper for the AI assistant.
 *
 * Wraps `runAiTool` with the following robustness features:
 *  - Per-tool circuit breaker (skip tools that consistently fail)
 *  - Per-tool timeout (default 90s, override per call)
 *  - Lightweight retry with exponential backoff for transient errors
 *  - Per-tool metrics (calls, successes, failures, p50/p95 latency)
 *  - Structured "needs more input" detection (does NOT trigger retries)
 *  - Argument validation via the tool's Zod schema before execution
 *
 * The reasoning orchestrator and the chat tool-calling loop both use this
 * runner so they get consistent behavior. Errors thrown by a tool's `run`
 * are caught and converted to a structured error object so callers don't
 * have to wrap every tool call in try/catch.
 */

import {
  AI_TOOLS,
  runAiTool as rawRunAiTool,
} from '@/lib/ai/tools'
import type { AgentTool, AgentToolContext } from '@/lib/ai/tool-types'
import { isToolNeedsInput } from '@/lib/ai/tool-result'
import logger from '@/lib/logger'

const log = logger.child({ module: 'ai-tool-runner' })

// ----------------------------------------------------------------
// Tool-level circuit breaker
// ----------------------------------------------------------------

type BreakerState = 'closed' | 'open' | 'half-open'

interface BreakerEntry {
  state: BreakerState
  consecutiveFailures: number
  openedAt: number
  lastError?: string
}

const CIRCUIT_BREAKER_THRESHOLD = 4 // consecutive failures before opening
const CIRCUIT_BREAKER_COOLDOWN_MS = 30_000 // half-open after this many ms
const breakers = new Map<string, BreakerEntry>()

function getBreaker(toolName: string): BreakerEntry {
  let b = breakers.get(toolName)
  if (!b) {
    b = { state: 'closed', consecutiveFailures: 0, openedAt: 0 }
    breakers.set(toolName, b)
  }
  // Auto-transition open -> half-open after cooldown
  if (b.state === 'open' && Date.now() - b.openedAt >= CIRCUIT_BREAKER_COOLDOWN_MS) {
    b.state = 'half-open'
  }
  return b
}

function recordSuccess(toolName: string): void {
  const b = getBreaker(toolName)
  b.consecutiveFailures = 0
  b.lastError = undefined
  if (b.state !== 'closed') {
    log.info({ toolName, prevState: b.state }, 'tool circuit breaker closed after success')
    b.state = 'closed'
  }
}

function recordFailure(toolName: string, error: string): void {
  const b = getBreaker(toolName)
  b.consecutiveFailures += 1
  b.lastError = error
  if (b.consecutiveFailures >= CIRCUIT_BREAKER_THRESHOLD && b.state !== 'open') {
    b.state = 'open'
    b.openedAt = Date.now()
    log.warn(
      { toolName, consecutiveFailures: b.consecutiveFailures, error },
      'tool circuit breaker opened',
    )
  }
}

export function getToolBreakerStatus(): Record<string, BreakerEntry> {
  const out: Record<string, BreakerEntry> = {}
  for (const [name, b] of breakers) out[name] = { ...b }
  return out
}

export function resetToolBreakers(): void {
  breakers.clear()
}

// ----------------------------------------------------------------
// Per-tool metrics
// ----------------------------------------------------------------

interface ToolMetrics {
  calls: number
  successes: number
  failures: number
  needsInput: number
  totalDurationMs: number
  recentDurations: number[] // last 50 durations
  lastError?: string
  lastErrorAt?: number
}

const METRICS_WINDOW = 50
const metrics = new Map<string, ToolMetrics>()

function getMetrics(toolName: string): ToolMetrics {
  let m = metrics.get(toolName)
  if (!m) {
    m = {
      calls: 0,
      successes: 0,
      failures: 0,
      needsInput: 0,
      totalDurationMs: 0,
      recentDurations: [],
    }
    metrics.set(toolName, m)
  }
  return m
}

function recordMetric(
  toolName: string,
  outcome: 'success' | 'failure' | 'needs_input',
  durationMs: number,
  error?: string,
): void {
  const m = getMetrics(toolName)
  m.calls += 1
  m.totalDurationMs += durationMs
  m.recentDurations.push(durationMs)
  if (m.recentDurations.length > METRICS_WINDOW) {
    m.recentDurations.shift()
  }
  if (outcome === 'success') m.successes += 1
  else if (outcome === 'failure') {
    m.failures += 1
    m.lastError = error
    m.lastErrorAt = Date.now()
  } else if (outcome === 'needs_input') m.needsInput += 1
}

export function getToolMetrics(): Record<
  string,
  ToolMetrics & { p50Ms: number; p95Ms: number; successRate: number }
> {
  const out: Record<
    string,
    ToolMetrics & { p50Ms: number; p95Ms: number; successRate: number }
  > = {}
  for (const [name, m] of metrics) {
    const sorted = [...m.recentDurations].sort((a, b) => a - b)
    const p50Ms = sorted.length ? sorted[Math.floor(sorted.length * 0.5)] : 0
    const p95Ms = sorted.length ? sorted[Math.floor(sorted.length * 0.95)] : 0
    const successRate = m.calls > 0 ? m.successes / m.calls : 0
    out[name] = { ...m, p50Ms, p95Ms, successRate }
  }
  return out
}

export function resetToolMetrics(): void {
  metrics.clear()
}

// ----------------------------------------------------------------
// Retry classification
// ----------------------------------------------------------------

/**
 * Classify whether a tool error is transient (retryable) or fatal.
 * Transient: network/timeout/temporary failures.
 * Fatal: validation/auth/not-found errors — retrying won't help.
 */
function isTransientToolError(message: string): boolean {
  const lower = message.toLowerCase()
  if (lower.includes('timed out') || lower.includes('timeout')) return true
  if (lower.includes('econnreset') || lower.includes('econnrefused')) return true
  if (lower.includes('socket hang up')) return true
  if (lower.includes('network') && !lower.includes('not found')) return true
  if (lower.includes('rate limit') || lower.includes('429')) return true
  if (lower.includes('temporarily unavailable')) return true
  if (lower.includes('5') && lower.match(/\b5\d{2}\b/)) return true // 5xx
  return false
}

// ----------------------------------------------------------------
// Public: robust tool runner
// ----------------------------------------------------------------

export interface RunToolOptions extends AgentToolContext {
  /** Per-call timeout (ms). Default 90_000. */
  timeoutMs?: number
  /** Max retries for transient errors. Default 1. */
  maxRetries?: number
  /** Base backoff delay (ms). Default 500. */
  baseDelayMs?: number
}

export interface RunToolResult {
  ok: boolean
  /** Raw tool result. Always present (errors are stringified into a stable shape). */
  result: unknown
  /** True when the tool returned a structured "needs input" response. */
  needsInput: boolean
  /** Error message when ok=false. */
  error?: string
  /** True when the circuit breaker rejected the call without executing. */
  shortCircuited: boolean
  durationMs: number
  attempts: number
}

const DEFAULT_TOOL_TIMEOUT_MS = 90_000

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  signal: AbortSignal | undefined,
  toolName: string,
): Promise<T> {
  const timeoutSignal = AbortSignal.timeout(timeoutMs)
  const combined = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      reject(new Error(`tool ${toolName} timed out after ${timeoutMs}ms`))
    }
    if (combined.aborted) {
      onAbort()
      return
    }
    combined.addEventListener('abort', onAbort, { once: true })
    promise.then(
      (v) => {
        combined.removeEventListener('abort', onAbort)
        resolve(v)
      },
      (e) => {
        combined.removeEventListener('abort', onAbort)
        reject(e)
      },
    )
  })
}

/**
 * Validate tool args against the tool's Zod schema, returning a
 * structured error result if validation fails. This catches the case
 * where the LLM hallucinates argument shapes.
 */
function validateToolArgs(
  toolName: string,
  rawArgs: unknown,
): { ok: true } | { ok: false; error: string } {
  const tool = (AI_TOOLS as Record<string, AgentTool<unknown, unknown>>)[toolName]
  if (!tool) return { ok: false, error: `unknown tool: ${toolName}` }
  const parsed = tool.parameters.safeParse(rawArgs)
  if (!parsed.success) {
    return { ok: false, error: `invalid args for ${toolName}: ${parsed.error.message}` }
  }
  return { ok: true }
}

/**
 * Robustly execute an AI tool with timeout, retry, validation, and
 * circuit-breaker protection. Errors are returned as structured results
 * rather than thrown.
 */
export async function runAiToolRobust(
  toolName: string,
  rawArgs: unknown,
  options: RunToolOptions,
): Promise<RunToolResult> {
  const {
    timeoutMs = DEFAULT_TOOL_TIMEOUT_MS,
    maxRetries = 1,
    baseDelayMs = 500,
    signal,
    invokerUid,
  } = options

  const startedAt = Date.now()

  // --- 1. Tool existence check ---
  const tool = (AI_TOOLS as Record<string, AgentTool<unknown, unknown>>)[toolName]
  if (!tool) {
    const error = `unknown tool: ${toolName}`
    recordMetric(toolName, 'failure', 0, error)
    return {
      ok: false,
      result: { error },
      needsInput: false,
      error,
      shortCircuited: false,
      durationMs: 0,
      attempts: 0,
    }
  }

  // --- 2. Circuit breaker check ---
  const breaker = getBreaker(toolName)
  if (breaker.state === 'open') {
    const error = `tool ${toolName} circuit breaker is open (last error: ${breaker.lastError ?? 'unknown'})`
    log.warn({ toolName, lastError: breaker.lastError }, 'short-circuited tool call')
    recordMetric(toolName, 'failure', 0, error)
    return {
      ok: false,
      result: { error, shortCircuited: true },
      needsInput: false,
      error,
      shortCircuited: true,
      durationMs: 0,
      attempts: 0,
    }
  }

  // --- 3. Argument validation ---
  const argCheck = validateToolArgs(toolName, rawArgs)
  if (!argCheck.ok) {
    log.warn({ toolName, error: argCheck.error }, 'tool argument validation failed')
    recordMetric(toolName, 'failure', 0, argCheck.error)
    // Validation errors are NOT counted toward circuit breaker —
    // they're caused by the LLM, not by the tool itself.
    return {
      ok: false,
      result: { error: argCheck.error },
      needsInput: false,
      error: argCheck.error,
      shortCircuited: false,
      durationMs: 0,
      attempts: 0,
    }
  }

  // --- 4. Execute with retry ---
  let lastError: string | undefined
  let attempts = 0

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    attempts = attempt + 1
    if (signal?.aborted) {
      lastError = 'request aborted'
      break
    }

    try {
      const result = await withTimeout(
        rawRunAiTool(toolName, rawArgs, { signal, invokerUid }),
        timeoutMs,
        signal,
        toolName,
      )

      const durationMs = Date.now() - startedAt

      // Structured needs-input result is a SUCCESS from the runner's
      // POV (the tool ran correctly) but it shouldn't be retried.
      if (isToolNeedsInput(result)) {
        recordMetric(toolName, 'needs_input', durationMs)
        recordSuccess(toolName)
        return {
          ok: true,
          result,
          needsInput: true,
          shortCircuited: false,
          durationMs,
          attempts,
        }
      }

      recordMetric(toolName, 'success', durationMs)
      recordSuccess(toolName)
      return {
        ok: true,
        result,
        needsInput: false,
        shortCircuited: false,
        durationMs,
        attempts,
      }
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err)
      log.warn(
        { toolName, attempt: attempt + 1, error: lastError },
        'tool execution failed',
      )

      // Don't retry fatal errors
      if (!isTransientToolError(lastError) || attempt >= maxRetries) {
        break
      }

      // Exponential backoff with jitter
      const delay = baseDelayMs * 2 ** attempt + Math.floor(Math.random() * 100)
      await new Promise((r) => setTimeout(r, delay))
    }
  }

  const durationMs = Date.now() - startedAt
  recordMetric(toolName, 'failure', durationMs, lastError)
  recordFailure(toolName, lastError ?? 'unknown error')
  return {
    ok: false,
    result: { error: lastError ?? 'tool execution failed' },
    needsInput: false,
    error: lastError ?? 'tool execution failed',
    shortCircuited: false,
    durationMs,
    attempts,
  }
}
