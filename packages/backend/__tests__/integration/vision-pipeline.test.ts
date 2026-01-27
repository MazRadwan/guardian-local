/**
 * Integration Tests - Vision Pipeline (Epic 30 Sprint 4 Story 30.4.1)
 *
 * Tests the complete Vision pipeline end-to-end:
 * 1. Upload PNG → Claude receives Vision block
 * 2. Upload JPG → same flow works
 * 3. Upload PDF + image → both processed correctly
 * 4. Large image (4-5MB) → warning logged, still works
 * 5. Oversized image (>5MB) → graceful rejection
 *
 * These tests mock the Claude API to verify the request payload
 * contains properly formatted image blocks.
 */

import { VisionContentBuilder } from '../../src/infrastructure/ai/VisionContentBuilder';
import { FileContextBuilder } from '../../src/infrastructure/websocket/context/FileContextBuilder';
import type { IFileStorage } from '../../src/application/interfaces/IFileStorage';
import type { IFileRepository, FileWithExcerpt } from '../../src/application/interfaces/IFileRepository';
import type { IVisionContentBuilder } from '../../src/application/interfaces/IVisionContentBuilder';
import type { ImageContentBlock } from '../../src/infrastructure/ai/types/vision';

/**
 * Helper to create a FileWithExcerpt with defaults
 */
function createFileWithExcerpt(
  overrides: Partial<FileWithExcerpt> & { size?: number } = {}
): FileWithExcerpt & { size: number } {
  return {
    id: 'file-1',
    filename: 'test.pdf',
    mimeType: 'application/pdf',
    storagePath: 's3://bucket/test.pdf',
    textExcerpt: null,
    intakeContext: null,
    size: 1024 * 1024, // 1MB default
    ...overrides,
  } as FileWithExcerpt & { size: number };
}

