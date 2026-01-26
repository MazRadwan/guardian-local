/**
 * ClaudeApiMessage Type
 *
 * Epic 30: Infrastructure-level message type for Anthropic API
 *
 * This type supports ContentBlock arrays for multimodal messages (text + images).
 * Domain's ClaudeMessage stays unchanged (string-only) to maintain clean architecture.
 *
 * Architecture:
 * - Domain: ClaudeMessage { content: string } - pure, no external dependencies
 * - Infrastructure: ClaudeApiMessage { content: string | ContentBlock[] } - API format
 * - ClaudeClient converts domain -> API format internally
 */

import type { ContentBlock } from './vision.js';

/**
 * Message format for Anthropic Claude API
 *
 * Supports both simple string content and ContentBlock arrays for multimodal requests.
 * This is the format sent to the Anthropic API, NOT the domain message type.
 */
export interface ClaudeApiMessage {
  role: 'user' | 'assistant';
  content: string | ContentBlock[];
}

/**
 * Type guard to check if content is a ContentBlock array
 *
 * @param content - The content to check
 * @returns True if content is a ContentBlock array, false if string
 */
export function isContentBlockArray(
  content: string | ContentBlock[]
): content is ContentBlock[] {
  return Array.isArray(content);
}

/**
 * Type guard to check if content is a simple string
 *
 * @param content - The content to check
 * @returns True if content is a string, false if ContentBlock array
 */
export function isStringContent(
  content: string | ContentBlock[]
): content is string {
  return typeof content === 'string';
}
