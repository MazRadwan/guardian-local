/**
 * Sanitization utilities for prompt injection prevention
 *
 * Epic 18: Sanitize user-provided text before injecting into Claude prompts.
 */

export interface SanitizeOptions {
  /** Maximum length (default 10000) */
  maxLength?: number
  /** Remove control characters except newlines/tabs (default true) */
  stripControlChars?: boolean
  /** Escape potential prompt injection patterns (default true) */
  escapePromptInjection?: boolean
  /** Normalize whitespace to single spaces and trim (default false) */
  normalizeWhitespace?: boolean
  /** Skip truncation marker suffix when truncating (default false) */
  skipTruncationMarker?: boolean
}

/**
 * ChatServer-compatible preset for context sanitization
 *
 * This profile matches the original ChatServer.sanitizeForPrompt() behavior:
 * - Normalizes whitespace (collapses to single spaces, trims)
 * - Strips control characters
 * - Does NOT escape prompt injection patterns (context is trusted)
 * - Short max length (200 chars) for context snippets
 * - No truncation marker (clean cut-off)
 */
export const CHAT_CONTEXT_PROFILE: SanitizeOptions = {
  maxLength: 200,
  stripControlChars: true,
  escapePromptInjection: false,
  normalizeWhitespace: true,
  skipTruncationMarker: true,
}

/**
 * Sanitize text before injecting into Claude prompts
 *
 * Prevents:
 * - Excessively long text (truncated with marker)
 * - Control characters that could confuse the model
 * - Basic prompt injection patterns (Human:/Assistant:/System:)
 *
 * @param text - Raw text to sanitize
 * @param options - Sanitization options
 * @returns Sanitized text safe for prompt injection
 */
export function sanitizeForPrompt(text: string | null, options: SanitizeOptions = {}): string {
  if (!text) return ''

  const {
    maxLength = 10000,
    stripControlChars = true,
    escapePromptInjection = true,
    normalizeWhitespace = false,
    skipTruncationMarker = false,
  } = options

  let result = text

  // Strip control characters
  // When normalizing whitespace (ChatServer-compatible): strip ALL control chars including tabs/newlines
  // Otherwise: preserve newlines \n, carriage returns \r, tabs \t (0x09, 0x0A, 0x0D)
  if (stripControlChars) {
    if (normalizeWhitespace) {
      // ChatServer pattern: removes ALL control chars (they'll be normalized to spaces anyway)
      result = result.replace(/[\x00-\x1F\x7F]/g, '')
    } else {
      // Default pattern: preserve newlines, carriage returns, tabs
      result = result.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    }
  }

  // Normalize whitespace (ChatServer-compatible mode)
  // Collapses all whitespace sequences to single space and trims
  if (normalizeWhitespace) {
    result = result.replace(/\s+/g, ' ').trim()
  }

  // Escape common prompt injection patterns
  // These patterns at start of line could be interpreted as conversation turns
  if (escapePromptInjection) {
    result = result.replace(/^(Human:|Assistant:|System:)/gim, '[escaped] $1')
  }

  // Truncate to max length (after other processing to get accurate length)
  if (result.length > maxLength) {
    if (skipTruncationMarker) {
      result = result.slice(0, maxLength)
    } else {
      result = result.slice(0, maxLength) + '\n[...truncated]'
    }
  }

  return result
}

/**
 * Validate vendor/solution name - rejects invalid values like numeric-only, single chars, etc.
 * Story 26.2 fix: Prevent bad tool input like "1" from becoming "Assessment: 1"
 *
 * Invalid values:
 * - Numeric-only strings ("1", "123")
 * - Single character strings
 * - Assessment option tokens ("option1", "choice_a", etc.)
 * - null/undefined/empty
 *
 * This matches ChatServer.ts:289-305 behavior exactly.
 *
 * @param value - The vendor name to validate
 * @returns true if valid vendor name, false otherwise
 */
export function isValidVendorName(value: string | null | undefined): boolean {
  if (!value || typeof value !== 'string') return false

  const trimmed = value.trim()
  if (!trimmed) return false

  // Reject numeric-only values
  if (/^\d+$/.test(trimmed)) return false

  // Reject single character values
  if (trimmed.length < 2) return false

  // Reject assessment option tokens (option1, choice_a, etc.)
  // Pattern from ChatServer.ts:302
  if (/^(option|choice|select|item|answer)[_\-]?\d*[a-z]?$/i.test(trimmed)) return false

  return true
}

/**
 * Sanitize error message for client
 * Prevents SQL queries and internal details from leaking to clients
 *
 * Sprint 17.3 Security Fix: Raw SQL was being sent to clients in error messages
 *
 * IMPORTANT: Only handles Error instances - all other types return fallback.
 * This matches ChatServer.ts:242-275 behavior exactly.
 *
 * @param error - The caught error (any type)
 * @param fallbackMessage - Default message if error is not an Error instance
 * @returns Safe error message string (max 200 chars)
 */
export function sanitizeErrorForClient(
  error: unknown,
  fallbackMessage: string
): string {
  // ONLY handle Error instances - strings and other types return fallback
  if (!(error instanceof Error)) {
    return fallbackMessage
  }

  const message = error.message

  // Detect SQL/database errors (contains SQL keywords or query patterns)
  // FULL pattern list from ChatServer.ts:250-263
  const sqlPatterns = [
    /\bSELECT\b/i,
    /\bINSERT\b/i,
    /\bUPDATE\b/i,
    /\bDELETE\b/i,
    /\bFROM\b.*\bWHERE\b/i,
    /\$\d+/, // PostgreSQL parameter placeholders
    /params:/i,
    /Failed query:/i,
    /ECONNREFUSED/,
    /ETIMEDOUT/,
    /duplicate key/i,
    /violates.*constraint/i,
  ]

  for (const pattern of sqlPatterns) {
    if (pattern.test(message)) {
      // Log the full error server-side, return generic message to client
      console.error('[sanitizeErrorForClient] Suppressed SQL error from client:', message)
      return fallbackMessage
    }
  }

  // Safe to return (but still truncate for safety - max 200 chars)
  return message.slice(0, 200)
}
