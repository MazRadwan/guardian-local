/**
 * Unit tests for ChatServer mode-specific behavior (Epic 18 Sprint 3)
 *
 * Story 18.3.2: Assessment mode - background enrichment after immediate response
 * Story 18.3.3: Scoring mode - trigger-on-send with progress events
 */

import type { ParseStatus, FileRecord, FileWithExcerpt } from '../../src/application/interfaces/IFileRepository.js';
import type { IntakeDocumentContext } from '../../src/domain/entities/Conversation.js';
import type { ScoringProgressEvent } from '../../src/domain/scoring/types.js';

/**
 * Mock MIME_TYPE_MAP (matches ChatServer implementation)
 */
const MIME_TYPE_MAP: Record<string, string> = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'image/png': 'image',
  'image/jpeg': 'image',
  'image/webp': 'image',
};

/**
 * Simulate enrichInBackground logic for testing
 *
 * This function mirrors the ChatServer.enrichInBackground() method
 * for unit testing the business logic without infrastructure dependencies.
 */
async function enrichInBackground(
  fileIds: string[],
  fileRepository: {
    tryStartParsing: (id: string) => Promise<boolean>;
    findById: (id: string) => Promise<FileRecord | null>;
    updateIntakeContext: (id: string, context: IntakeDocumentContext, gaps?: string[]) => Promise<void>;
    updateParseStatus: (id: string, status: ParseStatus) => Promise<void>;
  },
  fileStorage: {
    retrieve: (path: string) => Promise<Buffer>;
  },
  intakeParser: {
    parseForContext: (buffer: Buffer, metadata: unknown) => Promise<{
      success: boolean;
      error?: string;
      context?: IntakeDocumentContext;
      gapCategories?: string[];
    }>;
  }
): Promise<{ processed: string[]; skipped: string[]; failed: string[] }> {
  const results = { processed: [] as string[], skipped: [] as string[], failed: [] as string[] };

  for (const fileId of fileIds) {
    try {
      // Idempotency check
      const started = await fileRepository.tryStartParsing(fileId);
      if (!started) {
        results.skipped.push(fileId);
        continue;
      }

      // Get file record
      const file = await fileRepository.findById(fileId);
      if (!file) {
        results.failed.push(fileId);
        await fileRepository.updateParseStatus(fileId, 'failed');
        continue;
      }

      // Check MIME type
      const documentType = MIME_TYPE_MAP[file.mimeType];
      if (!documentType) {
        results.failed.push(fileId);
        await fileRepository.updateParseStatus(fileId, 'failed');
        continue;
      }

      // Retrieve and parse
      const buffer = await fileStorage.retrieve(file.storagePath);
      const result = await intakeParser.parseForContext(buffer, {
        filename: file.filename,
        mimeType: file.mimeType,
        documentType,
      });

      if (result.success && result.context) {
        await fileRepository.updateIntakeContext(fileId, result.context, result.gapCategories);
        await fileRepository.updateParseStatus(fileId, 'completed');
        results.processed.push(fileId);
      } else {
        results.failed.push(fileId);
        await fileRepository.updateParseStatus(fileId, 'failed');
      }
    } catch (err) {
      results.failed.push(fileId);
      try {
        await fileRepository.updateParseStatus(fileId, 'failed');
      } catch {}
    }
  }

  return results;
}

/**
 * Simulate triggerScoringOnSend logic for testing
 */
