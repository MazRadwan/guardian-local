/**
 * DrizzleQuestionRepository
 *
 * Drizzle ORM implementation of IQuestionRepository
 */

import { eq } from 'drizzle-orm';
import { db, type DbTransaction } from '../client.js';
import { questions } from '../schema/questions.js';
import type { IQuestionRepository } from '../../../application/interfaces/IQuestionRepository.js';
import { Question } from '../../../domain/entities/Question.js';

export class DrizzleQuestionRepository implements IQuestionRepository {

  /**
   * Bulk create questions
   */
  async bulkCreate(questionEntities: Question[]): Promise<Question[]> {
    if (questionEntities.length === 0) {
      return [];
    }

    const values = questionEntities.map((q) => q.toPersistence());

    const created = await db.insert(questions).values(values).returning();

    return created.map((row) => Question.fromPersistence(row));
  }

  /**
   * Find all questions for an assessment, ordered by position
   */
  async findByAssessmentId(assessmentId: string): Promise<Question[]> {
    const rows = await db
      .select()
      .from(questions)
      .where(eq(questions.assessmentId, assessmentId))
      .orderBy(questions.sectionNumber, questions.questionNumber);

    return rows.map((row) => Question.fromPersistence(row));
  }

  /**
   * Find question by ID
   */
  async findById(id: string): Promise<Question | null> {
    const [row] = await db
      .select()
      .from(questions)
      .where(eq(questions.id, id))
      .limit(1);

    return row ? Question.fromPersistence(row) : null;
  }

  /**
   * Delete all questions for an assessment
   */
  async deleteByAssessmentId(assessmentId: string): Promise<void> {
    await db.delete(questions).where(eq(questions.assessmentId, assessmentId));
  }

  /**
   * Atomically replace all questions for an assessment (delete + insert in transaction)
   * This ensures no partial state if insert fails after delete
   */
  async replaceAllForAssessment(assessmentId: string, questionEntities: Question[]): Promise<Question[]> {
    return await db.transaction(async (tx: DbTransaction) => {
      // Delete existing questions within transaction
      await tx.delete(questions).where(eq(questions.assessmentId, assessmentId));

      // If no new questions, return empty array
      if (questionEntities.length === 0) {
        return [];
      }

      // Insert new questions within same transaction
      const values = questionEntities.map((q) => q.toPersistence());
      const created = await tx.insert(questions).values(values).returning();

      return created.map((row) => Question.fromPersistence(row));
    });
  }
}
