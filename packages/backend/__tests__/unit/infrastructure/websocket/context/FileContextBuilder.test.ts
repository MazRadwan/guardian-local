import { FileContextBuilder } from '../../../../../src/infrastructure/websocket/context/FileContextBuilder';
import type {
  IFileRepository,
  FileWithExcerpt,
} from '../../../../../src/application/interfaces/IFileRepository';
import type { IFileStorage } from '../../../../../src/application/interfaces/IFileStorage';
import type { ITextExtractionService } from '../../../../../src/application/interfaces/ITextExtractionService';
import type { IVisionContentBuilder } from '../../../../../src/application/interfaces/IVisionContentBuilder';
import type { IntakeDocumentContext } from '../../../../../src/domain/entities/Conversation';
import type { ImageContentBlock } from '../../../../../src/infrastructure/ai/types/vision';

/**
 * Helper to create a complete IntakeDocumentContext with defaults
 */
function createIntakeContext(
  overrides: Partial<IntakeDocumentContext> = {}
): IntakeDocumentContext {
  return {
    vendorName: null,
    solutionName: null,
    solutionType: null,
    industry: null,
    features: [],
    claims: [],
    complianceMentions: [],
    ...overrides,
  };
}

/**
 * Helper to create a FileWithExcerpt with defaults
 */
function createFileWithExcerpt(
  overrides: Partial<FileWithExcerpt> = {}
): FileWithExcerpt {
  return {
    id: 'file-1',
    filename: 'test.pdf',
    mimeType: 'application/pdf',
    storagePath: 's3://bucket/test.pdf',
    textExcerpt: null,
    intakeContext: null,
    ...overrides,
  };
}

