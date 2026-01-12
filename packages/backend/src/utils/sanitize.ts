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
export function sanitizeForPrompt(text: string, options: SanitizeOptions = {}): string {
  const {
    maxLength = 10000,
    stripControlChars = true,
    escapePromptInjection = true,
  } = options

  let result = text

  // Strip control characters (except newlines \n, carriage returns \r, tabs \t)
  // Control chars: 0x00-0x08, 0x0B, 0x0C, 0x0E-0x1F, 0x7F
  if (stripControlChars) {
    result = result.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
  }

  // Escape common prompt injection patterns
  // These patterns at start of line could be interpreted as conversation turns
  if (escapePromptInjection) {
    result = result.replace(/^(Human:|Assistant:|System:)/gim, '[escaped] $1')
  }

  // Truncate to max length (after other processing to get accurate length)
  if (result.length > maxLength) {
    result = result.slice(0, maxLength) + '\n[...truncated]'
  }

  return result
}
