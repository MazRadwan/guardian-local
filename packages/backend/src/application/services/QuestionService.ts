/**
 * QuestionService
 *
 * Orchestrates question generation workflow:
 * 1. Call Claude API with vendor context
 * 2. Parse and validate response
 * 3. Persist questions to database
 * 4. Update assessment status
 */

import type { IClaudeClient } from '../interfaces/IClaudeClient.js';
import type { IQuestionRepository } from '../interfaces/IQuestionRepository.js';
import type { IAssessmentRepository } from '../interfaces/IAssessmentRepository.js';
import type { QuestionGenerationContextDTO } from '../dtos/QuestionGenerationContextDTO.js';
import { Question } from '../../domain/entities/Question.js';
import {
  buildQuestionGenerationPrompt,
  GUARDIAN_SYSTEM_CONTEXT,
} from '../../infrastructure/ai/prompts/questionGeneration.js';
import { QuestionParser } from '../../infrastructure/ai/parsers/QuestionParser.js';

export class QuestionService {
  constructor(
    private claudeClient: IClaudeClient,
    private questionRepository: IQuestionRepository,
    private assessmentRepository: IAssessmentRepository
  ) {}

  /**
   * Generate questions for an assessment
   *
   * @param assessmentId - Assessment UUID
   * @param context - Vendor and solution context
   * @returns Number of questions generated
   */
  async generateQuestions(
    assessmentId: string,
    context: QuestionGenerationContextDTO
  ): Promise<number> {
    // 1. Verify assessment exists and is in draft status
    const assessment = await this.assessmentRepository.findById(assessmentId);
    if (!assessment) {
      throw new Error(`Assessment ${assessmentId} not found`);
    }

    if (assessment.status !== 'draft') {
      throw new Error(
        `Assessment must be in draft status (current: ${assessment.status})`
      );
    }

    // 2. Build prompt
    const prompt = buildQuestionGenerationPrompt(context);

    // 3. Call Claude API
    const response = await this.claudeClient.sendMessage(
      [{ role: 'user', content: prompt }],
      GUARDIAN_SYSTEM_CONTEXT
    );

    // 4. Parse and validate response
    const parsedQuestions = QuestionParser.parse(response.content);

    // 5. Additional validation for enum questions
    QuestionParser.validateEnumQuestions(parsedQuestions);

    // 6. Convert to Question entities
    const questionEntities = parsedQuestions.map((q) =>
      Question.create({
        assessmentId,
        sectionName: q.sectionName,
        sectionNumber: q.sectionNumber,
        questionNumber: q.questionNumber,
        questionText: q.questionText,
        questionType: q.questionType,
        questionMetadata: q.questionMetadata,
      })
    );

    // 7. Bulk insert to database
    await this.questionRepository.bulkCreate(questionEntities);

    // 8. Update assessment status
    await this.assessmentRepository.updateStatus(
      assessmentId,
      'questions_generated'
    );

    return questionEntities.length;
  }

  /**
   * Get questions for an assessment
   *
   * @param assessmentId - Assessment UUID
   * @returns Array of questions
   */
  async getQuestions(assessmentId: string): Promise<Question[]> {
    return this.questionRepository.findByAssessmentId(assessmentId);
  }

  /**
   * Get question count for an assessment
   *
   * @param assessmentId - Assessment UUID
   * @returns Number of questions
   */
  async getQuestionCount(assessmentId: string): Promise<number> {
    const questions =
      await this.questionRepository.findByAssessmentId(assessmentId);
    return questions.length;
  }
}
