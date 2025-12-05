/**
 * Questionnaire Output Tool Definition
 *
 * Part of Epic 12.5 Story 5.3.1: Tool_use for Structured JSON Output
 *
 * This tool definition forces Claude to return structured JSON matching
 * the QuestionnaireSchema type. Using tool_use provides:
 * - Built-in schema validation
 * - Eliminates regex extraction of JSON from responses
 * - Removes handling of markdown code blocks and preambles
 * - Produces cleaner, more reliable output
 */

import type { ClaudeTool } from '../../../application/interfaces/IClaudeClient.js';
import { ALL_RISK_DIMENSIONS } from '../../../domain/types/QuestionnaireSchema.js';

/**
 * Tool name constant for consistent reference
 */
export const QUESTIONNAIRE_OUTPUT_TOOL_NAME = 'output_questionnaire';

/**
 * Tool definition for structured questionnaire output.
 *
 * Imports ALL_RISK_DIMENSIONS from QuestionnaireSchema to maintain
 * single source of truth for valid risk dimensions.
 */
export const questionnaireOutputTool: ClaudeTool = {
  name: QUESTIONNAIRE_OUTPUT_TOOL_NAME,
  description:
    'Output the generated healthcare AI vendor assessment questionnaire in structured JSON format. Call this tool with the complete questionnaire data.',
  input_schema: {
    type: 'object',
    properties: {
      version: {
        type: 'string',
        description: 'Schema version, must be "1.0"',
        enum: ['1.0'],
      },
      metadata: {
        type: 'object',
        description: 'Questionnaire metadata',
        properties: {
          assessmentType: {
            type: 'string',
            description: 'Type of assessment being generated',
            enum: ['quick', 'comprehensive', 'category_focused'],
          },
          vendorName: {
            type: ['string', 'null'],
            description: 'Name of the vendor being assessed (null if unknown)',
          },
          solutionName: {
            type: ['string', 'null'],
            description: 'Name of the solution/product being assessed (null if unknown)',
          },
          generatedAt: {
            type: 'string',
            description: 'ISO 8601 timestamp of generation',
          },
          questionCount: {
            type: 'integer',
            description: 'Total number of questions in the questionnaire',
            minimum: 1,
          },
        },
        required: ['assessmentType', 'generatedAt', 'questionCount'],
      },
      sections: {
        type: 'array',
        description: 'Ordered list of questionnaire sections, one per risk dimension',
        items: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'Unique section identifier (e.g., "privacy_risk")',
            },
            title: {
              type: 'string',
              description: 'Human-readable section title',
            },
            riskDimension: {
              type: 'string',
              description: 'Risk dimension this section covers',
              enum: [...ALL_RISK_DIMENSIONS],
            },
            description: {
              type: 'string',
              description: 'Brief description of what this section assesses',
            },
            questions: {
              type: 'array',
              description: 'Questions in this section',
              items: {
                type: 'object',
                properties: {
                  id: {
                    type: 'string',
                    description: 'Unique question identifier (e.g., "privacy_1")',
                  },
                  text: {
                    type: 'string',
                    description: 'The question text (minimum 5 characters)',
                    minLength: 5,
                  },
                  category: {
                    type: 'string',
                    description: 'Category within the risk dimension',
                  },
                  riskDimension: {
                    type: 'string',
                    description: 'Risk dimension for this question',
                    enum: [...ALL_RISK_DIMENSIONS],
                  },
                  questionType: {
                    type: 'string',
                    description: 'Type of response expected',
                    enum: ['text', 'yes_no', 'scale', 'multiple_choice'],
                  },
                  required: {
                    type: 'boolean',
                    description: 'Whether this question must be answered',
                  },
                  guidance: {
                    type: 'string',
                    description: 'Optional guidance text for answering',
                  },
                  options: {
                    type: 'array',
                    description: 'Options for multiple_choice questions',
                    items: { type: 'string' },
                  },
                },
                required: ['id', 'text', 'category', 'riskDimension', 'questionType', 'required'],
              },
            },
          },
          required: ['id', 'title', 'riskDimension', 'description', 'questions'],
        },
      },
    },
    required: ['version', 'metadata', 'sections'],
  },
};
