import { ExtractionResult } from '../services/QuestionExtractionService.js';

export interface IQuestionExtractionService {
  handleAssistantCompletion(
    conversationId: string,
    assessmentId: string | null,
    fullResponse: string
  ): Promise<ExtractionResult | null>;

  hasQuestionnaireMarkers(response: string): boolean;
  extractMarkedContent(response: string): string | null;
}
