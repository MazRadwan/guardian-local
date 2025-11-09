/**
 * Question Generation E2E Tests
 *
 * Tests the complete question generation workflow:
 * 1. Create assessment
 * 2. Generate questions via API
 * 3. Verify questions in database
 * 4. Retrieve questions via API
 */

import { describe, it, expect, beforeAll, beforeEach } from '@jest/globals';
import request from 'supertest';
import { db } from '../../src/infrastructure/database/client';
import { questions } from '../../src/infrastructure/database/schema/questions';
import { assessments } from '../../src/infrastructure/database/schema/assessments';
import { vendors } from '../../src/infrastructure/database/schema/vendors';
import { users } from '../../src/infrastructure/database/schema/users';

// Note: This test requires ANTHROPIC_API_KEY to be set
// For CI/CD, mock the Claude API client

describe('Question Generation E2E Tests', () => {
  const API_BASE_URL = 'http://localhost:8000/api';
  let authToken: string;
  let testAssessmentId: string;
  let testUserId: string;
  let testVendorId: string;

  beforeAll(async () => {
    // Clean up test data
    await db.delete(questions);
    await db.delete(assessments);
    await db.delete(vendors);
    await db.delete(users);
  });

  beforeEach(async () => {
    // Create test user and get auth token
    const registerResponse = await request(API_BASE_URL).post('/auth/register').send({
      email: 'test@guardian.test',
      password: 'TestPassword123!',
      name: 'Test User',
    });

    authToken = registerResponse.body.token;
    testUserId = registerResponse.body.user.id;

    // Create test vendor
    const vendorResponse = await request(API_BASE_URL)
      .post('/vendors')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        name: 'TechFlow Solutions',
        industry: 'Healthcare',
        website: 'https://techflow.example.com',
      });

    testVendorId = vendorResponse.body.id;

    // Create test assessment
    const assessmentResponse = await request(API_BASE_URL)
      .post('/assessments')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        vendorId: testVendorId,
        assessmentType: 'comprehensive',
        solutionName: 'AI Clinical Decision Support',
        solutionType: 'Clinical AI',
      });

    testAssessmentId = assessmentResponse.body.id;
  });

  describe('POST /api/assessments/:id/generate-questions', () => {
    it('should generate questions and return success', async () => {
      const response = await request(API_BASE_URL)
        .post(`/assessments/${testAssessmentId}/generate-questions`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          vendorType: 'SaaS Provider',
          solutionType: 'Clinical Decision Support AI',
          industry: 'Healthcare',
        });

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Questions generated successfully');
      expect(response.body.assessmentId).toBe(testAssessmentId);
      expect(response.body.questionCount).toBeGreaterThanOrEqual(78);
      expect(response.body.questionCount).toBeLessThanOrEqual(126);
    }, 60000); // 60 second timeout for Claude API call

    it('should update assessment status to questions_generated', async () => {
      await request(API_BASE_URL)
        .post(`/assessments/${testAssessmentId}/generate-questions`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          vendorType: 'SaaS Provider',
          solutionType: 'Clinical Decision Support AI',
        });

      const assessmentResponse = await request(API_BASE_URL)
        .get(`/assessments/${testAssessmentId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(assessmentResponse.body.status).toBe('questions_generated');
    }, 60000);

    it('should return 400 if assessment already has questions', async () => {
      // Generate questions first time
      await request(API_BASE_URL)
        .post(`/assessments/${testAssessmentId}/generate-questions`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          vendorType: 'SaaS Provider',
          solutionType: 'Clinical AI',
        });

      // Try to generate again
      const response = await request(API_BASE_URL)
        .post(`/assessments/${testAssessmentId}/generate-questions`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          vendorType: 'SaaS Provider',
          solutionType: 'Clinical AI',
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('must be in draft status');
    }, 60000);

    it('should return 404 for non-existent assessment', async () => {
      const response = await request(API_BASE_URL)
        .post('/assessments/non-existent-id/generate-questions')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          vendorType: 'SaaS Provider',
          solutionType: 'Clinical AI',
        });

      expect(response.status).toBe(404);
    });

    it('should return 400 if required fields missing', async () => {
      const response = await request(API_BASE_URL)
        .post(`/assessments/${testAssessmentId}/generate-questions`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          vendorType: 'SaaS Provider',
          // Missing solutionType
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('solutionType');
    });
  });

  describe('GET /api/assessments/:id/questions', () => {
    beforeEach(async () => {
      // Generate questions for the test
      await request(API_BASE_URL)
        .post(`/assessments/${testAssessmentId}/generate-questions`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          vendorType: 'SaaS Provider',
          solutionType: 'Clinical AI',
        });
    }, 60000);

    it('should retrieve all questions for assessment', async () => {
      const response = await request(API_BASE_URL)
        .get(`/assessments/${testAssessmentId}/questions`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.assessmentId).toBe(testAssessmentId);
      expect(response.body.questionCount).toBeGreaterThanOrEqual(78);
      expect(response.body.questions).toBeInstanceOf(Array);
      expect(response.body.questions[0]).toHaveProperty('sectionName');
      expect(response.body.questions[0]).toHaveProperty('questionText');
      expect(response.body.questions[0]).toHaveProperty('questionType');
    });

    it('should return questions in correct order', async () => {
      const response = await request(API_BASE_URL)
        .get(`/assessments/${testAssessmentId}/questions`)
        .set('Authorization', `Bearer ${authToken}`);

      const questions = response.body.questions;

      // Verify ordering: first by section, then by question number
      for (let i = 1; i < questions.length; i++) {
        const prev = questions[i - 1];
        const curr = questions[i];

        if (prev.sectionNumber === curr.sectionNumber) {
          expect(curr.questionNumber).toBeGreaterThan(prev.questionNumber);
        } else {
          expect(curr.sectionNumber).toBeGreaterThanOrEqual(prev.sectionNumber);
        }
      }
    });

    it('should return empty array for assessment with no questions', async () => {
      // Create new assessment without questions
      const newAssessmentResponse = await request(API_BASE_URL)
        .post('/assessments')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          vendorId: testVendorId,
          assessmentType: 'quick',
          solutionName: 'Test Solution',
        });

      const response = await request(API_BASE_URL)
        .get(`/assessments/${newAssessmentResponse.body.id}/questions`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.questionCount).toBe(0);
      expect(response.body.questions).toHaveLength(0);
    });
  });
});
