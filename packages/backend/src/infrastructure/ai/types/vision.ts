/**
 * Vision Content Types for Anthropic API
 *
 * Epic 30: Vision API support for document parsing
 *
 * These are Anthropic API schemas, NOT domain types.
 * They define the structure for image content blocks in Claude's Messages API.
 *
 * @see https://docs.anthropic.com/en/docs/build-with-claude/vision
 */

/**
 * Supported image media types for Claude Vision API
 */
export type ImageMediaType = 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp';

/**
 * Base64 image source for Claude Vision API
 */
export interface ImageSource {
  type: 'base64';
  media_type: ImageMediaType;
  /** Base64-encoded image data */
  data: string;
}

/**
 * Image content block for Claude Vision API
 *
 * Used to send images to Claude for visual analysis.
 */
export interface ImageContentBlock {
  type: 'image';
  source: ImageSource;
}

/**
 * Text content block for Claude Vision API
 *
 * Used alongside images in multimodal requests.
 */
export interface TextContentBlock {
  type: 'text';
  text: string;
}

/**
 * Union type for all content block types supported by Claude Vision API
 *
 * Messages to Claude can contain a mix of text and image blocks.
 */
export type ContentBlock = ImageContentBlock | TextContentBlock;
