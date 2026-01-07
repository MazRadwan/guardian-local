import { ScoringReportData, ScoringProgressEvent } from '../../domain/scoring/types.js';
import type { ScoringErrorCode } from '../../domain/scoring/errors.js';

export interface ScoringInput {
  assessmentId: string;
  conversationId: string;
  fileId: string;
  userId: string;
}

export interface ScoringOutput {
  success: boolean;
  batchId: string;
  report?: ScoringReportData;
  error?: string;
  code?: ScoringErrorCode; // Epic 15 Story 5a.4: Structured error codes
}

export interface IScoringService {
  /**
   * Execute scoring workflow for uploaded questionnaire
   * Emits progress events via callback
   */
  score(
    input: ScoringInput,
    onProgress: (event: ScoringProgressEvent) => void
  ): Promise<ScoringOutput>;

  /**
   * Abort an in-progress scoring operation
   */
  abort(conversationId: string): void;
}
