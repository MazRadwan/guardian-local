/**
 * Contract Tests for RegexExtractor -> ScoringParseResult
 *
 * Story 39.1.5: Verify that regex extraction output matches the
 * ScoringParseResult interface exactly, and that all fields consumed
 * by downstream services (ScoringLLMService, ScoringStorageService)
 * are present with correct types.
 *
 * These tests act as a safety net: if the ScoringParseResult interface
 * changes or the regex pipeline drifts, these tests catch it before
 * production.
 */

import {
  RegexResponseExtractor,
  type RegexExtractionResult,
} from '../../../../src/infrastructure/extraction/RegexResponseExtractor';
import {
  ExtractionConfidenceCalculator,
  type ConfidenceResult,
} from '../../../../src/infrastructure/extraction/ExtractionConfidenceCalculator';
import type {
  ScoringParseResult,
  ExtractedResponse,
} from '../../../../src/application/interfaces/IScoringDocumentParser';
import type { DocumentMetadata } from '../../../../src/application/interfaces/IDocumentParser';
import type { IQuestionRepository } from '../../../../src/application/interfaces/IQuestionRepository';
import type { Question } from '../../../../src/domain/entities/Question';

// =============================================================================
// Helpers
// =============================================================================

const ASSESSMENT_ID = '550e8400-e29b-41d4-a716-446655440000';

function createGuardianText(questionCount: number): string {
  const lines: string[] = [
    'AI Vendor Assessment Questionnaire',
    'SuperHealthyCan.ai',
    `Assessment ID: ${ASSESSMENT_ID}`,
    '',
    'Section 1: Data Privacy & Security',
    '',
  ];

  for (let i = 1; i <= questionCount; i++) {
    lines.push(`Question 1.${i}`);
    lines.push(`How does your organization handle scenario ${i}?`);
    lines.push('Response:');
    lines.push(`Our organization follows strict guidelines for scenario ${i}.`);
    lines.push('');
  }

  return lines.join('\n');
}

function createDocumentMetadata(): DocumentMetadata {
  return {
    filename: 'questionnaire.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 2048,
    documentType: 'pdf',
    storagePath: '/uploads/questionnaire.pdf',
    uploadedAt: new Date('2026-01-15'),
    uploadedBy: 'user-abc',
  };
}

/**
 * Build a ScoringParseResult from a regex extraction result,
 * replicating the logic in ExtractionRoutingService.buildScoringResult.
 *
 * This is the exact conversion path tested in contract form.
 */
