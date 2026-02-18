/**
 * Tests for DocumentParserHelpers - shared helper functions
 *
 * Story 39.4.2: Extracted helpers from DocumentParserService and IntakeDocumentParser
 */

import {
  parseJsonResponse,
  attemptJsonRepair,
  truncateText,
  extractPdfText,
  extractDocxText,
  filterStrings,
  isObject,
} from '../../../../src/infrastructure/ai/DocumentParserHelpers.js';

// Mock pdf-parse module (v2 class-based API)
const mockPdfGetText = jest.fn();
const mockPdfDestroy = jest.fn();

jest.mock('pdf-parse', () => ({
  PDFParse: jest.fn().mockImplementation(() => ({
    getText: (...args: unknown[]) => mockPdfGetText(...args),
    destroy: (...args: unknown[]) => mockPdfDestroy(...args),
  })),
}));

// Mock mammoth module
jest.mock('mammoth', () => ({
  extractRawText: jest.fn(),
}));

describe('DocumentParserHelpers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // =========================================================================
  // parseJsonResponse
  // =========================================================================

  describe('parseJsonResponse', () => {
    it('handles markdown code blocks with json tag', () => {
      const content = '```json\n{"key": "value", "count": 42}\n```';
      const result = parseJsonResponse(content);

      expect(result).toEqual({ key: 'value', count: 42 });
    });

    it('handles markdown code blocks without json tag', () => {
      const content = '```\n{"key": "value"}\n```';
      const result = parseJsonResponse(content);

      expect(result).toEqual({ key: 'value' });
    });

    it('handles bare JSON (no code block)', () => {
      const content = '{"name": "test", "nested": {"a": 1}}';
      const result = parseJsonResponse(content);

      expect(result).toEqual({ name: 'test', nested: { a: 1 } });
    });

    it('handles JSON with surrounding text', () => {
      const content = 'Here is the result:\n{"key": "value"}\nDone.';
      const result = parseJsonResponse(content);

      expect(result).toEqual({ key: 'value' });
    });

    it('returns null for completely invalid content', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      const result = parseJsonResponse('This is not JSON at all');

      expect(result).toBeNull();
      consoleSpy.mockRestore();
    });

    it('returns null when parsed value is not an object', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      const result = parseJsonResponse('"just a string"');

      expect(result).toBeNull();
      consoleSpy.mockRestore();
    });

    it('uses custom log prefix in error messages', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      parseJsonResponse('invalid json', '[CustomPrefix]');

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[CustomPrefix]'),
        expect.anything()
      );
      consoleSpy.mockRestore();
    });

    it('falls through to JSON repair on initial parse failure', () => {
      // Trailing comma - will fail JSON.parse but be fixed by repair
      const content = '{"key": "value",}';
      const result = parseJsonResponse(content);

      expect(result).toEqual({ key: 'value' });
    });
  });

  // =========================================================================
  // attemptJsonRepair
  // =========================================================================

  describe('attemptJsonRepair', () => {
    it('fixes trailing commas before closing braces', () => {
      const input = '{"key": "value",}';
      const repaired = attemptJsonRepair(input);
      const parsed = JSON.parse(repaired);

      expect(parsed).toEqual({ key: 'value' });
    });

    it('fixes trailing commas before closing brackets', () => {
      const input = '["a", "b",]';
      const repaired = attemptJsonRepair(input);
      const parsed = JSON.parse(repaired);

      expect(parsed).toEqual(['a', 'b']);
    });

    it('adds missing closing braces', () => {
      const input = '{"key": "value"';
      const repaired = attemptJsonRepair(input);
      const parsed = JSON.parse(repaired);

      expect(parsed).toEqual({ key: 'value' });
    });

    it('adds missing closing brackets', () => {
      // Simple case: only brackets missing
      const input = '["a", "b"';
      const repaired = attemptJsonRepair(input);
      const parsed = JSON.parse(repaired);

      expect(parsed).toEqual(['a', 'b']);
    });

    it('adds missing closing braces for nested objects', () => {
      const input = '{"nested": {"key": "value"';
      const repaired = attemptJsonRepair(input);
      const parsed = JSON.parse(repaired);

      expect(parsed).toEqual({ nested: { key: 'value' } });
    });

    it('adds missing commas between adjacent objects', () => {
      const input = '{"a": 1} {"b": 2}';
      const repaired = attemptJsonRepair(input);

      // Should add comma between adjacent objects (preserving whitespace)
      expect(repaired).toContain('}, {');
    });

    it('returns valid JSON unchanged (no trailing commas, balanced braces)', () => {
      const input = '{"valid": true}';
      const repaired = attemptJsonRepair(input);

      expect(repaired).toBe(input);
    });
  });

  // =========================================================================
  // truncateText
  // =========================================================================

  describe('truncateText', () => {
    it('returns original text when under the limit', () => {
      const text = 'Short text';
      const result = truncateText(text, 1000);

      expect(result).toBe('Short text');
    });

    it('returns original text when exactly at the limit', () => {
      const text = 'A'.repeat(100);
      const result = truncateText(text, 100);

      expect(result).toBe(text);
    });

    it('adds default notice when truncated', () => {
      const text = 'A'.repeat(500);
      const result = truncateText(text, 200);

      expect(result).toContain('[NOTE: Document text was truncated');
      expect(result.length).toBeLessThanOrEqual(200);
    });

    it('adds custom notice when truncated', () => {
      const text = 'A'.repeat(500);
      const customNotice = ' [cut]';
      const result = truncateText(text, 200, customNotice);

      expect(result).toContain('[cut]');
      expect(result.length).toBeLessThanOrEqual(200);
    });

    it('falls back to simple slice when maxChars is too small for notice', () => {
      const text = 'A'.repeat(500);
      // Notice is ~100 chars, and minMeaningfulContent is 100,
      // so maxChars < notice.length + 100 triggers fallback
      const result = truncateText(text, 50);

      expect(result).toBe('A'.repeat(50));
      expect(result).not.toContain('[NOTE:');
    });
  });

  // =========================================================================
  // extractPdfText
  // =========================================================================

  describe('extractPdfText', () => {
    it('returns text from PDF buffer', async () => {
      mockPdfGetText.mockResolvedValue({ text: 'Extracted PDF text', total: 1, pages: [] });
      mockPdfDestroy.mockResolvedValue(undefined);

      const buffer = Buffer.from('fake pdf content');
      const result = await extractPdfText(buffer);

      expect(result).toBe('Extracted PDF text');
    });

    it('calls destroy after extraction (cleanup)', async () => {
      mockPdfGetText.mockResolvedValue({ text: 'text', total: 1, pages: [] });
      mockPdfDestroy.mockResolvedValue(undefined);

      await extractPdfText(Buffer.from('content'));

      expect(mockPdfDestroy).toHaveBeenCalledTimes(1);
    });

    it('calls destroy even when getText throws', async () => {
      mockPdfGetText.mockRejectedValue(new Error('Parse failed'));
      mockPdfDestroy.mockResolvedValue(undefined);

      await expect(extractPdfText(Buffer.from('bad pdf'))).rejects.toThrow('Parse failed');
      expect(mockPdfDestroy).toHaveBeenCalledTimes(1);
    });
  });

  // =========================================================================
  // extractDocxText
  // =========================================================================

  describe('extractDocxText', () => {
    it('returns text from docx buffer', async () => {
      const mammoth = require('mammoth');
      mammoth.extractRawText.mockResolvedValue({ value: 'Extracted DOCX text' });

      const buffer = Buffer.from('fake docx content');
      const result = await extractDocxText(buffer);

      expect(result).toBe('Extracted DOCX text');
    });

    it('passes buffer to mammoth', async () => {
      const mammoth = require('mammoth');
      mammoth.extractRawText.mockResolvedValue({ value: 'text' });

      const buffer = Buffer.from('docx bytes');
      await extractDocxText(buffer);

      expect(mammoth.extractRawText).toHaveBeenCalledWith({ buffer });
    });
  });

  // =========================================================================
  // filterStrings
  // =========================================================================

  describe('filterStrings', () => {
    it('keeps only string elements from a mixed array', () => {
      const input = ['hello', 42, 'world', null, undefined, true, 'test'];
      const result = filterStrings(input);

      expect(result).toEqual(['hello', 'world', 'test']);
    });

    it('returns empty array when no strings present', () => {
      const input = [1, 2, null, true, { key: 'value' }];
      const result = filterStrings(input);

      expect(result).toEqual([]);
    });

    it('returns all elements when all are strings', () => {
      const input = ['a', 'b', 'c'];
      const result = filterStrings(input);

      expect(result).toEqual(['a', 'b', 'c']);
    });

    it('returns empty array for empty input', () => {
      expect(filterStrings([])).toEqual([]);
    });
  });

  // =========================================================================
  // isObject
  // =========================================================================

  describe('isObject', () => {
    it('returns true for plain objects', () => {
      expect(isObject({ key: 'value' })).toBe(true);
      expect(isObject({})).toBe(true);
    });

    it('rejects arrays', () => {
      expect(isObject([1, 2, 3])).toBe(false);
      expect(isObject([])).toBe(false);
    });

    it('rejects null', () => {
      expect(isObject(null)).toBe(false);
    });

    it('rejects primitives', () => {
      expect(isObject('string')).toBe(false);
      expect(isObject(42)).toBe(false);
      expect(isObject(true)).toBe(false);
      expect(isObject(undefined)).toBe(false);
    });
  });
});
