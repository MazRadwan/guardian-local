/**
 * Unit Tests for ScoringHandler
 *
 * Story 28.7.1: Extract ScoringHandler.ts (triggerScoringOnSend)
 * Story 28.7.2: Extract ScoringHandler.ts (buildScoringFollowUpContext)
 *
 * Tests cover:
 * 1. Emit scoring_started and scoring_progress with fileId
 * 2. Emit scoring_error with SERVICE_UNAVAILABLE when scoringService missing
 * 3. Emit scoring_error with SERVICE_UNAVAILABLE when fileStorage missing
 * 4. Short-circuit with NOT_A_QUESTIONNAIRE for document type
 * 5. Skip file if tryStartParsing returns false (idempotency)
 * 6. Request vendor clarification for multiple vendors
 * 7. Emit scoring_complete with batchId and assessmentId
 * 8. Persist narrative message and emit message event
 * 9. Call linkAssessment (non-fatal on failure)
 * 10. Stream follow-up response when userQuery provided
 * 11. Format composite score and risk rating (28.7.2)
 * 12. Format dimension scores with /10 scale (28.7.2)
 * 13. Format key findings as bullet points (28.7.2)
 * 14. Include executive summary (28.7.2)
 */

import {
  ScoringHandler,
  type PendingVendorClarification,
  type BuildConversationContext,
} from '../../../../../src/infrastructure/websocket/handlers/ScoringHandler.js';
import type { IAuthenticatedSocket } from '../../../../../src/infrastructure/websocket/ChatContext.js';
import type { IScoringService, ScoringInput, ScoringOutput } from '../../../../../src/application/interfaces/IScoringService.js';
import type { IFileRepository, FileRecord } from '../../../../../src/application/interfaces/IFileRepository.js';
import type { IFileStorage } from '../../../../../src/application/interfaces/IFileStorage.js';
import type { IClaudeClient, ClaudeMessage, StreamChunk } from '../../../../../src/application/interfaces/IClaudeClient.js';
import type { ConversationService } from '../../../../../src/application/services/ConversationService.js';
import type { VendorValidationService, VendorValidationResult } from '../../../../../src/application/services/VendorValidationService.js';
import type { ScoringReportData, ScoringProgressEvent, DimensionScoreData } from '../../../../../src/domain/scoring/types.js';
import type { Message } from '../../../../../src/domain/entities/Message.js';
import type { RiskDimension } from '../../../../../src/domain/types/QuestionnaireSchema.js';

/**
 * Create a mock scoring service
 */
const createMockScoringService = (): jest.Mocked<IScoringService> => ({
  score: jest.fn(),
  abort: jest.fn(),
  getResultForConversation: jest.fn(),
});

/**
 * Create a mock file repository
 */
const createMockFileRepository = (): jest.Mocked<IFileRepository> => ({
  create: jest.fn(),
  findById: jest.fn(),
  findByIds: jest.fn(),
  findByIdAndUser: jest.fn(),
  findByIdAndConversation: jest.fn(),
  updateIntakeContext: jest.fn(),
  findByConversationWithContext: jest.fn(),
  updateTextExcerpt: jest.fn(),
  updateExcerptAndClassification: jest.fn(),
  updateParseStatus: jest.fn(),
  tryStartParsing: jest.fn(),
  findByConversationWithExcerpt: jest.fn(),
  deleteByConversationId: jest.fn(),
});

/**
 * Create a mock file storage
 */
const createMockFileStorage = (): jest.Mocked<IFileStorage> => ({
  store: jest.fn(),
  retrieve: jest.fn(),
  delete: jest.fn(),
  exists: jest.fn(),
});

/**
 * Create a mock conversation service
 */
const createMockConversationService = (): jest.Mocked<ConversationService> => ({
  getConversation: jest.fn(),
  createConversation: jest.fn(),
  getUserConversations: jest.fn(),
  switchMode: jest.fn(),
  linkAssessment: jest.fn(),
  sendMessage: jest.fn(),
  getHistory: jest.fn(),
  completeConversation: jest.fn(),
  deleteConversation: jest.fn(),
  updateContext: jest.fn(),
  getConversationTitle: jest.fn(),
  getFirstUserMessage: jest.fn(),
  getFirstAssistantMessage: jest.fn(),
  getMessageCount: jest.fn(),
  updateTitle: jest.fn(),
  updateTitleIfNotManuallyEdited: jest.fn(),
} as unknown as jest.Mocked<ConversationService>);

/**
 * Create a mock Claude client
 */
const createMockClaudeClient = (): jest.Mocked<IClaudeClient> => ({
  sendMessage: jest.fn(),
  streamMessage: jest.fn(),
  continueWithToolResult: jest.fn(),
});

/**
 * Create a mock vendor validation service
 */
const createMockVendorValidationService = (): jest.Mocked<VendorValidationService> => ({
  validateSingleVendor: jest.fn(),
} as unknown as jest.Mocked<VendorValidationService>);

/**
 * Create a mock authenticated socket
 */
const createMockSocket = (userId?: string): jest.Mocked<IAuthenticatedSocket> => ({
  id: 'socket-123',
  userId,
  userEmail: userId ? 'test@example.com' : undefined,
  userRole: userId ? 'analyst' : undefined,
  conversationId: undefined,
  data: {},
  handshake: {
    auth: {},
  },
  emit: jest.fn(),
  join: jest.fn(),
} as unknown as jest.Mocked<IAuthenticatedSocket>);

/**
 * Create a mock file record
 */