describe('FileContextBuilder', () => {
  let builder: FileContextBuilder;
  let mockFileRepository: jest.Mocked<IFileRepository>;

  beforeEach(() => {
    mockFileRepository = {
      findByConversationWithExcerpt: jest.fn(),
      updateTextExcerpt: jest.fn().mockResolvedValue(undefined),
      // Include other methods to satisfy the interface (not used in these tests)
      create: jest.fn(),
      findById: jest.fn(),
      findByIds: jest.fn(),
      findByIdAndUser: jest.fn(),
      findByIdAndConversation: jest.fn(),
      updateIntakeContext: jest.fn(),
      findByConversationWithContext: jest.fn(),
      updateParseStatus: jest.fn(),
      tryStartParsing: jest.fn(),
      deleteByConversationId: jest.fn(),
    } as jest.Mocked<IFileRepository>;
    builder = new FileContextBuilder(mockFileRepository);
  });

  describe('build()', () => {
    it('should return empty string for no files', async () => {
      mockFileRepository.findByConversationWithExcerpt.mockResolvedValue([]);
      const result = await builder.build('conv-123');
      expect(result).toBe('');
    });

    it('should use findByConversationWithExcerpt (not findByConversation)', async () => {
      mockFileRepository.findByConversationWithExcerpt.mockResolvedValue([]);
      await builder.build('conv-123');
      expect(
        mockFileRepository.findByConversationWithExcerpt
      ).toHaveBeenCalledWith('conv-123');
    });

    it('should use correct output format with --- Attached Documents --- header', async () => {
      mockFileRepository.findByConversationWithExcerpt.mockResolvedValue([
        createFileWithExcerpt({
          id: 'file-1',
          filename: 'vendor-doc.pdf',
          intakeContext: createIntakeContext({ vendorName: 'Acme Corp' }),
        }),
      ]);

      const result = await builder.build('conv-123');
      expect(result).toContain('--- Attached Documents ---');
      expect(result.startsWith('\n\n--- Attached Documents ---\n')).toBe(true);
    });

    it('should format intake context files (priority 1)', async () => {
      mockFileRepository.findByConversationWithExcerpt.mockResolvedValue([
        createFileWithExcerpt({
          id: 'file-1',
          filename: 'vendor-doc.pdf',
          intakeContext: createIntakeContext({
            vendorName: 'Acme Corp',
            solutionName: 'AI Suite',
          }),
        }),
      ]);

      const result = await builder.build('conv-123');
      expect(result).toContain('Acme Corp');
      expect(result).toContain('AI Suite');
    });

    it('should format text excerpt files (priority 2)', async () => {
      mockFileRepository.findByConversationWithExcerpt.mockResolvedValue([
        createFileWithExcerpt({
          id: 'file-1',
          filename: 'doc.pdf',
          textExcerpt: 'This is the document content...',
          intakeContext: null,
        }),
      ]);

      const result = await builder.build('conv-123');
      expect(result).toContain('document content');
      expect(result).toContain('enrichment pending');
    });

    it('should scope to specific file IDs', async () => {
      mockFileRepository.findByConversationWithExcerpt.mockResolvedValue([
        createFileWithExcerpt({
          id: 'file-1',
          filename: 'a.pdf',
          textExcerpt: 'AAA',
        }),
        createFileWithExcerpt({
          id: 'file-2',
          filename: 'b.pdf',
          textExcerpt: 'BBB',
        }),
      ]);

      const result = await builder.build('conv-123', ['file-1']);
      expect(result).toContain('AAA');
      expect(result).not.toContain('BBB');
    });

    it('should combine multiple files', async () => {
      mockFileRepository.findByConversationWithExcerpt.mockResolvedValue([
        createFileWithExcerpt({
          id: 'file-1',
          filename: 'vendor1.pdf',
          intakeContext: createIntakeContext({ vendorName: 'Acme' }),
        }),
        createFileWithExcerpt({
          id: 'file-2',
          filename: 'vendor2.pdf',
          textExcerpt: 'Globex content',
        }),
      ]);

      const result = await builder.build('conv-123');
      expect(result).toContain('Acme');
      expect(result).toContain('Globex content');
    });

    it('should return empty string when scoped to non-existent file IDs', async () => {
      mockFileRepository.findByConversationWithExcerpt.mockResolvedValue([
        createFileWithExcerpt({
          id: 'file-1',
          filename: 'a.pdf',
          textExcerpt: 'AAA',
        }),
      ]);

      const result = await builder.build('conv-123', ['non-existent-id']);
      expect(result).toBe('');
    });

    it('should prefer intakeContext over textExcerpt when both present', async () => {
      mockFileRepository.findByConversationWithExcerpt.mockResolvedValue([
        createFileWithExcerpt({
          id: 'file-1',
          filename: 'doc.pdf',
          textExcerpt: 'Raw text excerpt here',
          intakeContext: createIntakeContext({ vendorName: 'Structured Vendor' }),
        }),
      ]);

      const result = await builder.build('conv-123');
      expect(result).toContain('Structured Vendor');
      expect(result).not.toContain('Raw text excerpt here');
    });
  });

  describe('S3 fallback and backfill', () => {
    it('should extract from S3 when no textExcerpt (priority 3)', async () => {
      const mockFileStorage = {
        retrieve: jest.fn().mockResolvedValue(Buffer.from('test')),
      } as unknown as jest.Mocked<IFileStorage>;
      const mockTextExtraction = {
        extract: jest
          .fn()
          .mockResolvedValue({ success: true, excerpt: 'Extracted from S3' }),
      } as unknown as jest.Mocked<ITextExtractionService>;
      const builderWithS3 = new FileContextBuilder(
        mockFileRepository,
        mockFileStorage,
        mockTextExtraction
      );

      mockFileRepository.findByConversationWithExcerpt.mockResolvedValue([
        createFileWithExcerpt({
          id: 'file-1',
          filename: 'doc.pdf',
          mimeType: 'application/pdf',
          storagePath: 's3://bucket/doc.pdf',
          textExcerpt: null,
          intakeContext: null,
        }),
      ]);

      const result = await builderWithS3.build('conv-123');
      expect(mockFileStorage.retrieve).toHaveBeenCalledWith(
        's3://bucket/doc.pdf'
      );
      expect(result).toContain('Extracted from S3');
    });

    it('should lazy backfill excerpt after S3 extraction (fire-and-forget)', async () => {
      const mockFileStorage = {
        retrieve: jest.fn().mockResolvedValue(Buffer.from('test')),
      } as unknown as jest.Mocked<IFileStorage>;
      const mockTextExtraction = {
        extract: jest
          .fn()
          .mockResolvedValue({ success: true, excerpt: 'Backfill content' }),
      } as unknown as jest.Mocked<ITextExtractionService>;
      const builderWithS3 = new FileContextBuilder(
        mockFileRepository,
        mockFileStorage,
        mockTextExtraction
      );

      mockFileRepository.findByConversationWithExcerpt.mockResolvedValue([
        createFileWithExcerpt({
          id: 'file-1',
          filename: 'doc.pdf',
          mimeType: 'application/pdf',
          storagePath: 's3://bucket/doc.pdf',
          textExcerpt: null,
          intakeContext: null,
        }),
      ]);

      await builderWithS3.build('conv-123');

      // Backfill should be called
      expect(mockFileRepository.updateTextExcerpt).toHaveBeenCalledWith(
        'file-1',
        'Backfill content'
      );
    });

    it('should handle DOCX MIME type correctly (MIME_TYPE_MAP)', async () => {
      const mockFileStorage = {
        retrieve: jest.fn().mockResolvedValue(Buffer.from('test')),
      } as unknown as jest.Mocked<IFileStorage>;
      const mockTextExtraction = {
        extract: jest
          .fn()
          .mockResolvedValue({ success: true, excerpt: 'DOCX content' }),
      } as unknown as jest.Mocked<ITextExtractionService>;
      const builderWithS3 = new FileContextBuilder(
        mockFileRepository,
        mockFileStorage,
        mockTextExtraction
      );

      mockFileRepository.findByConversationWithExcerpt.mockResolvedValue([
        createFileWithExcerpt({
          id: 'file-1',
          filename: 'doc.docx',
          mimeType:
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          storagePath: 's3://bucket/doc.docx',
          textExcerpt: null,
          intakeContext: null,
        }),
      ]);

      await builderWithS3.build('conv-123');

      expect(mockTextExtraction.extract).toHaveBeenCalledWith(
        expect.any(Buffer),
        'docx'
      );
    });

    it('should skip image files in text path (Epic 30: images handled by VisionContentBuilder)', async () => {
      // Epic 30 Sprint 3: Image files are now routed to VisionContentBuilder, not text extraction
      const mockFileStorage = {
        retrieve: jest.fn().mockResolvedValue(Buffer.from('test')),
      } as unknown as jest.Mocked<IFileStorage>;
      const mockTextExtraction = {
        extract: jest
          .fn()
          .mockResolvedValue({ success: true, excerpt: 'Image text' }),
      } as unknown as jest.Mocked<ITextExtractionService>;
      const builderWithS3 = new FileContextBuilder(
        mockFileRepository,
        mockFileStorage,
        mockTextExtraction
        // No visionContentBuilder - images will be skipped
      );

      mockFileRepository.findByConversationWithExcerpt.mockResolvedValue([
        createFileWithExcerpt({
          id: 'file-1',
          filename: 'image.png',
          mimeType: 'image/png',
          storagePath: 's3://bucket/image.png',
          textExcerpt: null,
          intakeContext: null,
        }),
      ]);

      const result = await builderWithS3.build('conv-123');

      // Image files should be skipped (not sent to text extraction)
      expect(mockTextExtraction.extract).not.toHaveBeenCalled();
      // Result should be empty since image was skipped and no text files
      expect(result).toBe('');
    });

    it('should skip unknown MIME types', async () => {
      const mockFileStorage = {
        retrieve: jest.fn().mockResolvedValue(Buffer.from('test')),
      } as unknown as jest.Mocked<IFileStorage>;
      const mockTextExtraction = {
        extract: jest.fn(),
      } as unknown as jest.Mocked<ITextExtractionService>;
      const builderWithS3 = new FileContextBuilder(
        mockFileRepository,
        mockFileStorage,
        mockTextExtraction
      );

      mockFileRepository.findByConversationWithExcerpt.mockResolvedValue([
        createFileWithExcerpt({
          id: 'file-1',
          filename: 'doc.xyz',
          mimeType: 'application/unknown',
          storagePath: 's3://bucket/doc.xyz',
          textExcerpt: null,
          intakeContext: null,
        }),
      ]);

      const result = await builderWithS3.build('conv-123');
      expect(mockTextExtraction.extract).not.toHaveBeenCalled();
      expect(result).toBe('');
    });

    it('should return empty when S3 extraction fails', async () => {
      const mockFileStorage = {
        retrieve: jest.fn().mockRejectedValue(new Error('S3 error')),
      } as unknown as jest.Mocked<IFileStorage>;
      const builderWithS3 = new FileContextBuilder(
        mockFileRepository,
        mockFileStorage
      );

      mockFileRepository.findByConversationWithExcerpt.mockResolvedValue([
        createFileWithExcerpt({
          id: 'file-1',
          filename: 'doc.pdf',
          mimeType: 'application/pdf',
          storagePath: 's3://bucket/doc.pdf',
          textExcerpt: null,
          intakeContext: null,
        }),
      ]);

      const result = await builderWithS3.build('conv-123');
      expect(result).toBe('');
    });

    it('should skip S3 fallback when dependencies not provided', async () => {
      // Builder without fileStorage or textExtractionService
      const builderNoS3 = new FileContextBuilder(mockFileRepository);

      mockFileRepository.findByConversationWithExcerpt.mockResolvedValue([
        createFileWithExcerpt({
          id: 'file-1',
          filename: 'doc.pdf',
          mimeType: 'application/pdf',
          storagePath: 's3://bucket/doc.pdf',
          textExcerpt: null,
          intakeContext: null,
        }),
      ]);

      const result = await builderNoS3.build('conv-123');
      expect(result).toBe('');
    });

    it('should continue with other files when one extraction fails', async () => {
      const mockFileStorage = {
        retrieve: jest.fn().mockRejectedValue(new Error('S3 error')),
      } as unknown as jest.Mocked<IFileStorage>;
      const builderWithS3 = new FileContextBuilder(
        mockFileRepository,
        mockFileStorage
      );

      mockFileRepository.findByConversationWithExcerpt.mockResolvedValue([
        createFileWithExcerpt({
          id: 'file-1',
          filename: 'broken.pdf',
          mimeType: 'application/pdf',
          storagePath: 's3://bucket/broken.pdf',
          textExcerpt: null,
          intakeContext: null,
        }),
        createFileWithExcerpt({
          id: 'file-2',
          filename: 'working.pdf',
          mimeType: 'application/pdf',
          storagePath: 's3://bucket/working.pdf',
          textExcerpt: 'This works',
          intakeContext: null,
        }),
      ]);

      const result = await builderWithS3.build('conv-123');
      expect(result).toContain('This works');
    });

    it('should handle text extraction returning failure', async () => {
      const mockFileStorage = {
        retrieve: jest.fn().mockResolvedValue(Buffer.from('test')),
      } as unknown as jest.Mocked<IFileStorage>;
      const mockTextExtraction = {
        extract: jest.fn().mockResolvedValue({
          success: false,
          error: 'Extraction failed',
          excerpt: '',
          fullLength: 0,
          extractionMs: 100,
        }),
      } as unknown as jest.Mocked<ITextExtractionService>;
      const builderWithS3 = new FileContextBuilder(
        mockFileRepository,
        mockFileStorage,
        mockTextExtraction
      );

      mockFileRepository.findByConversationWithExcerpt.mockResolvedValue([
        createFileWithExcerpt({
          id: 'file-1',
          filename: 'doc.pdf',
          mimeType: 'application/pdf',
          storagePath: 's3://bucket/doc.pdf',
          textExcerpt: null,
          intakeContext: null,
        }),
      ]);

      const result = await builderWithS3.build('conv-123');
      expect(result).toBe('');
    });

    it('should not call backfill when extraction returns null', async () => {
      const mockFileStorage = {
        retrieve: jest.fn().mockResolvedValue(Buffer.from('test')),
      } as unknown as jest.Mocked<IFileStorage>;
      const mockTextExtraction = {
        extract: jest.fn().mockResolvedValue({
          success: false,
          error: 'Failed',
          excerpt: '',
          fullLength: 0,
          extractionMs: 100,
        }),
      } as unknown as jest.Mocked<ITextExtractionService>;
      const builderWithS3 = new FileContextBuilder(
        mockFileRepository,
        mockFileStorage,
        mockTextExtraction
      );

      mockFileRepository.findByConversationWithExcerpt.mockResolvedValue([
        createFileWithExcerpt({
          id: 'file-1',
          filename: 'doc.pdf',
          mimeType: 'application/pdf',
          storagePath: 's3://bucket/doc.pdf',
          textExcerpt: null,
          intakeContext: null,
        }),
      ]);

      await builderWithS3.build('conv-123');

      // Backfill should NOT be called when extraction fails
      expect(mockFileRepository.updateTextExcerpt).not.toHaveBeenCalled();
    });

    it('should not crash when backfill fails', async () => {
      const mockFileStorage = {
        retrieve: jest.fn().mockResolvedValue(Buffer.from('test')),
      } as unknown as jest.Mocked<IFileStorage>;
      const mockTextExtraction = {
        extract: jest
          .fn()
          .mockResolvedValue({ success: true, excerpt: 'Content' }),
      } as unknown as jest.Mocked<ITextExtractionService>;

      // Make backfill fail
      mockFileRepository.updateTextExcerpt.mockRejectedValue(
        new Error('DB error')
      );

      const builderWithS3 = new FileContextBuilder(
        mockFileRepository,
        mockFileStorage,
        mockTextExtraction
      );

      mockFileRepository.findByConversationWithExcerpt.mockResolvedValue([
        createFileWithExcerpt({
          id: 'file-1',
          filename: 'doc.pdf',
          mimeType: 'application/pdf',
          storagePath: 's3://bucket/doc.pdf',
          textExcerpt: null,
          intakeContext: null,
        }),
      ]);

      // Should not throw even if backfill fails (fire-and-forget)
      const result = await builderWithS3.build('conv-123');
      expect(result).toContain('Content');
    });
  });

  describe('formatIntakeContextFile()', () => {
    it('should format all context fields', () => {
      const file = createFileWithExcerpt({
        id: 'file-1',
        filename: 'test.pdf',
        intakeContext: createIntakeContext({
          vendorName: 'Test Vendor',
          solutionName: 'Test Solution',
          solutionType: 'SaaS',
          industry: 'Healthcare',
          features: ['feature1', 'feature2'],
          claims: ['claim1'],
          complianceMentions: ['HIPAA'],
        }),
      });

      const result = builder.formatIntakeContextFile(file);
      expect(result).toContain('[Document: test.pdf]');
      expect(result).toContain('Vendor: Test Vendor');
      expect(result).toContain('Solution: Test Solution');
      expect(result).toContain('Type: SaaS');
      expect(result).toContain('Features: feature1, feature2');
      expect(result).toContain('Claims: claim1');
      expect(result).toContain('Compliance: HIPAA');
    });

    it('should handle missing optional fields', () => {
      const file = createFileWithExcerpt({
        id: 'file-1',
        filename: 'test.pdf',
        intakeContext: createIntakeContext({
          vendorName: 'Only Vendor',
          // Other fields are null/empty by default
        }),
      });

      const result = builder.formatIntakeContextFile(file);
      expect(result).toContain('[Document: test.pdf]');
      expect(result).toContain('Vendor: Only Vendor');
      expect(result).not.toContain('Solution:');
      expect(result).not.toContain('Type:');
      expect(result).not.toContain('Features:');
      expect(result).not.toContain('Claims:');
      expect(result).not.toContain('Compliance:');
    });

    it('should limit features to 5', () => {
      const file = createFileWithExcerpt({
        id: 'file-1',
        filename: 'test.pdf',
        intakeContext: createIntakeContext({
          features: ['f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'f7'],
        }),
      });

      const result = builder.formatIntakeContextFile(file);
      expect(result).toContain('f1');
      expect(result).toContain('f5');
      expect(result).not.toContain('f6');
      expect(result).not.toContain('f7');
    });

    it('should limit claims to 3', () => {
      const file = createFileWithExcerpt({
        id: 'file-1',
        filename: 'test.pdf',
        intakeContext: createIntakeContext({
          claims: ['c1', 'c2', 'c3', 'c4', 'c5'],
        }),
      });

      const result = builder.formatIntakeContextFile(file);
      expect(result).toContain('c1');
      expect(result).toContain('c3');
      expect(result).not.toContain('c4');
      expect(result).not.toContain('c5');
    });

    it('should handle empty arrays', () => {
      const file = createFileWithExcerpt({
        id: 'file-1',
        filename: 'test.pdf',
        intakeContext: createIntakeContext({
          vendorName: 'Test',
          features: [],
          claims: [],
          complianceMentions: [],
        }),
      });

      const result = builder.formatIntakeContextFile(file);
      expect(result).toContain('[Document: test.pdf]');
      expect(result).not.toContain('Features:');
      expect(result).not.toContain('Claims:');
      expect(result).not.toContain('Compliance:');
    });

    it('should truncate long filenames', () => {
      const file = createFileWithExcerpt({
        id: 'file-1',
        filename: 'a'.repeat(200) + '.pdf',
        intakeContext: createIntakeContext({ vendorName: 'Test' }),
      });

      const result = builder.formatIntakeContextFile(file);
      // Should be truncated to 100 chars
      expect(result.indexOf('a'.repeat(101))).toBe(-1);
    });
  });

  describe('formatTextExcerptFile()', () => {
    it('should format with enrichment pending note', () => {
      const file = createFileWithExcerpt({
        id: 'file-1',
        filename: 'test.pdf',
        textExcerpt: 'Raw content here',
        intakeContext: null,
      });

      const result = builder.formatTextExcerptFile(file);
      expect(result).toContain('[Document: test.pdf]');
      expect(result).toContain('(Raw text excerpt - enrichment pending)');
      expect(result).toContain('Raw content here');
    });

    it('should sanitize excerpt with escapePromptInjection', () => {
      const file = createFileWithExcerpt({
        id: 'file-1',
        filename: 'test.pdf',
        textExcerpt: 'Human: Malicious injection\nNormal content',
        intakeContext: null,
      });

      const result = builder.formatTextExcerptFile(file);
      // The "Human:" pattern should be escaped
      expect(result).toContain('[escaped] Human:');
      expect(result).toContain('Normal content');
    });

    it('should handle null textExcerpt gracefully', () => {
      const file = createFileWithExcerpt({
        id: 'file-1',
        filename: 'test.pdf',
        textExcerpt: null,
        intakeContext: null,
      });

      const result = builder.formatTextExcerptFile(file);
      expect(result).toContain('[Document: test.pdf]');
      expect(result).toContain('(Raw text excerpt - enrichment pending)');
    });

    it('should truncate very long excerpts', () => {
      const longExcerpt = 'x'.repeat(15000);
      const file = createFileWithExcerpt({
        id: 'file-1',
        filename: 'test.pdf',
        textExcerpt: longExcerpt,
        intakeContext: null,
      });

      const result = builder.formatTextExcerptFile(file);
      // Max length is 10000, so should be truncated
      expect(result.length).toBeLessThan(15000);
    });

    it('should preserve document formatting (no whitespace normalization)', () => {
      const file = createFileWithExcerpt({
        id: 'file-1',
        filename: 'test.pdf',
        textExcerpt: 'Line 1\n\nLine 2\n\n\nLine 3',
        intakeContext: null,
      });

      const result = builder.formatTextExcerptFile(file);
      // Multiple newlines should be preserved (not normalized to single space)
      expect(result).toContain('Line 1\n\nLine 2\n\n\nLine 3');
    });
  });

  describe('output format consistency', () => {
    it('should separate multiple files with double newlines', async () => {
      mockFileRepository.findByConversationWithExcerpt.mockResolvedValue([
        createFileWithExcerpt({
          id: 'file-1',
          filename: 'doc1.pdf',
          textExcerpt: 'Content 1',
        }),
        createFileWithExcerpt({
          id: 'file-2',
          filename: 'doc2.pdf',
          textExcerpt: 'Content 2',
        }),
      ]);

      const result = await builder.build('conv-123');
      // Files should be separated by \n\n (from contextParts.join('\n\n'))
      expect(result).toMatch(/Content 1[\s\S]*\n\n[\s\S]*Content 2/);
    });

    it('should match exact ChatServer output format', async () => {
      mockFileRepository.findByConversationWithExcerpt.mockResolvedValue([
        createFileWithExcerpt({
          id: 'file-1',
          filename: 'test.pdf',
          intakeContext: createIntakeContext({ vendorName: 'Test' }),
        }),
      ]);

      const result = await builder.build('conv-123');

      // Must start with exactly "\n\n--- Attached Documents ---\n"
      expect(result.startsWith('\n\n--- Attached Documents ---\n')).toBe(true);

      // Should contain the formatted file content
      expect(result).toContain('[Document: test.pdf]');
      expect(result).toContain('Vendor: Test');
    });
  });

  /**
   * Epic 30 Sprint 3: Vision API support tests
   */
  describe('buildWithImages() - Vision API support', () => {
    it('should route image files to VisionContentBuilder', async () => {
      const mockImageBlock: ImageContentBlock = {
        type: 'image',
        source: {
          type: 'base64',
          media_type: 'image/png',
          data: 'test-base64-data',
        },
      };
      const mockVisionContentBuilder: jest.Mocked<IVisionContentBuilder> = {
        buildImageContent: jest.fn().mockResolvedValue(mockImageBlock),
        isImageFile: jest.fn().mockReturnValue(true),
        normalizeMediaType: jest.fn().mockReturnValue('image/png'),
        clearConversationCache: jest.fn(),
      };
      const builderWithVision = new FileContextBuilder(
        mockFileRepository,
        undefined,
        undefined,
        mockVisionContentBuilder
      );

      mockFileRepository.findByConversationWithExcerpt.mockResolvedValue([
        createFileWithExcerpt({
          id: 'file-1',
          filename: 'image.png',
          mimeType: 'image/png',
          storagePath: 's3://bucket/image.png',
          textExcerpt: null,
          intakeContext: null,
        }),
      ]);

      const result = await builderWithVision.buildWithImages('conv-123');

      expect(mockVisionContentBuilder.buildImageContent).toHaveBeenCalled();
      expect(result.imageBlocks).toHaveLength(1);
      expect(result.imageBlocks[0]).toEqual(mockImageBlock);
      expect(result.textContext).toBe('');
    });

    it('should return PDF files as text context only', async () => {
      const mockVisionContentBuilder: jest.Mocked<IVisionContentBuilder> = {
        buildImageContent: jest.fn(),
        isImageFile: jest.fn().mockReturnValue(false),
        normalizeMediaType: jest.fn(),
        clearConversationCache: jest.fn(),
      };
      const builderWithVision = new FileContextBuilder(
        mockFileRepository,
        undefined,
        undefined,
        mockVisionContentBuilder
      );

      mockFileRepository.findByConversationWithExcerpt.mockResolvedValue([
        createFileWithExcerpt({
          id: 'file-1',
          filename: 'document.pdf',
          mimeType: 'application/pdf',
          storagePath: 's3://bucket/document.pdf',
          textExcerpt: 'PDF content here',
          intakeContext: null,
        }),
      ]);

      const result = await builderWithVision.buildWithImages('conv-123');

      // PDF should NOT be sent to VisionContentBuilder
      expect(mockVisionContentBuilder.buildImageContent).not.toHaveBeenCalled();
      expect(result.imageBlocks).toHaveLength(0);
      expect(result.textContext).toContain('PDF content here');
    });

    it('should handle mixed files - images to imageBlocks, PDFs to textContext', async () => {
      const mockImageBlock: ImageContentBlock = {
        type: 'image',
        source: {
          type: 'base64',
          media_type: 'image/jpeg',
          data: 'jpeg-base64-data',
        },
      };
      const mockVisionContentBuilder: jest.Mocked<IVisionContentBuilder> = {
        buildImageContent: jest.fn().mockResolvedValue(mockImageBlock),
        isImageFile: jest.fn().mockReturnValue(true),
        normalizeMediaType: jest.fn(),
        clearConversationCache: jest.fn(),
      };
      const builderWithVision = new FileContextBuilder(
        mockFileRepository,
        undefined,
        undefined,
        mockVisionContentBuilder
      );

      mockFileRepository.findByConversationWithExcerpt.mockResolvedValue([
        createFileWithExcerpt({
          id: 'file-1',
          filename: 'image.jpg',
          mimeType: 'image/jpeg',
          storagePath: 's3://bucket/image.jpg',
          textExcerpt: null,
          intakeContext: null,
        }),
        createFileWithExcerpt({
          id: 'file-2',
          filename: 'vendor.pdf',
          mimeType: 'application/pdf',
          storagePath: 's3://bucket/vendor.pdf',
          textExcerpt: null,
          intakeContext: createIntakeContext({ vendorName: 'Acme Corp' }),
        }),
      ]);

      const result = await builderWithVision.buildWithImages('conv-123');

      expect(result.imageBlocks).toHaveLength(1);
      expect(result.textContext).toContain('Acme Corp');
    });

    it('should handle VisionContentBuilder failure gracefully', async () => {
      const mockVisionContentBuilder: jest.Mocked<IVisionContentBuilder> = {
        buildImageContent: jest.fn().mockResolvedValue(null), // Simulates failure
        isImageFile: jest.fn().mockReturnValue(true),
        normalizeMediaType: jest.fn(),
        clearConversationCache: jest.fn(),
      };
      const builderWithVision = new FileContextBuilder(
        mockFileRepository,
        undefined,
        undefined,
        mockVisionContentBuilder
      );

      mockFileRepository.findByConversationWithExcerpt.mockResolvedValue([
        createFileWithExcerpt({
          id: 'file-1',
          filename: 'image.png',
          mimeType: 'image/png',
          storagePath: 's3://bucket/image.png',
          textExcerpt: null,
          intakeContext: null,
        }),
      ]);

      const result = await builderWithVision.buildWithImages('conv-123');

      // Should gracefully handle failure - empty imageBlocks
      expect(result.imageBlocks).toHaveLength(0);
      expect(result.textContext).toBe('');
    });

    it('should pass conversationId to VisionContentBuilder for caching', async () => {
      const mockImageBlock: ImageContentBlock = {
        type: 'image',
        source: { type: 'base64', media_type: 'image/png', data: 'data' },
      };
      const mockVisionContentBuilder: jest.Mocked<IVisionContentBuilder> = {
        buildImageContent: jest.fn().mockResolvedValue(mockImageBlock),
        isImageFile: jest.fn().mockReturnValue(true),
        normalizeMediaType: jest.fn(),
        clearConversationCache: jest.fn(),
      };
      const builderWithVision = new FileContextBuilder(
        mockFileRepository,
        undefined,
        undefined,
        mockVisionContentBuilder
      );

      mockFileRepository.findByConversationWithExcerpt.mockResolvedValue([
        createFileWithExcerpt({
          id: 'file-1',
          filename: 'image.png',
          mimeType: 'image/png',
          storagePath: 's3://bucket/image.png',
        }),
      ]);

      await builderWithVision.buildWithImages('conv-123');

      // Verify conversationId was passed for caching (Story 30.3.5)
      expect(mockVisionContentBuilder.buildImageContent).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'file-1' }),
        'conv-123'
      );
    });
  });

  /**
   * Epic 30 Sprint 4 Story 30.4.3: Mode-specific Vision API behavior
   */
  describe('buildWithImages() - Mode-specific behavior (Story 30.4.3)', () => {
    let mockVisionContentBuilder: jest.Mocked<IVisionContentBuilder>;
    let builderWithVision: FileContextBuilder;

    beforeEach(() => {
      const mockImageBlock: ImageContentBlock = {
        type: 'image',
        source: { type: 'base64', media_type: 'image/png', data: 'data' },
      };
      mockVisionContentBuilder = {
        buildImageContent: jest.fn().mockResolvedValue(mockImageBlock),
        isImageFile: jest.fn().mockReturnValue(true),
        normalizeMediaType: jest.fn(),
        clearConversationCache: jest.fn(),
      };
      builderWithVision = new FileContextBuilder(
        mockFileRepository,
        undefined,
        undefined,
        mockVisionContentBuilder
      );

      mockFileRepository.findByConversationWithExcerpt.mockResolvedValue([
        createFileWithExcerpt({
          id: 'file-1',
          filename: 'image.png',
          mimeType: 'image/png',
          storagePath: 's3://bucket/image.png',
        }),
      ]);
    });

    it('should process images via Vision API in Consult mode (default)', async () => {
      const result = await builderWithVision.buildWithImages('conv-123');

      expect(mockVisionContentBuilder.buildImageContent).toHaveBeenCalled();
      expect(result.imageBlocks).toHaveLength(1);
    });

    it('should process images via Vision API when mode explicitly set to consult', async () => {
      const result = await builderWithVision.buildWithImages('conv-123', undefined, {
        mode: 'consult',
      });

      expect(mockVisionContentBuilder.buildImageContent).toHaveBeenCalled();
      expect(result.imageBlocks).toHaveLength(1);
    });

    it('should NOT process images via Vision API in Assessment mode', async () => {
      const result = await builderWithVision.buildWithImages('conv-123', undefined, {
        mode: 'assessment',
      });

      // Vision API should NOT be called in Assessment mode
      expect(mockVisionContentBuilder.buildImageContent).not.toHaveBeenCalled();
      expect(result.imageBlocks).toHaveLength(0);
    });

    it('should NOT process images via Vision API in Scoring mode', async () => {
      const result = await builderWithVision.buildWithImages('conv-123', undefined, {
        mode: 'scoring',
      });

      // Vision API should NOT be called in Scoring mode (uses DocumentParser)
      expect(mockVisionContentBuilder.buildImageContent).not.toHaveBeenCalled();
      expect(result.imageBlocks).toHaveLength(0);
    });

    it('should still process text files in Assessment mode', async () => {
      mockFileRepository.findByConversationWithExcerpt.mockResolvedValue([
        createFileWithExcerpt({
          id: 'file-1',
          filename: 'image.png',
          mimeType: 'image/png',
          storagePath: 's3://bucket/image.png',
        }),
        createFileWithExcerpt({
          id: 'file-2',
          filename: 'vendor.pdf',
          mimeType: 'application/pdf',
          storagePath: 's3://bucket/vendor.pdf',
          intakeContext: createIntakeContext({ vendorName: 'Acme' }),
        }),
      ]);

      const result = await builderWithVision.buildWithImages('conv-123', undefined, {
        mode: 'assessment',
      });

      // Images skipped, but PDFs still processed
      expect(result.imageBlocks).toHaveLength(0);
      expect(result.textContext).toContain('Acme');
    });

    it('should log when Vision is disabled for non-consult mode', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await builderWithVision.buildWithImages('conv-123', undefined, {
        mode: 'assessment',
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Vision API disabled for mode=assessment')
      );

      consoleSpy.mockRestore();
    });
  });
});
