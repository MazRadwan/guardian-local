/**
 * Question Routes
 *
 * API endpoints for question generation and retrieval
 */

import { Router } from 'express';
import { QuestionController } from '../controllers/QuestionController.js';

export function createQuestionRoutes(
  questionController: QuestionController
): Router {
  const router = Router();

  // Generate questions for an assessment
  router.post(
    '/assessments/:id/generate-questions',
    questionController.generateQuestions
  );

  // Get questions for an assessment
  router.get('/assessments/:id/questions', questionController.getQuestions);

  return router;
}