describe('Vision Pipeline Integration Tests', () => {
  let mockFileStorage: jest.Mocked<IFileStorage>;
  let mockFileRepository: jest.Mocked<IFileRepository>;
  let visionContentBuilder: VisionContentBuilder;
  let fileContextBuilder: FileContextBuilder;

  // Console spies
  let consoleWarnSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;
  let consoleLogSpy: jest.SpyInstance;

  // Test image buffers (small for speed)
  const createTestImageBuffer = (sizeBytes: number = 1000): Buffer => {
    return Buffer.alloc(sizeBytes, 'x');
  };

  beforeEach(() => {
    // Mock file storage
    mockFileStorage = {
      store: jest.fn(),
      retrieve: jest.fn().mockResolvedValue(createTestImageBuffer()),
      delete: jest.fn(),
      exists: jest.fn(),
    } as jest.Mocked<IFileStorage>;

    // Mock file repository
    mockFileRepository = {
      findByConversationWithExcerpt: jest.fn(),
      updateTextExcerpt: jest.fn().mockResolvedValue(undefined),
      updateExcerptAndClassification: jest.fn().mockResolvedValue(undefined),
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

    // Create VisionContentBuilder
    visionContentBuilder = new VisionContentBuilder(mockFileStorage);

    // Create FileContextBuilder with VisionContentBuilder
    fileContextBuilder = new FileContextBuilder(
      mockFileRepository,
      mockFileStorage,
      undefined, // textExtractionService
      visionContentBuilder
    );

    // Console spies
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('PNG Image Upload → Claude receives Vision block', () => {
    it('should convert PNG file to ImageContentBlock for Claude', async () => {
      const pngFile = createFileWithExcerpt({
        id: 'png-file-1',
        filename: 'screenshot.png',
        mimeType: 'image/png',
        storagePath: 's3://bucket/screenshot.png',
        size: 500 * 1024, // 500KB
      });

      mockFileRepository.findByConversationWithExcerpt.mockResolvedValue([pngFile]);

      const result = await fileContextBuilder.buildWithImages('conv-123');

      // Should have one image block
      expect(result.imageBlocks).toHaveLength(1);
      expect(result.imageBlocks[0].type).toBe('image');
      expect(result.imageBlocks[0].source.type).toBe('base64');
      expect(result.imageBlocks[0].source.media_type).toBe('image/png');
      expect(result.imageBlocks[0].source.data).toBeDefined();

      // Should have no text context (image only)
      expect(result.textContext).toBe('');

      // Verify storage was called
      expect(mockFileStorage.retrieve).toHaveBeenCalledWith(pngFile.storagePath);
    });
  });

  describe('JPG Image Upload → Claude receives Vision block', () => {
    it('should convert JPG file to ImageContentBlock with normalized mime type', async () => {
      const jpgFile = createFileWithExcerpt({
        id: 'jpg-file-1',
        filename: 'photo.jpg',
        mimeType: 'image/jpeg',
        storagePath: 's3://bucket/photo.jpg',
        size: 800 * 1024, // 800KB
      });

      mockFileRepository.findByConversationWithExcerpt.mockResolvedValue([jpgFile]);

      const result = await fileContextBuilder.buildWithImages('conv-123');

      expect(result.imageBlocks).toHaveLength(1);
      expect(result.imageBlocks[0].source.media_type).toBe('image/jpeg');
    });

    it('should normalize image/jpg to image/jpeg', async () => {
      const jpgFile = createFileWithExcerpt({
        id: 'jpg-file-2',
        filename: 'photo.jpg',
        mimeType: 'image/jpg', // Non-standard
        storagePath: 's3://bucket/photo.jpg',
        size: 800 * 1024,
      });

      mockFileRepository.findByConversationWithExcerpt.mockResolvedValue([jpgFile]);

      const result = await fileContextBuilder.buildWithImages('conv-123');

      expect(result.imageBlocks).toHaveLength(1);
      // Should be normalized to image/jpeg
      expect(result.imageBlocks[0].source.media_type).toBe('image/jpeg');
    });
  });

  describe('PDF + Image Upload → Both processed correctly', () => {
    it('should process PDF as text and image as Vision block', async () => {
      const pdfFile = createFileWithExcerpt({
        id: 'pdf-file-1',
        filename: 'document.pdf',
        mimeType: 'application/pdf',
        storagePath: 's3://bucket/document.pdf',
        textExcerpt: 'This is the PDF content extracted as text.',
        size: 1024 * 1024,
      });

      const pngFile = createFileWithExcerpt({
        id: 'png-file-2',
        filename: 'diagram.png',
        mimeType: 'image/png',
        storagePath: 's3://bucket/diagram.png',
        size: 500 * 1024,
      });

      mockFileRepository.findByConversationWithExcerpt.mockResolvedValue([pdfFile, pngFile]);

      const result = await fileContextBuilder.buildWithImages('conv-123');

      // Should have text context from PDF
      expect(result.textContext).toContain('PDF content extracted');
      expect(result.textContext).toContain('Attached Documents');

      // Should have image block from PNG
      expect(result.imageBlocks).toHaveLength(1);
      expect(result.imageBlocks[0].source.media_type).toBe('image/png');
    });

    it('should process multiple images in order', async () => {
      const png1 = createFileWithExcerpt({
        id: 'png-1',
        filename: 'first.png',
        mimeType: 'image/png',
        storagePath: 's3://bucket/first.png',
        size: 300 * 1024,
      });

      const png2 = createFileWithExcerpt({
        id: 'png-2',
        filename: 'second.png',
        mimeType: 'image/png',
        storagePath: 's3://bucket/second.png',
        size: 400 * 1024,
      });

      const jpg = createFileWithExcerpt({
        id: 'jpg-1',
        filename: 'third.jpg',
        mimeType: 'image/jpeg',
        storagePath: 's3://bucket/third.jpg',
        size: 500 * 1024,
      });

      mockFileRepository.findByConversationWithExcerpt.mockResolvedValue([png1, png2, jpg]);

      const result = await fileContextBuilder.buildWithImages('conv-123');

      // Should have 3 image blocks
      expect(result.imageBlocks).toHaveLength(3);
      expect(result.imageBlocks[0].source.media_type).toBe('image/png');
      expect(result.imageBlocks[1].source.media_type).toBe('image/png');
      expect(result.imageBlocks[2].source.media_type).toBe('image/jpeg');
    });
  });

  describe('Large Image (4-5MB) → Warning logged, still works', () => {
    it('should process large image with warning', async () => {
      const largeImageSize = 4.5 * 1024 * 1024; // 4.5MB
      const largeBuffer = createTestImageBuffer(Math.floor(largeImageSize));
      mockFileStorage.retrieve.mockResolvedValue(largeBuffer);

      const largeImage = createFileWithExcerpt({
        id: 'large-image',
        filename: 'large-screenshot.png',
        mimeType: 'image/png',
        storagePath: 's3://bucket/large-screenshot.png',
        size: largeImageSize,
      });

      mockFileRepository.findByConversationWithExcerpt.mockResolvedValue([largeImage]);

      const result = await fileContextBuilder.buildWithImages('conv-123');

      // Should still process the image
      expect(result.imageBlocks).toHaveLength(1);
      expect(result.imageBlocks[0].type).toBe('image');

      // Should log warning about large image
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Large image')
      );
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('fileId=large-image')
      );
    });

    it('should process image exactly at 5MB (at limit)', async () => {
      const atLimitSize = 5 * 1024 * 1024; // Exactly 5MB
      const atLimitBuffer = createTestImageBuffer(atLimitSize);
      mockFileStorage.retrieve.mockResolvedValue(atLimitBuffer);

      const atLimitImage = createFileWithExcerpt({
        id: 'at-limit-image',
        filename: 'at-limit.png',
        mimeType: 'image/png',
        storagePath: 's3://bucket/at-limit.png',
        size: atLimitSize,
      });

      mockFileRepository.findByConversationWithExcerpt.mockResolvedValue([atLimitImage]);

      const result = await fileContextBuilder.buildWithImages('conv-123');

      // Should still work (exactly at 5MB limit)
      expect(result.imageBlocks).toHaveLength(1);

      // Should have warning (4-5MB range triggers warning)
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Large image')
      );
    });
  });

  describe('Oversized Image (>5MB) → Graceful rejection', () => {
    it('should reject image over 5MB and not include in result', async () => {
      const oversizedSize = 6 * 1024 * 1024; // 6MB - over limit

      const oversizedImage = createFileWithExcerpt({
        id: 'oversized-image',
        filename: 'huge-image.png',
        mimeType: 'image/png',
        storagePath: 's3://bucket/huge-image.png',
        size: oversizedSize,
      });

      mockFileRepository.findByConversationWithExcerpt.mockResolvedValue([oversizedImage]);

      const result = await fileContextBuilder.buildWithImages('conv-123');

      // Should NOT have any image blocks (rejected)
      expect(result.imageBlocks).toHaveLength(0);
      expect(result.textContext).toBe('');

      // Should log error about oversized image
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Image too large')
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('fileId=oversized-image')
      );

      // Should NOT have called storage retrieve (rejected before retrieval)
      expect(mockFileStorage.retrieve).not.toHaveBeenCalled();
    });

    it('should process valid images while rejecting oversized ones', async () => {
      const validImage = createFileWithExcerpt({
        id: 'valid-image',
        filename: 'small.png',
        mimeType: 'image/png',
        storagePath: 's3://bucket/small.png',
        size: 1 * 1024 * 1024, // 1MB - valid
      });

      const oversizedImage = createFileWithExcerpt({
        id: 'oversized-image',
        filename: 'huge.png',
        mimeType: 'image/png',
        storagePath: 's3://bucket/huge.png',
        size: 6 * 1024 * 1024, // 6MB - over limit
      });

      mockFileRepository.findByConversationWithExcerpt.mockResolvedValue([
        validImage,
        oversizedImage,
      ]);

      const result = await fileContextBuilder.buildWithImages('conv-123');

      // Should have only the valid image
      expect(result.imageBlocks).toHaveLength(1);

      // Valid image should be included
      expect(mockFileStorage.retrieve).toHaveBeenCalledWith(validImage.storagePath);
    });
  });

  describe('GIF and WebP Support', () => {
    it('should process GIF files correctly', async () => {
      const gifFile = createFileWithExcerpt({
        id: 'gif-file',
        filename: 'animation.gif',
        mimeType: 'image/gif',
        storagePath: 's3://bucket/animation.gif',
        size: 200 * 1024,
      });

      mockFileRepository.findByConversationWithExcerpt.mockResolvedValue([gifFile]);

      const result = await fileContextBuilder.buildWithImages('conv-123');

      expect(result.imageBlocks).toHaveLength(1);
      expect(result.imageBlocks[0].source.media_type).toBe('image/gif');
    });

    it('should process WebP files correctly', async () => {
      const webpFile = createFileWithExcerpt({
        id: 'webp-file',
        filename: 'modern.webp',
        mimeType: 'image/webp',
        storagePath: 's3://bucket/modern.webp',
        size: 150 * 1024,
      });

      mockFileRepository.findByConversationWithExcerpt.mockResolvedValue([webpFile]);

      const result = await fileContextBuilder.buildWithImages('conv-123');

      expect(result.imageBlocks).toHaveLength(1);
      expect(result.imageBlocks[0].source.media_type).toBe('image/webp');
    });
  });

  describe('Claude Request Payload Verification', () => {
    it('should generate valid ImageContentBlock structure for Claude API', async () => {
      const testBuffer = createTestImageBuffer(1000);
      mockFileStorage.retrieve.mockResolvedValue(testBuffer);

      const imageFile = createFileWithExcerpt({
        id: 'test-image',
        filename: 'test.png',
        mimeType: 'image/png',
        storagePath: 's3://bucket/test.png',
        size: 1000,
      });

      mockFileRepository.findByConversationWithExcerpt.mockResolvedValue([imageFile]);

      const result = await fileContextBuilder.buildWithImages('conv-123');

      // Verify the structure matches Anthropic Vision API requirements
      const imageBlock = result.imageBlocks[0];
      expect(imageBlock).toMatchObject({
        type: 'image',
        source: {
          type: 'base64',
          media_type: 'image/png',
          data: expect.any(String),
        },
      });

      // Verify base64 data is valid
      expect(imageBlock.source.data.length).toBeGreaterThan(0);
      // Base64 encoding increases size by ~33%
      expect(imageBlock.source.data.length).toBeGreaterThan(testBuffer.length);
    });
  });

  describe('Caching Behavior', () => {
    it('should use cached image on subsequent calls', async () => {
      const imageFile = createFileWithExcerpt({
        id: 'cached-image',
        filename: 'cached.png',
        mimeType: 'image/png',
        storagePath: 's3://bucket/cached.png',
        size: 500 * 1024,
      });

      mockFileRepository.findByConversationWithExcerpt.mockResolvedValue([imageFile]);

      // First call
      const result1 = await fileContextBuilder.buildWithImages('conv-123');
      expect(result1.imageBlocks).toHaveLength(1);
      expect(mockFileStorage.retrieve).toHaveBeenCalledTimes(1);

      // Second call (should use cache)
      const result2 = await fileContextBuilder.buildWithImages('conv-123');
      expect(result2.imageBlocks).toHaveLength(1);
      // Storage should NOT be called again (cached)
      expect(mockFileStorage.retrieve).toHaveBeenCalledTimes(1);

      // Verify cache hit logged
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Cache hit')
      );
    });

    it('should not use cache for different conversations', async () => {
      const imageFile = createFileWithExcerpt({
        id: 'shared-image',
        filename: 'shared.png',
        mimeType: 'image/png',
        storagePath: 's3://bucket/shared.png',
        size: 500 * 1024,
      });

      mockFileRepository.findByConversationWithExcerpt.mockResolvedValue([imageFile]);

      // Call for conv-1
      await fileContextBuilder.buildWithImages('conv-1');
      expect(mockFileStorage.retrieve).toHaveBeenCalledTimes(1);

      // Call for conv-2 (different conversation - should NOT use cache)
      await fileContextBuilder.buildWithImages('conv-2');
      expect(mockFileStorage.retrieve).toHaveBeenCalledTimes(2);
    });
  });
});
