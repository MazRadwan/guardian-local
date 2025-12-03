/**
 * Questionnaire Ready Tool Definition
 *
 * Part of Epic 12: Tool-Based Questionnaire Generation Trigger
 *
 * This tool definition is passed to Claude API. When Claude determines
 * the user is ready to generate a questionnaire, it calls this tool.
 *
 * The tool schema is intentionally flexible:
 * - Only assessment_type is required
 * - Other fields are optional (Claude may not have all info)
 * - Frontend handles missing fields gracefully
 */

import { ClaudeTool } from '../../../application/interfaces/IClaudeClient.js';
import { QuestionnaireReadyInput } from '../../../application/services/QuestionnaireReadyService.js';

/**
 * Tool definition for questionnaire_ready
 *
 * Claude calls this when it determines:
 * 1. User has expressed intent to generate a questionnaire
 * 2. Enough context has been gathered (vendor type, solution, etc.)
 * 3. User has confirmed they want to proceed
 */
export const questionnaireReadyTool: ClaudeTool = {
  name: 'questionnaire_ready',
  description: `Call this tool when the user confirms they want to generate a vendor assessment questionnaire.

You should call this tool when:
- User explicitly asks to generate/create/make a questionnaire or assessment
- User confirms they want to proceed (e.g., "yes", "go ahead", "let's do it", "generate it")
- User responds affirmatively after you've gathered context about their needs

Do NOT call this tool when:
- User is just asking questions ABOUT questionnaires
- User wants to modify or review an existing questionnaire
- You're still gathering initial context and haven't offered to generate yet
- User seems uncertain or is asking for more information

The tool will trigger a "Generate Questionnaire" button in the UI. The user must click this button to proceed with actual generation.`,

  input_schema: {
    type: 'object',
    properties: {
      assessment_type: {
        type: 'string',
        enum: ['quick', 'comprehensive', 'category_focused'],
        description: `The type of assessment based on conversation context:
- quick: ~30-40 questions, high-level assessment
- comprehensive: ~85-95 questions, detailed assessment
- category_focused: 50-70 questions, focused on specific risk categories`,
      },
      vendor_name: {
        type: 'string',
        description:
          'Name of the AI vendor being assessed (if mentioned in conversation)',
      },
      solution_name: {
        type: 'string',
        description:
          'Name of the specific AI solution or product (if mentioned)',
      },
      context_summary: {
        type: 'string',
        description:
          'Brief 1-2 sentence summary of what the questionnaire will assess',
      },
      estimated_questions: {
        type: 'integer',
        description: 'Estimated number of questions (based on assessment type)',
        minimum: 1,
        maximum: 200,
      },
      selected_categories: {
        type: 'array',
        items: { type: 'string' },
        description:
          'For category_focused type: list of risk categories to include',
      },
    },
    required: ['assessment_type'],
    additionalProperties: false,
  },
};

/**
 * Re-export the input type from application layer (single source of truth)
 * This maintains clean architecture: infrastructure imports from application
 */
export type { QuestionnaireReadyInput };

/**
 * Array of all assessment mode tools
 * (Currently just questionnaire_ready, but allows for future expansion)
 */
export const assessmentModeTools: ClaudeTool[] = [questionnaireReadyTool];
