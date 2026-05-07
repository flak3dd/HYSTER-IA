/**
 * Input Validation and Sanitization (No Regex)
 *
 * Provides comprehensive input validation using string manipulation,
 * character code checks, and structured parsing instead of regex.
 *
 * Design Principles:
 * - No regular expressions for validation
 * - Explicit character-by-character checking
 * - Type-safe validation functions
 * - Composable validators
 */

import { AiError, AiErrors, ErrorCategory, ErrorSeverity } from './errors';

// ============================================================================
// Character Classification (Character Code Based)
// ============================================================================

const CHAR_CODES = {
  // Whitespace
  SPACE: 32,
  TAB: 9,
  NEWLINE: 10,
  CARRIAGE_RETURN: 13,

  // Symbols
  UNDERSCORE: 95,
  HYPHEN: 45,
  DOT: 46,
  SLASH: 47,
  COLON: 58,
  AT: 64,

  // Brackets
  OPEN_PAREN: 40,
  CLOSE_PAREN: 41,
  OPEN_BRACKET: 91,
  CLOSE_BRACKET: 93,
  OPEN_BRACE: 123,
  CLOSE_BRACE: 125,

  // Quotes
  SINGLE_QUOTE: 39,
  DOUBLE_QUOTE: 34,
  BACKTICK: 96,

  // Numbers
  ZERO: 48,
  NINE: 57,

  // Letters (uppercase)
  UPPER_A: 65,
  UPPER_Z: 90,

  // Letters (lowercase)
  LOWER_A: 97,
  LOWER_Z: 122,
};

function isDigit(charCode: number): boolean {
  return charCode >= CHAR_CODES.ZERO && charCode <= CHAR_CODES.NINE;
}

function isLowercaseLetter(charCode: number): boolean {
  return charCode >= CHAR_CODES.LOWER_A && charCode <= CHAR_CODES.LOWER_Z;
}

function isUppercaseLetter(charCode: number): boolean {
  return charCode >= CHAR_CODES.UPPER_A && charCode <= CHAR_CODES.UPPER_Z;
}

function isLetter(charCode: number): boolean {
  return isLowercaseLetter(charCode) || isUppercaseLetter(charCode);
}

function isAlphanumeric(charCode: number): boolean {
  return isLetter(charCode) || isDigit(charCode);
}

function isWhitespace(charCode: number): boolean {
  return charCode === CHAR_CODES.SPACE ||
         charCode === CHAR_CODES.TAB ||
         charCode === CHAR_CODES.NEWLINE ||
         charCode === CHAR_CODES.CARRIAGE_RETURN;
}

function isCommonSymbol(charCode: number): boolean {
  return charCode === CHAR_CODES.UNDERSCORE ||
         charCode === CHAR_CODES.HYPHEN ||
         charCode === CHAR_CODES.DOT;
}

function isUrlSafe(charCode: number): boolean {
  // Unreserved characters per RFC 3986
  return isAlphanumeric(charCode) ||
         charCode === CHAR_CODES.HYPHEN ||
         charCode === CHAR_CODES.DOT ||
         charCode === CHAR_CODES.UNDERSCORE ||
         charCode === 126; // tilde ~
}

// ============================================================================
// String Validation Functions
// ============================================================================

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  sanitized?: string;
}

export interface Validator<T> {
  (value: T): ValidationResult;
}

/**
 * Validate that a string is non-empty
 */
export function validateNonEmpty(value: string, fieldName: string = 'value'): ValidationResult {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return {
      valid: false,
      errors: [`${fieldName} cannot be empty`],
    };
  }
  return { valid: true, errors: [], sanitized: trimmed };
}

/**
 * Validate string length
 */
