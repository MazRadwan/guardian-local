/**
 * Integration tests for QuestionnaireGenerationService
 *
 * Part of Epic 12.5 Story 5.6: Integration Cleanup
 *
 * These tests verify the hybrid questionnaire generation flow with REAL dependencies:
 * - Real Drizzle repositories (DB persistence)
 * - Real services (AssessmentService, VendorService, ConversationService)
 * - Real questionnaireToMarkdown renderer
 * - ONLY Claude client is mocked (to avoid API calls)
 */

import { db } from '../../src/infrastructure/database/client';
import { users } from '../../src/infrastructure/database/schema/users';
import { vendors } from '../../src/infrastructure/database/schema/vendors';
import { conversations } from '../../src/infrastructure/database/schema/conversations';
import { assessments } from '../../src/infrastructure/database/schema/assessments';
import { questions } from '../../src/infrastructure/database/schema/questions';

import { DrizzleQuestionRepository } from '../../src/infrastructure/database/repositories/DrizzleQuestionRepository';
import { DrizzleAssessmentRepository } from '../../src/infrastructure/database/repositories/DrizzleAssessmentRepository';
import { DrizzleVendorRepository } from '../../src/infrastructure/database/repositories/DrizzleVendorRepository';
import { DrizzleConversationRepository } from '../../src/infrastructure/database/repositories/DrizzleConversationRepository';
import { DrizzleMessageRepository } from '../../src/infrastructure/database/repositories/DrizzleMessageRepository';

import { AssessmentService } from '../../src/application/services/AssessmentService';
import { VendorService } from '../../src/application/services/VendorService';
import { ConversationService } from '../../src/application/services/ConversationService';
import { QuestionnaireGenerationService } from '../../src/application/services/QuestionnaireGenerationService';

import { questionnaireToMarkdown } from '../../src/infrastructure/rendering/questionnaireToMarkdown';
import { fixtureQuestionnaireSchema } from '../fixtures/questionnaireSchema';
import { QUESTIONNAIRE_OUTPUT_TOOL_NAME } from '../../src/infrastructure/ai/tools/questionnaireOutputTool';

// Mock only Claude client (avoid real API calls)
const mockClaudeClient = {
  sendMessage: jest.fn(),
  streamMessage: jest.fn(),
};