function buildScoringResultFromRegex(
  extraction: RegexExtractionResult,
  confidence: ConfidenceResult,
  metadata: DocumentMetadata,
  dbQuestionCount: number | null,
): ScoringParseResult {
  const responses: ExtractedResponse[] = extraction.responses.map((r) => ({
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
    parseTimeMs: extraction.parseTimeMs,
    assessmentId: extraction.assessmentId,
    vendorName: extraction.vendorName,
    solutionName: null,
    responses,
    expectedQuestionCount: dbQuestionCount,
    parsedQuestionCount: extraction.responses.length,
    unparsedQuestions: [],
    isComplete:
      dbQuestionCount !== null
        ? extraction.responses.length === dbQuestionCount
        : false,
  };
}

function createMockQuestionRepo(
  dbQuestions: Array<{ sectionNumber: number; questionNumber: number }>,
): IQuestionRepository {
  return {
    bulkCreate: jest.fn(),
    findByAssessmentId: jest.fn().mockResolvedValue(
      dbQuestions.map((q) => ({
        sectionNumber: q.sectionNumber,
        questionNumber: q.questionNumber,
      })),
    ),
    findById: jest.fn(),
    deleteByAssessmentId: jest.fn(),
    replaceAllForAssessment: jest.fn(),
  };
}

// =============================================================================
// Contract Tests
// =============================================================================

describe('RegexExtractor Contract (Story 39.1.5)', () => {
  const extractor = new RegexResponseExtractor();
  const metadata = createDocumentMetadata();

  describe('ScoringParseResult shape', () => {
    it('produces a valid ScoringParseResult with all required fields', async () => {
      const text = createGuardianText(3);
      const extraction = extractor.extract(text);

      const dbQuestions = [
        { sectionNumber: 1, questionNumber: 1 },
        { sectionNumber: 1, questionNumber: 2 },
        { sectionNumber: 1, questionNumber: 3 },
      ];
      const questionRepo = createMockQuestionRepo(dbQuestions);
      const confidenceCalc = new ExtractionConfidenceCalculator(questionRepo);
      const confidence = await confidenceCalc.evaluate(extraction, ASSESSMENT_ID);

      const result: ScoringParseResult = buildScoringResultFromRegex(
        extraction,
        confidence,
        metadata,
        dbQuestions.length,
      );

      // ---- All top-level ScoringParseResult fields present ----
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('confidence');
      expect(result).toHaveProperty('metadata');
      expect(result).toHaveProperty('parseTimeMs');
      expect(result).toHaveProperty('assessmentId');
      expect(result).toHaveProperty('vendorName');
      expect(result).toHaveProperty('solutionName');
      expect(result).toHaveProperty('responses');
      expect(result).toHaveProperty('expectedQuestionCount');
      expect(result).toHaveProperty('parsedQuestionCount');
      expect(result).toHaveProperty('unparsedQuestions');
      expect(result).toHaveProperty('isComplete');

      // ---- Correct types for each field ----
      expect(typeof result.success).toBe('boolean');
      expect(typeof result.confidence).toBe('number');
      expect(typeof result.metadata).toBe('object');
      expect(typeof result.parseTimeMs).toBe('number');
      expect(
        result.assessmentId === null || typeof result.assessmentId === 'string',
      ).toBe(true);
      expect(
        result.vendorName === null || typeof result.vendorName === 'string',
      ).toBe(true);
      expect(
        result.solutionName === null || typeof result.solutionName === 'string',
      ).toBe(true);
      expect(Array.isArray(result.responses)).toBe(true);
      expect(
        result.expectedQuestionCount === null ||
          typeof result.expectedQuestionCount === 'number',
      ).toBe(true);
      expect(typeof result.parsedQuestionCount).toBe('number');
      expect(Array.isArray(result.unparsedQuestions)).toBe(true);
      expect(typeof result.isComplete).toBe('boolean');
    });

    it('metadata contains all DocumentMetadata fields', async () => {
      const text = createGuardianText(1);
      const extraction = extractor.extract(text);
      const questionRepo = createMockQuestionRepo([
        { sectionNumber: 1, questionNumber: 1 },
      ]);
      const confidenceCalc = new ExtractionConfidenceCalculator(questionRepo);
      const confidence = await confidenceCalc.evaluate(extraction, ASSESSMENT_ID);

      const result = buildScoringResultFromRegex(extraction, confidence, metadata, 1);

      expect(result.metadata).toHaveProperty('filename');
      expect(result.metadata).toHaveProperty('mimeType');
      expect(result.metadata).toHaveProperty('sizeBytes');
      expect(result.metadata).toHaveProperty('documentType');
      expect(result.metadata).toHaveProperty('storagePath');
      expect(result.metadata).toHaveProperty('uploadedAt');
      expect(result.metadata).toHaveProperty('uploadedBy');

      expect(typeof result.metadata.filename).toBe('string');
      expect(typeof result.metadata.mimeType).toBe('string');
      expect(typeof result.metadata.sizeBytes).toBe('number');
      expect(typeof result.metadata.documentType).toBe('string');
      expect(typeof result.metadata.storagePath).toBe('string');
      expect(result.metadata.uploadedAt).toBeInstanceOf(Date);
      expect(typeof result.metadata.uploadedBy).toBe('string');
    });
  });

  describe('ExtractedResponse shape', () => {
    it('each response contains all ExtractedResponse fields with correct types', async () => {
      const text = createGuardianText(3);
      const extraction = extractor.extract(text);
      const dbQuestions = [
        { sectionNumber: 1, questionNumber: 1 },
        { sectionNumber: 1, questionNumber: 2 },
        { sectionNumber: 1, questionNumber: 3 },
      ];
      const questionRepo = createMockQuestionRepo(dbQuestions);
      const confidenceCalc = new ExtractionConfidenceCalculator(questionRepo);
      const confidence = await confidenceCalc.evaluate(extraction, ASSESSMENT_ID);

      const result = buildScoringResultFromRegex(
        extraction,
        confidence,
        metadata,
        dbQuestions.length,
      );

      expect(result.responses.length).toBe(3);

      for (const response of result.responses) {
        // All fields present
        expect(response).toHaveProperty('sectionNumber');
        expect(response).toHaveProperty('sectionTitle');
        expect(response).toHaveProperty('questionNumber');
        expect(response).toHaveProperty('questionText');
        expect(response).toHaveProperty('responseText');
        expect(response).toHaveProperty('confidence');
        expect(response).toHaveProperty('hasVisualContent');
        expect(response).toHaveProperty('visualContentDescription');

        // Correct types
        expect(typeof response.sectionNumber).toBe('number');
        expect(
          response.sectionTitle === null ||
            typeof response.sectionTitle === 'string',
        ).toBe(true);
        expect(typeof response.questionNumber).toBe('number');
        expect(typeof response.questionText).toBe('string');
        expect(typeof response.responseText).toBe('string');
        expect(typeof response.confidence).toBe('number');
        expect(typeof response.hasVisualContent).toBe('boolean');
        expect(
          response.visualContentDescription === null ||
            typeof response.visualContentDescription === 'string',
        ).toBe(true);
      }
    });

    it('regex extraction always sets sectionTitle to null', () => {
      const text = createGuardianText(2);
      const extraction = extractor.extract(text);

      const result = buildScoringResultFromRegex(
        extraction,
        { confident: true, overallScore: 1, checks: [], dbQuestionCount: 0 },
        metadata,
        2,
      );

      for (const response of result.responses) {
        expect(response.sectionTitle).toBeNull();
      }
    });

    it('regex extraction always sets visualContentDescription to null', () => {
      const text = createGuardianText(2);
      const extraction = extractor.extract(text);

      const result = buildScoringResultFromRegex(
        extraction,
        { confident: true, overallScore: 1, checks: [], dbQuestionCount: 0 },
        metadata,
        2,
      );

      for (const response of result.responses) {
        expect(response.visualContentDescription).toBeNull();
      }
    });

    it('regex extraction always sets hasVisualContent to false (before image merge)', () => {
      const text = createGuardianText(2);
      const extraction = extractor.extract(text);

      // Before DocxImageDetector merges, hasVisualContent is always false
      for (const r of extraction.responses) {
        expect(r.hasVisualContent).toBe(false);
      }
    });
  });

  describe('fields consumed by ScoringLLMService', () => {
    /**
     * ScoringLLMService.scoreWithClaude maps parseResult.responses to:
     *   { sectionNumber, questionNumber, questionText, responseText }
     *
     * These 4 fields MUST exist with string/number types on every response.
     */
    it('all 4 fields required by ScoringLLMService are present and correctly typed', () => {
      const text = createGuardianText(5);
      const extraction = extractor.extract(text);

      const result = buildScoringResultFromRegex(
        extraction,
        { confident: true, overallScore: 1, checks: [], dbQuestionCount: 0 },
        metadata,
        5,
      );

      expect(result.responses.length).toBe(5);

      for (const response of result.responses) {
        // sectionNumber: number (positive integer)
        expect(typeof response.sectionNumber).toBe('number');
        expect(Number.isInteger(response.sectionNumber)).toBe(true);
        expect(response.sectionNumber).toBeGreaterThan(0);

        // questionNumber: number (positive integer)
        expect(typeof response.questionNumber).toBe('number');
        expect(Number.isInteger(response.questionNumber)).toBe(true);
        expect(response.questionNumber).toBeGreaterThan(0);

        // questionText: non-empty string
        expect(typeof response.questionText).toBe('string');
        expect(response.questionText.length).toBeGreaterThan(0);

        // responseText: string (may be empty for skipped responses)
        expect(typeof response.responseText).toBe('string');
      }
    });

    it('ScoringLLMService prompt mapping is structurally compatible', () => {
      const text = createGuardianText(2);
      const extraction = extractor.extract(text);

      const result = buildScoringResultFromRegex(
        extraction,
        { confident: true, overallScore: 1, checks: [], dbQuestionCount: 0 },
        metadata,
        2,
      );

      // Replicate the exact mapping from ScoringLLMService.scoreWithClaude:
      const promptResponses = result.responses.map((r) => ({
        sectionNumber: r.sectionNumber,
        questionNumber: r.questionNumber,
        questionText: r.questionText,
        responseText: r.responseText,
      }));

      expect(promptResponses).toHaveLength(2);
      for (const pr of promptResponses) {
        expect(pr).toEqual({
          sectionNumber: expect.any(Number),
          questionNumber: expect.any(Number),
          questionText: expect.any(String),
          responseText: expect.any(String),
        });
      }
    });
  });

  describe('fields consumed by ScoringStorageService', () => {
    /**
     * ScoringStorageService.storeResponses maps parseResult.responses to:
     *   { assessmentId, batchId, fileId, sectionNumber, questionNumber,
     *     questionText, responseText, confidence, hasVisualContent,
     *     visualContentDescription }
     *
     * The first 3 (assessmentId, batchId, fileId) come from caller args,
     * the rest must exist on each ExtractedResponse.
     */
    it('all fields required by ScoringStorageService.storeResponses are present', () => {
      const text = createGuardianText(3);
      const extraction = extractor.extract(text);

      const result = buildScoringResultFromRegex(
        extraction,
        { confident: true, overallScore: 1, checks: [], dbQuestionCount: 0 },
        metadata,
        3,
      );

      for (const r of result.responses) {
        // Fields read from each ExtractedResponse in ScoringStorageService:
        expect(typeof r.sectionNumber).toBe('number');
        expect(typeof r.questionNumber).toBe('number');
        expect(typeof r.questionText).toBe('string');
        expect(typeof r.responseText).toBe('string');
        expect(typeof r.confidence).toBe('number');
        // hasVisualContent may be boolean or falsy; ScoringStorageService uses `|| false`
        expect(typeof r.hasVisualContent).toBe('boolean');
        // visualContentDescription may be null; ScoringStorageService uses `?? undefined`
        expect(
          r.visualContentDescription === null ||
            typeof r.visualContentDescription === 'string',
        ).toBe(true);
      }
    });

    it('confidence is within 0-1 range for all responses', () => {
      const text = createGuardianText(3);
      const extraction = extractor.extract(text);

      const result = buildScoringResultFromRegex(
        extraction,
        { confident: true, overallScore: 1, checks: [], dbQuestionCount: 0 },
        metadata,
        3,
      );

      for (const r of result.responses) {
        expect(r.confidence).toBeGreaterThanOrEqual(0);
        expect(r.confidence).toBeLessThanOrEqual(1);
      }
    });

    it('top-level assessmentId, parsedQuestionCount, isComplete are present', () => {
      const text = createGuardianText(3);
      const extraction = extractor.extract(text);

      const result = buildScoringResultFromRegex(
        extraction,
        { confident: true, overallScore: 1, checks: [], dbQuestionCount: 0 },
        metadata,
        3,
      );

      // assessmentId: used by ScoringService to correlate with assessment record
      expect(result.assessmentId).toBe(ASSESSMENT_ID);
      expect(typeof result.assessmentId).toBe('string');

      // parsedQuestionCount: used for completeness check
      expect(result.parsedQuestionCount).toBe(3);
      expect(typeof result.parsedQuestionCount).toBe('number');

      // isComplete: used to decide if scoring can proceed
      expect(result.isComplete).toBe(true);
      expect(typeof result.isComplete).toBe('boolean');
    });
  });

  describe('empty and edge-case responses', () => {
    it('skipped question produces confidence 0.5 and empty responseText', () => {
      const text = [
        'AI Vendor Assessment Questionnaire',
        'TestVendor',
        `Assessment ID: ${ASSESSMENT_ID}`,
        '',
        'Question 1.1',
        'What is your policy?',
        'Response:',
        '',
        'Question 1.2',
        'How do you handle retention?',
        'Response:',
        'We retain for 7 years.',
      ].join('\n');

      const extraction = extractor.extract(text);
      const result = buildScoringResultFromRegex(
        extraction,
        { confident: true, overallScore: 0.75, checks: [], dbQuestionCount: 2 },
        metadata,
        2,
      );

      // Skipped response
      expect(result.responses[0].responseText).toBe('');
      expect(result.responses[0].confidence).toBe(0.5);

      // Answered response
      expect(result.responses[1].responseText).toContain('7 years');
      expect(result.responses[1].confidence).toBe(1.0);

      // Both still have correct shape
      for (const r of result.responses) {
        expect(typeof r.sectionNumber).toBe('number');
        expect(typeof r.questionNumber).toBe('number');
        expect(typeof r.questionText).toBe('string');
        expect(typeof r.responseText).toBe('string');
        expect(typeof r.confidence).toBe('number');
        expect(typeof r.hasVisualContent).toBe('boolean');
      }
    });

    it('zero responses produces valid ScoringParseResult', () => {
      const text = 'No question markers in this document at all.';
      const extraction = extractor.extract(text);

      const result = buildScoringResultFromRegex(
        extraction,
        { confident: false, overallScore: 0, checks: [], dbQuestionCount: 0 },
        metadata,
        null,
      );

      expect(result.success).toBe(true);
      expect(result.responses).toEqual([]);
      expect(result.parsedQuestionCount).toBe(0);
      expect(result.isComplete).toBe(false);
      expect(result.unparsedQuestions).toEqual([]);
    });

    it('regex extraction solutionName is always null', () => {
      const text = createGuardianText(2);
      const extraction = extractor.extract(text);

      const result = buildScoringResultFromRegex(
        extraction,
        { confident: true, overallScore: 1, checks: [], dbQuestionCount: 0 },
        metadata,
        2,
      );

      // Regex cannot extract solutionName (only Claude can)
      expect(result.solutionName).toBeNull();
    });

    it('unparsedQuestions is always an empty array for regex path', () => {
      const text = createGuardianText(3);
      const extraction = extractor.extract(text);

      const result = buildScoringResultFromRegex(
        extraction,
        { confident: true, overallScore: 1, checks: [], dbQuestionCount: 0 },
        metadata,
        3,
      );

      // Regex path does not track unparsed questions (it either finds them or doesn't)
      expect(result.unparsedQuestions).toEqual([]);
      expect(Array.isArray(result.unparsedQuestions)).toBe(true);
    });
  });

  describe('RegexExtractionResult to ScoringParseResult field mapping', () => {
    it('every RegexExtractionResult.responses field maps to ExtractedResponse', () => {
      const text = createGuardianText(2);
      const extraction = extractor.extract(text);

      // Verify all regex result fields are consumed in the conversion
      for (const regexResponse of extraction.responses) {
        // These are the fields from RegexExtractionResult.responses:
        expect(typeof regexResponse.sectionNumber).toBe('number');
        expect(typeof regexResponse.questionNumber).toBe('number');
        expect(typeof regexResponse.questionText).toBe('string');
        expect(typeof regexResponse.responseText).toBe('string');
        expect(typeof regexResponse.confidence).toBe('number');
        expect(typeof regexResponse.hasVisualContent).toBe('boolean');
      }

      // And the conversion adds two nullable fields
      const result = buildScoringResultFromRegex(
        extraction,
        { confident: true, overallScore: 1, checks: [], dbQuestionCount: 0 },
        metadata,
        2,
      );

      for (const converted of result.responses) {
        expect(converted.sectionTitle).toBeNull(); // Added by conversion
        expect(converted.visualContentDescription).toBeNull(); // Added by conversion
      }
    });

    it('assessmentId and vendorName pass through unchanged', () => {
      const text = createGuardianText(1);
      const extraction = extractor.extract(text);

      const result = buildScoringResultFromRegex(
        extraction,
        { confident: true, overallScore: 1, checks: [], dbQuestionCount: 0 },
        metadata,
        1,
      );

      expect(result.assessmentId).toBe(extraction.assessmentId);
      expect(result.vendorName).toBe(extraction.vendorName);
    });

    it('parseTimeMs is a non-negative number', () => {
      const text = createGuardianText(1);
      const extraction = extractor.extract(text);

      const result = buildScoringResultFromRegex(
        extraction,
        { confident: true, overallScore: 1, checks: [], dbQuestionCount: 0 },
        metadata,
        1,
      );

      expect(typeof result.parseTimeMs).toBe('number');
      expect(result.parseTimeMs).toBeGreaterThanOrEqual(0);
    });
  });
});
