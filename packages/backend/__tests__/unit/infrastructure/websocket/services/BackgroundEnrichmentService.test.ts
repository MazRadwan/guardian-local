/**
 * Unit Tests for BackgroundEnrichmentService
 *
 * Extracted from MessageHandler (Story 28.11.2).
 * Tests background file enrichment for assessment mode.
 *
 * Test cases:
 * 1. Skip files where tryStartParsing returns false (idempotency)
 * 2. Process files successfully (happy path)
 * 3. Mark file as failed when file not found
 * 4. Mark file as failed for unsupported MIME type
 * 5. Mark file as failed when parsing fails
 * 6. Continue processing other files after error
 * 7. Handle multiple files (skip, success, fail)
 */

import { BackgroundEnrichmentService } from '../../../../../src/infrastructure/websocket/services/BackgroundEnrichmentService.js';
import type { IFileRepository, FileRecord } from '../../../../../src/application/interfaces/IFileRepository.js';
import type { IFileStorage } from '../../../../../src/application/interfaces/IFileStorage.js';
import type { IIntakeDocumentParser, IntakeParseResult } from '../../../../../src/application/interfaces/IIntakeDocumentParser.js';
import type { IntakeDocumentContext } from '../../../../../src/domain/entities/Conversation.js';

// --- Mock factories ---

function createMockFileRepository(): jest.Mocked<IFileRepository> {
  return {
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
  };
}

function createMockFileStorage(): jest.Mocked<IFileStorage> {
  return {
    store: jest.fn(),
    retrieve: jest.fn(),
    delete: jest.fn(),
    exists: jest.fn(),
  };
}

function createMockIntakeParser(): jest.Mocked<IIntakeDocumentParser> {
  return {
    parseForContext: jest.fn(),
  };
}

function createFileRecord(overrides: Partial<FileRecord> = {}): FileRecord {
  return {
    id: 'file-1',
    userId: 'user-1',
    conversationId: 'conv-1',
    filename: 'vendor-doc.pdf',
    mimeType: 'application/pdf',
    size: 1024,
    storagePath: '/uploads/file-1.pdf',
    createdAt: new Date('2025-01-01'),
    textExcerpt: null,
    parseStatus: 'in_progress',
    detectedDocType: null,
    detectedVendorName: null,
    ...overrides,
  };
}

function createSuccessParseResult(overrides: Partial<IntakeParseResult> = {}): IntakeParseResult {
  return {
    success: true,
    confidence: 0.9,
    parseTimeMs: 150,
    metadata: {
      filename: 'vendor-doc.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 1024,
      documentType: 'pdf',
      storagePath: '/uploads/file-1.pdf',
      uploadedAt: new Date('2025-01-01'),
      uploadedBy: 'user-1',
    },
    context: {
      vendorName: 'TestVendor',
      solutionName: 'TestSolution',
      solutionType: 'Clinical AI',
      industry: 'Healthcare',
      features: ['Feature A'],
      claims: ['Claim 1'],
      integrations: [],
      complianceMentions: ['HIPAA'],
      architectureNotes: [],
      securityMentions: [],
      rawTextExcerpt: 'test excerpt',
      confidence: 0.9,
      sourceFilePath: '/uploads/file-1.pdf',
    },
    suggestedQuestions: [],
    coveredCategories: [],
    gapCategories: ['data-governance'],
    ...overrides,
  };
}

// --- Tests ---

