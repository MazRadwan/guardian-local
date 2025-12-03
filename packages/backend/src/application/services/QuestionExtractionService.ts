import { IQuestionRepository } from '../interfaces/IQuestionRepository.js';
import { IAssessmentRepository } from '../interfaces/IAssessmentRepository.js';
import { MarkdownQuestionnaireConverter } from '../../infrastructure/ai/converters/MarkdownQuestionnaireConverter.js';
import { Question } from '../../domain/entities/Question.js';

export interface ExtractionResult {
  success: boolean;
  assessmentId: string;
  questionCount: number;
  error?: string;
}

export class QuestionExtractionService {
  private readonly MARKER_START = '<!-- QUESTIONNAIRE_START -->';
  private readonly MARKER_END = '<!-- QUESTIONNAIRE_END -->';

  constructor(
    private readonly questionRepository: IQuestionRepository,
    private readonly assessmentRepository: IAssessmentRepository,
  ) {}

  /**
   * Handle assistant completion and extract questionnaire if present
   * @param conversationId - The conversation ID (for logging)
   * @param assessmentId - The linked assessment ID (or null)
   * @param fullResponse - Complete assistant response text
   * @returns ExtractionResult with success status and question count, or null if no markers
   */
  async handleAssistantCompletion(
    conversationId: string,
    assessmentId: string | null,
    fullResponse: string
  ): Promise<ExtractionResult | null> {
    // 1. Check for markers
    if (!this.hasQuestionnaireMarkers(fullResponse)) {
      return null; // Not a questionnaire response
    }

    console.log(`[QuestionExtractionService] Questionnaire markers detected in conversation ${conversationId}`);

    // 2. Verify we have an assessment
    if (!assessmentId) {
      console.warn('[QuestionExtractionService] Markers found but no assessmentId');
      return {
        success: false,
        assessmentId: '',
        questionCount: 0,
        error: 'No assessment linked to conversation',
      };
    }

    // 3. Verify assessment exists and is in draft status
    const assessment = await this.assessmentRepository.findById(assessmentId);
    if (!assessment) {
      return {
        success: false,
        assessmentId,
        questionCount: 0,
        error: 'Assessment not found',
      };
    }

    if (assessment.status !== 'draft') {
      return {
        success: false,
        assessmentId,
        questionCount: 0,
        error: `Assessment must be in draft status, current: ${assessment.status}`,
      };
    }

    try {
      // 4. Extract content between markers
      const markedContent = this.extractMarkedContent(fullResponse);
      if (!markedContent) {
        throw new Error('Failed to extract content between markers');
      }

      console.log(`[QuestionExtractionService] Extracted ${markedContent.length} chars of questionnaire content`);

      // 5. Convert markdown to JSON envelope
      const jsonEnvelope = MarkdownQuestionnaireConverter.convert(markedContent);

      console.log(`[QuestionExtractionService] Converted to ${jsonEnvelope.questions.length} questions`);

      // 6. Convert to Question entities
      const questionEntities = jsonEnvelope.questions.map((q) =>
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

      // 7. Atomic persistence (delete existing + insert new in transaction)
      await this.questionRepository.replaceAllForAssessment(assessmentId, questionEntities);

      // 8. Update assessment status
      await this.assessmentRepository.updateStatus(assessmentId, 'questions_generated');

      console.log(`[QuestionExtractionService] Successfully extracted ${questionEntities.length} questions for assessment ${assessmentId}`);

      return {
        success: true,
        assessmentId,
        questionCount: questionEntities.length,
      };

    } catch (error) {
      console.error('[QuestionExtractionService] Extraction failed:', error);
      return {
        success: false,
        assessmentId,
        questionCount: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Check if response contains questionnaire markers
   */
  hasQuestionnaireMarkers(response: string): boolean {
    return response.includes(this.MARKER_START) && response.includes(this.MARKER_END);
  }

  /**
   * Extract content between markers
   */
  extractMarkedContent(response: string): string | null {
    const startIdx = response.indexOf(this.MARKER_START);
    const endIdx = response.indexOf(this.MARKER_END);

    if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) {
      return null;
    }

    return response.slice(startIdx + this.MARKER_START.length, endIdx).trim();
  }
}
