/**
 * VisionContentBuilder - Builds Vision API content blocks from files
 *
 * Part of Epic 30: Vision API Support
 * Stories 30.2.1 & 30.2.2: VisionContentBuilder Service with validation
 * Story 30.3.5: Conversation-scoped caching for performance
 * Story 30.4.2: Error handling & logging (SECURITY)
 * Story 30.4.5: Documentation
 *
 * Retrieves image files from storage and converts them to base64-encoded
 * ImageContentBlock for use with Anthropic's Vision API.
 *
 * ## Supported Formats
 * - PNG (image/png)
 * - JPEG (image/jpeg, image/jpg - normalized to image/jpeg)
 * - GIF (image/gif) - first frame analyzed
 * - WebP (image/webp)
 *
 * ## Size Limits
 * - Maximum: 5MB per image (Anthropic API limit)
 * - Warning threshold: 4MB (logged for monitoring)
 * - Oversized images are gracefully rejected (return null)
 *
 * ## Caching
 * Uses conversation-scoped cache (key: `conversationId:fileId`) to avoid
 * repeated S3 fetches and base64 encoding on every message in a conversation.
 * Cache must be cleared when conversation ends via clearConversationCache().
 *
 * ## Security
 * - NEVER logs base64 data or buffer contents
 * - NEVER logs filename (may contain PHI)
 * - Only logs: fileId, mimeType, size (safe metadata)
 *
 * ## Error Handling
 * - S3 retrieval failures: logged with fileId, returns null (graceful fallback)
 * - Base64 encoding failures: caught, logged, returns null
 * - Oversized images: rejected before retrieval (saves bandwidth)
 * - Unsupported types: logged, returns null
 *
 * @module VisionContentBuilder
 */

import type { IFileStorage } from '../../application/interfaces/IFileStorage.js';
import type {
  IVisionContentBuilder,
  VisionFileDTO,
} from '../../application/interfaces/IVisionContentBuilder.js';
import type { ImageContentBlock, ImageMediaType } from './types/vision.js';

/** Maximum image size per Anthropic API (5MB) */
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

/** Warning threshold for large images (4MB) */
const WARN_IMAGE_SIZE = 4 * 1024 * 1024;

/** Supported image MIME types for Claude Vision API */
const SUPPORTED_MIME_TYPES: ImageMediaType[] = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
];

export class VisionContentBuilder implements IVisionContentBuilder {
  /**
   * Story 30.3.5: Conversation-scoped image cache
   * Key format: `conversationId:fileId` to prevent cross-conversation leakage
   */
  private imageCache = new Map<string, ImageContentBlock>();

  constructor(private readonly fileStorage: IFileStorage) {}

  /**
   * Story 30.3.5: Generate cache key for conversation-scoped caching
   */
  private cacheKey(conversationId: string, fileId: string): string {
    return `${conversationId}:${fileId}`;
  }

  /**
   * Build an ImageContentBlock from a file.
   *
   * Story 30.3.5: Supports conversation-scoped caching when conversationId is provided.
   * Second call with same (conversationId, fileId) returns cached result without S3 fetch.
   *
   * @param file - File metadata including storage path
   * @param conversationId - Optional conversation ID for caching (recommended)
   * @returns ImageContentBlock if successful, null if not an image or validation fails
   */
  async buildImageContent(file: VisionFileDTO, conversationId?: string): Promise<ImageContentBlock | null> {
    // Story 30.3.5: Check cache first if conversationId provided
    if (conversationId) {
      const key = this.cacheKey(conversationId, file.id);
      const cached = this.imageCache.get(key);
      if (cached) {
        console.log(`[VisionContentBuilder] Cache hit: fileId=${file.id}, conversationId=${conversationId}`);
        return cached;
      }
    }

    // Normalize and validate MIME type
    const normalizedMime = this.normalizeMediaType(file.mimeType);

    if (!this.isImageFile(normalizedMime)) {
      console.warn(
        `[VisionContentBuilder] Unsupported type: fileId=${file.id}, mimeType=${file.mimeType}`
      );
      return null;
    }

    // Validate size - reject if over 5MB (Anthropic API limit)
    if (file.size > MAX_IMAGE_SIZE) {
      console.error(
        `[VisionContentBuilder] Image too large: fileId=${file.id}, size=${file.size}, maxSize=${MAX_IMAGE_SIZE}`
      );
      return null;
    }

    // Warn if near limit (4-5MB)
    if (file.size > WARN_IMAGE_SIZE) {
      console.warn(
        `[VisionContentBuilder] Large image: fileId=${file.id}, size=${file.size}`
      );
    }

    try {
      // Retrieve file buffer from storage
      const buffer = await this.fileStorage.retrieve(file.storagePath);

      // Convert to base64
      const base64 = buffer.toString('base64');

      // Build the content block
      const block: ImageContentBlock = {
        type: 'image',
        source: {
          type: 'base64',
          media_type: normalizedMime as ImageMediaType,
          data: base64,
        },
      };

      // Story 30.3.5: Cache the result if conversationId provided
      if (conversationId) {
        const key = this.cacheKey(conversationId, file.id);
        this.imageCache.set(key, block);
        console.log(`[VisionContentBuilder] Cached: fileId=${file.id}, conversationId=${conversationId}`);
      }

      return block;
    } catch (error) {
      // Log error without exposing buffer contents
      console.error(
        `[VisionContentBuilder] Failed to retrieve file: fileId=${file.id}, error=${error instanceof Error ? error.message : 'Unknown error'}`
      );
      return null;
    }
  }

  /**
   * Story 30.3.5: Clear cached image content for a conversation.
   *
   * Should be called when conversation ends or WebSocket disconnects
   * to prevent memory leaks.
   *
   * @param conversationId - Conversation ID to clear cache for
   */
  clearConversationCache(conversationId: string): void {
    let cleared = 0;
    for (const key of this.imageCache.keys()) {
      if (key.startsWith(`${conversationId}:`)) {
        this.imageCache.delete(key);
        cleared++;
      }
    }
    if (cleared > 0) {
      console.log(`[VisionContentBuilder] Cleared ${cleared} cached images for conversation ${conversationId}`);
    }
  }

  /**
   * Check if a MIME type is a supported image format.
   *
   * @param mimeType - The MIME type to check (can be normalized or not)
   * @returns true if supported image type
   */
  isImageFile(mimeType: string): boolean {
    const normalized = this.normalizeMediaType(mimeType);
    return SUPPORTED_MIME_TYPES.includes(normalized as ImageMediaType);
  }

  /**
   * Normalize a MIME type.
   * - Converts image/jpg to image/jpeg (standard)
   *
   * @param mimeType - The MIME type to normalize
   * @returns Normalized MIME type
   */
  normalizeMediaType(mimeType: string): string {
    // Handle common non-standard MIME type
    if (mimeType === 'image/jpg') {
      return 'image/jpeg';
    }
    return mimeType;
  }
}

// Export constants for testing
export { MAX_IMAGE_SIZE, WARN_IMAGE_SIZE, SUPPORTED_MIME_TYPES };