describe('BackgroundEnrichmentService', () => {
  let service: BackgroundEnrichmentService;
  let mockFileRepository: jest.Mocked<IFileRepository>;
  let mockFileStorage: jest.Mocked<IFileStorage>;
  let mockIntakeParser: jest.Mocked<IIntakeDocumentParser>;

  beforeEach(() => {
    mockFileRepository = createMockFileRepository();
    mockFileStorage = createMockFileStorage();
    mockIntakeParser = createMockIntakeParser();
    service = new BackgroundEnrichmentService(mockFileRepository, mockFileStorage, mockIntakeParser);

    // Default: updateParseStatus and updateIntakeContext return resolved promises
    mockFileRepository.updateParseStatus.mockResolvedValue(undefined);
    mockFileRepository.updateIntakeContext.mockResolvedValue(undefined);

    // Suppress console output during tests
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should skip files where tryStartParsing returns false (idempotency)', async () => {
    mockFileRepository.tryStartParsing.mockResolvedValue(false);

    await service.enrichInBackground('conv-1', ['file-1']);

    expect(mockFileRepository.tryStartParsing).toHaveBeenCalledWith('file-1');
    expect(mockFileRepository.findById).not.toHaveBeenCalled();
    expect(mockFileStorage.retrieve).not.toHaveBeenCalled();
    expect(mockIntakeParser.parseForContext).not.toHaveBeenCalled();
  });

  it('should process files successfully (happy path)', async () => {
    const file = createFileRecord();
    const parseResult = createSuccessParseResult();
    const buffer = Buffer.from('pdf content');

    mockFileRepository.tryStartParsing.mockResolvedValue(true);
    mockFileRepository.findById.mockResolvedValue(file);
    mockFileStorage.retrieve.mockResolvedValue(buffer);
    mockIntakeParser.parseForContext.mockResolvedValue(parseResult);

    await service.enrichInBackground('conv-1', ['file-1']);

    expect(mockFileRepository.tryStartParsing).toHaveBeenCalledWith('file-1');
    expect(mockFileRepository.findById).toHaveBeenCalledWith('file-1');
    expect(mockFileStorage.retrieve).toHaveBeenCalledWith('/uploads/file-1.pdf');
    expect(mockIntakeParser.parseForContext).toHaveBeenCalledWith(buffer, {
      filename: 'vendor-doc.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 1024,
      documentType: 'pdf',
      storagePath: '/uploads/file-1.pdf',
      uploadedAt: file.createdAt,
      uploadedBy: 'user-1',
    });
    expect(mockFileRepository.updateIntakeContext).toHaveBeenCalledWith(
      'file-1',
      {
        vendorName: 'TestVendor',
        solutionName: 'TestSolution',
        solutionType: 'Clinical AI',
        industry: 'Healthcare',
        features: ['Feature A'],
        claims: ['Claim 1'],
        complianceMentions: ['HIPAA'],
      },
      ['data-governance']
    );
    expect(mockFileRepository.updateParseStatus).toHaveBeenCalledWith('file-1', 'completed');
  });

  it('should mark file as failed when file not found', async () => {
    mockFileRepository.tryStartParsing.mockResolvedValue(true);
    mockFileRepository.findById.mockResolvedValue(null);

    await service.enrichInBackground('conv-1', ['file-1']);

    expect(mockFileRepository.updateParseStatus).toHaveBeenCalledWith('file-1', 'failed');
    expect(mockFileStorage.retrieve).not.toHaveBeenCalled();
    expect(mockIntakeParser.parseForContext).not.toHaveBeenCalled();
  });

  it('should mark file as failed for unsupported MIME type', async () => {
    const file = createFileRecord({ mimeType: 'text/plain' });
    mockFileRepository.tryStartParsing.mockResolvedValue(true);
    mockFileRepository.findById.mockResolvedValue(file);
    mockFileStorage.retrieve.mockResolvedValue(Buffer.from('text'));

    await service.enrichInBackground('conv-1', ['file-1']);

    expect(mockFileRepository.updateParseStatus).toHaveBeenCalledWith('file-1', 'failed');
    expect(mockIntakeParser.parseForContext).not.toHaveBeenCalled();
  });

  it('should mark file as failed when parsing fails', async () => {
    const file = createFileRecord();
    const failResult: IntakeParseResult = {
      success: false,
      confidence: 0,
      parseTimeMs: 50,
      metadata: {
        filename: 'vendor-doc.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1024,
        documentType: 'pdf',
        storagePath: '/uploads/file-1.pdf',
        uploadedAt: new Date('2025-01-01'),
        uploadedBy: 'user-1',
      },
      context: null,
      error: 'Parse error',
      suggestedQuestions: [],
      coveredCategories: [],
      gapCategories: [],
    };

    mockFileRepository.tryStartParsing.mockResolvedValue(true);
    mockFileRepository.findById.mockResolvedValue(file);
    mockFileStorage.retrieve.mockResolvedValue(Buffer.from('pdf'));
    mockIntakeParser.parseForContext.mockResolvedValue(failResult);

    await service.enrichInBackground('conv-1', ['file-1']);

    expect(mockFileRepository.updateParseStatus).toHaveBeenCalledWith('file-1', 'failed');
    expect(mockFileRepository.updateIntakeContext).not.toHaveBeenCalled();
  });

  it('should continue processing other files after error', async () => {
    const file2 = createFileRecord({ id: 'file-2', storagePath: '/uploads/file-2.pdf' });
    const parseResult = createSuccessParseResult();

    // file-1 throws, file-2 succeeds
    mockFileRepository.tryStartParsing.mockResolvedValue(true);
    mockFileRepository.findById
      .mockRejectedValueOnce(new Error('DB error'))
      .mockResolvedValueOnce(file2);
    mockFileStorage.retrieve.mockResolvedValue(Buffer.from('pdf'));
    mockIntakeParser.parseForContext.mockResolvedValue(parseResult);

    await service.enrichInBackground('conv-1', ['file-1', 'file-2']);

    // file-1 should be marked failed
    expect(mockFileRepository.updateParseStatus).toHaveBeenCalledWith('file-1', 'failed');
    // file-2 should be processed successfully
    expect(mockFileRepository.updateParseStatus).toHaveBeenCalledWith('file-2', 'completed');
    expect(mockFileRepository.updateIntakeContext).toHaveBeenCalledTimes(1);
  });

  it('should handle multiple files: skip, success, and fail', async () => {
    const file2 = createFileRecord({
      id: 'file-2',
      filename: 'doc.docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      storagePath: '/uploads/file-2.docx',
    });
    const file3 = createFileRecord({
      id: 'file-3',
      mimeType: 'text/plain',
      storagePath: '/uploads/file-3.txt',
    });
    const parseResult = createSuccessParseResult();

    // file-1: skip (already processing)
    // file-2: success
    // file-3: fail (unsupported MIME)
    mockFileRepository.tryStartParsing
      .mockResolvedValueOnce(false)   // file-1: skip
      .mockResolvedValueOnce(true)    // file-2: proceed
      .mockResolvedValueOnce(true);   // file-3: proceed

    mockFileRepository.findById
      .mockResolvedValueOnce(file2)   // file-2
      .mockResolvedValueOnce(file3);  // file-3

    mockFileStorage.retrieve.mockResolvedValue(Buffer.from('content'));
    mockIntakeParser.parseForContext.mockResolvedValue(parseResult);

    await service.enrichInBackground('conv-1', ['file-1', 'file-2', 'file-3']);

    // file-1: skipped, no findById call
    expect(mockFileRepository.tryStartParsing).toHaveBeenCalledWith('file-1');

    // file-2: success
    expect(mockFileRepository.updateIntakeContext).toHaveBeenCalledTimes(1);
    expect(mockFileRepository.updateParseStatus).toHaveBeenCalledWith('file-2', 'completed');

    // file-3: failed (unsupported MIME)
    expect(mockFileRepository.updateParseStatus).toHaveBeenCalledWith('file-3', 'failed');

    // findById called for file-2 and file-3 only (file-1 was skipped)
    expect(mockFileRepository.findById).toHaveBeenCalledTimes(2);
  });
});
