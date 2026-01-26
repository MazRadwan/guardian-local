/**
 * Unit tests for ClaudeApiMessage type guards
 *
 * Epic 30 Story 30.1.2: ClaudeApiMessage Type
 *
 * Tests verify that type guards correctly identify content types.
 */

import {
  isContentBlockArray,
  isStringContent,
} from '../../../../../src/infrastructure/ai/types/message.js';
import type {
  ContentBlock,
  ImageContentBlock,
  TextContentBlock,
} from '../../../../../src/infrastructure/ai/types/vision.js';

describe('ClaudeApiMessage type guards', () => {
  describe('isContentBlockArray', () => {
    it('should return true for an empty array', () => {
      const content: ContentBlock[] = [];
      expect(isContentBlockArray(content)).toBe(true);
    });

    it('should return true for array with TextContentBlock', () => {
      const content: ContentBlock[] = [
        { type: 'text', text: 'Hello, world!' },
      ];
      expect(isContentBlockArray(content)).toBe(true);
    });

    it('should return true for array with ImageContentBlock', () => {
      const imageBlock: ImageContentBlock = {
        type: 'image',
        source: {
          type: 'base64',
          media_type: 'image/png',
          data: 'base64encodeddata',
        },
      };
      const content: ContentBlock[] = [imageBlock];
      expect(isContentBlockArray(content)).toBe(true);
    });

    it('should return true for mixed text and image blocks', () => {
      const textBlock: TextContentBlock = { type: 'text', text: 'Describe this image:' };
      const imageBlock: ImageContentBlock = {
        type: 'image',
        source: {
          type: 'base64',
          media_type: 'image/jpeg',
          data: 'base64encodeddata',
        },
      };
      const content: ContentBlock[] = [textBlock, imageBlock];
      expect(isContentBlockArray(content)).toBe(true);
    });

    it('should return false for a string', () => {
      const content = 'Hello, world!';
      expect(isContentBlockArray(content)).toBe(false);
    });

    it('should return false for an empty string', () => {
      const content = '';
      expect(isContentBlockArray(content)).toBe(false);
    });
  });

  describe('isStringContent', () => {
    it('should return true for a non-empty string', () => {
      const content = 'Hello, world!';
      expect(isStringContent(content)).toBe(true);
    });

    it('should return true for an empty string', () => {
      const content = '';
      expect(isStringContent(content)).toBe(true);
    });

    it('should return false for an empty array', () => {
      const content: ContentBlock[] = [];
      expect(isStringContent(content)).toBe(false);
    });

    it('should return false for array with content blocks', () => {
      const content: ContentBlock[] = [
        { type: 'text', text: 'Hello' },
      ];
      expect(isStringContent(content)).toBe(false);
    });
  });

  describe('type narrowing', () => {
    it('should allow type narrowing in if statements', () => {
      const content: string | ContentBlock[] = [{ type: 'text', text: 'test' }];

      if (isContentBlockArray(content)) {
        // TypeScript should know content is ContentBlock[] here
        expect(content[0].type).toBe('text');
      }
    });

    it('should allow type narrowing for string content', () => {
      const content: string | ContentBlock[] = 'test string';

      if (isStringContent(content)) {
        // TypeScript should know content is string here
        expect(content.toLowerCase()).toBe('test string');
      }
    });
  });
});
