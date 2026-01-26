/**
 * IVisionContentBuilder - Interface for building Vision API content blocks
 *
 * Part of Epic 30: Vision API Support
 * Story 30.2.1: VisionContentBuilder Service
 *
 * Converts file data into Anthropic Vision API image content blocks.
 */

import type { ImageContentBlock } from '../../infrastructure/ai/types/vision.js';

/**
 * File DTO containing metadata needed for Vision content building.
 * This is a subset of the full FileDTO from domain layer.
 */
export interface VisionFileDTO {
  id: string;
  mimeType: string;
  size: number;
  storagePath: string;
}

/**
 * Result of building image content, includes the block and any warnings.
 */
export interface BuildImageResult {
  /** The image content block, or null if not an image or validation failed */
  block: ImageContentBlock | null;
  /** Warning message if size is near limit (4-5MB) */
  warning?: string;
  /** Error message if validation failed */
  error?: string;
}

export interface IVisionContentBuilder {
  /**
   * Build an ImageContentBlock from a file.
   *
   * Epic 30 Sprint 3 (Story 30.3.5): Supports conversation-scoped caching.
   * When conversationId is provided, the result is cached by `conversationId:fileId`
   * to avoid repeated S3 fetches on subsequent messages.
   *
   * @param file - File metadata including storage path
   * @param conversationId - Optional conversation ID for caching (recommended)
   * @returns ImageContentBlock if successful, null if not an image or validation fails
   */
  buildImageContent(file: VisionFileDTO, conversationId?: string): Promise<ImageContentBlock | null>;

  /**
   * Check if a MIME type is a supported image format.
   *
   * @param mimeType - The MIME type to check
   * @returns true if supported image type
   */
  isImageFile(mimeType: string): boolean;

  /**
   * Normalize a MIME type (e.g., image/jpg -> image/jpeg).
   *
   * @param mimeType - The MIME type to normalize
   * @returns Normalized MIME type
   */
  normalizeMediaType(mimeType: string): string;

  /**
   * Clear cached image content for a conversation.
   *
   * Epic 30 Sprint 3 (Story 30.3.5): Should be called when conversation ends
   * or WebSocket disconnects to prevent memory leaks.
   *
   * @param conversationId - Conversation ID to clear cache for
   */
  clearConversationCache(conversationId: string): void;
}
