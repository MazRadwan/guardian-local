/**
 * ScoringQueryService - Read-only query logic extracted from ScoringService.
 *
 * Phase 1 of ScoringService split (Epic 37, Sprint 1, Story 3).
 * Handles scoring rehydration queries (getResultForConversation).
 *
 * Zero behavioral change from original ScoringService method.
 */

import { IConversationRepository } from '../interfaces/IConversationRepository.js';
import { IAssessmentResultRepository } from '../interfaces/IAssessmentResultRepository.js';
import { IDimensionScoreRepository } from '../interfaces/IDimensionScoreRepository.js';
import { ScoringRehydrationResult } from '../interfaces/IScoringService.js';
import { UnauthorizedError } from '../../domain/scoring/errors.js';

export class ScoringQueryService {
  constructor(
    private assessmentResultRepo: IAssessmentResultRepository,
    private dimensionScoreRepo: IDimensionScoreRepository,
    private conversationRepo?: IConversationRepository
  ) {}

  /**
   * Epic 22.1.1: Get scoring result for a conversation.
   * Used for rehydrating scoring card after page refresh.
   *
   * Logic:
   * 1. Look up conversation by ID
   * 2. Verify user owns conversation (throw error if not)
   * 3. Get assessmentId from conversation (return null if not linked)
   * 4. Fetch latest assessmentResult for that assessment (most recent scoredAt)
   * 5. Fetch dimensionScores for that batch
   * 6. Map to ScoringRehydrationResult shape
   */
  async getResultForConversation(
    conversationId: string,
    userId: string
  ): Promise<ScoringRehydrationResult | null> {
    if (!this.conversationRepo) {
      throw new Error('ConversationRepository not configured for rehydration');
    }

    // 1. Look up conversation
    const conversation = await this.conversationRepo.findById(conversationId);
    if (!conversation) {
      return null;
    }

    // 2. Verify user owns conversation
    if (conversation.userId !== userId) {
      throw new UnauthorizedError(`User ${userId} does not own conversation ${conversationId}`);
    }

    // 3. Get assessmentId from conversation
    if (!conversation.assessmentId) {
      return null;
    }

    // 4. Fetch latest assessmentResult for that assessment
    const assessmentResult = await this.assessmentResultRepo.findLatestByAssessmentId(
      conversation.assessmentId
    );
    if (!assessmentResult) {
      return null;
    }

    // 5. Fetch dimensionScores for that batch
    const dimensionScores = await this.dimensionScoreRepo.findByBatchId(
      conversation.assessmentId,
      assessmentResult.batchId
    );

    // 6. Map to ScoringRehydrationResult shape
    return {
      compositeScore: assessmentResult.compositeScore,
      recommendation: assessmentResult.recommendation,
      overallRiskRating: assessmentResult.overallRiskRating,
      executiveSummary: assessmentResult.executiveSummary || '',
      keyFindings: assessmentResult.keyFindings || [],
      dimensionScores: dimensionScores.map(ds => ({
        dimension: ds.dimension,
        score: ds.score,
        riskRating: ds.riskRating,
      })),
      batchId: assessmentResult.batchId,
      assessmentId: conversation.assessmentId,
    };
  }
}
