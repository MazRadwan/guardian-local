/**
 * IntakeDocumentParser - Intake document parsing implementation
 *
 * Extracted from DocumentParserService (Story 39.4.1) to comply with 300 LOC limit.
 * Implements IIntakeDocumentParser for extracting vendor context from PRDs,
 * proposals, and other vendor-provided documents.
 *
 * Story 39.4.2: Shared helpers moved to DocumentParserHelpers.ts.
 */

import type { IClaudeClient } from '../../application/interfaces/IClaudeClient.js';
import type { IVisionClient } from '../../application/interfaces/IVisionClient.js';
import {
  IIntakeDocumentParser,
  IntakeParseResult,
  IntakeParseOptions,
} from '../../application/interfaces/IIntakeDocumentParser.js';
import {
  DocumentMetadata,
} from '../../application/interfaces/IDocumentParser.js';
import {
  buildIntakeExtractionPrompt,
  INTAKE_EXTRACTION_SYSTEM_PROMPT,
} from './prompts/intakeExtraction.js';
import { applyIntakeDefaults } from './parsing-helpers.js';
import {
  extractContent,
  truncateText,
  parseJsonResponse,
  TRUNCATION_NOTICE,
} from './DocumentParserHelpers.js';

export class IntakeDocumentParser implements IIntakeDocumentParser {
  constructor(
    private readonly claudeClient: IClaudeClient,
    private readonly visionClient: IVisionClient,
  ) {}

  // =========================================================================
  // IIntakeDocumentParser Implementation
  // =========================================================================

  async parseForContext(
    file: Buffer,
    metadata: DocumentMetadata,
    options?: IntakeParseOptions
  ): Promise<IntakeParseResult> {
    const startTime = Date.now();

    try {
      const { text: rawDocumentText, visionContent } = await extractContent(
        file, metadata.documentType, metadata.mimeType, this.visionClient
      );

      const maxChars = options?.maxExtractedTextChars ?? 100000;
      const documentText = truncateText(rawDocumentText, maxChars, TRUNCATION_NOTICE);

      const prompt = buildIntakeExtractionPrompt({
        focusCategories: options?.focusCategories,
        filename: metadata.filename,
      });

      let responseContent: string;

      if (visionContent && visionContent.length > 0) {
        const visionResponse = await this.visionClient.analyzeImages({
          images: visionContent,
          prompt: `${prompt}\n\nAnalyze the document shown in the image(s).`,
          systemPrompt: INTAKE_EXTRACTION_SYSTEM_PROMPT,
          maxTokens: 4096,
        });
        responseContent = visionResponse.content;
      } else {
        const response = await this.claudeClient.sendMessage(
          [{ role: 'user', content: `${prompt}\n\nDOCUMENT CONTENT:\n${documentText}` }],
          { systemPrompt: INTAKE_EXTRACTION_SYSTEM_PROMPT, maxTokens: 4096, usePromptCache: true }
        );
        responseContent = response.content;
      }

      const rawJson = parseJsonResponse(responseContent, '[IntakeDocumentParser]');
      if (!rawJson) {
        return this.createFailedIntakeResult(metadata, startTime, 'Failed to parse extraction response');
      }
      const extracted = applyIntakeDefaults(rawJson);

      return {
        success: true,
        confidence: extracted.confidence,
        metadata,
        parseTimeMs: Date.now() - startTime,
        context: {
          ...extracted,
          rawTextExcerpt: documentText.slice(0, 2000),
          sourceFilePath: metadata.storagePath,
        },
        suggestedQuestions: extracted.suggestedQuestions ?? [],
        coveredCategories: extracted.coveredCategories ?? [],
        gapCategories: extracted.gapCategories ?? [],
      };
    } catch (error) {
      console.error('[IntakeDocumentParser] Intake parsing error:', error);
      return this.createFailedIntakeResult(
        metadata, startTime,
        error instanceof Error ? error.message : 'Unknown parsing error'
      );
    }
  }

  // =========================================================================
  // Result Builder
  // =========================================================================

  private createFailedIntakeResult(
    metadata: DocumentMetadata, startTime: number, error: string
  ): IntakeParseResult {
    return {
      success: false, error, confidence: 0, metadata,
      parseTimeMs: Date.now() - startTime,
      context: null, suggestedQuestions: [], coveredCategories: [], gapCategories: [],
    };
  }
}
