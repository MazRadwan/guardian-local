/**
 * questionnaireToMarkdown - Deterministic markdown renderer
 *
 * Part of Epic 12.5: Hybrid Questionnaire Generation Architecture
 *
 * Converts a QuestionnaireSchema to clean markdown for chat display.
 * This is a pure function with no side effects or external dependencies.
 *
 * @see QuestionnaireSchema for input type definition
 */

import {
  QuestionnaireSchema,
  QuestionnaireSection,
  QuestionnaireQuestion,
  RISK_DIMENSION_LABELS,
  AssessmentType,
} from '../../domain/types/QuestionnaireSchema.js';

/**
 * Escape markdown control characters to prevent injection
 *
 * Escapes characters that could alter markdown rendering:
 * - Backslash (escape char itself)
 * - Backticks (code blocks)
 * - Asterisks/underscores (emphasis)
 * - Brackets/parens (links/images)
 * - Angle brackets (HTML/autolinks)
 *
 * Note: We intentionally don't escape `.`, `-`, `#`, `!`, `|` as they
 * only cause issues in specific contexts (start of line) and escaping
 * them everywhere hurts readability significantly.
 *
 * @param text - Raw text to escape
 * @returns Escaped text safe for markdown concatenation
 */
function escapeMarkdown(text: string): string {
  if (!text) return '';
  // Escape: \ ` * _ [ ] ( ) < >
  return text.replace(/([\\`*_[\]()<>])/g, '\\$1');
}

/**
 * Calculate actual question count from sections
 */
function countQuestions(schema: QuestionnaireSchema): number {
  return schema.sections.reduce(
    (total, section) => total + section.questions.length,
    0
  );
}

/**
 * Format assessment type for display
 */
function formatAssessmentType(type: AssessmentType): string {
  switch (type) {
    case 'quick':
      return 'Quick Assessment (Red Flag Screening)';
    case 'comprehensive':
      return 'Comprehensive Assessment';
    case 'category_focused':
      return 'Category-Focused Assessment';
    default:
      return 'Assessment';
  }
}

/**
 * Format a single question as markdown
 * Uses bold question number for visibility since numbered lists may not render
 */
function formatQuestion(question: QuestionnaireQuestion, index: number): string {
  const lines: string[] = [];

  // Question with bold number prefix for clear visibility
  lines.push(`**${index + 1}.** ${escapeMarkdown(question.text)}`);

  // Optional guidance on its own line with clear formatting
  if (question.guidance) {
    lines.push('');
    lines.push(`> *Guidance: ${escapeMarkdown(question.guidance)}*`);
  }

  // Options for multiple choice (escaped)
  if (question.questionType === 'multiple_choice' && question.options) {
    lines.push('');
    for (const option of question.options) {
      lines.push(`   - [ ] ${escapeMarkdown(option)}`);
    }
  }

  return lines.join('\n');
}

/**
 * Format a section as markdown
 */
function formatSection(section: QuestionnaireSection): string {
  const lines: string[] = [];

  // Section header (use known label if available, escape title as fallback)
  const label = RISK_DIMENSION_LABELS[section.riskDimension] || escapeMarkdown(section.title);
  lines.push(`## ${label}`);
  lines.push('');

  // Section description (escaped)
  if (section.description) {
    lines.push(`*${escapeMarkdown(section.description)}*`);
    lines.push('');
  }

  // Questions with extra spacing for readability
  for (let i = 0; i < section.questions.length; i++) {
    lines.push(formatQuestion(section.questions[i], i));
    lines.push(''); // Blank line after each question
    lines.push(''); // Extra blank line for visual separation
  }

  return lines.join('\n');
}

/**
 * Convert a QuestionnaireSchema to markdown
 *
 * This is a pure, deterministic function. The same schema will always
 * produce the exact same markdown output.
 *
 * @param schema - The questionnaire schema to render
 * @returns Markdown string for chat display
 *
 * @example
 * ```typescript
 * const markdown = questionnaireToMarkdown(schema);
 * // Returns:
 * // # Vendor Assessment Questionnaire
 * // **Type:** Comprehensive Assessment
 * // **Questions:** 90
 * // ...
 * ```
 */
export function questionnaireToMarkdown(schema: QuestionnaireSchema): string {
  const lines: string[] = [];

  // Header (escape vendor name to prevent injection)
  const vendorName = schema.metadata.vendorName
    ? escapeMarkdown(schema.metadata.vendorName)
    : 'Vendor';
  lines.push(`# ${vendorName} Assessment Questionnaire`);
  lines.push('');

  // Metadata - calculate actual question count from sections for accuracy
  const actualQuestionCount = countQuestions(schema);
  lines.push(`**Type:** ${formatAssessmentType(schema.metadata.assessmentType)}`);
  lines.push(`**Questions:** ${actualQuestionCount}`);
  if (schema.metadata.solutionName) {
    lines.push(`**Solution:** ${escapeMarkdown(schema.metadata.solutionName)}`);
  }
  lines.push('');

  // Divider
  lines.push('---');
  lines.push('');

  // Sections with dividers between them
  for (let i = 0; i < schema.sections.length; i++) {
    lines.push(formatSection(schema.sections[i]));
    // Add divider between sections (but not after the last one)
    if (i < schema.sections.length - 1) {
      lines.push('---');
      lines.push('');
    }
  }

  // Footer
  lines.push('---');
  lines.push('');
  lines.push('*Generated by Guardian - AI Governance Assessment Platform*');

  return lines.join('\n');
}

/**
 * Chunk markdown for simulated streaming
 *
 * When streaming to chat, we emit chunks to simulate Claude streaming.
 * This provides familiar UX without actual Claude streaming.
 *
 * @param markdown - Full markdown string
 * @param chunkSize - Approximate characters per chunk (default: 50, min: 1)
 * @returns Array of chunks
 * @throws Error if chunkSize is less than 1
 */
export function chunkMarkdown(markdown: string, chunkSize: number = 50): string[] {
  // Guard against invalid chunk size to prevent infinite loops
  if (chunkSize < 1) {
    throw new Error('chunkSize must be at least 1');
  }

  const chunks: string[] = [];
  let remaining = markdown;

  while (remaining.length > 0) {
    // Try to break at word boundary
    let breakPoint = Math.min(chunkSize, remaining.length);

    if (breakPoint < remaining.length) {
      // Look for space or newline near chunk size
      const spaceIndex = remaining.lastIndexOf(' ', breakPoint);
      const newlineIndex = remaining.lastIndexOf('\n', breakPoint);
      const boundary = Math.max(spaceIndex, newlineIndex);

      if (boundary > chunkSize * 0.5) {
        breakPoint = boundary + 1; // Include the space/newline
      }
    }

    chunks.push(remaining.slice(0, breakPoint));
    remaining = remaining.slice(breakPoint);
  }

  return chunks;
}
