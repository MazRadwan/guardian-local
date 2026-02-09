/**
 * Unit Tests for MessageHandler
 *
 * Story 28.9.2: Extract MessageHandler.ts (file context building)
 * Story 36.1.3: Validation tests moved to SendMessageValidator.test.ts
 * Story 36.2.3: Streaming tests moved to ClaudeStreamingService.test.ts
 *
 * Tests cover:
 * buildFileContext (Story 28.9.2):
 * 1. Return empty string when FileContextBuilder not configured
 * 2. Build context for all files when no attachments provided
 * 3. Build context for all files when empty attachments array
 * 4. Scope to specific files when enrichedAttachments provided
 * 5. Extract fileIds from enrichedAttachments
 */

import { MessageHandler } from '../../../../../src/infrastructure/websocket/handlers/MessageHandler.js';
import type { MessageAttachment } from '../../../../../src/domain/entities/Message.js';
import type { FileContextBuilder } from '../../../../../src/infrastructure/websocket/context/FileContextBuilder.js';

/**
 * Create a mock FileContextBuilder
 * Story 28.9.2: File context building
 */
const createMockFileContextBuilder = (): jest.Mocked<FileContextBuilder> => ({
  build: jest.fn(),
  buildWithImages: jest.fn().mockResolvedValue({ textContext: '', imageBlocks: [] }),
  formatIntakeContextFile: jest.fn(),
  formatTextExcerptFile: jest.fn(),
} as unknown as jest.Mocked<FileContextBuilder>);