const createMockFile = (overrides?: Partial<FileRecord>): FileRecord => ({
  id: 'file-1',
  userId: 'user-123',
  conversationId: 'conv-1',
  filename: 'questionnaire.pdf',
  mimeType: 'application/pdf',
  size: 1024,
  storagePath: 'files/user-123/file-1.pdf',
  createdAt: new Date('2025-01-15T10:00:00Z'),
  textExcerpt: null,
  parseStatus: 'pending',
  detectedDocType: 'questionnaire',
  detectedVendorName: 'Acme Corp',
  ...overrides,
});

/**
 * Create a mock scoring report
 */
const createMockReport = (overrides?: Partial<ScoringReportData>): ScoringReportData => ({
  assessmentId: 'assess-456',
  batchId: 'batch-123',
  payload: {
    compositeScore: 72,
    recommendation: 'conditional',
    overallRiskRating: 'medium',
    executiveSummary: 'Summary text',
    keyFindings: ['Finding 1', 'Finding 2'],
    disqualifyingFactors: [],
    dimensionScores: [
      { dimension: 'security_risk' as RiskDimension, score: 8, riskRating: 'low' },
      { dimension: 'privacy_risk' as RiskDimension, score: 6, riskRating: 'medium' },
    ] as DimensionScoreData[],
  },
  narrativeReport: 'Test narrative report text',
  rubricVersion: '1.0',
  modelId: 'claude-3-sonnet',
  scoringDurationMs: 5000,
  ...overrides,
});

/**
 * Create a mock message
 */
const createMockMessage = (conversationId: string, text: string): Message => ({
  id: 'msg-123',
  conversationId,
  role: 'assistant',
  content: { text },
  createdAt: new Date('2025-01-15T12:00:00Z'),
} as Message);

