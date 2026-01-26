/**
 * VisionContentBuilder Unit Tests
 *
 * Part of Epic 30: Vision API Support
 * Stories 30.2.1 & 30.2.2: VisionContentBuilder Service with validation
 *
 * Tests:
 * - PNG/JPG/GIF/WebP files convert to ImageContentBlock
 * - Non-image files return null
 * - Images > 5MB rejected with error log
 * - Images 4-5MB succeed with warning log
 * - image/jpg normalized to image/jpeg
 * - S3 retrieval failure handled gracefully
 * - Logs contain only fileId/mimeType/size (no buffer content)
 */

import {
  VisionContentBuilder,
  MAX_IMAGE_SIZE,
  WARN_IMAGE_SIZE,
  SUPPORTED_MIME_TYPES,
} from '../../../../src/infrastructure/ai/VisionContentBuilder';
import type { IFileStorage } from '../../../../src/application/interfaces/IFileStorage';
import type { VisionFileDTO } from '../../../../src/application/interfaces/IVisionContentBuilder';

describe('VisionContentBuilder', () => {
  let visionContentBuilder: VisionContentBuilder;
  let mockFileStorage: jest.Mocked<IFileStorage>;

  // Spy on console methods
  let consoleWarnSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;

  // Test fixtures
  const createFile = (overrides: Partial<VisionFileDTO> = {}): VisionFileDTO => ({
    id: 'file-123',
    mimeType: 'image/png',
    size: 1024 * 1024, // 1MB default
    storagePath: 'users/user-1/conv-1/file-123.png',
    ...overrides,
  });

  // Small test buffer (avoid memory issues)
  const testImageBuffer = Buffer.from('fake-image-data-for-testing');
  const testBase64 = testImageBuffer.toString('base64');

  beforeEach(() => {
    mockFileStorage = {
      store: jest.fn(),
      retrieve: jest.fn().mockResolvedValue(testImageBuffer),
      delete: jest.fn(),
      exists: jest.fn(),
    } as jest.Mocked<IFileStorage>;

    visionContentBuilder = new VisionContentBuilder(mockFileStorage);

    // Spy on console to verify logging
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('buildImageContent', () => {
    describe('successful conversions', () => {
      it('should convert PNG file to ImageContentBlock', async () => {
        const file = createFile({ mimeType: 'image/png' });

        const result = await visionContentBuilder.buildImageContent(file);

        expect(result).toEqual({
          type: 'image',
          source: {
            type: 'base64',
            media_type: 'image/png',
            data: testBase64,
          },
        });
        expect(mockFileStorage.retrieve).toHaveBeenCalledWith(file.storagePath);
      });

      it('should convert JPG file to ImageContentBlock', async () => {
        const file = createFile({ mimeType: 'image/jpeg' });

        const result = await visionContentBuilder.buildImageContent(file);

        expect(result).toEqual({
          type: 'image',
          source: {
            type: 'base64',
            media_type: 'image/jpeg',
            data: testBase64,
          },
        });
      });

      it('should convert GIF file to ImageContentBlock', async () => {
        const file = createFile({ mimeType: 'image/gif' });

        const result = await visionContentBuilder.buildImageContent(file);

        expect(result).toEqual({
          type: 'image',
          source: {
            type: 'base64',
            media_type: 'image/gif',
            data: testBase64,
          },
        });
      });

      it('should convert WebP file to ImageContentBlock', async () => {
        const file = createFile({ mimeType: 'image/webp' });

        const result = await visionContentBuilder.buildImageContent(file);

        expect(result).toEqual({
          type: 'image',
          source: {
            type: 'base64',
            media_type: 'image/webp',
            data: testBase64,
          },
        });
      });
    });

    describe('non-image files', () => {
      it('should return null for PDF files', async () => {
        const file = createFile({ mimeType: 'application/pdf' });

        const result = await visionContentBuilder.buildImageContent(file);

        expect(result).toBeNull();
        expect(mockFileStorage.retrieve).not.toHaveBeenCalled();
        expect(consoleWarnSpy).toHaveBeenCalledWith(
          expect.stringContaining('Unsupported type')
        );
        expect(consoleWarnSpy).toHaveBeenCalledWith(
          expect.stringContaining('fileId=file-123')
        );
      });

      it('should return null for Word documents', async () => {
        const file = createFile({
          mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        });

        const result = await visionContentBuilder.buildImageContent(file);

        expect(result).toBeNull();
      });

      it('should return null for text files', async () => {
        const file = createFile({ mimeType: 'text/plain' });

        const result = await visionContentBuilder.buildImageContent(file);

        expect(result).toBeNull();
      });
    });

    describe('MIME type normalization', () => {
      it('should normalize image/jpg to image/jpeg', async () => {
        const file = createFile({ mimeType: 'image/jpg' });

        const result = await visionContentBuilder.buildImageContent(file);

        expect(result).not.toBeNull();
        expect(result?.source.media_type).toBe('image/jpeg');
      });

      it('should not normalize already correct image/jpeg', async () => {
        const file = createFile({ mimeType: 'image/jpeg' });

        const result = await visionContentBuilder.buildImageContent(file);

        expect(result?.source.media_type).toBe('image/jpeg');
      });
    });

    describe('size validation', () => {
      it('should accept image under 4MB without warning', async () => {
        const file = createFile({ size: 3 * 1024 * 1024 }); // 3MB

        const result = await visionContentBuilder.buildImageContent(file);

        expect(result).not.toBeNull();
        expect(consoleWarnSpy).not.toHaveBeenCalledWith(
          expect.stringContaining('Large image')
        );
        expect(consoleErrorSpy).not.toHaveBeenCalled();
      });

      it('should accept image between 4-5MB with warning', async () => {
        const file = createFile({ size: 4.5 * 1024 * 1024 }); // 4.5MB

        const result = await visionContentBuilder.buildImageContent(file);

        expect(result).not.toBeNull();
        expect(consoleWarnSpy).toHaveBeenCalledWith(
          expect.stringContaining('Large image')
        );
        expect(consoleWarnSpy).toHaveBeenCalledWith(
          expect.stringContaining('fileId=file-123')
        );
        expect(consoleWarnSpy).toHaveBeenCalledWith(
          expect.stringContaining(`size=${file.size}`)
        );
      });

      it('should reject image over 5MB with error', async () => {
        const file = createFile({ size: 6 * 1024 * 1024 }); // 6MB

        const result = await visionContentBuilder.buildImageContent(file);

        expect(result).toBeNull();
        expect(mockFileStorage.retrieve).not.toHaveBeenCalled();
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          expect.stringContaining('Image too large')
        );
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          expect.stringContaining('fileId=file-123')
        );
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          expect.stringContaining(`size=${file.size}`)
        );
      });

      it('should reject image exactly at 5MB limit', async () => {
        const file = createFile({ size: MAX_IMAGE_SIZE + 1 }); // Just over 5MB

        const result = await visionContentBuilder.buildImageContent(file);

        expect(result).toBeNull();
      });

      it('should accept image exactly at 5MB', async () => {
        const file = createFile({ size: MAX_IMAGE_SIZE }); // Exactly 5MB

        const result = await visionContentBuilder.buildImageContent(file);

        expect(result).not.toBeNull();
        // Should have warning since 5MB > WARN_IMAGE_SIZE (4MB)
        expect(consoleWarnSpy).toHaveBeenCalledWith(
          expect.stringContaining('Large image')
        );
      });
    });

    describe('S3 retrieval failure', () => {
      it('should return null and log error on storage failure', async () => {
        const file = createFile();
        mockFileStorage.retrieve.mockRejectedValue(new Error('S3 connection failed'));

        const result = await visionContentBuilder.buildImageContent(file);

        expect(result).toBeNull();
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          expect.stringContaining('Failed to retrieve file')
        );
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          expect.stringContaining('fileId=file-123')
        );
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          expect.stringContaining('S3 connection failed')
        );
      });

      it('should handle non-Error objects thrown by storage', async () => {
        const file = createFile();
        mockFileStorage.retrieve.mockRejectedValue('string error');

        const result = await visionContentBuilder.buildImageContent(file);

        expect(result).toBeNull();
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          expect.stringContaining('Unknown error')
        );
      });
    });

    describe('security - logging restrictions', () => {
      it('should not log buffer content', async () => {
        const file = createFile();

        await visionContentBuilder.buildImageContent(file);

        // Verify no log call contains the buffer content or base64
        const allLogCalls = [
          ...consoleWarnSpy.mock.calls,
          ...consoleErrorSpy.mock.calls,
        ].flat();

        for (const logContent of allLogCalls) {
          expect(logContent).not.toContain(testBase64);
          expect(logContent).not.toContain('fake-image-data');
        }
      });

      it('should only log fileId, mimeType, and size in error cases', async () => {
        const file = createFile({ size: 6 * 1024 * 1024 }); // Trigger error

        await visionContentBuilder.buildImageContent(file);

        const errorCall = consoleErrorSpy.mock.calls[0][0];
        expect(errorCall).toContain('fileId=');
        expect(errorCall).toContain('size=');
        expect(errorCall).toContain('[VisionContentBuilder]');
      });
    });
  });

  describe('isImageFile', () => {
    it('should return true for image/png', () => {
      expect(visionContentBuilder.isImageFile('image/png')).toBe(true);
    });

    it('should return true for image/jpeg', () => {
      expect(visionContentBuilder.isImageFile('image/jpeg')).toBe(true);
    });

    it('should return true for image/gif', () => {
      expect(visionContentBuilder.isImageFile('image/gif')).toBe(true);
    });

    it('should return true for image/webp', () => {
      expect(visionContentBuilder.isImageFile('image/webp')).toBe(true);
    });

    it('should return true for image/jpg (after normalization)', () => {
      expect(visionContentBuilder.isImageFile('image/jpg')).toBe(true);
    });

    it('should return false for application/pdf', () => {
      expect(visionContentBuilder.isImageFile('application/pdf')).toBe(false);
    });

    it('should return false for text/plain', () => {
      expect(visionContentBuilder.isImageFile('text/plain')).toBe(false);
    });

    it('should return false for unsupported image types', () => {
      expect(visionContentBuilder.isImageFile('image/bmp')).toBe(false);
      expect(visionContentBuilder.isImageFile('image/tiff')).toBe(false);
      expect(visionContentBuilder.isImageFile('image/svg+xml')).toBe(false);
    });
  });

  describe('normalizeMediaType', () => {
    it('should convert image/jpg to image/jpeg', () => {
      expect(visionContentBuilder.normalizeMediaType('image/jpg')).toBe('image/jpeg');
    });

    it('should not modify image/jpeg', () => {
      expect(visionContentBuilder.normalizeMediaType('image/jpeg')).toBe('image/jpeg');
    });

    it('should not modify image/png', () => {
      expect(visionContentBuilder.normalizeMediaType('image/png')).toBe('image/png');
    });

    it('should not modify non-image MIME types', () => {
      expect(visionContentBuilder.normalizeMediaType('application/pdf')).toBe('application/pdf');
    });
  });

  describe('constants', () => {
    it('should export MAX_IMAGE_SIZE as 5MB', () => {
      expect(MAX_IMAGE_SIZE).toBe(5 * 1024 * 1024);
    });

    it('should export WARN_IMAGE_SIZE as 4MB', () => {
      expect(WARN_IMAGE_SIZE).toBe(4 * 1024 * 1024);
    });

    it('should export SUPPORTED_MIME_TYPES with 4 types', () => {
      expect(SUPPORTED_MIME_TYPES).toHaveLength(4);
      expect(SUPPORTED_MIME_TYPES).toContain('image/png');
      expect(SUPPORTED_MIME_TYPES).toContain('image/jpeg');
      expect(SUPPORTED_MIME_TYPES).toContain('image/gif');
      expect(SUPPORTED_MIME_TYPES).toContain('image/webp');
    });
  });

  /**
   * Epic 30 Sprint 3 Story 30.3.5: Conversation-scoped caching tests
   */
  describe('conversation-scoped caching', () => {
    it('should cache image content when conversationId is provided', async () => {
      const file = createFile({ mimeType: 'image/png' });

      // First call - should retrieve from storage
      const result1 = await visionContentBuilder.buildImageContent(file, 'conv-123');
      expect(mockFileStorage.retrieve).toHaveBeenCalledTimes(1);
      expect(result1).not.toBeNull();

      // Second call with same conversationId and fileId - should use cache
      const result2 = await visionContentBuilder.buildImageContent(file, 'conv-123');
      expect(mockFileStorage.retrieve).toHaveBeenCalledTimes(1); // Still 1, not 2
      expect(result2).toEqual(result1);
    });

    it('should not use cache for different conversationId', async () => {
      const file = createFile({ mimeType: 'image/png' });

      // First call with conv-123
      await visionContentBuilder.buildImageContent(file, 'conv-123');
      expect(mockFileStorage.retrieve).toHaveBeenCalledTimes(1);

      // Second call with conv-456 - should NOT use cache
      await visionContentBuilder.buildImageContent(file, 'conv-456');
      expect(mockFileStorage.retrieve).toHaveBeenCalledTimes(2);
    });

    it('should not cache when conversationId is not provided', async () => {
      const file = createFile({ mimeType: 'image/png' });

      // First call without conversationId
      await visionContentBuilder.buildImageContent(file);
      expect(mockFileStorage.retrieve).toHaveBeenCalledTimes(1);

      // Second call without conversationId - should NOT use cache
      await visionContentBuilder.buildImageContent(file);
      expect(mockFileStorage.retrieve).toHaveBeenCalledTimes(2);
    });

    it('should clear cache for specific conversation', async () => {
      const file1 = createFile({ id: 'file-1', mimeType: 'image/png' });
      const file2 = createFile({ id: 'file-2', mimeType: 'image/jpeg' });

      // Cache two files for conv-123
      await visionContentBuilder.buildImageContent(file1, 'conv-123');
      await visionContentBuilder.buildImageContent(file2, 'conv-123');
      expect(mockFileStorage.retrieve).toHaveBeenCalledTimes(2);

      // Cache one file for conv-456
      await visionContentBuilder.buildImageContent(file1, 'conv-456');
      expect(mockFileStorage.retrieve).toHaveBeenCalledTimes(3);

      // Clear cache for conv-123
      visionContentBuilder.clearConversationCache('conv-123');

      // Accessing file1 with conv-123 should retrieve from storage again
      await visionContentBuilder.buildImageContent(file1, 'conv-123');
      expect(mockFileStorage.retrieve).toHaveBeenCalledTimes(4);

      // But file1 with conv-456 should still be cached
      await visionContentBuilder.buildImageContent(file1, 'conv-456');
      expect(mockFileStorage.retrieve).toHaveBeenCalledTimes(4); // Still 4
    });

    it('should handle clearConversationCache for non-existent conversation', () => {
      // Should not throw
      expect(() => {
        visionContentBuilder.clearConversationCache('non-existent');
      }).not.toThrow();
    });
  });
});
