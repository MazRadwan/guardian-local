/**
 * QuestionController
 *
 * Handles question generation and retrieval endpoints
 */

import type { Request, Response } from 'express';
import { QuestionService } from '../../../application/services/QuestionService.js';
import type { QuestionGenerationContextDTO } from '../../../application/dtos/QuestionGenerationContextDTO.js';

export class QuestionController {
  constructor(private questionService: QuestionService) {}

  /**
   * POST /api/assessments/:id/generate-questions
   *
   * Generate questions for an assessment
   */
  generateQuestions = async (req: Request, res: Response): Promise<void> => {
    try {
      const assessmentId = req.params.id;
      const context: QuestionGenerationContextDTO = req.body;

      // Validate request body
      if (!context.vendorType || !context.solutionType) {
        res.status(400).json({
          error: 'vendorType and solutionType are required',
        });
        return;
      }

      // Call service to generate questions
      const questionCount = await this.questionService.generateQuestions(
        assessmentId,
        context
      );

      res.status(200).json({
        message: 'Questions generated successfully',
        assessmentId,
        questionCount,
      });
    } catch (error) {
      const err = error as Error;

      if (err.message.includes('not found')) {
        res.status(404).json({ error: err.message });
        return;
      }

      if (err.message.includes('must be in draft status')) {
        res.status(400).json({ error: err.message });
        return;
      }

      console.error('Error generating questions:', err);
      res.status(500).json({
        error: 'Failed to generate questions',
        details: err.message,
      });
    }
  };

  /**
   * GET /api/assessments/:id/questions
   *
   * Get all questions for an assessment
   */
  getQuestions = async (req: Request, res: Response): Promise<void> => {
    try {
      const assessmentId = req.params.id;

      const questions = await this.questionService.getQuestions(assessmentId);

      res.status(200).json({
        assessmentId,
        questionCount: questions.length,
        questions: questions.map((q) => ({
          id: q.id,
          sectionName: q.sectionName,
          sectionNumber: q.sectionNumber,
          questionNumber: q.questionNumber,
          questionText: q.questionText,
          questionType: q.questionType,
          questionMetadata: q.questionMetadata,
        })),
      });
    } catch (error) {
      const err = error as Error;
      console.error('Error fetching questions:', err);
      res.status(500).json({
        error: 'Failed to fetch questions',
        details: err.message,
      });
    }
  };
}
