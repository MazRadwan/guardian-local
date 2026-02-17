/**
 * ExtractionRoutingService - Routes document extraction between regex and Claude
 *
 * Epic 39, Story 39.1.4: Extraction Routing
 *
 * For Guardian documents:
 *   1. Try regex extraction first (fast path)
 *   2. Evaluate confidence via ExtractionConfidenceCalculator
 *   3. If confident, build ScoringParseResult from regex result
 *   4. If not confident, return null to signal Claude fallback
 *
 * For non-Guardian documents: not handled here (rejected upstream)
 *
 * Feature flag: ENABLE_REGEX_EXTRACTION (default: true)
 */

import type { IQuestionRepository } from '../../application/interfaces/IQuestionRepository.js';
import type {
  ScoringParseResult,
  ExtractedResponse,
} from '../../application/interfaces/IScoringDocumentParser.js';
import type { DocumentMetadata } from '../../application/interfaces/IDocumentParser.js';
import {
  RegexResponseExtractor,
  type RegexExtractionResult,
} from './RegexResponseExtractor.js';
import {
  ExtractionConfidenceCalculator,
  type ConfidenceResult,
} from './ExtractionConfidenceCalculator.js';
import { DocxImageDetector } from './DocxImageDetector.js';

/** Feature flag: set ENABLE_REGEX_EXTRACTION=false to disable regex path */
const ENABLE_REGEX_EXTRACTION = process.env.ENABLE_REGEX_EXTRACTION !== 'false';

/** Confidence threshold for image-only responses (text was stripped by mammoth) */
const IMAGE_ONLY_CONFIDENCE = 0.3;

export interface RegexRoutingResult {
  /** Non-null when regex succeeded with confidence; null means fall through to Claude */
  result: ScoringParseResult | null;
  /** Which extraction method was used (for logging) */
  method: 'regex' | 'claude_fallback';
  /** Confidence evaluation (null if regex not attempted) */
  confidence: ConfidenceResult | null;
}

export class ExtractionRoutingService {
  private readonly extractor: RegexResponseExtractor;
  private readonly confidenceCalc: ExtractionConfidenceCalculator;
  private readonly imageDetector: DocxImageDetector;

  constructor(questionRepo: IQuestionRepository) {
    this.extractor = new RegexResponseExtractor();
    this.confidenceCalc = new ExtractionConfidenceCalculator(questionRepo);
    this.imageDetector = new DocxImageDetector();
  }

  /**
   * Attempt regex extraction for a Guardian document.
   *
   * @returns RegexRoutingResult with result=non-null if regex succeeded,
   *          or result=null to signal Claude fallback
   */
  async tryRegexExtraction(
    rawText: string,
    buffer: Buffer,
    metadata: DocumentMetadata,
    startTime: number,
    expectedAssessmentId?: string,
  ): Promise<RegexRoutingResult> {
    if (!ENABLE_REGEX_EXTRACTION) {
      console.log('[DocumentParserService] Extraction method: claude (regex disabled)');
      return { result: null, method: 'claude_fallback', confidence: null };
    }

    try {
      // Step 1: Run regex extraction
      const extraction = this.extractor.extract(rawText);

      // Step 2: Merge image detection for docx files
      if (this.isDocx(metadata.mimeType)) {
        await this.mergeImageFlags(extraction, buffer);
      }

      // Step 3: Evaluate confidence (also fetches DB questions — reuse count from result)
      const confidence = await this.confidenceCalc.evaluate(
        extraction,
        expectedAssessmentId,
      );

      console.log(
        '[DocumentParserService] Extraction method: regex |',
        `Confidence: ${JSON.stringify({
          confident: confidence.confident,
          overallScore: confidence.overallScore,
          checks: confidence.checks.map(c => `${c.name}:${c.passed}`),
        })} |`,
        `Parse time: ${extraction.parseTimeMs}ms (regex)`,
      );

      if (!confidence.confident) {
        console.log(
          '[DocumentParserService] Regex confidence insufficient, falling back to Claude.',
          'Failed checks:',
          confidence.checks.filter(c => !c.passed).map(c => `${c.name}: ${c.detail}`).join('; '),
        );
        return { result: null, method: 'claude_fallback', confidence };
      }

      // Step 4: Build ScoringParseResult (reuse dbQuestionCount from confidence evaluation)
      const dbQuestionCount = confidence.dbQuestionCount || null;
      const parseResult = this.buildScoringResult(
        extraction,
        confidence,
        metadata,
        startTime,
        dbQuestionCount,
      );

      return { result: parseResult, method: 'regex', confidence };
    } catch (error) {
      console.warn(
        '[DocumentParserService] Regex extraction failed, falling back to Claude:',
        error instanceof Error ? error.message : error,
      );
      return { result: null, method: 'claude_fallback', confidence: null };
    }
  }

  /** Check if MIME type indicates a docx file */
  private isDocx(mimeType: string): boolean {
    return mimeType.includes('wordprocessingml') || mimeType.includes('docx');
  }

  /** Merge image detection flags into extraction responses */
  private async mergeImageFlags(
    extraction: RegexExtractionResult,
    buffer: Buffer,
  ): Promise<void> {
    const imageResult = await this.imageDetector.detect(buffer);
    for (const response of extraction.responses) {
      const key = `${response.sectionNumber}.${response.questionNumber}`;
      const imageFlag = imageResult.questionImages.get(key);
      if (imageFlag?.hasVisualContent) {
        response.hasVisualContent = true;
        if (response.responseText === '') {
          response.confidence = IMAGE_ONLY_CONFIDENCE;
        }
      }
    }
  }

  /** Build a ScoringParseResult from regex extraction data */
  private buildScoringResult(
    extraction: RegexExtractionResult,
    confidence: ConfidenceResult,
    metadata: DocumentMetadata,
    startTime: number,
    dbQuestionCount: number | null,
  ): ScoringParseResult {
    const responses: ExtractedResponse[] = extraction.responses.map(r => ({
      sectionNumber: r.sectionNumber,
      sectionTitle: null,
      questionNumber: r.questionNumber,
      questionText: r.questionText,
      responseText: r.responseText,
      confidence: r.confidence,
      hasVisualContent: r.hasVisualContent,
      visualContentDescription: null,
    }));

    return {
      success: true,
      confidence: confidence.overallScore,
      metadata,
      parseTimeMs: Date.now() - startTime,
      assessmentId: extraction.assessmentId,
      vendorName: extraction.vendorName,
      solutionName: null,
      responses,
      expectedQuestionCount: dbQuestionCount,
      parsedQuestionCount: extraction.responses.length,
      unparsedQuestions: [],
      isComplete: dbQuestionCount !== null
        ? extraction.responses.length === dbQuestionCount
        : false,
    };
  }
}
