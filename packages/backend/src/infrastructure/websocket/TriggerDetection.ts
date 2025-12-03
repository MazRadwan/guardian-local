/**
 * Trigger Detection Utilities
 *
 * Detects user intent triggers in chat messages.
 * Extracted for testability and reuse.
 *
 * PERFORMANCE NOTES:
 * - LITERAL_PATTERNS checked first (compiled regex, fast exact matches)
 * - FLEXIBLE_PATTERNS checked second (more complex regex, only if literals miss)
 * - Order matters: most common phrases should be in LITERAL_PATTERNS
 *
 * WORD BOUNDARIES:
 * - All patterns use \b to prevent partial matches
 * - "regenerate questionnaire" will NOT match "generate questionnaire"
 * - "degenerate" will NOT match "generate"
 */

// Literal phrase patterns - converted to regex with word boundaries
// These are exact phrases users commonly type
const LITERAL_PATTERNS: RegExp[] = [
  // Existing triggers (preserved for backward compatibility)
  /\bgenerate questionnaire\b/i,
  /\bgenerate the questionnaire\b/i,
  /\bcreate questionnaire\b/i,
  /\bgenerate it\b/i,
  /\bgo ahead\b/i,
  /\byes generate\b/i,
  // Direct requests with articles
  /\bcreate a questionnaire\b/i,
  /\bmake a questionnaire\b/i,
  /\bmake the questionnaire\b/i,
  /\bbuild a questionnaire\b/i,
  /\bbuild the questionnaire\b/i,
  /\bproduce a questionnaire\b/i,
  /\bstart the questionnaire\b/i,
  /\bbegin the questionnaire\b/i,
  // Short confirmation forms
  /\bcreate it\b/i,
  /\bmake it\b/i,
  /\bbuild it\b/i,
  /\bstart it\b/i,
  /\bbegin it\b/i,
  /\bdo it\b/i,
  /\bproceed\b/i,
  /\byes please\b/i,
  /\byes,?\s*please\b/i,
  /\byes,?\s*create\b/i,
  /\byes,?\s*generate\b/i,
  /\bok(ay)?\s*generate\b/i,
  // Synonyms (survey, form, assessment)
  /\bgenerate survey\b/i,
  /\bcreate survey\b/i,
  /\bmake survey\b/i,
  /\bgenerate form\b/i,
  /\bcreate form\b/i,
  /\bgenerate assessment\b/i,
  /\bcreate assessment\b/i,
];

// Flexible patterns - more complex regex for natural language variations
// Only checked if LITERAL_PATTERNS don't match (performance optimization)
const FLEXIBLE_PATTERNS: RegExp[] = [
  // "create/make/build a [modifier] questionnaire/survey/form"
  /\b(create|generate|make|build|produce|start)\s+(a\s+)?(short\s+|brief\s+|quick\s+|simple\s+|basic\s+)?(questionnaire|survey|form|assessment)\b/i,
  // "let's create/make/generate..."
  /\blet'?s\s+(create|generate|make|build|start)\b/i,
  // Affirmative + action: "sure, create it" or "ok, generate the form"
  /\b(yes|ok|okay|sure|please|absolutely|definitely)\b.{0,20}\b(generate|create|make|build)\b/i,
  // Adjective + noun WITHOUT verb (e.g., "short questionnaire please")
  // Catches cases where user omits the action verb
  /\b(short|brief|quick|simple|basic)\s+(questionnaire|survey|form|assessment)\b/i,
];

/**
 * Detect if user message contains a trigger to generate questionnaire
 * @param message - User's message text
 * @returns true if message contains a generation trigger
 */
export function detectGenerateTrigger(message: string): boolean {
  const normalized = message.toLowerCase().trim();

  // Check literal patterns first (fast, common cases)
  if (LITERAL_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return true;
  }

  // Check flexible patterns second (slower, edge cases)
  return FLEXIBLE_PATTERNS.some((pattern) => pattern.test(normalized));
}

// Export for testing
export { LITERAL_PATTERNS, FLEXIBLE_PATTERNS };
