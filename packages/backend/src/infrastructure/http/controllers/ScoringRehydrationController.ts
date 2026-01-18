/**
 * ScoringRehydrationController
 *
 * Epic 22.1.1: HTTP controller for scoring rehydration endpoint.
 * Enables frontend to fetch persisted scoring results after page reload.
 */

import { Request, Response, NextFunction } from 'express';
import type { IScoringService } from '../../../application/interfaces/IScoringService.js';
import { UnauthorizedError } from '../../../domain/scoring/errors.js';

export class ScoringRehydrationController {
  constructor(private readonly scoringService: IScoringService) {}

  /**
   * GET /api/scoring/conversation/:conversationId
   *
   * Fetches scoring results for a conversation.
   * Used for rehydrating the scoring card after page refresh.
   *
   * Response: ScoringRehydrationResult (matches ScoringCompletePayload['result'])
   *
   * Status codes:
   * - 200: Success, returns scoring result
   * - 401: Not authenticated
   * - 403: User doesn't own the conversation
   * - 404: No scoring results (conversation not found or no assessment linked)
   */
  getForConversation = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { conversationId } = req.params;
      const userId = req.user?.id;

      // Auth middleware should have set this
      if (!userId) {
        res.status(401).json({ error: 'Not authenticated' });
        return;
      }

      if (!conversationId) {
        res.status(400).json({ error: 'Missing conversationId parameter' });
        return;
      }

      const result = await this.scoringService.getResultForConversation(
        conversationId,
        userId
      );

      if (!result) {
        res.status(404).json({ error: 'No scoring results found for conversation' });
        return;
      }

      res.status(200).json(result);
    } catch (error) {
      // Handle authorization error specifically
      if (error instanceof UnauthorizedError) {
        res.status(403).json({ error: 'Access denied' });
        return;
      }

      // Log unexpected errors and pass to error handler
      console.error('[ScoringRehydrationController] Error:', error);
      next(error);
    }
  };
}
