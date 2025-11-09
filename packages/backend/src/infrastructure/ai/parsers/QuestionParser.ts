/**
 * QuestionParser
 *
 * Validates and parses Claude's JSON response into Question entities
 */

import { z } from 'zod';

/**
 * Zod schema for question validation
 */
const QuestionMetadataSchema = z.object({
  required: z.boolean().optional(),
  helpText: z.string().optional(),
  enumOptions: z.array(z.string()).optional(),
});

const QuestionSchema = z.object({
  sectionName: z.string().min(1),
  sectionNumber: z.number().int().min(1).max(11),
  questionNumber: z.number().int().min(1),
  questionText: z.string().min(10),
  questionType: z.enum(['text', 'enum', 'boolean']),
  questionMetadata: QuestionMetadataSchema.optional(),
});

const QuestionGenerationResponseSchema = z.object({
  questions: z.array(QuestionSchema).min(78).max(126),
});

export type ParsedQuestion = z.infer<typeof QuestionSchema>;
export type QuestionGenerationResponse = z.infer<
  typeof QuestionGenerationResponseSchema
>;

export class QuestionParser {
  /**
   * Parse and validate Claude's JSON response
   *
   * @param jsonResponse - Raw JSON string from Claude
   * @returns Validated questions array
   * @throws QuestionParseError if validation fails
   */
  static parse(jsonResponse: string): ParsedQuestion[] {
    try {
      // Remove markdown code blocks if present
      const cleanedJson = this.extractJSON(jsonResponse);

      // Parse JSON
      const parsed = JSON.parse(cleanedJson);

      // Validate with Zod
      const validated = QuestionGenerationResponseSchema.parse(parsed);

      // Additional validation: Check for duplicate positions
      this.validateUniquePositions(validated.questions);

      return validated.questions;
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new QuestionParseError(
          `Invalid question structure: ${error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ')}`
        );
      }

      if (error instanceof SyntaxError) {
        throw new QuestionParseError(`Invalid JSON: ${error.message}`);
      }

      throw error;
    }
  }

  /**
   * Extract JSON from Claude response (handles markdown code blocks)
   */
  private static extractJSON(response: string): string {
    // Remove markdown code blocks if present
    const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      return jsonMatch[1].trim();
    }

    return response.trim();
  }

  /**
   * Validate that each question has a unique position within its section
   */
  private static validateUniquePositions(questions: ParsedQuestion[]): void {
    const positions = new Set<string>();

    for (const question of questions) {
      const positionKey = `${question.sectionNumber}-${question.questionNumber}`;

      if (positions.has(positionKey)) {
        throw new QuestionParseError(
          `Duplicate question position: Section ${question.sectionNumber}, Question ${question.questionNumber}`
        );
      }

      positions.add(positionKey);
    }
  }

  /**
   * Validate enum questions have options
   */
  static validateEnumQuestions(questions: ParsedQuestion[]): void {
    for (const question of questions) {
      if (question.questionType === 'enum') {
        if (
          !question.questionMetadata?.enumOptions ||
          question.questionMetadata.enumOptions.length === 0
        ) {
          throw new QuestionParseError(
            `Enum question "${question.questionText}" missing enumOptions`
          );
        }
      }
    }
  }
}

/**
 * Custom error for question parsing failures
 */
export class QuestionParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QuestionParseError';
  }
}