export function validateLength(
  value: string,
  fieldName: string,
  options: { min?: number; max?: number }
): ValidationResult {
  const errors: string[] = [];

  if (options.min !== undefined && value.length < options.min) {
    errors.push(`${fieldName} must be at least ${options.min} characters`);
  }

  if (options.max !== undefined && value.length > options.max) {
    errors.push(`${fieldName} must be no more than ${options.max} characters`);
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validate that a string contains only allowed characters
 */
export function validateAllowedChars(
  value: string,
  fieldName: string,
  allowedPredicate: (charCode: number) => boolean
): ValidationResult {
  const errors: string[] = [];
  const invalidChars: string[] = [];

  for (let i = 0; i < value.length; i++) {
    const charCode = value.charCodeAt(i);
    if (!allowedPredicate(charCode)) {
      const char = value[i];
      if (!invalidChars.includes(char)) {
        invalidChars.push(char);
      }
    }
  }

  if (invalidChars.length > 0) {
    // Limit error message length
    const displayChars = invalidChars.slice(0, 5);
    const extra = invalidChars.length > 5 ? ` and ${invalidChars.length - 5} more` : '';
    errors.push(`${fieldName} contains invalid characters: "${displayChars.join('", "')}"${extra}`);
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Check if a character code is a control character
 * Includes C0 (0-31, 127), C1 (128-159), surrogates (0xD800-0xDFFF),
 * and other Unicode control/formatting characters
 */
function isControlCharCode(charCode: number): boolean {
  // C0 control characters (NUL through US, and DEL)
  if (charCode >= 0 && charCode <= 31) return true;
  if (charCode === 127) return true;
  // C1 control characters
  if (charCode >= 128 && charCode <= 159) return true;
  return false;
}

/**
 * Validate that a string does not contain control characters
 * Uses character code checking to properly handle all Unicode ranges
 *
 * @param allowWhitespace - If true, allow common whitespace control chars
 *   (\n=10, \r=13, \t=9) which are legitimate in message content.
 */
export function validateNoControlChars(value: string, fieldName: string, allowWhitespace: boolean = false): ValidationResult {
  const errors: string[] = [];

  for (let i = 0; i < value.length; i++) {
    const charCode = value.charCodeAt(i);

    // Allow common whitespace control chars when allowWhitespace is true
    if (allowWhitespace && (charCode === 9 || charCode === 10 || charCode === 13)) {
      continue;
    }

    // Check for surrogate pairs - if we find a high surrogate, check the full code point
    if (charCode >= 0xD800 && charCode <= 0xDBFF) {
      // High surrogate - check if followed by low surrogate
      const lowSurrogate = value.charCodeAt(i + 1);
      if (lowSurrogate >= 0xDC00 && lowSurrogate <= 0xDFFF) {
        // Valid surrogate pair, skip the low surrogate in next iteration
        i++;
        continue;
      }
      // Lone high surrogate is a control character
      errors.push(`${fieldName} contains invalid surrogate characters`);
      break;
    }

    // Check for lone low surrogate
    if (charCode >= 0xDC00 && charCode <= 0xDFFF) {
      errors.push(`${fieldName} contains invalid surrogate characters`);
      break;
    }

    // Check standard control characters using codePointAt for full Unicode support
    const codePoint = value.codePointAt(i) ?? charCode;
    if (isControlCharCode(codePoint) || isControlCharCode(charCode)) {
      errors.push(`${fieldName} contains control characters`);
      break;
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validate a provider name (alphanumeric + underscore + hyphen)
 */
export function validateProviderName(name: string): ValidationResult {
  const results = [
    validateNonEmpty(name, 'Provider name'),
    validateAllowedChars(name, 'Provider name', (code) =>
      isAlphanumeric(code) || code === CHAR_CODES.UNDERSCORE || code === CHAR_CODES.HYPHEN
    ),
    validateLength(name, 'Provider name', { min: 1, max: 50 }),
  ];

  return combineResults(results);
}

/**
 * Validate a model name (alphanumeric + common symbols)
 */
export function validateModelName(name: string): ValidationResult {
  const results = [
    validateNonEmpty(name, 'Model name'),
    validateAllowedChars(name, 'Model name', (code) =>
      isAlphanumeric(code) || isCommonSymbol(code)
    ),
    validateLength(name, 'Model name', { min: 1, max: 100 }),
  ];

  return combineResults(results);
}

/**
 * Validate an API key format (basic checks)
 */
export function validateApiKey(key: string, provider: string): ValidationResult {
  const results = [
    validateNonEmpty(key, `${provider} API key`),
    validateLength(key, `${provider} API key`, { min: 10, max: 500 }),
    validateNoControlChars(key, `${provider} API key`),
  ];

  return combineResults(results);
}

/**
 * Validate a timeout value
 */
export function validateTimeoutMs(value: number, fieldName: string = 'Timeout'): ValidationResult {
  const errors: string[] = [];

  if (!Number.isFinite(value)) {
    errors.push(`${fieldName} must be a finite number`);
  } else if (value < 0) {
    errors.push(`${fieldName} cannot be negative`);
  } else if (value > 600000) { // 10 minutes
    errors.push(`${fieldName} cannot exceed 10 minutes (600000ms)`);
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validate retry count
 */
export function validateRetryCount(count: number, fieldName: string = 'Retry count'): ValidationResult {
  const errors: string[] = [];

  if (!Number.isInteger(count)) {
    errors.push(`${fieldName} must be an integer`);
  } else if (count < 0) {
    errors.push(`${fieldName} cannot be negative`);
  } else if (count > 10) {
    errors.push(`${fieldName} cannot exceed 10`);
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validate temperature value
 */
export function validateTemperature(value: number): ValidationResult {
  const errors: string[] = [];

  if (!Number.isFinite(value)) {
    errors.push('Temperature must be a finite number');
  } else if (value < 0 || value > 2) {
    errors.push('Temperature must be between 0 and 2');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validate a message content string
 */
export function validateMessageContent(content: string, maxLength: number = 20000): ValidationResult {
  const results = [
    validateNonEmpty(content, 'Message'),
    validateLength(content, 'Message', { min: 1, max: maxLength }),
    validateNoControlChars(content, 'Message', true),  // allowWhitespace=true: \n, \r, \t are valid
  ];

  return combineResults(results);
}

/**
 * Validate a tool name
 */
export function validateToolName(name: string): ValidationResult {
  const results = [
    validateNonEmpty(name, 'Tool name'),
    validateAllowedChars(name, 'Tool name', (code) =>
      isAlphanumeric(code) || code === CHAR_CODES.UNDERSCORE
    ),
    validateLength(name, 'Tool name', { min: 1, max: 64 }),
  ];

  return combineResults(results);
}

/**
 * Validate a conversation ID
 */
export function validateConversationId(id: string): ValidationResult {
  const results = [
    validateNonEmpty(id, 'Conversation ID'),
    validateAllowedChars(id, 'Conversation ID', (code) =>
      isAlphanumeric(code) || code === CHAR_CODES.HYPHEN || code === CHAR_CODES.UNDERSCORE
    ),
    validateLength(id, 'Conversation ID', { min: 8, max: 128 }),
  ];

  return combineResults(results);
}

/**
 * Validate a user ID
 */
export function validateUserId(id: string): ValidationResult {
  const results = [
    validateNonEmpty(id, 'User ID'),
    validateAllowedChars(id, 'User ID', isAlphanumeric),
    validateLength(id, 'User ID', { min: 8, max: 128 }),
  ];

  return combineResults(results);
}

// ============================================================================
// JSON Validation (Without Regex)
// ============================================================================

/**
 * Validate that a string is valid JSON without using regex
 * Uses JSON.parse for actual validation but provides structured error info
 */
export function validateJson(value: string): ValidationResult {
  const trimmed = value.trim();

  if (trimmed.length === 0) {
    return { valid: false, errors: ['JSON cannot be empty'] };
  }

  // Basic structure check using first/last character
  const firstChar = trimmed[0];
  const lastChar = trimmed[trimmed.length - 1];

  const isObject = firstChar === '{' && lastChar === '}';
  const isArray = firstChar === '[' && lastChar === ']';
  const isString = firstChar === '"' && lastChar === '"';
  const isNumber = !isNaN(Number(trimmed)) && trimmed.length > 0;
  const isBoolean = trimmed === 'true' || trimmed === 'false';
  const isNull = trimmed === 'null';

  if (!isObject && !isArray && !isString && !isNumber && !isBoolean && !isNull) {
    return {
      valid: false,
      errors: ['Invalid JSON structure: must be an object, array, string, number, boolean, or null'],
    };
  }

  try {
    JSON.parse(trimmed);
    return { valid: true, errors: [], sanitized: trimmed };
  } catch (e) {
    const errorMsg = e instanceof Error ? e.message : String(e);
    return { valid: false, errors: [`Invalid JSON: ${errorMsg}`] };
  }
}

/**
 * Validate JSON string length and structure
 */
export function validateJsonSize(value: string, maxSize: number = 1024 * 1024): ValidationResult {
  const sizeInBytes = new TextEncoder().encode(value).length;

  if (sizeInBytes > maxSize) {
    return {
      valid: false,
      errors: [`JSON size (${sizeInBytes} bytes) exceeds maximum (${maxSize} bytes)`],
    };
  }

  return validateJson(value);
}

// ============================================================================
// URL Validation (Without Regex)
// ============================================================================

/**
 * Basic URL validation using string parsing instead of regex
 */
export function validateUrl(url: string, allowedProtocols: string[] = ['http:', 'https:']): ValidationResult {
  const errors: string[] = [];

  // Check non-empty
  if (url.trim().length === 0) {
    return { valid: false, errors: ['URL cannot be empty'] };
  }

  // Find protocol separator
  const protocolEnd = url.indexOf('://');
  if (protocolEnd === -1) {
    return { valid: false, errors: ['URL must include a protocol (e.g., https://)'] };
  }

  // Extract and validate protocol
  const protocol = url.slice(0, protocolEnd + 1).toLowerCase();
  if (!allowedProtocols.includes(protocol)) {
    errors.push(`Protocol "${protocol}" is not allowed. Allowed: ${allowedProtocols.join(', ')}`);
  }

  // Check for at least something after the protocol
  const afterProtocol = url.slice(protocolEnd + 3);
  if (afterProtocol.length === 0) {
    errors.push('URL must have a hostname after the protocol');
  }

  // Check for invalid characters in URL
  for (let i = 0; i < url.length; i++) {
    const charCode = url.charCodeAt(i);
    // Allow common URL characters
    if (!isUrlSafe(charCode) &&
        charCode !== CHAR_CODES.COLON &&
        charCode !== CHAR_CODES.SLASH &&
        charCode !== CHAR_CODES.AT &&
        !isWhitespace(charCode)) {
      // Additional safe characters for URLs
      if (charCode !== 37 && // % (percent encoding)
          charCode !== 38 && // & (query params)
          charCode !== 61 && // = (query params)
          charCode !== 63 && // ? (query start)
          charCode !== 35 && // # (fragment)
          charCode !== 91 && // [ (IPv6)
          charCode !== 93) {  // ] (IPv6)
        errors.push(`URL contains invalid character at position ${i}`);
        break; // Only report first invalid char
      }
    }
  }

  // Check URL length
  if (url.length > 2048) {
    errors.push('URL exceeds maximum length of 2048 characters');
  }

  return { valid: errors.length === 0, errors };
}

// ============================================================================
// Array Validation
// ============================================================================

/**
 * Validate an array of items
 */
export function validateArray<T>(
  value: T[],
  fieldName: string,
  itemValidator?: (item: T, index: number) => ValidationResult,
  options?: { minLength?: number; maxLength?: number }
): ValidationResult {
  const errors: string[] = [];

  if (!Array.isArray(value)) {
    return { valid: false, errors: [`${fieldName} must be an array`] };
  }

  if (options?.minLength !== undefined && value.length < options.minLength) {
    errors.push(`${fieldName} must have at least ${options.minLength} items`);
  }

  if (options?.maxLength !== undefined && value.length > options.maxLength) {
    errors.push(`${fieldName} cannot have more than ${options.maxLength} items`);
  }

  if (itemValidator) {
    for (let i = 0; i < value.length; i++) {
      const itemResult = itemValidator(value[i], i);
      if (!itemResult.valid) {
        errors.push(...itemResult.errors.map(e => `${fieldName}[${i}]: ${e}`));
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

// ============================================================================
// Object Validation
// ============================================================================

/**
 * Validate an object has required fields
 */
export function validateRequiredFields(
  obj: Record<string, unknown>,
  requiredFields: string[],
  objectName: string = 'Object'
): ValidationResult {
  const errors: string[] = [];

  for (const field of requiredFields) {
    if (!(field in obj) || obj[field] === undefined || obj[field] === null) {
      errors.push(`${objectName} is missing required field: ${field}`);
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validate object has no extra fields
 */
export function validateNoExtraFields(
  obj: Record<string, unknown>,
  allowedFields: string[],
  objectName: string = 'Object'
): ValidationResult {
  const errors: string[] = [];

  for (const key of Object.keys(obj)) {
    if (!allowedFields.includes(key)) {
      errors.push(`${objectName} has unexpected field: ${key}`);
    }
  }

  return { valid: errors.length === 0, errors };
}

// ============================================================================
// Sanitization Functions
// ============================================================================

/**
 * Sanitize a string by removing control characters
 * Uses character code checking to properly handle all Unicode ranges including:
 * - C0 controls (0-31, DEL 127) — except \n, \r, \t which are preserved
 * - C1 controls (128-159)
 * - Surrogate pairs (0xD800-0xDFFF)
 * - Other Unicode control/formatting characters
 *
 * @param preserveWhitespace - If true, keep \n (10), \r (13), \t (9) which are
 *   legitimate whitespace in message content. Default: true.
 */
export function sanitizeRemoveControlChars(value: string, preserveWhitespace: boolean = true): string {
  let result = '';
  for (let i = 0; i < value.length; i++) {
    const charCode = value.charCodeAt(i);

    // Preserve common whitespace chars (\n, \r, \t) when preserveWhitespace is true
    if (preserveWhitespace && (charCode === 9 || charCode === 10 || charCode === 13)) {
      result += value[i];
      continue;
    }

    // Check for high surrogate
    if (charCode >= 0xD800 && charCode <= 0xDBFF) {
      const lowSurrogate = value.charCodeAt(i + 1);
      if (lowSurrogate >= 0xDC00 && lowSurrogate <= 0xDFFF) {
        // Valid surrogate pair - keep it (it's a legitimate Unicode character)
        result += value[i] + value[i + 1];
        i++; // Skip the low surrogate
        continue;
      }
      // Lone high surrogate - skip (invalid/control character)
      continue;
    }

    // Skip lone low surrogates
    if (charCode >= 0xDC00 && charCode <= 0xDFFF) {
      continue;
    }

    // Check for control characters using codePointAt for full Unicode support
    const codePoint = value.codePointAt(i) ?? charCode;

    // Skip C0 controls (0-31, 127) and C1 controls (128-159)
    if (isControlCharCode(codePoint) || isControlCharCode(charCode)) {
      continue;
    }

    // Skip supplementary plane control characters (above 0xFFFF)
    if (codePoint > 0xFFFF) {
      // Check if it's a control/formatting character in supplementary planes
      // General category Cc (Other, Control) covers most controls
      // Range: U+FFF9-U+FFFB (interlinear annotations), U+2060-U+206F (formatting),
      // U+FE00-U+FE0F (variation selectors), etc.
      if ((codePoint >= 0x2060 && codePoint <= 0x206F) || // General Punctuation formatting
          (codePoint >= 0xFFF9 && codePoint <= 0xFFFB) || // Interlinear annotation
          (codePoint >= 0xE0000 && codePoint <= 0xE007F)) { // Tags block
        continue;
      }
      // For legitimate supplementary characters, add them
      // Note: supplementary characters use 2 UTF-16 code units
      result += value[i];
      if (i + 1 < value.length) {
        result += value[i + 1];
        i++; // Skip the second code unit
      }
      continue;
    }

    result += value[i];
  }
  return result;
}

/**
 * Sanitize by normalizing whitespace
 */
export function sanitizeNormalizeWhitespace(value: string): string {
  let result = '';
  let lastWasWhitespace = false;

  for (let i = 0; i < value.length; i++) {
    const charCode = value.charCodeAt(i);
    const isWs = isWhitespace(charCode);

    if (isWs) {
      if (!lastWasWhitespace) {
        result += ' ';
        lastWasWhitespace = true;
      }
    } else {
      result += value[i];
      lastWasWhitespace = false;
    }
  }

  return result.trim();
}

/**
 * Truncate a string to a maximum length with ellipsis
 */
export function sanitizeTruncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  const ellipsis = '...';
  const truncateLength = maxLength - ellipsis.length;

  if (truncateLength <= 0) {
    return value.slice(0, maxLength);
  }

  return value.slice(0, truncateLength) + ellipsis;
}

/**
 * Sanitize message content
 */
export function sanitizeMessageContent(content: string, maxLength: number = 20000): string {
  let sanitized = sanitizeRemoveControlChars(content);
  sanitized = sanitizeNormalizeWhitespace(sanitized);
  sanitized = sanitizeTruncate(sanitized, maxLength);
  return sanitized;
}

/**
 * Sanitize and validate in one step
 */
export function sanitizeAndValidate(
  value: string,
  validators: Array<(v: string) => ValidationResult>
): { value: string; validation: ValidationResult } {
  const validation = combineResults(validators.map(v => v(value)));
  return { value: validation.sanitized ?? value, validation };
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Combine multiple validation results
 */
export function combineResults(results: ValidationResult[]): ValidationResult {
  const allErrors: string[] = [];
  let allValid = true;
  let lastSanitized: string | undefined;

  for (const result of results) {
    if (!result.valid) {
      allValid = false;
      allErrors.push(...result.errors);
    }
    if (result.sanitized !== undefined) {
      lastSanitized = result.sanitized;
    }
  }

  return { valid: allValid, errors: allErrors, sanitized: lastSanitized };
}

/**
 * Validate or throw an AiError
 */
export function validateOrThrow<T>(
  value: T,
  validator: (v: T) => ValidationResult,
  errorCode: string = 'AI_VALIDATION_ERROR'
): T {
  const result = validator(value);

  if (!result.valid) {
    throw new AiError({
      category: ErrorCategory.REQUEST_VALIDATION,
      severity: ErrorSeverity.WARNING,
      message: result.errors.join('; '),
      code: errorCode,
      context: { metadata: { validationErrors: result.errors } },
      recoverable: false,
    });
  }

  // Return sanitized value if available
  if (result.sanitized !== undefined && typeof value === 'string') {
    return result.sanitized as unknown as T;
  }

  return value;
}

/**
 * Create a composed validator
 */
export function composeValidators<T>(...validators: Array<(v: T) => ValidationResult>): (v: T) => ValidationResult {
  return (value: T) => {
    const results = validators.map(v => v(value));
    return combineResults(results);
  };
}

// ============================================================================
// Pre-built Validators
// ============================================================================

export const Validators = {
  nonEmpty: (fieldName: string) => (value: string) => validateNonEmpty(value, fieldName),
  length: (fieldName: string, options: { min?: number; max?: number }) => (value: string) =>
    validateLength(value, fieldName, options),
  alphanumeric: (fieldName: string) => (value: string) =>
    validateAllowedChars(value, fieldName, isAlphanumeric),
  noControlChars: (fieldName: string) => (value: string) =>
    validateNoControlChars(value, fieldName),
  providerName: () => validateProviderName,
  modelName: () => validateModelName,
  toolName: () => validateToolName,
  messageContent: (maxLength?: number) => (value: string) =>
    validateMessageContent(value, maxLength),
  conversationId: () => validateConversationId,
  userId: () => validateUserId,
  json: () => validateJson,
  url: (allowedProtocols?: string[]) => (value: string) =>
    validateUrl(value, allowedProtocols),
  temperature: () => validateTemperature,
  timeout: (fieldName?: string) => (value: number) =>
    validateTimeoutMs(value, fieldName),
  retryCount: (fieldName?: string) => (value: number) =>
    validateRetryCount(value, fieldName),
};
