/**
 * IQuestionRepository Interface
 *
 * Repository pattern for Question persistence
 */

import type { Question } from '../../domain/entities/Question.js';

export interface IQuestionRepository {
  /**
   * Bulk create multiple questions for an assessment
   * @param questions - Array of Question entities to persist
   * @returns Array of created Questions with IDs
   */
  bulkCreate(questions: Question[]): Promise<Question[]>;

  /**
   * Find all questions for an assessment, ordered by section and question number
   * @param assessmentId - Assessment UUID
   * @returns Array of Questions
   */
  findByAssessmentId(assessmentId: string): Promise<Question[]>;

  /**
   * Find a specific question by ID
   * @param id - Question UUID
   * @returns Question or null if not found
   */
  findById(id: string): Promise<Question | null>;

  /**
   * Delete all questions for an assessment
   * @param assessmentId - Assessment UUID
   */
  deleteByAssessmentId(assessmentId: string): Promise<void>;
}