async function triggerScoringOnSend(
  fileIds: string[],
  conversationId: string,
  userId: string,
  fileRepository: {
    findById: (id: string) => Promise<FileRecord | null>;
    tryStartParsing: (id: string) => Promise<boolean>;
    updateParseStatus: (id: string, status: ParseStatus) => Promise<void>;
  },
  conversationService: {
    getConversation: (id: string) => Promise<{ assessmentId?: string | null } | null>;
    sendMessage: (msg: unknown) => Promise<{ id: string }>;
  },
  scoringService: {
    score: (
      input: { assessmentId: string; conversationId: string; fileId: string; userId: string },
      onProgress: (event: ScoringProgressEvent) => void
    ) => Promise<{
      success: boolean;
      batchId: string;
      error?: string;
      code?: string;
      report?: {
        payload: {
          compositeScore: number;
          recommendation: string;
          overallRiskRating: string;
          executiveSummary: string;
          keyFindings: string[];
          dimensionScores: Array<{ dimension: string; score: number; riskRating: string }>;
        };
        narrativeReport: string;
      };
    }>;
  },
  emittedEvents: Array<{ event: string; data: unknown }>
): Promise<{ processed: string[]; skipped: string[]; failed: string[] }> {
  const results = { processed: [] as string[], skipped: [] as string[], failed: [] as string[] };

  for (const fileId of fileIds) {
    try {
      // Get file record
      const file = await fileRepository.findById(fileId);
      if (!file) {
        results.failed.push(fileId);
        continue;
      }

      // Check if already completed
      if (file.parseStatus === 'completed') {
        results.skipped.push(fileId);
        continue;
      }

      // Idempotency check
      const started = await fileRepository.tryStartParsing(fileId);
      if (!started) {
        results.skipped.push(fileId);
        emittedEvents.push({
          event: 'scoring_progress',
          data: { conversationId, status: 'parsing', message: 'Document is already being processed...' },
        });
        continue;
      }

      // Emit initial progress
      emittedEvents.push({
        event: 'scoring_progress',
        data: { conversationId, status: 'parsing', progress: 10, message: 'Analyzing questionnaire responses...' },
      });

      // Get conversation for assessmentId
      const conversation = await conversationService.getConversation(conversationId);
      if (!conversation || !conversation.assessmentId) {
        emittedEvents.push({
          event: 'scoring_error',
          data: { conversationId, error: 'No assessment linked to this conversation.', code: 'NO_ASSESSMENT' },
        });
        await fileRepository.updateParseStatus(fileId, 'failed');
        results.failed.push(fileId);
        continue;
      }

      const assessmentId = conversation.assessmentId;

      // Emit scoring started
      emittedEvents.push({
        event: 'scoring_started',
        data: { assessmentId, fileId, conversationId },
      });

      // Run scoring
      const scoringResult = await scoringService.score(
        { assessmentId, conversationId, fileId, userId },
        (event) => {
          emittedEvents.push({ event: 'scoring_progress', data: { conversationId, ...event } });
        }
      );

      if (scoringResult.success && scoringResult.report) {
        await fileRepository.updateParseStatus(fileId, 'completed');
        emittedEvents.push({
          event: 'scoring_complete',
          data: { conversationId, result: scoringResult.report.payload, narrativeReport: scoringResult.report.narrativeReport },
        });
        results.processed.push(fileId);
      } else {
        await fileRepository.updateParseStatus(fileId, 'failed');
        emittedEvents.push({
          event: 'scoring_error',
          data: { conversationId, error: scoringResult.error, code: scoringResult.code },
        });
        results.failed.push(fileId);
      }
    } catch (err) {
      try {
        await fileRepository.updateParseStatus(fileId, 'failed');
      } catch {}
      results.failed.push(fileId);
    }
  }

  return results;
}

