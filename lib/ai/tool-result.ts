/**
 * Standardized tool result helpers for AI assistant robustness.
 *
 * Tools can return a structured "needs more info" response that the
 * reasoning orchestrator detects and turns into a clarifying user message
 * instead of treating it as a failure or a successful result with garbage.
 *
 * Tools can also return a structured retryable error so the orchestrator
 * can decide whether to retry, ask the user, or report the failure.
 */

/**
 * Sentinel error codes recognized by the reasoning orchestrator.
 *
 * MISSING_DESCRIPTION — A tool needs a natural language description.
 * MISSING_REQUIRED_INPUT — One or more required fields are missing.
 * INVALID_INPUT — Input was provided but failed validation.
 */
export const TOOL_ERROR_CODES = {
  MISSING_DESCRIPTION: 'MISSING_DESCRIPTION',
  MISSING_REQUIRED_INPUT: 'MISSING_REQUIRED_INPUT',
  INVALID_INPUT: 'INVALID_INPUT',
} as const

export type ToolErrorCode =
  (typeof TOOL_ERROR_CODES)[keyof typeof TOOL_ERROR_CODES]

/**
 * Shape of a structured tool error result.
 *
 * Tools can include this in their normal result type so the orchestrator
 * can detect the need for user clarification without throwing.
 */
export type ToolNeedsInputResult = {
  error: ToolErrorCode
  errorMessage: string
  missingFields?: string[]
  /** Optional multiple-choice prompt the orchestrator can present. */
  prompt?: {
    question: string
    options: Array<{
      label: string
      value: string
      description?: string
    }>
  }
}

/**
 * Type guard: detect a tool result that signals it needs more user input.
 */
export function isToolNeedsInput(value: unknown): value is ToolNeedsInputResult {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  if (typeof v.error !== 'string') return false
  if (typeof v.errorMessage !== 'string' || v.errorMessage.length === 0) return false
  return (
    v.error === TOOL_ERROR_CODES.MISSING_DESCRIPTION ||
    v.error === TOOL_ERROR_CODES.MISSING_REQUIRED_INPUT ||
    v.error === TOOL_ERROR_CODES.INVALID_INPUT
  )
}

/**
 * Build a "needs more info" result that signals the assistant should
 * stop and ask the user for missing details.
 */
export function needsInput(
  message: string,
  options: {
    code?: ToolErrorCode
    missingFields?: string[]
    prompt?: ToolNeedsInputResult['prompt']
  } = {},
): ToolNeedsInputResult {
  return {
    error: options.code ?? TOOL_ERROR_CODES.MISSING_REQUIRED_INPUT,
    errorMessage: message,
    missingFields: options.missingFields,
    prompt: options.prompt,
  }
}

/**
 * Format a needs-input result into a user-facing clarification message.
 *
 * Used by the reasoning orchestrator to render a short, helpful prompt.
 */
export function formatNeedsInputMessage(result: ToolNeedsInputResult): string {
  const lines: string[] = ['I need more information to proceed:', '', result.errorMessage]
  if (result.missingFields && result.missingFields.length > 0) {
    lines.push('', `Missing fields: ${result.missingFields.join(', ')}`)
  }
  if (result.prompt && result.prompt.options.length > 0) {
    lines.push('', result.prompt.question, '')
    for (const opt of result.prompt.options) {
      lines.push(`- ${opt.label}${opt.description ? ` — ${opt.description}` : ''}`)
    }
  }
  return lines.join('\n')
}
