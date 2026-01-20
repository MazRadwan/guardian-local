/**
 * QuestionnaireReadyService - Handles the questionnaire_ready tool call
 *
 * Part of Epic 12: Tool-Based Questionnaire Generation Trigger
 *
 * When Claude determines it has enough context to generate a questionnaire,
 * it calls the questionnaire_ready tool. This service:
 * 1. Validates the tool input
 * 2. Builds a payload for the frontend
 * 3. Returns a result that triggers a WebSocket event
 *
 * The actual questionnaire generation happens later when the user clicks
 * the "Generate" button in the frontend.
 */

import {
  IToolUseHandler,
  ToolUseInput,
  ToolUseResult,
  ToolUseContext,
} from '../interfaces/IToolUseHandler.js';
import { ConversationService } from './ConversationService.js';
import { isValidVendorName } from '../../utils/sanitize.js';

/**
 * Input schema for questionnaire_ready tool
 * Only assessment_type is required - others are optional
 */
export interface QuestionnaireReadyInput {
  assessment_type: 'quick' | 'comprehensive' | 'category_focused';
  vendor_name?: string;
  solution_name?: string;
  context_summary?: string;
  estimated_questions?: number;
  selected_categories?: string[];
}

/**
 * Payload emitted to frontend via WebSocket
 */
export interface QuestionnaireReadyPayload {
  conversationId: string;
  assessmentType: 'quick' | 'comprehensive' | 'category_focused';
  vendorName: string | null;
  solutionName: string | null;
  contextSummary: string | null;
  estimatedQuestions: number | null;
  selectedCategories: string[] | null;
}

export class QuestionnaireReadyService implements IToolUseHandler {
  readonly toolName = 'questionnaire_ready';

  // Note: ConversationService injected for future use (e.g., linking assessments)
  // TODO: Extract IConversationService interface for proper DI
  constructor(
    private readonly _conversationService: ConversationService
  ) {}

  /**
   * Sanitize string input - returns trimmed string or null
   */
  private sanitizeString(value: unknown): string | null {
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  }

  /**
   * Validate vendor/solution name - rejects invalid values like numeric-only, single chars, etc.
   * Story 26.2 fix: Prevent bad tool input like "1" from becoming "Assessment: 1"
   *
   * Uses shared validation from utils/sanitize (Story 28.1.4 consolidation).
   *
   * Invalid values:
   * - Numeric-only strings ("1", "123")
   * - Single character strings
   * - Strings less than 2 meaningful characters
   * - Assessment option tokens ("option1", "choice_a", etc.)
   *
   * @returns validated string or null if invalid
   */
  private validateVendorName(value: unknown): string | null {
    const sanitized = this.sanitizeString(value);
    if (!sanitized) return null;

    // Use shared validation from utils/sanitize
    if (!isValidVendorName(sanitized)) {
      console.log(`[QuestionnaireReadyService] Rejecting invalid vendor name: "${sanitized}"`);
      return null;
    }

    return sanitized;
  }

  /**
   * Sanitize string array input - filters non-strings, returns null if empty
   */
  private sanitizeStringArray(value: unknown): string[] | null {
    if (!Array.isArray(value)) return null;
    const filtered = value.filter((v): v is string => typeof v === 'string');
    return filtered.length > 0 ? filtered : null;
  }

  /**
   * Sanitize number input - returns positive number or null
   */
  private sanitizeNumber(value: unknown): number | null {
    return typeof value === 'number' && value > 0 ? value : null;
  }

  /**
   * Handle the questionnaire_ready tool call from Claude
   *
   * @param input - Tool use input from Claude
   * @param context - Conversation context
   * @returns Result with event to emit to frontend
   */
  async handle(
    input: ToolUseInput,
    context: ToolUseContext
  ): Promise<ToolUseResult> {
    // 1. Validate tool name
    if (input.toolName !== this.toolName) {
      return {
        handled: false,
        error: `Wrong tool: expected ${this.toolName}, got ${input.toolName}`,
      };
    }

    // 2. Validate input exists and is an object
    if (!input.input || typeof input.input !== 'object') {
      return {
        handled: false,
        error: 'Invalid tool input: expected object',
        toolResult: {
          toolUseId: input.toolUseId,
          content: JSON.stringify({ error: 'Invalid input format' }),
        },
      };
    }

    // 3. Parse and validate input
    const toolInput = input.input as Partial<QuestionnaireReadyInput>;

    // assessment_type is required
    if (!toolInput.assessment_type) {
      return {
        handled: false,
        error: 'Missing required field: assessment_type',
        toolResult: {
          toolUseId: input.toolUseId,
          content: JSON.stringify({
            error: 'Missing required field: assessment_type',
            valid_types: ['quick', 'comprehensive', 'category_focused'],
          }),
        },
      };
    }

    // Validate assessment_type value
    const validTypes = ['quick', 'comprehensive', 'category_focused'];
    if (!validTypes.includes(toolInput.assessment_type)) {
      return {
        handled: false,
        error: `Invalid assessment_type: ${toolInput.assessment_type}`,
        toolResult: {
          toolUseId: input.toolUseId,
          content: JSON.stringify({
            error: `Invalid assessment_type: ${toolInput.assessment_type}`,
            valid_types: validTypes,
          }),
        },
      };
    }

    // 4. Build payload for frontend with sanitized and validated inputs
    // Story 26.2 fix: Use validateVendorName to reject invalid values like "1"
    const payload: QuestionnaireReadyPayload = {
      conversationId: context.conversationId,
      assessmentType: toolInput.assessment_type,
      vendorName: this.validateVendorName(toolInput.vendor_name),
      solutionName: this.validateVendorName(toolInput.solution_name),
      contextSummary: this.sanitizeString(toolInput.context_summary),
      estimatedQuestions: this.getEstimatedQuestions(
        toolInput.assessment_type,
        this.sanitizeNumber(toolInput.estimated_questions)
      ),
      selectedCategories: this.sanitizeStringArray(toolInput.selected_categories),
    };

    console.log(
      '[QuestionnaireReadyService] Questionnaire ready for conversation:',
      context.conversationId,
      'Type:',
      toolInput.assessment_type
    );

    // 6. Return result with event to emit
    return {
      handled: true,
      emitEvent: {
        event: 'questionnaire_ready',
        payload: payload as unknown as Record<string, unknown>,
      },
      toolResult: {
        toolUseId: input.toolUseId,
        content: JSON.stringify({
          success: true,
          message:
            'Questionnaire generation ready. Waiting for user confirmation.',
          assessment_type: toolInput.assessment_type,
        }),
      },
    };
  }

  /**
   * Get estimated question count based on assessment type
   */
  private getEstimatedQuestions(
    type: 'quick' | 'comprehensive' | 'category_focused',
    provided: number | null
  ): number {
    if (provided !== null) {
      return provided;
    }

    // Default estimates based on assessment type
    switch (type) {
      case 'quick':
        return 35;
      case 'comprehensive':
        return 90;
      case 'category_focused':
        return 50;
      default:
        return 50;
    }
  }
}