describe('ChatServer Mode-Specific Behavior (Epic 18 Sprint 3)', () => {
  // =========================================================================
  // Story 18.3.2: Assessment Mode - Background Enrichment
  // =========================================================================

  describe('Story 18.3.2: Assessment Mode Background Enrichment', () => {
    const createMockFile = (
      id: string,
      parseStatus: ParseStatus = 'pending',
      mimeType: string = 'application/pdf'
    ): FileRecord => ({
      id,
      userId: 'user-1',
      conversationId: 'conv-1',
      filename: `${id}.pdf`,
      mimeType,
      size: 1000,
      storagePath: `uploads/${id}.pdf`,
      createdAt: new Date(),
      textExcerpt: 'Sample text excerpt',
      parseStatus,
      // Epic 18.4: Document classification fields
      detectedDocType: null,
      detectedVendorName: null,
    });

    const createMockIntakeContext = (): IntakeDocumentContext => ({
      vendorName: 'Acme Corp',
      solutionName: 'AI Platform',
      solutionType: 'SaaS',
      industry: 'Healthcare',
      features: ['Feature A', 'Feature B'],
      claims: ['99.9% uptime'],
      complianceMentions: ['HIPAA', 'SOC 2'],
    });

    describe('idempotency via tryStartParsing', () => {
      it('should skip files where tryStartParsing returns false', async () => {
        const fileRepository = {
          tryStartParsing: jest.fn().mockResolvedValue(false),
          findById: jest.fn(),
          updateIntakeContext: jest.fn(),
          updateParseStatus: jest.fn(),
        };
        const fileStorage = { retrieve: jest.fn() };
        const intakeParser = { parseForContext: jest.fn() };

        const results = await enrichInBackground(
          ['file-1', 'file-2'],
          fileRepository,
          fileStorage,
          intakeParser
        );

        expect(results.skipped).toEqual(['file-1', 'file-2']);
        expect(results.processed).toEqual([]);
        expect(fileRepository.findById).not.toHaveBeenCalled();
      });

      it('should process files where tryStartParsing returns true', async () => {
        const file = createMockFile('file-1');
        const context = createMockIntakeContext();

        const fileRepository = {
          tryStartParsing: jest.fn().mockResolvedValue(true),
          findById: jest.fn().mockResolvedValue(file),
          updateIntakeContext: jest.fn().mockResolvedValue(undefined),
          updateParseStatus: jest.fn().mockResolvedValue(undefined),
        };
        const fileStorage = {
          retrieve: jest.fn().mockResolvedValue(Buffer.from('PDF content')),
        };
        const intakeParser = {
          parseForContext: jest.fn().mockResolvedValue({
            success: true,
            context,
            gapCategories: ['privacy'],
          }),
        };

        const results = await enrichInBackground(
          ['file-1'],
          fileRepository,
          fileStorage,
          intakeParser
        );

        expect(results.processed).toEqual(['file-1']);
        expect(fileRepository.updateIntakeContext).toHaveBeenCalledWith('file-1', context, ['privacy']);
        expect(fileRepository.updateParseStatus).toHaveBeenCalledWith('file-1', 'completed');
      });
    });

    describe('error handling', () => {
      it('should mark file as failed when file not found', async () => {
        const fileRepository = {
          tryStartParsing: jest.fn().mockResolvedValue(true),
          findById: jest.fn().mockResolvedValue(null),
          updateIntakeContext: jest.fn(),
          updateParseStatus: jest.fn().mockResolvedValue(undefined),
        };
        const fileStorage = { retrieve: jest.fn() };
        const intakeParser = { parseForContext: jest.fn() };

        const results = await enrichInBackground(
          ['file-1'],
          fileRepository,
          fileStorage,
          intakeParser
        );

        expect(results.failed).toEqual(['file-1']);
        expect(fileRepository.updateParseStatus).toHaveBeenCalledWith('file-1', 'failed');
      });

      it('should mark file as failed for unsupported MIME type', async () => {
        const file = createMockFile('file-1', 'pending', 'text/plain');

        const fileRepository = {
          tryStartParsing: jest.fn().mockResolvedValue(true),
          findById: jest.fn().mockResolvedValue(file),
          updateIntakeContext: jest.fn(),
          updateParseStatus: jest.fn().mockResolvedValue(undefined),
        };
        const fileStorage = { retrieve: jest.fn() };
        const intakeParser = { parseForContext: jest.fn() };

        const results = await enrichInBackground(
          ['file-1'],
          fileRepository,
          fileStorage,
          intakeParser
        );

        expect(results.failed).toEqual(['file-1']);
        expect(fileRepository.updateParseStatus).toHaveBeenCalledWith('file-1', 'failed');
      });

      it('should mark file as failed when parsing fails', async () => {
        const file = createMockFile('file-1');

        const fileRepository = {
          tryStartParsing: jest.fn().mockResolvedValue(true),
          findById: jest.fn().mockResolvedValue(file),
          updateIntakeContext: jest.fn(),
          updateParseStatus: jest.fn().mockResolvedValue(undefined),
        };
        const fileStorage = {
          retrieve: jest.fn().mockResolvedValue(Buffer.from('content')),
        };
        const intakeParser = {
          parseForContext: jest.fn().mockResolvedValue({
            success: false,
            error: 'Parse failed',
          }),
        };

        const results = await enrichInBackground(
          ['file-1'],
          fileRepository,
          fileStorage,
          intakeParser
        );

        expect(results.failed).toEqual(['file-1']);
        expect(fileRepository.updateParseStatus).toHaveBeenCalledWith('file-1', 'failed');
      });

      it('should continue processing other files after error', async () => {
        const file1 = createMockFile('file-1');
        const file2 = createMockFile('file-2');
        const context = createMockIntakeContext();

        const fileRepository = {
          tryStartParsing: jest.fn().mockResolvedValue(true),
          findById: jest.fn()
            .mockResolvedValueOnce(null) // file-1 not found
            .mockResolvedValueOnce(file2), // file-2 found
          updateIntakeContext: jest.fn().mockResolvedValue(undefined),
          updateParseStatus: jest.fn().mockResolvedValue(undefined),
        };
        const fileStorage = {
          retrieve: jest.fn().mockResolvedValue(Buffer.from('content')),
        };
        const intakeParser = {
          parseForContext: jest.fn().mockResolvedValue({
            success: true,
            context,
          }),
        };

        const results = await enrichInBackground(
          ['file-1', 'file-2'],
          fileRepository,
          fileStorage,
          intakeParser
        );

        expect(results.failed).toEqual(['file-1']);
        expect(results.processed).toEqual(['file-2']);
      });
    });
  });

  // =========================================================================
  // Story 18.3.3: Scoring Mode - Trigger on Send
  // =========================================================================

  describe('Story 18.3.3: Scoring Mode Trigger on Send', () => {
    const createMockFile = (
      id: string,
      parseStatus: ParseStatus = 'pending'
    ): FileRecord => ({
      id,
      userId: 'user-1',
      conversationId: 'conv-1',
      filename: `${id}.pdf`,
      mimeType: 'application/pdf',
      size: 1000,
      storagePath: `uploads/${id}.pdf`,
      createdAt: new Date(),
      textExcerpt: null,
      parseStatus,
      // Epic 18.4: Document classification fields
      detectedDocType: null,
      detectedVendorName: null,
    });

    describe('idempotency checks', () => {
      it('should skip files already completed', async () => {
        const file = createMockFile('file-1', 'completed');
        const emittedEvents: Array<{ event: string; data: unknown }> = [];

        const fileRepository = {
          findById: jest.fn().mockResolvedValue(file),
          tryStartParsing: jest.fn(),
          updateParseStatus: jest.fn(),
        };
        const conversationService = {
          getConversation: jest.fn(),
          sendMessage: jest.fn(),
        };
        const scoringService = { score: jest.fn() };

        const results = await triggerScoringOnSend(
          ['file-1'],
          'conv-1',
          'user-1',
          fileRepository,
          conversationService,
          scoringService,
          emittedEvents
        );

        expect(results.skipped).toEqual(['file-1']);
        expect(fileRepository.tryStartParsing).not.toHaveBeenCalled();
      });

      it('should skip files where tryStartParsing returns false', async () => {
        const file = createMockFile('file-1', 'in_progress');
        const emittedEvents: Array<{ event: string; data: unknown }> = [];

        const fileRepository = {
          findById: jest.fn().mockResolvedValue(file),
          tryStartParsing: jest.fn().mockResolvedValue(false),
          updateParseStatus: jest.fn(),
        };
        const conversationService = {
          getConversation: jest.fn(),
          sendMessage: jest.fn(),
        };
        const scoringService = { score: jest.fn() };

        const results = await triggerScoringOnSend(
          ['file-1'],
          'conv-1',
          'user-1',
          fileRepository,
          conversationService,
          scoringService,
          emittedEvents
        );

        expect(results.skipped).toEqual(['file-1']);
        expect(emittedEvents).toContainEqual({
          event: 'scoring_progress',
          data: expect.objectContaining({ message: 'Document is already being processed...' }),
        });
      });
    });

    describe('progress events', () => {
      it('should emit scoring_progress events during scoring', async () => {
        const file = createMockFile('file-1');
        const emittedEvents: Array<{ event: string; data: unknown }> = [];

        const fileRepository = {
          findById: jest.fn().mockResolvedValue(file),
          tryStartParsing: jest.fn().mockResolvedValue(true),
          updateParseStatus: jest.fn().mockResolvedValue(undefined),
        };
        const conversationService = {
          getConversation: jest.fn().mockResolvedValue({ assessmentId: 'assess-1' }),
          sendMessage: jest.fn().mockResolvedValue({ id: 'msg-1' }),
        };
        const scoringService = {
          score: jest.fn().mockImplementation(async (_input, onProgress) => {
            onProgress({ status: 'parsing', message: 'Parsing...' });
            onProgress({ status: 'scoring', message: 'Scoring...' });
            return {
              success: true,
              batchId: 'batch-1',
              report: {
                payload: {
                  compositeScore: 75,
                  recommendation: 'approve',
                  overallRiskRating: 'medium',
                  executiveSummary: 'Good',
                  keyFindings: ['Finding 1'],
                  dimensionScores: [{ dimension: 'data_privacy', score: 80, riskRating: 'low' }],
                },
                narrativeReport: 'Risk analysis complete.',
              },
            };
          }),
        };

        await triggerScoringOnSend(
          ['file-1'],
          'conv-1',
          'user-1',
          fileRepository,
          conversationService,
          scoringService,
          emittedEvents
        );

        // Should have: initial progress, scoring_started, parsing progress, scoring progress, scoring_complete
        const progressEvents = emittedEvents.filter(e => e.event === 'scoring_progress');
        expect(progressEvents.length).toBeGreaterThanOrEqual(3);

        expect(emittedEvents).toContainEqual({
          event: 'scoring_started',
          data: { assessmentId: 'assess-1', fileId: 'file-1', conversationId: 'conv-1' },
        });

        expect(emittedEvents).toContainEqual({
          event: 'scoring_complete',
          data: expect.objectContaining({
            conversationId: 'conv-1',
            narrativeReport: 'Risk analysis complete.',
          }),
        });
      });
    });

    describe('error handling', () => {
      it('should emit scoring_error when no assessment linked', async () => {
        const file = createMockFile('file-1');
        const emittedEvents: Array<{ event: string; data: unknown }> = [];

        const fileRepository = {
          findById: jest.fn().mockResolvedValue(file),
          tryStartParsing: jest.fn().mockResolvedValue(true),
          updateParseStatus: jest.fn().mockResolvedValue(undefined),
        };
        const conversationService = {
          getConversation: jest.fn().mockResolvedValue({ assessmentId: null }),
          sendMessage: jest.fn(),
        };
        const scoringService = { score: jest.fn() };

        const results = await triggerScoringOnSend(
          ['file-1'],
          'conv-1',
          'user-1',
          fileRepository,
          conversationService,
          scoringService,
          emittedEvents
        );

        expect(results.failed).toEqual(['file-1']);
        expect(emittedEvents).toContainEqual({
          event: 'scoring_error',
          data: expect.objectContaining({ code: 'NO_ASSESSMENT' }),
        });
        expect(fileRepository.updateParseStatus).toHaveBeenCalledWith('file-1', 'failed');
      });

      it('should emit scoring_error when scoring fails', async () => {
        const file = createMockFile('file-1');
        const emittedEvents: Array<{ event: string; data: unknown }> = [];

        const fileRepository = {
          findById: jest.fn().mockResolvedValue(file),
          tryStartParsing: jest.fn().mockResolvedValue(true),
          updateParseStatus: jest.fn().mockResolvedValue(undefined),
        };
        const conversationService = {
          getConversation: jest.fn().mockResolvedValue({ assessmentId: 'assess-1' }),
          sendMessage: jest.fn().mockResolvedValue({ id: 'msg-1' }),
        };
        const scoringService = {
          score: jest.fn().mockResolvedValue({
            success: false,
            batchId: 'batch-1',
            error: 'Scoring validation failed',
            code: 'VALIDATION_FAILED',
          }),
        };

        const results = await triggerScoringOnSend(
          ['file-1'],
          'conv-1',
          'user-1',
          fileRepository,
          conversationService,
          scoringService,
          emittedEvents
        );

        expect(results.failed).toEqual(['file-1']);
        expect(emittedEvents).toContainEqual({
          event: 'scoring_error',
          data: expect.objectContaining({
            conversationId: 'conv-1',
            error: 'Scoring validation failed',
            code: 'VALIDATION_FAILED',
          }),
        });
      });
    });

    describe('successful scoring', () => {
      it('should emit scoring_complete with results and mark file completed', async () => {
        const file = createMockFile('file-1');
        const emittedEvents: Array<{ event: string; data: unknown }> = [];

        const fileRepository = {
          findById: jest.fn().mockResolvedValue(file),
          tryStartParsing: jest.fn().mockResolvedValue(true),
          updateParseStatus: jest.fn().mockResolvedValue(undefined),
        };
        const conversationService = {
          getConversation: jest.fn().mockResolvedValue({ assessmentId: 'assess-1' }),
          sendMessage: jest.fn().mockResolvedValue({ id: 'msg-1' }),
        };
        const scoringService = {
          score: jest.fn().mockResolvedValue({
            success: true,
            batchId: 'batch-1',
            report: {
              payload: {
                compositeScore: 82,
                recommendation: 'approve',
                overallRiskRating: 'low',
                executiveSummary: 'Excellent compliance',
                keyFindings: ['Strong security posture'],
                dimensionScores: [
                  { dimension: 'data_privacy', score: 85, riskRating: 'low' },
                  { dimension: 'security', score: 80, riskRating: 'low' },
                ],
              },
              narrativeReport: 'The vendor demonstrates excellent compliance...',
            },
          }),
        };

        const results = await triggerScoringOnSend(
          ['file-1'],
          'conv-1',
          'user-1',
          fileRepository,
          conversationService,
          scoringService,
          emittedEvents
        );

        expect(results.processed).toEqual(['file-1']);
        expect(fileRepository.updateParseStatus).toHaveBeenCalledWith('file-1', 'completed');

        const completeEvent = emittedEvents.find(e => e.event === 'scoring_complete');
        expect(completeEvent).toBeDefined();
        expect(completeEvent?.data).toMatchObject({
          conversationId: 'conv-1',
          narrativeReport: expect.stringContaining('excellent compliance'),
        });
      });
    });
  });
});
