/**
 * Conversation Routes
 *
 * Epic 25: Chat Title Intelligence
 * Defines HTTP routes for conversation operations
 */

import { Router } from 'express';
import { ConversationController } from '../controllers/ConversationController.js';
import { AuthService } from '../../../application/services/AuthService.js';
import { authMiddleware } from '../middleware/auth.middleware.js';

export function createConversationRoutes(
  controller: ConversationController,
  authService: AuthService
): Router {
  const router = Router();

  // All routes require authentication
  router.use(authMiddleware(authService));

  // PATCH /api/conversations/:id/title - Update conversation title
  router.patch('/:id/title', controller.updateTitle);

  return router;
}
