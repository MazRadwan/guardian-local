/**
 * Question Routes
 *
 * API endpoints for question generation and retrieval
 */

import { Router } from 'express';
import { QuestionController } from '../controllers/QuestionController.js';
import { AuthService } from '../../../application/services/AuthService.js';
import { authMiddleware } from '../middleware/auth.middleware.js';

export function createQuestionRoutes(
  questionController: QuestionController,
  authService: AuthService
): Router {
  const router = Router();

  // All routes require authentication
  router.use(authMiddleware(authService));

  // Generate questions for an assessment
  router.post(
    '/assessments/:id/generate-questions',
    questionController.generateQuestions
  );

  // Get questions for an assessment
  router.get('/assessments/:id/questions', questionController.getQuestions);

  return router;
}