describe('MessageHandler', () => {
  let handler: MessageHandler;

  beforeEach(() => {
    // Story 36.2.2: MessageHandler now has single optional param (FileContextBuilder)
    handler = new MessageHandler();

    // Suppress console output during tests
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  /**
   * Story 28.9.2: buildFileContext tests
   *
   * Tests file context building for Claude prompts.
   * NOTE: Validation (ownership, conversation membership) is handled in Story 28.9.1.
   * This method receives pre-validated enrichedAttachments and builds context from them.
   */
  describe('buildFileContext', () => {
    let mockFileContextBuilder: jest.Mocked<FileContextBuilder>;
    let handlerWithBuilder: MessageHandler;

    beforeEach(() => {
      mockFileContextBuilder = createMockFileContextBuilder();
      // Story 36.2.2: MessageHandler now has single optional param (FileContextBuilder)
      handlerWithBuilder = new MessageHandler(
        mockFileContextBuilder
      );
    });

    it('should return empty result when FileContextBuilder not configured', async () => {
      // Use handler without FileContextBuilder (from parent describe)
      const result = await handler.buildFileContext('conv-1');

      expect(result).toEqual({ textContext: '', imageBlocks: [] });
    });

    it('should return empty result when FileContextBuilder not configured (with attachments)', async () => {
      const enrichedAttachments: MessageAttachment[] = [
        { fileId: 'file-1', filename: 'doc.pdf', mimeType: 'application/pdf', size: 1024 },
      ];

      const result = await handler.buildFileContext('conv-1', enrichedAttachments);

      expect(result).toEqual({ textContext: '', imageBlocks: [] });
    });

    it('should build context for all files when no attachments provided', async () => {
      mockFileContextBuilder.buildWithImages.mockResolvedValue({
        textContext: '\n\n--- Attached Documents ---\nDocument context here',
        imageBlocks: [],
      });

      const result = await handlerWithBuilder.buildFileContext('conv-1');

      expect(mockFileContextBuilder.buildWithImages).toHaveBeenCalledWith('conv-1', undefined, undefined);
      expect(mockFileContextBuilder.buildWithImages).toHaveBeenCalledTimes(1);
      expect(result.textContext).toContain('Attached Documents');
    });

    it('should build context for all files when empty attachments array', async () => {
      mockFileContextBuilder.buildWithImages.mockResolvedValue({
        textContext: '\n\n--- Attached Documents ---\nDocument context here',
        imageBlocks: [],
      });

      const result = await handlerWithBuilder.buildFileContext('conv-1', []);

      expect(mockFileContextBuilder.buildWithImages).toHaveBeenCalledWith('conv-1', undefined, undefined);
      expect(mockFileContextBuilder.buildWithImages).toHaveBeenCalledTimes(1);
      expect(result.textContext).toContain('Attached Documents');
    });

    it('should build context for all files when undefined attachments', async () => {
      mockFileContextBuilder.buildWithImages.mockResolvedValue({
        textContext: '\n\n--- Attached Documents ---\nDocument context here',
        imageBlocks: [],
      });

      const result = await handlerWithBuilder.buildFileContext('conv-1', undefined);

      expect(mockFileContextBuilder.buildWithImages).toHaveBeenCalledWith('conv-1', undefined, undefined);
    });

    it('should scope to specific files when enrichedAttachments provided', async () => {
      mockFileContextBuilder.buildWithImages.mockResolvedValue({
        textContext: 'Scoped context for specific files',
        imageBlocks: [],
      });

      const enrichedAttachments: MessageAttachment[] = [
        { fileId: 'file-1', filename: 'doc.pdf', mimeType: 'application/pdf', size: 1024 },
        { fileId: 'file-2', filename: 'data.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', size: 2048 },
      ];

      const result = await handlerWithBuilder.buildFileContext('conv-1', enrichedAttachments);

      expect(mockFileContextBuilder.buildWithImages).toHaveBeenCalledWith('conv-1', ['file-1', 'file-2'], undefined);
      expect(result.textContext).toBe('Scoped context for specific files');
    });

    it('should extract fileIds from enrichedAttachments correctly', async () => {
      mockFileContextBuilder.buildWithImages.mockResolvedValue({
        textContext: 'Context',
        imageBlocks: [],
      });

      const enrichedAttachments: MessageAttachment[] = [
        { fileId: 'uuid-aaa', filename: 'report.pdf', mimeType: 'application/pdf', size: 5000 },
        { fileId: 'uuid-bbb', filename: 'analysis.docx', mimeType: 'application/docx', size: 3000 },
        { fileId: 'uuid-ccc', filename: 'summary.txt', mimeType: 'text/plain', size: 1000 },
      ];

      await handlerWithBuilder.buildFileContext('my-conv-id', enrichedAttachments);

      expect(mockFileContextBuilder.buildWithImages).toHaveBeenCalledWith(
        'my-conv-id',
        ['uuid-aaa', 'uuid-bbb', 'uuid-ccc'],
        undefined
      );
    });

    it('should handle single enriched attachment', async () => {
      mockFileContextBuilder.buildWithImages.mockResolvedValue({
        textContext: 'Single file context',
        imageBlocks: [],
      });

      const enrichedAttachments: MessageAttachment[] = [
        { fileId: 'single-file', filename: 'only-one.pdf', mimeType: 'application/pdf', size: 1024 },
      ];

      const result = await handlerWithBuilder.buildFileContext('conv-1', enrichedAttachments);

      expect(mockFileContextBuilder.buildWithImages).toHaveBeenCalledWith('conv-1', ['single-file'], undefined);
      expect(result.textContext).toBe('Single file context');
    });

    it('should return empty result when FileContextBuilder returns empty', async () => {
      mockFileContextBuilder.buildWithImages.mockResolvedValue({
        textContext: '',
        imageBlocks: [],
      });

      const result = await handlerWithBuilder.buildFileContext('conv-no-files');

      expect(result.textContext).toBe('');
      expect(result.imageBlocks).toEqual([]);
    });

    it('should propagate errors from FileContextBuilder', async () => {
      mockFileContextBuilder.buildWithImages.mockRejectedValue(new Error('S3 connection failed'));

      await expect(
        handlerWithBuilder.buildFileContext('conv-1')
      ).rejects.toThrow('S3 connection failed');
    });

    it('should pass conversationId correctly to FileContextBuilder', async () => {
      mockFileContextBuilder.buildWithImages.mockResolvedValue({
        textContext: 'Context',
        imageBlocks: [],
      });

      await handlerWithBuilder.buildFileContext('specific-conversation-uuid');

      expect(mockFileContextBuilder.buildWithImages).toHaveBeenCalledWith('specific-conversation-uuid', undefined, undefined);
    });

    // Epic 30 Sprint 3: New test for imageBlocks
    it('should return imageBlocks when VisionContentBuilder produces them', async () => {
      const mockImageBlock = {
        type: 'image' as const,
        source: {
          type: 'base64' as const,
          media_type: 'image/png' as const,
          data: 'test-base64-data',
        },
      };
      mockFileContextBuilder.buildWithImages.mockResolvedValue({
        textContext: '',
        imageBlocks: [mockImageBlock],
      });

      const result = await handlerWithBuilder.buildFileContext('conv-1');

      expect(result.imageBlocks).toHaveLength(1);
      expect(result.imageBlocks[0]).toEqual(mockImageBlock);
    });

    // Epic 30 Sprint 4 Story 30.4.3: Mode-specific Vision API behavior
    describe('mode-specific Vision API gating', () => {
      it('should pass mode to FileContextBuilder.buildWithImages', async () => {
        mockFileContextBuilder.buildWithImages.mockResolvedValue({
          textContext: 'Context',
          imageBlocks: [],
        });

        await handlerWithBuilder.buildFileContext('conv-1', undefined, 'assessment');

        expect(mockFileContextBuilder.buildWithImages).toHaveBeenCalledWith(
          'conv-1',
          undefined,
          { mode: 'assessment' }
        );
      });

      it('should pass consult mode to FileContextBuilder.buildWithImages', async () => {
        mockFileContextBuilder.buildWithImages.mockResolvedValue({
          textContext: 'Context',
          imageBlocks: [],
        });

        await handlerWithBuilder.buildFileContext('conv-1', undefined, 'consult');

        expect(mockFileContextBuilder.buildWithImages).toHaveBeenCalledWith(
          'conv-1',
          undefined,
          { mode: 'consult' }
        );
      });

      it('should NOT pass mode options when mode is undefined (backwards compatibility)', async () => {
        mockFileContextBuilder.buildWithImages.mockResolvedValue({
          textContext: 'Context',
          imageBlocks: [],
        });

        await handlerWithBuilder.buildFileContext('conv-1');

        expect(mockFileContextBuilder.buildWithImages).toHaveBeenCalledWith(
          'conv-1',
          undefined,
          undefined
        );
      });

      it('should pass mode with specific fileIds when enrichedAttachments provided', async () => {
        mockFileContextBuilder.buildWithImages.mockResolvedValue({
          textContext: 'Scoped context',
          imageBlocks: [],
        });

        const enrichedAttachments: MessageAttachment[] = [
          { fileId: 'file-1', filename: 'doc.pdf', mimeType: 'application/pdf', size: 1024 },
        ];

        await handlerWithBuilder.buildFileContext('conv-1', enrichedAttachments, 'assessment');

        expect(mockFileContextBuilder.buildWithImages).toHaveBeenCalledWith(
          'conv-1',
          ['file-1'],
          { mode: 'assessment' }
        );
      });

      it('should return empty imageBlocks for assessment mode (Vision API disabled)', async () => {
        // This test verifies the integration: when assessment mode is passed,
        // FileContextBuilder returns empty imageBlocks (Vision API disabled)
        mockFileContextBuilder.buildWithImages.mockResolvedValue({
          textContext: 'Document context',
          imageBlocks: [], // Empty because assessment mode disables Vision
        });

        const result = await handlerWithBuilder.buildFileContext('conv-1', undefined, 'assessment');

        // Verify mode was passed
        expect(mockFileContextBuilder.buildWithImages).toHaveBeenCalledWith(
          'conv-1',
          undefined,
          { mode: 'assessment' }
        );
        // Verify result has empty imageBlocks
        expect(result.imageBlocks).toHaveLength(0);
        expect(result.textContext).toBe('Document context');
      });

      it('should return imageBlocks for consult mode (Vision API enabled)', async () => {
        const mockImageBlock = {
          type: 'image' as const,
          source: {
            type: 'base64' as const,
            media_type: 'image/png' as const,
            data: 'test-base64-data',
          },
        };
        mockFileContextBuilder.buildWithImages.mockResolvedValue({
          textContext: '',
          imageBlocks: [mockImageBlock],
        });

        const result = await handlerWithBuilder.buildFileContext('conv-1', undefined, 'consult');

        // Verify mode was passed
        expect(mockFileContextBuilder.buildWithImages).toHaveBeenCalledWith(
          'conv-1',
          undefined,
          { mode: 'consult' }
        );
        // Verify result has imageBlocks
        expect(result.imageBlocks).toHaveLength(1);
        expect(result.imageBlocks[0]).toEqual(mockImageBlock);
      });
    });
  });
});