describe('ScoringHandler', () => {
  let handler: ScoringHandler;
  let mockScoringService: jest.Mocked<IScoringService>;
  let mockFileRepository: jest.Mocked<IFileRepository>;
  let mockFileStorage: jest.Mocked<IFileStorage>;
  let mockConversationService: jest.Mocked<ConversationService>;
  let mockClaudeClient: jest.Mocked<IClaudeClient>;
  let mockVendorValidationService: jest.Mocked<VendorValidationService>;
  let mockSocket: jest.Mocked<IAuthenticatedSocket>;

  beforeEach(() => {
    mockScoringService = createMockScoringService();
    mockFileRepository = createMockFileRepository();
    mockFileStorage = createMockFileStorage();
    mockConversationService = createMockConversationService();
    mockClaudeClient = createMockClaudeClient();
    mockVendorValidationService = createMockVendorValidationService();
    mockSocket = createMockSocket('user-123');

    handler = new ScoringHandler(
      mockScoringService,
      mockFileRepository,
      mockFileStorage,
      mockConversationService,
      mockClaudeClient,
      mockVendorValidationService
    );

    // Suppress console output during tests
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('triggerScoringOnSend', () => {
    describe('dependency gate', () => {
      it('should emit scoring_error with SERVICE_UNAVAILABLE when scoringService missing', async () => {
        const handlerNoService = new ScoringHandler(
          undefined, // scoringService missing
          mockFileRepository,
          mockFileStorage,
          mockConversationService,
          mockClaudeClient
        );

        await handlerNoService.triggerScoringOnSend(
          mockSocket,
          'conv-1',
          'user-123',
          ['file-1']
        );

        expect(mockSocket.emit).toHaveBeenCalledWith('scoring_error', {
          conversationId: 'conv-1',
          error: 'Scoring is not available',
          code: 'SERVICE_UNAVAILABLE',
        });
      });

      it('should emit scoring_error with SERVICE_UNAVAILABLE when fileStorage missing', async () => {
        const handlerNoStorage = new ScoringHandler(
          mockScoringService,
          mockFileRepository,
          undefined, // fileStorage missing
          mockConversationService,
          mockClaudeClient
        );

        await handlerNoStorage.triggerScoringOnSend(
          mockSocket,
          'conv-1',
          'user-123',
          ['file-1']
        );

        expect(mockSocket.emit).toHaveBeenCalledWith('scoring_error', {
          conversationId: 'conv-1',
          error: 'Scoring is not available',
          code: 'SERVICE_UNAVAILABLE',
        });
      });

      it('should emit scoring_error when both dependencies missing', async () => {
        const handlerNoDeps = new ScoringHandler(
          undefined,
          mockFileRepository,
          undefined,
          mockConversationService,
          mockClaudeClient
        );

        await handlerNoDeps.triggerScoringOnSend(
          mockSocket,
          'conv-1',
          'user-123',
          ['file-1']
        );

        expect(mockSocket.emit).toHaveBeenCalledWith('scoring_error', {
          conversationId: 'conv-1',
          error: 'Scoring is not available',
          code: 'SERVICE_UNAVAILABLE',
        });
      });

      it('should log warning when dependencies missing', async () => {
        const consoleSpy = jest.spyOn(console, 'warn');
        const handlerNoDeps = new ScoringHandler(
          undefined,
          mockFileRepository,
          undefined,
          mockConversationService,
          mockClaudeClient
        );

        await handlerNoDeps.triggerScoringOnSend(
          mockSocket,
          'conv-1',
          'user-123',
          ['file-1']
        );

        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining('Scoring service or file storage not configured')
        );
      });
    });

    describe('vendor clarification', () => {
      it('should request vendor clarification for multiple vendors', async () => {
        mockVendorValidationService.validateSingleVendor.mockResolvedValue({
          valid: false,
          vendors: [
            { name: 'Vendor A', fileCount: 1, fileIds: ['f1'] },
            { name: 'Vendor B', fileCount: 1, fileIds: ['f2'] },
          ],
        });

        await handler.triggerScoringOnSend(
          mockSocket,
          'conv-1',
          'user-123',
          ['f1', 'f2']
        );

        expect(mockSocket.emit).toHaveBeenCalledWith('vendor_clarification_needed', expect.objectContaining({
          conversationId: 'conv-1',
          vendors: expect.arrayContaining([
            expect.objectContaining({ name: 'Vendor A' }),
            expect.objectContaining({ name: 'Vendor B' }),
          ]),
        }));
      });

      it('should store pending clarification in socket.data', async () => {
        mockVendorValidationService.validateSingleVendor.mockResolvedValue({
          valid: false,
          vendors: [
            { name: 'Vendor A', fileCount: 1, fileIds: ['f1'] },
            { name: 'Vendor B', fileCount: 1, fileIds: ['f2'] },
          ],
        });

        await handler.triggerScoringOnSend(
          mockSocket,
          'conv-1',
          'user-123',
          ['f1', 'f2'],
          'user query'
        );

        const pendingMap = mockSocket.data.pendingVendorClarifications as Map<string, PendingVendorClarification>;
        expect(pendingMap).toBeDefined();
        expect(pendingMap.get('conv-1')).toEqual({
          conversationId: 'conv-1',
          userId: 'user-123',
          fileIds: ['f1', 'f2'],
          userQuery: 'user query',
          vendors: expect.any(Array),
        });
      });

      it('should not proceed to scoring when vendor clarification needed', async () => {
        mockVendorValidationService.validateSingleVendor.mockResolvedValue({
          valid: false,
          vendors: [
            { name: 'Vendor A', fileCount: 1, fileIds: ['f1'] },
          ],
        });

        await handler.triggerScoringOnSend(
          mockSocket,
          'conv-1',
          'user-123',
          ['f1', 'f2']
        );

        expect(mockFileRepository.findById).not.toHaveBeenCalled();
        expect(mockScoringService.score).not.toHaveBeenCalled();
      });

      it('should proceed to scoring when single vendor is valid', async () => {
        mockVendorValidationService.validateSingleVendor.mockResolvedValue({
          valid: true,
          vendorName: 'Acme Corp',
        });
        mockFileRepository.findById.mockResolvedValue(createMockFile());
        mockFileRepository.tryStartParsing.mockResolvedValue(true);
        mockScoringService.score.mockResolvedValue({
          success: true,
          batchId: 'batch-123',
          report: createMockReport(),
        });
        mockConversationService.sendMessage.mockResolvedValue(createMockMessage('conv-1', 'test'));

        await handler.triggerScoringOnSend(
          mockSocket,
          'conv-1',
          'user-123',
          ['file-1']
        );

        expect(mockSocket.emit).not.toHaveBeenCalledWith('vendor_clarification_needed', expect.anything());
        expect(mockScoringService.score).toHaveBeenCalled();
      });
    });

    describe('NOT_A_QUESTIONNAIRE short-circuit', () => {
      it('should short-circuit with NOT_A_QUESTIONNAIRE for document type', async () => {
        mockVendorValidationService.validateSingleVendor.mockResolvedValue({ valid: true });
        mockFileRepository.findById.mockResolvedValue(
          createMockFile({ detectedDocType: 'document' })
        );

        await handler.triggerScoringOnSend(
          mockSocket,
          'conv-1',
          'user-123',
          ['file-1']
        );

        expect(mockSocket.emit).toHaveBeenCalledWith('scoring_error', expect.objectContaining({
          code: 'NOT_A_QUESTIONNAIRE',
          fileId: 'file-1',
        }));
        expect(mockFileRepository.updateParseStatus).toHaveBeenCalledWith('file-1', 'pending');
      });

      it('should not call scoring service for document type', async () => {
        mockVendorValidationService.validateSingleVendor.mockResolvedValue({ valid: true });
        mockFileRepository.findById.mockResolvedValue(
          createMockFile({ detectedDocType: 'document' })
        );

        await handler.triggerScoringOnSend(
          mockSocket,
          'conv-1',
          'user-123',
          ['file-1']
        );

        expect(mockScoringService.score).not.toHaveBeenCalled();
      });

      it('should include helpful error message for document type', async () => {
        mockVendorValidationService.validateSingleVendor.mockResolvedValue({ valid: true });
        mockFileRepository.findById.mockResolvedValue(
          createMockFile({ detectedDocType: 'document' })
        );

        await handler.triggerScoringOnSend(
          mockSocket,
          'conv-1',
          'user-123',
          ['file-1']
        );

        const errorCall = mockSocket.emit.mock.calls.find(
          call => call[0] === 'scoring_error'
        );
        expect(errorCall).toBeDefined();
        const errorPayload = errorCall![1] as { error: string; code: string };
        expect(errorPayload.error).toContain('general document');
        expect(errorPayload.error).toContain('Consult mode');
        expect(errorPayload.error).toContain('Assessment mode');
      });
    });

    describe('idempotency', () => {
      it('should skip file if tryStartParsing returns false', async () => {
        mockVendorValidationService.validateSingleVendor.mockResolvedValue({ valid: true });
        mockFileRepository.findById.mockResolvedValue(createMockFile());
        mockFileRepository.tryStartParsing.mockResolvedValue(false);

        await handler.triggerScoringOnSend(
          mockSocket,
          'conv-1',
          'user-123',
          ['file-1']
        );

        expect(mockSocket.emit).toHaveBeenCalledWith('scoring_progress', expect.objectContaining({
          message: 'Document is already being processed...',
        }));
        expect(mockScoringService.score).not.toHaveBeenCalled();
      });

      it('should skip already completed files', async () => {
        mockVendorValidationService.validateSingleVendor.mockResolvedValue({ valid: true });
        mockFileRepository.findById.mockResolvedValue(
          createMockFile({ parseStatus: 'completed' })
        );

        await handler.triggerScoringOnSend(
          mockSocket,
          'conv-1',
          'user-123',
          ['file-1']
        );

        expect(mockFileRepository.tryStartParsing).not.toHaveBeenCalled();
        expect(mockScoringService.score).not.toHaveBeenCalled();
      });
    });

    describe('successful scoring', () => {
      beforeEach(() => {
        mockVendorValidationService.validateSingleVendor.mockResolvedValue({ valid: true });
        mockFileRepository.findById.mockResolvedValue(createMockFile());
        mockFileRepository.tryStartParsing.mockResolvedValue(true);
        mockConversationService.sendMessage.mockResolvedValue(createMockMessage('conv-1', 'test'));
      });

      it('should emit scoring_started and scoring_progress with fileId', async () => {
        mockScoringService.score.mockResolvedValue({
          success: true,
          batchId: 'batch-123',
          report: createMockReport(),
        });

        await handler.triggerScoringOnSend(
          mockSocket,
          'conv-1',
          'user-123',
          ['file-1']
        );

        expect(mockSocket.emit).toHaveBeenCalledWith('scoring_started', {
          fileId: 'file-1',
          conversationId: 'conv-1',
        });
        expect(mockSocket.emit).toHaveBeenCalledWith('scoring_progress', expect.objectContaining({
          fileId: 'file-1',
          status: 'parsing',
        }));
      });

      it('should emit scoring_complete with batchId and assessmentId', async () => {
        mockScoringService.score.mockResolvedValue({
          success: true,
          batchId: 'batch-123',
          report: createMockReport({ assessmentId: 'assess-456' }),
        });

        await handler.triggerScoringOnSend(
          mockSocket,
          'conv-1',
          'user-123',
          ['file-1']
        );

        expect(mockSocket.emit).toHaveBeenCalledWith('scoring_complete', {
          conversationId: 'conv-1',
          result: expect.objectContaining({
            batchId: 'batch-123',
            assessmentId: 'assess-456',
            compositeScore: 72,
          }),
          narrativeReport: 'Test narrative report text',
        });
      });

      it('should pass progress callback to scoring service', async () => {
        mockScoringService.score.mockImplementation(async (input, onProgress) => {
          onProgress({ status: 'scoring', message: 'Processing...', progress: 50 });
          return { success: true, batchId: 'batch-123', report: createMockReport() };
        });

        await handler.triggerScoringOnSend(
          mockSocket,
          'conv-1',
          'user-123',
          ['file-1']
        );

        expect(mockSocket.emit).toHaveBeenCalledWith('scoring_progress', expect.objectContaining({
          status: 'scoring',
          message: 'Processing...',
          progress: 50,
        }));
      });
    });

    describe('post-score behaviors', () => {
      beforeEach(() => {
        mockVendorValidationService.validateSingleVendor.mockResolvedValue({ valid: true });
        mockFileRepository.findById.mockResolvedValue(createMockFile());
        mockFileRepository.tryStartParsing.mockResolvedValue(true);
        mockScoringService.score.mockResolvedValue({
          success: true,
          batchId: 'batch-123',
          report: createMockReport(),
        });
      });

      it('should persist narrative message and emit message event', async () => {
        const mockMessage = createMockMessage('conv-1', 'Test narrative report text');
        mockConversationService.sendMessage.mockResolvedValue(mockMessage);

        await handler.triggerScoringOnSend(
          mockSocket,
          'conv-1',
          'user-123',
          ['file-1']
        );

        // Verify narrative persisted
        expect(mockConversationService.sendMessage).toHaveBeenCalledWith({
          conversationId: 'conv-1',
          role: 'assistant',
          content: expect.objectContaining({
            text: expect.any(String),
            // NO components - card rendered from scoring_complete
          }),
        });

        // Verify message event emitted
        expect(mockSocket.emit).toHaveBeenCalledWith('message', expect.objectContaining({
          id: mockMessage.id,
          role: 'assistant',
        }));
      });

      it('should use fallback narrative when narrativeReport is empty', async () => {
        mockScoringService.score.mockResolvedValue({
          success: true,
          batchId: 'batch-123',
          report: createMockReport({ narrativeReport: '' }),
        });
        mockConversationService.sendMessage.mockResolvedValue(createMockMessage('conv-1', 'test'));

        await handler.triggerScoringOnSend(
          mockSocket,
          'conv-1',
          'user-123',
          ['file-1']
        );

        expect(mockConversationService.sendMessage).toHaveBeenCalledWith(
          expect.objectContaining({
            content: expect.objectContaining({
              text: expect.stringContaining('Risk assessment complete'),
            }),
          })
        );
      });

      it('should call linkAssessment (non-fatal on failure)', async () => {
        mockConversationService.sendMessage.mockResolvedValue(createMockMessage('conv-1', 'test'));
        mockConversationService.linkAssessment.mockRejectedValue(new Error('Link failed'));

        // Should not throw
        await handler.triggerScoringOnSend(
          mockSocket,
          'conv-1',
          'user-123',
          ['file-1']
        );

        expect(mockConversationService.linkAssessment).toHaveBeenCalledWith('conv-1', 'assess-456');
        // Scoring complete should still have been emitted
        expect(mockSocket.emit).toHaveBeenCalledWith('scoring_complete', expect.anything());
      });

      it('should log warning when linkAssessment fails', async () => {
        const consoleSpy = jest.spyOn(console, 'warn');
        mockConversationService.sendMessage.mockResolvedValue(createMockMessage('conv-1', 'test'));
        mockConversationService.linkAssessment.mockRejectedValue(new Error('Link failed'));

        await handler.triggerScoringOnSend(
          mockSocket,
          'conv-1',
          'user-123',
          ['file-1']
        );

        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining('Failed to link assessment (non-fatal)'),
          expect.any(Error)
        );
      });

      it('should mark file as completed after successful scoring', async () => {
        mockConversationService.sendMessage.mockResolvedValue(createMockMessage('conv-1', 'test'));

        await handler.triggerScoringOnSend(
          mockSocket,
          'conv-1',
          'user-123',
          ['file-1']
        );

        expect(mockFileRepository.updateParseStatus).toHaveBeenCalledWith('file-1', 'completed');
      });
    });

    describe('follow-up query flow', () => {
      beforeEach(() => {
        mockVendorValidationService.validateSingleVendor.mockResolvedValue({ valid: true });
        mockFileRepository.findById.mockResolvedValue(createMockFile());
        mockFileRepository.tryStartParsing.mockResolvedValue(true);
        mockScoringService.score.mockResolvedValue({
          success: true,
          batchId: 'batch-123',
          report: createMockReport(),
        });
        mockConversationService.sendMessage.mockResolvedValue(createMockMessage('conv-1', 'test'));
      });

      it('should stream follow-up response when userQuery provided', async () => {
        const mockBuildContext: BuildConversationContext = jest.fn().mockResolvedValue({
          messages: [],
          systemPrompt: 'Test prompt',
        });

        // Mock async iterator
        async function* mockStream(): AsyncGenerator<StreamChunk> {
          yield { content: 'Response ', isComplete: false };
          yield { content: 'text', isComplete: false };
          yield { content: '', isComplete: true };
        }
        mockClaudeClient.streamMessage.mockReturnValue(mockStream());

        await handler.triggerScoringOnSend(
          mockSocket,
          'conv-1',
          'user-123',
          ['file-1'],
          'What about security?',
          mockBuildContext
        );

        expect(mockSocket.emit).toHaveBeenCalledWith('assistant_stream_start', { conversationId: 'conv-1' });
        expect(mockSocket.emit).toHaveBeenCalledWith('assistant_token', expect.objectContaining({
          conversationId: 'conv-1',
          token: expect.any(String),
        }));
        expect(mockSocket.emit).toHaveBeenCalledWith('assistant_done', expect.objectContaining({
          conversationId: 'conv-1',
          fullText: 'Response text',
        }));
      });

      it('should not stream if userQuery is empty', async () => {
        const mockBuildContext = jest.fn();

        await handler.triggerScoringOnSend(
          mockSocket,
          'conv-1',
          'user-123',
          ['file-1'],
          '   ', // Whitespace only
          mockBuildContext
        );

        expect(mockBuildContext).not.toHaveBeenCalled();
        expect(mockClaudeClient.streamMessage).not.toHaveBeenCalled();
      });

      it('should not stream if buildConversationContext is not provided', async () => {
        await handler.triggerScoringOnSend(
          mockSocket,
          'conv-1',
          'user-123',
          ['file-1'],
          'What about security?',
          undefined // No context builder
        );

        expect(mockClaudeClient.streamMessage).not.toHaveBeenCalled();
      });

      it('should emit fallback message on follow-up error', async () => {
        const mockBuildContext: BuildConversationContext = jest.fn().mockRejectedValue(
          new Error('Context build failed')
        );

        await handler.triggerScoringOnSend(
          mockSocket,
          'conv-1',
          'user-123',
          ['file-1'],
          'What about security?',
          mockBuildContext
        );

        expect(mockSocket.emit).toHaveBeenCalledWith('message', expect.objectContaining({
          role: 'assistant',
          content: expect.stringContaining('completed the scoring'),
          conversationId: 'conv-1',
        }));
      });
    });

    describe('scoring failure', () => {
      beforeEach(() => {
        mockVendorValidationService.validateSingleVendor.mockResolvedValue({ valid: true });
        mockFileRepository.findById.mockResolvedValue(createMockFile());
        mockFileRepository.tryStartParsing.mockResolvedValue(true);
      });

      it('should emit scoring_error with code when scoring fails', async () => {
        mockScoringService.score.mockResolvedValue({
          success: false,
          batchId: '',
          error: 'Scoring failed',
          code: 'PARSE_FAILED',
        });

        await handler.triggerScoringOnSend(
          mockSocket,
          'conv-1',
          'user-123',
          ['file-1']
        );

        expect(mockSocket.emit).toHaveBeenCalledWith('scoring_error', {
          conversationId: 'conv-1',
          error: 'Scoring failed',
          code: 'PARSE_FAILED',
        });
      });

      it('should mark file as failed when scoring fails', async () => {
        mockScoringService.score.mockResolvedValue({
          success: false,
          batchId: '',
          error: 'Scoring failed',
        });

        await handler.triggerScoringOnSend(
          mockSocket,
          'conv-1',
          'user-123',
          ['file-1']
        );

        expect(mockFileRepository.updateParseStatus).toHaveBeenCalledWith('file-1', 'failed');
      });

      it('should save error as system message', async () => {
        mockScoringService.score.mockResolvedValue({
          success: false,
          batchId: '',
          error: 'Scoring failed',
        });

        await handler.triggerScoringOnSend(
          mockSocket,
          'conv-1',
          'user-123',
          ['file-1']
        );

        expect(mockConversationService.sendMessage).toHaveBeenCalledWith({
          conversationId: 'conv-1',
          role: 'system',
          content: expect.objectContaining({
            text: expect.stringContaining('Scoring failed'),
          }),
        });
      });
    });

    describe('error handling', () => {
      beforeEach(() => {
        mockVendorValidationService.validateSingleVendor.mockResolvedValue({ valid: true });
        mockFileRepository.findById.mockResolvedValue(createMockFile());
        mockFileRepository.tryStartParsing.mockResolvedValue(true);
        // CRITICAL: Must return a promise for .catch() to work in error handling
        mockFileRepository.updateParseStatus.mockResolvedValue(undefined);
      });

      it('should emit scoring_error on exception', async () => {
        mockScoringService.score.mockRejectedValue(new Error('Unexpected error'));

        await handler.triggerScoringOnSend(
          mockSocket,
          'conv-1',
          'user-123',
          ['file-1']
        );

        expect(mockSocket.emit).toHaveBeenCalledWith('scoring_error', {
          conversationId: 'conv-1',
          error: 'Unexpected error',
          code: 'SCORING_FAILED',
        });
      });

      it('should mark file as failed on exception', async () => {
        mockScoringService.score.mockRejectedValue(new Error('Unexpected error'));

        await handler.triggerScoringOnSend(
          mockSocket,
          'conv-1',
          'user-123',
          ['file-1']
        );

        expect(mockFileRepository.updateParseStatus).toHaveBeenCalledWith('file-1', 'failed');
      });

      it('should continue processing other files on error', async () => {
        mockFileRepository.findById
          .mockResolvedValueOnce(createMockFile({ id: 'file-1' }))
          .mockResolvedValueOnce(createMockFile({ id: 'file-2' }));
        mockFileRepository.tryStartParsing.mockResolvedValue(true);
        mockScoringService.score
          .mockRejectedValueOnce(new Error('Error on file 1'))
          .mockResolvedValueOnce({
            success: true,
            batchId: 'batch-2',
            report: createMockReport(),
          });
        mockConversationService.sendMessage.mockResolvedValue(createMockMessage('conv-1', 'test'));

        await handler.triggerScoringOnSend(
          mockSocket,
          'conv-1',
          'user-123',
          ['file-1', 'file-2']
        );

        // Both files should be processed
        expect(mockScoringService.score).toHaveBeenCalledTimes(2);
        expect(mockSocket.emit).toHaveBeenCalledWith('scoring_error', expect.objectContaining({
          error: 'Error on file 1',
        }));
        expect(mockSocket.emit).toHaveBeenCalledWith('scoring_complete', expect.anything());
      });

      it('should skip files that are not found', async () => {
        mockFileRepository.findById.mockResolvedValue(null);

        await handler.triggerScoringOnSend(
          mockSocket,
          'conv-1',
          'user-123',
          ['nonexistent-file']
        );

        expect(mockScoringService.score).not.toHaveBeenCalled();
      });
    });
  });

  /**
   * Story 28.7.2: buildScoringFollowUpContext tests
   *
   * Tests that the method:
   * - Is a synchronous pure function
   * - Takes report parameter directly (not conversationId)
   * - Formats composite score and risk rating
   * - Formats dimension scores with /10 scale
   * - Formats key findings as bullet points
   * - Includes executive summary
   */
  describe('buildScoringFollowUpContext', () => {
    it('should format composite score and risk rating', () => {
      const report = {
        payload: {
          compositeScore: 72,
          overallRiskRating: 'medium' as const,
          recommendation: 'conditional' as const,
          executiveSummary: 'Test summary',
          keyFindings: ['Finding 1'],
          disqualifyingFactors: [],
          dimensionScores: [],
        },
      };

      const result = handler.buildScoringFollowUpContext(report);

      expect(result).toContain('**Composite Score:** 72/100');
      expect(result).toContain('**Overall Risk Rating:** medium');
      expect(result).toContain('**Recommendation:** conditional');
    });

    it('should format dimension scores with /10 scale', () => {
      const report = {
        payload: {
          compositeScore: 65,
          overallRiskRating: 'medium' as const,
          recommendation: 'conditional' as const,
          executiveSummary: 'Test summary',
          keyFindings: [],
          disqualifyingFactors: [],
          dimensionScores: [
            { dimension: 'security_risk' as RiskDimension, score: 8, riskRating: 'low' as const },
            { dimension: 'privacy_risk' as RiskDimension, score: 6, riskRating: 'medium' as const },
            { dimension: 'compliance_risk' as RiskDimension, score: 4, riskRating: 'high' as const },
          ],
        },
      };

      const result = handler.buildScoringFollowUpContext(report);

      expect(result).toContain('### Dimension Scores:');
      expect(result).toContain('- security_risk: 8/100 (low)');
      expect(result).toContain('- privacy_risk: 6/100 (medium)');
      expect(result).toContain('- compliance_risk: 4/100 (high)');
    });

    it('should format key findings as bullet points', () => {
      const report = {
        payload: {
          compositeScore: 50,
          overallRiskRating: 'high' as const,
          recommendation: 'decline' as const,
          executiveSummary: 'Test summary',
          keyFindings: [
            'First important finding',
            'Second critical observation',
            'Third notable point',
          ],
          disqualifyingFactors: [],
          dimensionScores: [],
        },
      };

      const result = handler.buildScoringFollowUpContext(report);

      expect(result).toContain('### Key Findings:');
      expect(result).toContain('- First important finding');
      expect(result).toContain('- Second critical observation');
      expect(result).toContain('- Third notable point');
    });

    it('should include executive summary', () => {
      const report = {
        payload: {
          compositeScore: 85,
          overallRiskRating: 'low' as const,
          recommendation: 'approve' as const,
          executiveSummary: 'This vendor demonstrates strong security practices and compliance with healthcare regulations. Recommended for deployment with standard monitoring.',
          keyFindings: [],
          disqualifyingFactors: [],
          dimensionScores: [],
        },
      };

      const result = handler.buildScoringFollowUpContext(report);

      expect(result).toContain('### Executive Summary:');
      expect(result).toContain('This vendor demonstrates strong security practices');
      expect(result).toContain('Recommended for deployment with standard monitoring');
    });

    it('should be a synchronous pure function (no service calls)', () => {
      // Reset mocks to verify no service calls are made
      jest.clearAllMocks();

      const report = {
        payload: {
          compositeScore: 72,
          overallRiskRating: 'medium' as const,
          recommendation: 'conditional' as const,
          executiveSummary: 'Summary',
          keyFindings: ['Finding'],
          disqualifyingFactors: [],
          dimensionScores: [
            { dimension: 'security_risk' as RiskDimension, score: 7, riskRating: 'low' as const },
          ],
        },
      };

      // Call should be synchronous and immediate
      const result = handler.buildScoringFollowUpContext(report);

      // Verify it returns a string synchronously
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);

      // Verify no service methods were called
      expect(mockScoringService.getResultForConversation).not.toHaveBeenCalled();
      expect(mockConversationService.getHistory).not.toHaveBeenCalled();
      expect(mockFileRepository.findById).not.toHaveBeenCalled();
    });

    it('should handle empty dimension scores array', () => {
      const report = {
        payload: {
          compositeScore: 0,
          overallRiskRating: 'critical' as const,
          recommendation: 'decline' as const,
          executiveSummary: 'No scores available',
          keyFindings: [],
          disqualifyingFactors: [],
          dimensionScores: [],
        },
      };

      const result = handler.buildScoringFollowUpContext(report);

      expect(result).toContain('### Dimension Scores:');
      expect(result).toContain('**Composite Score:** 0/100');
    });

    it('should handle empty key findings array', () => {
      const report = {
        payload: {
          compositeScore: 75,
          overallRiskRating: 'medium' as const,
          recommendation: 'conditional' as const,
          executiveSummary: 'Standard assessment',
          keyFindings: [],
          disqualifyingFactors: [],
          dimensionScores: [],
        },
      };

      const result = handler.buildScoringFollowUpContext(report);

      expect(result).toContain('### Key Findings:');
      // Should not throw, just have empty section
      expect(result).toBeDefined();
    });

    it('should include all required sections in output', () => {
      const report = {
        payload: {
          compositeScore: 68,
          overallRiskRating: 'medium' as const,
          recommendation: 'conditional' as const,
          executiveSummary: 'Complete assessment summary',
          keyFindings: ['Key finding 1', 'Key finding 2'],
          disqualifyingFactors: [],
          dimensionScores: [
            { dimension: 'security_risk' as RiskDimension, score: 7, riskRating: 'low' as const },
          ],
        },
      };

      const result = handler.buildScoringFollowUpContext(report);

      // Verify all required sections are present
      expect(result).toContain('## Scoring Results Context');
      expect(result).toContain('**Composite Score:**');
      expect(result).toContain('**Overall Risk Rating:**');
      expect(result).toContain('**Recommendation:**');
      expect(result).toContain('### Dimension Scores:');
      expect(result).toContain('### Key Findings:');
      expect(result).toContain('### Executive Summary:');
    });
  });

  /**
   * Story 28.7.3: handleVendorSelected tests
   *
   * Tests cover:
   * 1. Filter files to selected vendor and trigger scoring
   * 2. Normalize vendor name (case insensitive, trimmed)
   * 3. Clear pending clarification after selection
   * 4. Emit error if no pending clarification exists
   * 5. Emit error if vendor name is empty
   * 6. Emit error if selected vendor not in list
   * 7. Emit error if user not authenticated
   */
  describe('handleVendorSelected', () => {
    beforeEach(() => {
      // Setup pending clarification in socket.data
      mockSocket.data.pendingVendorClarifications = new Map([
        ['conv-1', {
          conversationId: 'conv-1',
          userId: 'user-123',
          fileIds: ['f1', 'f2', 'f3'],
          userQuery: 'How risky is this?',
          vendors: [
            { name: 'Vendor A', fileCount: 2, fileIds: ['f1', 'f2'] },
            { name: 'Vendor B', fileCount: 1, fileIds: ['f3'] },
          ],
        }],
      ]);
    });

    it('should filter files to selected vendor and trigger scoring', async () => {
      const triggerSpy = jest.spyOn(handler, 'triggerScoringOnSend').mockResolvedValue();

      await handler.handleVendorSelected(mockSocket, {
        conversationId: 'conv-1',
        vendorName: 'Vendor A',
      });

      // Should emit confirmation message
      expect(mockSocket.emit).toHaveBeenCalledWith('message', expect.objectContaining({
        role: 'assistant',
        content: expect.stringContaining('Vendor A'),
        conversationId: 'conv-1',
      }));

      // Should call triggerScoringOnSend with selected vendor's files
      // 6th param is buildContext (undefined when no contextBuilder)
      expect(triggerSpy).toHaveBeenCalledWith(
        mockSocket,
        'conv-1',
        'user-123',
        ['f1', 'f2'],  // Only Vendor A's files
        'How risky is this?',  // User query preserved
        undefined  // buildContext
      );
    });

    it('should normalize vendor name (case insensitive, trimmed)', async () => {
      const triggerSpy = jest.spyOn(handler, 'triggerScoringOnSend').mockResolvedValue();

      await handler.handleVendorSelected(mockSocket, {
        conversationId: 'conv-1',
        vendorName: '  VENDOR a  ',  // Different case, extra whitespace
      });

      expect(triggerSpy).toHaveBeenCalledWith(
        mockSocket,
        'conv-1',
        'user-123',
        ['f1', 'f2'],
        'How risky is this?',
        undefined  // buildContext
      );
    });

    it('should clear pending clarification after selection', async () => {
      jest.spyOn(handler, 'triggerScoringOnSend').mockResolvedValue();

      await handler.handleVendorSelected(mockSocket, {
        conversationId: 'conv-1',
        vendorName: 'Vendor A',
      });

      const pendingMap = mockSocket.data.pendingVendorClarifications as Map<string, PendingVendorClarification>;
      expect(pendingMap.has('conv-1')).toBe(false);
    });

    it('should emit error if no pending clarification exists', async () => {
      mockSocket.data.pendingVendorClarifications = new Map();

      await handler.handleVendorSelected(mockSocket, {
        conversationId: 'conv-1',
        vendorName: 'Vendor A',
      });

      expect(mockSocket.emit).toHaveBeenCalledWith('error', expect.objectContaining({
        event: 'vendor_selected',
        message: expect.stringContaining('No pending vendor clarification'),
      }));
    });

    it('should emit error if pending clarification map is undefined', async () => {
      mockSocket.data.pendingVendorClarifications = undefined;

      await handler.handleVendorSelected(mockSocket, {
        conversationId: 'conv-1',
        vendorName: 'Vendor A',
      });

      expect(mockSocket.emit).toHaveBeenCalledWith('error', expect.objectContaining({
        event: 'vendor_selected',
        message: expect.stringContaining('No pending vendor clarification'),
      }));
    });

    it('should emit error if vendor name is empty', async () => {
      await handler.handleVendorSelected(mockSocket, {
        conversationId: 'conv-1',
        vendorName: '   ',
      });

      expect(mockSocket.emit).toHaveBeenCalledWith('error', expect.objectContaining({
        event: 'vendor_selected',
        message: 'Vendor name is required',
      }));
    });

    it('should emit error if vendor name is missing', async () => {
      await handler.handleVendorSelected(mockSocket, {
        conversationId: 'conv-1',
        vendorName: '',
      });

      expect(mockSocket.emit).toHaveBeenCalledWith('error', expect.objectContaining({
        event: 'vendor_selected',
        message: 'Vendor name is required',
      }));
    });

    it('should emit error if vendor name is null', async () => {
      await handler.handleVendorSelected(mockSocket, {
        conversationId: 'conv-1',
        vendorName: null as unknown as string,
      });

      expect(mockSocket.emit).toHaveBeenCalledWith('error', expect.objectContaining({
        event: 'vendor_selected',
        message: 'Vendor name is required',
      }));
    });

    it('should emit error if selected vendor not in list', async () => {
      await handler.handleVendorSelected(mockSocket, {
        conversationId: 'conv-1',
        vendorName: 'Unknown Vendor',
      });

      expect(mockSocket.emit).toHaveBeenCalledWith('error', expect.objectContaining({
        event: 'vendor_selected',
        message: expect.stringContaining('Unknown vendor'),
      }));
    });

    it('should emit error if user not authenticated', async () => {
      mockSocket.userId = undefined;

      await handler.handleVendorSelected(mockSocket, {
        conversationId: 'conv-1',
        vendorName: 'Vendor A',
      });

      expect(mockSocket.emit).toHaveBeenCalledWith('error', expect.objectContaining({
        event: 'vendor_selected',
        message: 'Not authenticated',
      }));
    });

    it('should emit error if conversationId is missing', async () => {
      await handler.handleVendorSelected(mockSocket, {
        conversationId: '',
        vendorName: 'Vendor A',
      });

      expect(mockSocket.emit).toHaveBeenCalledWith('error', expect.objectContaining({
        event: 'vendor_selected',
        message: 'Conversation ID is required',
      }));
    });

    it('should emit error if conversationId is null', async () => {
      await handler.handleVendorSelected(mockSocket, {
        conversationId: null as unknown as string,
        vendorName: 'Vendor A',
      });

      expect(mockSocket.emit).toHaveBeenCalledWith('error', expect.objectContaining({
        event: 'vendor_selected',
        message: 'Conversation ID is required',
      }));
    });

    it('should select second vendor correctly', async () => {
      const triggerSpy = jest.spyOn(handler, 'triggerScoringOnSend').mockResolvedValue();

      await handler.handleVendorSelected(mockSocket, {
        conversationId: 'conv-1',
        vendorName: 'Vendor B',
      });

      // Should emit confirmation message with correct vendor name
      expect(mockSocket.emit).toHaveBeenCalledWith('message', expect.objectContaining({
        content: expect.stringContaining('Vendor B'),
      }));

      // Should call triggerScoringOnSend with Vendor B's files
      expect(triggerSpy).toHaveBeenCalledWith(
        mockSocket,
        'conv-1',
        'user-123',
        ['f3'],  // Only Vendor B's files
        'How risky is this?',
        undefined  // buildContext
      );
    });

    it('should handle selection when userQuery is undefined', async () => {
      // Setup pending clarification without userQuery
      mockSocket.data.pendingVendorClarifications = new Map([
        ['conv-2', {
          conversationId: 'conv-2',
          userId: 'user-123',
          fileIds: ['f4'],
          userQuery: undefined,  // No user query
          vendors: [
            { name: 'Vendor C', fileCount: 1, fileIds: ['f4'] },
          ],
        }],
      ]);

      const triggerSpy = jest.spyOn(handler, 'triggerScoringOnSend').mockResolvedValue();

      await handler.handleVendorSelected(mockSocket, {
        conversationId: 'conv-2',
        vendorName: 'Vendor C',
      });

      expect(triggerSpy).toHaveBeenCalledWith(
        mockSocket,
        'conv-2',
        'user-123',
        ['f4'],
        undefined,  // userQuery should be undefined
        undefined   // buildContext
      );
    });

    it('should not call triggerScoringOnSend when validation fails', async () => {
      const triggerSpy = jest.spyOn(handler, 'triggerScoringOnSend');
      mockSocket.data.pendingVendorClarifications = new Map();

      await handler.handleVendorSelected(mockSocket, {
        conversationId: 'conv-1',
        vendorName: 'Vendor A',
      });

      expect(triggerSpy).not.toHaveBeenCalled();
    });
  });
});
