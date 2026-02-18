/**
 * DocumentParserHelpers - Shared helper functions for document parsers
 *
 * Extracted from DocumentParserService and IntakeDocumentParser (Story 39.4.2)
 * to eliminate code duplication and comply with 300 LOC limit.
 *
 * All functions are standalone (no class/this context required).
 */

import type {
  IVisionClient,
  VisionContent,
} from '../../application/interfaces/IVisionClient.js';
import {
  DocumentType,
  DocumentParseError,
} from '../../application/interfaces/IDocumentParser.js';
import { isObject } from './parsing-helpers.js';
import { PDFParse } from 'pdf-parse';
import mammoth from 'mammoth';

/** Default maximum characters to send to Claude (prevents context overflow) */
export const DEFAULT_MAX_EXTRACTED_TEXT_CHARS = 100000;

/** Truncation notice appended when text is truncated */
export const TRUNCATION_NOTICE =
  '\n\n[NOTE: Document text was truncated due to length. Full document contains additional content.]';

// =========================================================================
// Content Extraction
// =========================================================================

/**
 * Extract text from a PDF buffer.
 */
export async function extractPdfText(buffer: Buffer): Promise<string> {
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return result.text;
  } finally {
    await parser.destroy();
  }
}

/**
 * Extract text from a DOCX buffer.
 */
export async function extractDocxText(buffer: Buffer): Promise<string> {
  const result = await mammoth.extractRawText({ buffer });
  return result.value;
}

/**
 * Extract text and/or vision content from a document buffer.
 *
 * Routes to the appropriate extraction method based on document type.
 */
export async function extractContent(
  buffer: Buffer,
  documentType: DocumentType,
  mimeType: string,
  visionClient: IVisionClient,
): Promise<{ text: string; visionContent: VisionContent[] | null }> {
  switch (documentType) {
    case 'pdf':
      return { text: await extractPdfText(buffer), visionContent: null };
    case 'docx':
      return { text: await extractDocxText(buffer), visionContent: null };
    case 'image': {
      const visionContent = await visionClient.prepareDocument(buffer, mimeType);
      return { text: '', visionContent };
    }
    default:
      throw new DocumentParseError(`Unsupported document type: ${documentType}`);
  }
}

// =========================================================================
// Text Truncation
// =========================================================================

/**
 * Truncate text to a maximum number of characters, appending a notice
 * when truncation occurs. Returns the original text if already under limit.
 */
export function truncateText(
  text: string,
  maxChars: number,
  notice: string = TRUNCATION_NOTICE,
): string {
  if (text.length <= maxChars) return text;
  const minMeaningfulContent = 100;
  if (maxChars < notice.length + minMeaningfulContent) {
    return text.slice(0, maxChars);
  }
  return text.slice(0, maxChars - notice.length) + notice;
}

// =========================================================================
// JSON Parsing & Repair
// =========================================================================

/**
 * Attempt to repair malformed JSON from LLM responses.
 *
 * Handles common issues:
 * - Trailing commas before closing braces/brackets
 * - Missing commas between objects
 * - Unclosed braces/brackets
 */
export function attemptJsonRepair(jsonStr: string): string {
  let repaired = jsonStr;
  repaired = repaired.replace(/,(\s*[}\]])/g, '$1');
  repaired = repaired.replace(/}(\s*){/g, '},$1{');
  repaired = repaired.replace(/"(\s*){/g, '",$1{');

  const openBraces = (repaired.match(/{/g) || []).length;
  const closeBraces = (repaired.match(/}/g) || []).length;
  const openBrackets = (repaired.match(/\[/g) || []).length;
  const closeBrackets = (repaired.match(/\]/g) || []).length;

  for (let i = 0; i < openBraces - closeBraces; i++) repaired += '}';
  for (let i = 0; i < openBrackets - closeBrackets; i++) repaired += ']';

  return repaired;
}

/**
 * Parse a JSON response from Claude, handling markdown code blocks
 * and malformed JSON. Returns null if parsing fails entirely.
 */
export function parseJsonResponse(
  content: string,
  logPrefix: string = '[DocumentParser]',
): Record<string, unknown> | null {
  try {
    let jsonStr = content.trim();

    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim();
    } else {
      if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.replace(/^```(?:json)?\s*/, '');
        jsonStr = jsonStr.replace(/\s*```\s*$/, '');
      }
      const firstBrace = jsonStr.indexOf('{');
      const lastBrace = jsonStr.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace > firstBrace) {
        jsonStr = jsonStr.slice(firstBrace, lastBrace + 1);
      }
    }

    try {
      const parsed = JSON.parse(jsonStr.trim());
      if (isObject(parsed)) return parsed;
    } catch {
      // Fall through to repair
    }

    const repairedJson = attemptJsonRepair(jsonStr.trim());
    const parsed = JSON.parse(repairedJson);
    if (!isObject(parsed)) {
      console.error(`${logPrefix} Parsed JSON is not an object`);
      return null;
    }
    return parsed;
  } catch (error) {
    console.error(`${logPrefix} JSON parse error:`, error);
    return null;
  }
}

// =========================================================================
// Validation Utilities (re-exported from parsing-helpers for convenience)
// =========================================================================

export { isObject } from './parsing-helpers.js';

/**
 * Filter an array to only include string elements.
 * Useful for sanitizing AI-generated arrays.
 */
export function filterStrings(arr: unknown[]): string[] {
  return arr.filter((x): x is string => typeof x === 'string');
}
