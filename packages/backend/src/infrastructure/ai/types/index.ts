/**
 * AI Infrastructure Types
 *
 * Types for Anthropic API schemas used by ClaudeClient.
 * These are infrastructure-level types, NOT domain types.
 */

// Vision content types (Epic 30)
export type {
  ImageMediaType,
  ImageSource,
  ImageContentBlock,
  TextContentBlock,
  ContentBlock,
} from './vision.js';

// API message types (Epic 30)
export type { ClaudeApiMessage } from './message.js';
export { isContentBlockArray, isStringContent } from './message.js';
