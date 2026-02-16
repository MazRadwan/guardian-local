import { ScoringReportData, ScoringProgressEvent, DimensionScoreData } from '../../domain/scoring/types.js';
import type { ScoringErrorCode } from '../../domain/scoring/errors.js';

export interface ScoringInput {
  /**
   * Assessment ID to score. If not provided, will be extracted from the uploaded document.
   * Epic 18: Made optional to support Scoring mode in new conversations where the
   * assessment ID is embedded in the questionnaire file, not linked to the conversation.
   */
  assessmentId?: string;
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

/**
 * Scoring rehydration response shape.
 * Matches ScoringCompletePayload['result'] from frontend types.
 */
export interface ScoringRehydrationResult {
  compositeScore: number;
  recommendation: 'approve' | 'conditional' | 'decline' | 'more_info';
  overallRiskRating: 'low' | 'medium' | 'high' | 'critical';
  executiveSummary: string;
  keyFindings: string[];
  dimensionScores: Array<{
    dimension: string;
    score: number;
    riskRating: 'low' | 'medium' | 'high' | 'critical';
    findings?: DimensionScoreData['findings'];
  }>;
  batchId: string;
  assessmentId: string;
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

  /**
   * Epic 22.1.1: Get scoring result for a conversation.
   * Used for rehydrating scoring card after page refresh.
   *
   * @param conversationId - The conversation to fetch scoring for
   * @param userId - The authenticated user (for ownership check)
   * @returns The scoring result or null if not found/not linked
   * @throws Error if user doesn't own the conversation
   */
  getResultForConversation(
    conversationId: string,
    userId: string
  ): Promise<ScoringRehydrationResult | null>;
}
