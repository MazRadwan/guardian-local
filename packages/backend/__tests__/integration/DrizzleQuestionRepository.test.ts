/**
 * DrizzleQuestionRepository Integration Tests
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { DrizzleQuestionRepository } from '../../src/infrastructure/database/repositories/DrizzleQuestionRepository';
import { Question } from '../../src/domain/entities/Question';
import { db } from '../../src/infrastructure/database/client';
import { questions } from '../../src/infrastructure/database/schema/questions';
import { assessments } from '../../src/infrastructure/database/schema/assessments';
import { vendors } from '../../src/infrastructure/database/schema/vendors';
import { users } from '../../src/infrastructure/database/schema/users';
import { sql } from 'drizzle-orm';

describe('DrizzleQuestionRepository Integration Tests', () => {
  let repository: DrizzleQuestionRepository;
  let testAssessmentId: string;
  let testUserId: string;
  let testVendorId: string;

  beforeEach(async () => {
    repository = new DrizzleQuestionRepository();

    // Clean up test data - use CASCADE to handle FK constraints
    // Order: questions → assessments (CASCADE handles conversations FK)
    await db.delete(questions);
    await db.execute(sql`TRUNCATE TABLE assessments CASCADE`);
    await db.execute(sql`TRUNCATE TABLE vendors CASCADE`);
    await db.execute(sql`TRUNCATE TABLE users CASCADE`);

    // Create test user
    const [user] = await db
      .insert(users)
      .values({
        email: 'test@test.com',
        passwordHash: 'hash',
        name: 'Test User',
        role: 'analyst',
      })
      .returning();
    testUserId = user.id;

    // Create test vendor
    const [vendor] = await db
      .insert(vendors)
      .values({
        name: 'Test Vendor',
        industry: 'Healthcare',
      })
      .returning();
    testVendorId = vendor.id;

    // Create test assessment
    const [assessment] = await db
      .insert(assessments)
      .values({
        vendorId: testVendorId,
        assessmentType: 'comprehensive',
        status: 'draft',
        createdBy: testUserId,
      })
      .returning();
    testAssessmentId = assessment.id;
  });

  describe('bulkCreate', () => {
    it('should bulk insert 87 questions', async () => {
      // 87 questions spread across 10 sections (max allowed)
      // ~9 questions per section
      const questionEntities = Array.from({ length: 87 }, (_, i) =>
        Question.create({
          assessmentId: testAssessmentId,
          sectionName: `Section ${(i % 10) + 1}`,
          sectionNumber: (i % 10) + 1, // Keep within 1-10 range
          questionNumber: Math.floor(i / 10) + 1,
          questionText: `Test question ${i + 1}?`,
          questionType: 'text',
        })
      );

      const created = await repository.bulkCreate(questionEntities);

      expect(created).toHaveLength(87);
      expect(created[0].id).toBeDefined();
      expect(created[0].createdAt).toBeDefined();
    });

    it('should return empty array for empty input', async () => {
      const created = await repository.bulkCreate([]);
      expect(created).toHaveLength(0);
    });

    it('should enforce unique position constraint', async () => {
      const questionEntities = [
        Question.create({
          assessmentId: testAssessmentId,
          sectionName: 'Section 1',
          sectionNumber: 1,
          questionNumber: 1,
          questionText: 'Question 1?',
          questionType: 'text',
        }),
        Question.create({
          assessmentId: testAssessmentId,
          sectionName: 'Section 1',
          sectionNumber: 1,
          questionNumber: 1, // Duplicate position
          questionText: 'Question 2?',
          questionType: 'text',
        }),
      ];

      await expect(repository.bulkCreate(questionEntities)).rejects.toThrow();
    });
  });

  describe('findByAssessmentId', () => {
    it('should retrieve questions in correct order', async () => {
      const questionEntities = [
        Question.create({
          assessmentId: testAssessmentId,
          sectionName: 'Section 2',
          sectionNumber: 2,
          questionNumber: 1,
          questionText: 'Question 2.1?',
          questionType: 'text',
        }),
        Question.create({
          assessmentId: testAssessmentId,
          sectionName: 'Section 1',
          sectionNumber: 1,
          questionNumber: 2,
          questionText: 'Question 1.2?',
          questionType: 'text',
        }),
        Question.create({
          assessmentId: testAssessmentId,
          sectionName: 'Section 1',
          sectionNumber: 1,
          questionNumber: 1,
          questionText: 'Question 1.1?',
          questionType: 'text',
        }),
      ];

      await repository.bulkCreate(questionEntities);

      const retrieved = await repository.findByAssessmentId(testAssessmentId);

      expect(retrieved).toHaveLength(3);
      expect(retrieved[0].questionText).toBe('Question 1.1?');
      expect(retrieved[1].questionText).toBe('Question 1.2?');
      expect(retrieved[2].questionText).toBe('Question 2.1?');
    });

    it('should return empty array for non-existent assessment', async () => {
      const retrieved = await repository.findByAssessmentId('00000000-0000-0000-0000-000000000000');
      expect(retrieved).toHaveLength(0);
    });
  });

  describe('findById', () => {
    it('should find question by ID', async () => {
      const questionEntities = [
        Question.create({
          assessmentId: testAssessmentId,
          sectionName: 'Section 1',
          sectionNumber: 1,
          questionNumber: 1,
          questionText: 'Test question?',
          questionType: 'text',
        }),
      ];

      const [created] = await repository.bulkCreate(questionEntities);

      const found = await repository.findById(created.id!);

      expect(found).not.toBeNull();
      expect(found!.questionText).toBe('Test question?');
    });

    it('should return null for non-existent ID', async () => {
      const found = await repository.findById('00000000-0000-0000-0000-000000000000');
      expect(found).toBeNull();
    });
  });

  describe('deleteByAssessmentId', () => {
    it('should delete all questions for assessment', async () => {
      const questionEntities = Array.from({ length: 10 }, (_, i) =>
        Question.create({
          assessmentId: testAssessmentId,
          sectionName: 'Section 1',
          sectionNumber: 1,
          questionNumber: i + 1,
          questionText: `Question ${i + 1}?`,
          questionType: 'text',
        })
      );

      await repository.bulkCreate(questionEntities);

      await repository.deleteByAssessmentId(testAssessmentId);

      const retrieved = await repository.findByAssessmentId(testAssessmentId);
      expect(retrieved).toHaveLength(0);
    });
  });
});
