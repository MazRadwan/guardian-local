/**
 * Scoring Routes
 *
 * Epic 22.1.1: API endpoints for scoring rehydration
 */

import { Router } from 'express';
import { ScoringRehydrationController } from '../controllers/ScoringRehydrationController.js';
import { AuthService } from '../../../application/services/AuthService.js';
import { authMiddleware } from '../middleware/auth.middleware.js';

export function createScoringRoutes(
  controller: ScoringRehydrationController,
  authService: AuthService
): Router {
  const router = Router();

  /**
   * @route   GET /api/scoring/conversation/:conversationId
   * @desc    Get scoring results for a conversation (rehydration)
   * @access  Protected
   */
  router.get(
    '/conversation/:conversationId',
    authMiddleware(authService),
    controller.getForConversation
  );

  return router;
}