describe('QuestionnaireGenerationService Integration', () => {
  // Real repositories
  let questionRepo: DrizzleQuestionRepository;
  let assessmentRepo: DrizzleAssessmentRepository;
  let vendorRepo: DrizzleVendorRepository;
  let conversationRepo: DrizzleConversationRepository;
  let messageRepo: DrizzleMessageRepository;

  // Real services
  let assessmentService: AssessmentService;
  let vendorService: VendorService;
  let conversationService: ConversationService;

  // Service under test
  let service: QuestionnaireGenerationService;

  // Test data IDs
  let testUserId: string;
  let testVendorId: string;
  let testConversationId: string;

  beforeAll(() => {
    // Initialize real repositories
    questionRepo = new DrizzleQuestionRepository();
    assessmentRepo = new DrizzleAssessmentRepository();
    vendorRepo = new DrizzleVendorRepository();
    conversationRepo = new DrizzleConversationRepository();
    messageRepo = new DrizzleMessageRepository();

    // Initialize real services
    conversationService = new ConversationService(conversationRepo, messageRepo);
    vendorService = new VendorService(vendorRepo);
    assessmentService = new AssessmentService(vendorRepo, assessmentRepo);

    // Initialize service under test (only Claude is mocked)
    service = new QuestionnaireGenerationService(
      mockClaudeClient as any,
      questionRepo,
      assessmentService,
      vendorService,
      conversationService
    );
  });

  beforeEach(async () => {
    jest.clearAllMocks();

    // Create test user
    const [user] = await db
      .insert(users)
      .values({
        email: `test-${Date.now()}@example.com`,
        passwordHash: 'hashed_password',
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

    // Create test conversation
    const [conversation] = await db
      .insert(conversations)
      .values({
        userId: testUserId,
        title: 'Test Conversation',
        mode: 'assessment',
        metadata: {
          vendorName: 'Test Vendor',
          solutionName: 'Test Solution',
        },
      })
      .returning();
    testConversationId = conversation.id;
  });

  afterEach(async () => {
    // Clean up in correct order (respecting foreign keys)
    // conversations FK -> assessments, so delete conversations first
    await db.delete(questions);
    await db.delete(conversations);
    await db.delete(assessments);
    await db.delete(vendors);
    await db.delete(users);
  });

  afterAll(async () => {
    // Close DB connection to prevent Jest from hanging
    await db.$client.end();
  });

  describe('end-to-end generation flow', () => {
    it('generates schema, persists questions to DB, and renders markdown', async () => {
      const expectedSchema = fixtureQuestionnaireSchema({
        assessmentType: 'comprehensive',
        vendorName: 'Test Vendor',
        solutionName: 'Test Solution',
      });

      mockClaudeClient.sendMessage.mockResolvedValue({
        content: '',
        toolUse: [
          {
            id: 'tool_1',
            name: QUESTIONNAIRE_OUTPUT_TOOL_NAME,
            input: expectedSchema,
          },
        ],
      });

      const result = await service.generate({
        conversationId: testConversationId,
        userId: testUserId,
        assessmentType: 'comprehensive',
        vendorName: 'Test Vendor',
        solutionName: 'Test Solution',
      });

      // Verify schema structure
      expect(result.schema.version).toBe('1.0');
      expect(result.schema.metadata.assessmentType).toBe('comprehensive');
      expect(result.schema.sections.length).toBeGreaterThan(0);

      // Verify assessment was created in DB
      expect(result.assessmentId).toBeDefined();
      const savedAssessment = await assessmentRepo.findById(result.assessmentId);
      expect(savedAssessment).toBeDefined();
      expect(savedAssessment?.assessmentType).toBe('comprehensive');

      // Verify questions were persisted to DB
      const savedQuestions = await questionRepo.findByAssessmentId(result.assessmentId);
      expect(savedQuestions.length).toBe(expectedSchema.metadata.questionCount);

      // Verify markdown was rendered
      expect(result.markdown).toContain('Test Vendor');
      expect(result.markdown).toContain('Privacy Risk');
    });

    it('chat content (markdown) matches schema structure', async () => {
      const expectedSchema = fixtureQuestionnaireSchema({ assessmentType: 'quick' });

      mockClaudeClient.sendMessage.mockResolvedValue({
        content: '',
        toolUse: [
          {
            id: 'tool_1',
            name: QUESTIONNAIRE_OUTPUT_TOOL_NAME,
            input: expectedSchema,
          },
        ],
      });

      const result = await service.generate({
        conversationId: testConversationId,
        userId: testUserId,
        assessmentType: 'quick',
      });

      // Count questions in schema
      const schemaQuestionCount = result.schema.sections.reduce(
        (sum, section) => sum + section.questions.length,
        0
      );

      // Count questions in markdown (numbered list items)
      const markdownQuestionMatches = result.markdown.match(/^\d+\./gm) || [];
      const markdownQuestionCount = markdownQuestionMatches.length;

      // They should match exactly
      expect(markdownQuestionCount).toBe(schemaQuestionCount);
      expect(schemaQuestionCount).toBe(result.schema.metadata.questionCount);
    });

    it('handles category_focused with focusedDimensions', async () => {
      const expectedSchema = fixtureQuestionnaireSchema({
        assessmentType: 'category_focused',
        focusedDimensions: ['privacy_risk'],
      });

      mockClaudeClient.sendMessage.mockResolvedValue({
        content: '',
        toolUse: [
          {
            id: 'tool_1',
            name: QUESTIONNAIRE_OUTPUT_TOOL_NAME,
            input: expectedSchema,
          },
        ],
      });

      const result = await service.generate({
        conversationId: testConversationId,
        userId: testUserId,
        assessmentType: 'category_focused',
        selectedCategories: ['privacy_risk'],
      });

      // Verify category_focused type
      expect(result.schema.metadata.assessmentType).toBe('category_focused');

      // Verify only focused dimensions are in schema
      expect(result.schema.sections.length).toBe(1);
      expect(result.schema.sections[0].riskDimension).toBe('privacy_risk');

      // Verify persisted correctly
      const savedQuestions = await questionRepo.findByAssessmentId(result.assessmentId);
      expect(savedQuestions.length).toBe(1);
      expect(savedQuestions[0].sectionName).toBe('Privacy Risk');
    });
  });

  describe('deterministic rendering', () => {
    it('same schema always produces identical markdown', () => {
      // Use fixed timestamp for deterministic test
      const schema = {
        ...fixtureQuestionnaireSchema(),
        metadata: {
          ...fixtureQuestionnaireSchema().metadata,
          generatedAt: '2025-01-01T00:00:00.000Z',
        },
      };

      const markdown1 = questionnaireToMarkdown(schema);
      const markdown2 = questionnaireToMarkdown(schema);
      const markdown3 = questionnaireToMarkdown(schema);

      expect(markdown1).toBe(markdown2);
      expect(markdown2).toBe(markdown3);
    });
  });

  describe('persistence verification', () => {
    it('questions in DB match schema exactly', async () => {
      const expectedSchema = fixtureQuestionnaireSchema({
        assessmentType: 'comprehensive',
      });

      mockClaudeClient.sendMessage.mockResolvedValue({
        content: '',
        toolUse: [
          {
            id: 'tool_1',
            name: QUESTIONNAIRE_OUTPUT_TOOL_NAME,
            input: expectedSchema,
          },
        ],
      });

      const result = await service.generate({
        conversationId: testConversationId,
        userId: testUserId,
        assessmentType: 'comprehensive',
      });

      // Get all questions from DB
      const savedQuestions = await questionRepo.findByAssessmentId(result.assessmentId);

      // Verify each question matches schema
      const schemaQuestions = expectedSchema.sections.flatMap((s) => s.questions);
      expect(savedQuestions.length).toBe(schemaQuestions.length);

      // Verify questions are persisted with correct text
      for (const schemaQ of schemaQuestions) {
        const dbQ = savedQuestions.find((q) => q.questionText === schemaQ.text);
        expect(dbQ).toBeDefined();
        expect(dbQ?.questionText).toBe(schemaQ.text);
      }
    });
  });
});
