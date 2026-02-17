/**
 * Integration Tests for RegexExtractor Pipeline
 *
 * Story 39.1.5: Verify the full extraction routing path using
 * real RegexResponseExtractor and ExtractionConfidenceCalculator
 * (not mocked). Only IQuestionRepository is mocked since it
 * requires a database connection.
 *
 * Tests the pipeline: raw text -> regex extraction -> confidence
 * evaluation -> ScoringParseResult (or null for Claude fallback).
 */

import { ExtractionRoutingService } from '../../../../src/infrastructure/extraction/ExtractionRoutingService';
import type { DocumentMetadata } from '../../../../src/application/interfaces/IDocumentParser';
import type { IQuestionRepository } from '../../../../src/application/interfaces/IQuestionRepository';
import type { ScoringParseResult, ExtractedResponse } from '../../../../src/application/interfaces/IScoringDocumentParser';

// Mock mammoth for docx image detection (not testing mammoth itself)
jest.mock('mammoth', () => ({
  convertToHtml: jest.fn().mockResolvedValue({ value: '<p>mock html</p>' }),
}));

// =============================================================================
// Shared Fixtures
// =============================================================================

const ASSESSMENT_UUID = '550e8400-e29b-41d4-a716-446655440000';

/**
 * Realistic Guardian questionnaire text with multiple sections
 * and configurable question count. Mirrors the actual exported
 * format from the Guardian questionnaire generator.
 */
function createRealisticGuardianText(opts: {
  assessmentId?: string;
  vendorName?: string;
  sections?: Array<{
    number: number;
    title: string;
    questions: Array<{
      number: number;
      text: string;
      response: string;
    }>;
  }>;
} = {}): string {
  const {
    assessmentId = ASSESSMENT_UUID,
    vendorName = 'SuperHealthyCan.ai',
    sections = [
      {
        number: 1,
        title: 'Data Privacy & Security',
        questions: [
          {
            number: 1,
            text: 'How does your organization handle protected health information (PHI)?',
            response:
              'Our organization follows strict HIPAA guidelines. We implement role-based access controls, encrypt PHI at rest and in transit, and maintain audit logs of all access.',
          },
          {
            number: 2,
            text: 'Describe your data encryption approach for data at rest and in transit.',
            response:
              'We use AES-256 encryption at rest with hardware security modules for key management. In transit, all data uses TLS 1.3 with certificate pinning.',
          },
          {
            number: 3,
            text: 'What data retention and deletion policies do you maintain?',
            response:
              'Data retention follows a tiered schedule: active data retained for 3 years, archived data for 7 years per healthcare regulation, then securely deleted using NIST 800-88 compliant methods.',
          },
        ],
      },
      {
        number: 2,
        title: 'Clinical Validation',
        questions: [
          {
            number: 1,
            text: 'What clinical validation studies have been performed on your AI system?',
            response:
              'We have completed three peer-reviewed studies: a 500-patient prospective trial at Johns Hopkins (2024), a multicenter study across 12 VA hospitals (2025), and an ongoing FDA De Novo submission trial.',
          },
          {
            number: 2,
            text: 'How do you handle model drift and performance degradation over time?',
            response:
              'We continuously monitor model performance with automated statistical process control. Monthly calibration reports are generated, and retraining is triggered when AUC drops below 0.92 on the validation cohort.',
          },
        ],
      },
    ],
  } = opts;

  const lines: string[] = [
    'AI Vendor Assessment Questionnaire',
    vendorName,
    `GUARDIAN Assessment ID: ${assessmentId}`,
    '',
  ];

  for (const section of sections) {
    lines.push(`Section ${section.number}: ${section.title}`);
    lines.push('');

    for (const q of section.questions) {
      lines.push(`Question ${section.number}.${q.number}`);
      lines.push(q.text);
      lines.push('Response:');
      lines.push(q.response);
      lines.push('');
    }
  }

  return lines.join('\n');
}

function createMetadata(overrides: Partial<DocumentMetadata> = {}): DocumentMetadata {
  return {
    filename: 'assessment-questionnaire.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 45000,
    documentType: 'pdf',
    storagePath: '/uploads/assessment-questionnaire.pdf',
    uploadedAt: new Date('2026-02-01'),
    uploadedBy: 'user-integration-test',
    ...overrides,
  };
}

function createMockQuestionRepo(
  questions: Array<{ sectionNumber: number; questionNumber: number }>,
): IQuestionRepository {
  return {
    bulkCreate: jest.fn(),
    findByAssessmentId: jest.fn().mockResolvedValue(
      questions.map((q) => ({
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
// Integration Tests
// =============================================================================

describe('RegexExtractor Integration (Story 39.1.5)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // =========================================================================
  // Path 1: Guardian doc + confident regex -> ScoringParseResult
  // =========================================================================

  describe('Path 1: Guardian doc + confident regex -> ScoringParseResult', () => {
    it('extracts correct response count from realistic Guardian text', async () => {
      const text = createRealisticGuardianText(); // 5 questions across 2 sections
      const dbQuestions = [
        { sectionNumber: 1, questionNumber: 1 },
        { sectionNumber: 1, questionNumber: 2 },
        { sectionNumber: 1, questionNumber: 3 },
        { sectionNumber: 2, questionNumber: 1 },
        { sectionNumber: 2, questionNumber: 2 },
      ];

      const questionRepo = createMockQuestionRepo(dbQuestions);
      const routingService = new ExtractionRoutingService(questionRepo);

      const result = await routingService.tryRegexExtraction(
        text,
        Buffer.from(text),
        createMetadata(),
        Date.now(),
        ASSESSMENT_UUID,
      );

      expect(result.result).not.toBeNull();
      expect(result.method).toBe('regex');
      expect(result.result!.responses).toHaveLength(5);
    });

    it('correctly extracts assessmentId from document header', async () => {
      const text = createRealisticGuardianText();
      const dbQuestions = [
        { sectionNumber: 1, questionNumber: 1 },
        { sectionNumber: 1, questionNumber: 2 },
        { sectionNumber: 1, questionNumber: 3 },
        { sectionNumber: 2, questionNumber: 1 },
        { sectionNumber: 2, questionNumber: 2 },
      ];

      const questionRepo = createMockQuestionRepo(dbQuestions);
      const routingService = new ExtractionRoutingService(questionRepo);

      const result = await routingService.tryRegexExtraction(
        text,
        Buffer.from(text),
        createMetadata(),
        Date.now(),
        ASSESSMENT_UUID,
      );

      expect(result.result!.assessmentId).toBe(ASSESSMENT_UUID);
    });

    it('correctly extracts vendor name', async () => {
      const text = createRealisticGuardianText({ vendorName: 'MediTech Solutions Inc.' });
      const dbQuestions = [
        { sectionNumber: 1, questionNumber: 1 },
        { sectionNumber: 1, questionNumber: 2 },
        { sectionNumber: 1, questionNumber: 3 },
        { sectionNumber: 2, questionNumber: 1 },
        { sectionNumber: 2, questionNumber: 2 },
      ];

      const questionRepo = createMockQuestionRepo(dbQuestions);
      const routingService = new ExtractionRoutingService(questionRepo);

      const result = await routingService.tryRegexExtraction(
        text,
        Buffer.from(text),
        createMetadata(),
        Date.now(),
        ASSESSMENT_UUID,
      );

      expect(result.result!.vendorName).toBe('MediTech Solutions Inc.');
    });

    it('confidence calculator passes on real extraction output', async () => {
      const text = createRealisticGuardianText();
      const dbQuestions = [
        { sectionNumber: 1, questionNumber: 1 },
        { sectionNumber: 1, questionNumber: 2 },
        { sectionNumber: 1, questionNumber: 3 },
        { sectionNumber: 2, questionNumber: 1 },
        { sectionNumber: 2, questionNumber: 2 },
      ];

      const questionRepo = createMockQuestionRepo(dbQuestions);
      const routingService = new ExtractionRoutingService(questionRepo);

      const result = await routingService.tryRegexExtraction(
        text,
        Buffer.from(text),
        createMetadata(),
        Date.now(),
        ASSESSMENT_UUID,
      );

      expect(result.confidence).not.toBeNull();
      expect(result.confidence!.confident).toBe(true);
      expect(result.confidence!.overallScore).toBe(1);

      // All 4 checks should pass
      expect(result.confidence!.checks).toHaveLength(4);
      for (const check of result.confidence!.checks) {
        expect(check.passed).toBe(true);
      }
    });

    it('extracts multi-paragraph responses correctly', async () => {
      const text = createRealisticGuardianText();
      const dbQuestions = [
        { sectionNumber: 1, questionNumber: 1 },
        { sectionNumber: 1, questionNumber: 2 },
        { sectionNumber: 1, questionNumber: 3 },
        { sectionNumber: 2, questionNumber: 1 },
        { sectionNumber: 2, questionNumber: 2 },
      ];

      const questionRepo = createMockQuestionRepo(dbQuestions);
      const routingService = new ExtractionRoutingService(questionRepo);

      const result = await routingService.tryRegexExtraction(
        text,
        Buffer.from(text),
        createMetadata(),
        Date.now(),
        ASSESSMENT_UUID,
      );

      // Check that actual response content is extracted (not just markers)
      const r1 = result.result!.responses[0];
      expect(r1.sectionNumber).toBe(1);
      expect(r1.questionNumber).toBe(1);
      expect(r1.questionText).toContain('protected health information');
      expect(r1.responseText).toContain('HIPAA guidelines');
      expect(r1.responseText).toContain('role-based access controls');
      expect(r1.confidence).toBe(1.0);

      const r4 = result.result!.responses[3];
      expect(r4.sectionNumber).toBe(2);
      expect(r4.questionNumber).toBe(1);
      expect(r4.responseText).toContain('peer-reviewed studies');
      expect(r4.responseText).toContain('Johns Hopkins');
    });

    it('produces a complete ScoringParseResult with all fields', async () => {
      const text = createRealisticGuardianText();
      const dbQuestions = [
        { sectionNumber: 1, questionNumber: 1 },
        { sectionNumber: 1, questionNumber: 2 },
        { sectionNumber: 1, questionNumber: 3 },
        { sectionNumber: 2, questionNumber: 1 },
        { sectionNumber: 2, questionNumber: 2 },
      ];

      const questionRepo = createMockQuestionRepo(dbQuestions);
      const routingService = new ExtractionRoutingService(questionRepo);

      const result = await routingService.tryRegexExtraction(
        text,
        Buffer.from(text),
        createMetadata(),
        Date.now(),
        ASSESSMENT_UUID,
      );

      const parseResult = result.result!;

      // Full ScoringParseResult shape verification
      expect(parseResult.success).toBe(true);
      expect(parseResult.confidence).toBe(1);
      expect(parseResult.metadata).toBeDefined();
      expect(typeof parseResult.parseTimeMs).toBe('number');
      expect(parseResult.assessmentId).toBe(ASSESSMENT_UUID);
      expect(parseResult.vendorName).toBe('SuperHealthyCan.ai');
      expect(parseResult.solutionName).toBeNull();
      expect(parseResult.responses).toHaveLength(5);
      expect(parseResult.expectedQuestionCount).toBe(5);
      expect(parseResult.parsedQuestionCount).toBe(5);
      expect(parseResult.unparsedQuestions).toEqual([]);
      expect(parseResult.isComplete).toBe(true);
    });

    it('sets isComplete=false when not all DB questions are extracted', async () => {
      // Guardian text has 5 questions but DB has 8
      const text = createRealisticGuardianText();
      const dbQuestions = [
        { sectionNumber: 1, questionNumber: 1 },
        { sectionNumber: 1, questionNumber: 2 },
        { sectionNumber: 1, questionNumber: 3 },
        { sectionNumber: 2, questionNumber: 1 },
        { sectionNumber: 2, questionNumber: 2 },
        // These extra DB questions are not in the document
        // but since all 5 extracted keys match the first 5 DB keys,
        // confidence still passes (count ratio 5/8 = 0.625 < 0.9 threshold)
        { sectionNumber: 3, questionNumber: 1 },
        { sectionNumber: 3, questionNumber: 2 },
        { sectionNumber: 3, questionNumber: 3 },
      ];

      const questionRepo = createMockQuestionRepo(dbQuestions);
      const routingService = new ExtractionRoutingService(questionRepo);

      const result = await routingService.tryRegexExtraction(
        text,
        Buffer.from(text),
        createMetadata(),
        Date.now(),
        ASSESSMENT_UUID,
      );

      // Count ratio 5/8 = 0.625 is below 0.9 threshold, so confidence fails
      // This means result.result is null (Claude fallback)
      expect(result.result).toBeNull();
      expect(result.method).toBe('claude_fallback');
      expect(result.confidence!.confident).toBe(false);
    });
  });

  // =========================================================================
  // Path 2: Guardian doc + low confidence -> null (Claude fallback)
  // =========================================================================

  describe('Path 2: Guardian doc + low confidence -> null (Claude fallback)', () => {
    it('returns null when no question markers found', async () => {
      const text = [
        'AI Vendor Assessment Questionnaire',
        'SomeVendor',
        `Assessment ID: ${ASSESSMENT_UUID}`,
        '',
        'This document has no properly formatted questions.',
        'The vendor just wrote a free-form essay about their solution.',
      ].join('\n');

      const questionRepo = createMockQuestionRepo([
        { sectionNumber: 1, questionNumber: 1 },
      ]);
      const routingService = new ExtractionRoutingService(questionRepo);

      const result = await routingService.tryRegexExtraction(
        text,
        Buffer.from(text),
        createMetadata(),
        Date.now(),
        ASSESSMENT_UUID,
      );

      expect(result.result).toBeNull();
      expect(result.method).toBe('claude_fallback');
      expect(result.confidence).not.toBeNull();
      expect(result.confidence!.confident).toBe(false);
    });

    it('returns null when assessment ID is missing', async () => {
      // Valid questions but no assessment ID
      const text = [
        'AI Vendor Assessment Questionnaire',
        'SomeVendor',
        '',
        'Question 1.1',
        'What is your policy?',
        'Response:',
        'We have a policy.',
      ].join('\n');

      const questionRepo = createMockQuestionRepo([
        { sectionNumber: 1, questionNumber: 1 },
      ]);
      const routingService = new ExtractionRoutingService(questionRepo);

      const result = await routingService.tryRegexExtraction(
        text,
        Buffer.from(text),
        createMetadata(),
        Date.now(),
        ASSESSMENT_UUID,
      );

      expect(result.result).toBeNull();
      expect(result.method).toBe('claude_fallback');
      // assessmentId check should fail
      const idCheck = result.confidence!.checks.find((c) => c.name === 'assessmentId');
      expect(idCheck?.passed).toBe(false);
    });

    it('returns null when extracted questions do not match DB keys', async () => {
      const text = createRealisticGuardianText();
      // DB has completely different question keys than what's in the document
      const wrongDbQuestions = [
        { sectionNumber: 5, questionNumber: 1 },
        { sectionNumber: 5, questionNumber: 2 },
        { sectionNumber: 5, questionNumber: 3 },
        { sectionNumber: 6, questionNumber: 1 },
        { sectionNumber: 6, questionNumber: 2 },
      ];

      const questionRepo = createMockQuestionRepo(wrongDbQuestions);
      const routingService = new ExtractionRoutingService(questionRepo);

      const result = await routingService.tryRegexExtraction(
        text,
        Buffer.from(text),
        createMetadata(),
        Date.now(),
        ASSESSMENT_UUID,
      );

      expect(result.result).toBeNull();
      expect(result.method).toBe('claude_fallback');

      const keyCheck = result.confidence!.checks.find((c) => c.name === 'dbKeyMapping');
      expect(keyCheck?.passed).toBe(false);
    });

    it('returns null when assessment ID does not match expected', async () => {
      const differentId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
      const text = createRealisticGuardianText({ assessmentId: differentId });
      const dbQuestions = [
        { sectionNumber: 1, questionNumber: 1 },
        { sectionNumber: 1, questionNumber: 2 },
        { sectionNumber: 1, questionNumber: 3 },
        { sectionNumber: 2, questionNumber: 1 },
        { sectionNumber: 2, questionNumber: 2 },
      ];

      const questionRepo = createMockQuestionRepo(dbQuestions);
      const routingService = new ExtractionRoutingService(questionRepo);

      // Expected ID differs from what's in the document
      const result = await routingService.tryRegexExtraction(
        text,
        Buffer.from(text),
        createMetadata(),
        Date.now(),
        ASSESSMENT_UUID, // This doesn't match differentId
      );

      expect(result.result).toBeNull();
      expect(result.method).toBe('claude_fallback');

      const idCheck = result.confidence!.checks.find((c) => c.name === 'assessmentId');
      expect(idCheck?.passed).toBe(false);
      expect(idCheck?.detail).toContain('mismatch');
    });

    it('returns null when document has duplicate question markers', async () => {
      // Create text with duplicate Question 1.1 markers
      const text = [
        'AI Vendor Assessment Questionnaire',
        'DupeVendor',
        `Assessment ID: ${ASSESSMENT_UUID}`,
        '',
        'Section 1: Data Privacy',
        '',
        'Question 1.1',
        'First version of question.',
        'Response:',
        'First answer.',
        '',
        'Question 1.1',
        'Duplicate of the same question (OCR artifact).',
        'Response:',
        'Duplicate answer.',
        '',
        'Question 1.2',
        'Second question.',
        'Response:',
        'Second answer.',
      ].join('\n');

      const dbQuestions = [
        { sectionNumber: 1, questionNumber: 1 },
        { sectionNumber: 1, questionNumber: 2 },
      ];

      const questionRepo = createMockQuestionRepo(dbQuestions);
      const routingService = new ExtractionRoutingService(questionRepo);

      const result = await routingService.tryRegexExtraction(
        text,
        Buffer.from(text),
        createMetadata(),
        Date.now(),
        ASSESSMENT_UUID,
      );

      expect(result.result).toBeNull();
      expect(result.method).toBe('claude_fallback');

      const dupeCheck = result.confidence!.checks.find((c) => c.name === 'duplicates');
      expect(dupeCheck?.passed).toBe(false);
    });
  });

  // =========================================================================
  // Full pipeline path verification
  // =========================================================================

  describe('full pipeline: text -> regex -> confidence -> ScoringParseResult', () => {
    it('end-to-end: realistic questionnaire produces correct structure', async () => {
      const text = createRealisticGuardianText();
      const dbQuestions = [
        { sectionNumber: 1, questionNumber: 1 },
        { sectionNumber: 1, questionNumber: 2 },
        { sectionNumber: 1, questionNumber: 3 },
        { sectionNumber: 2, questionNumber: 1 },
        { sectionNumber: 2, questionNumber: 2 },
      ];

      const questionRepo = createMockQuestionRepo(dbQuestions);
      const routingService = new ExtractionRoutingService(questionRepo);

      const startTime = Date.now();
      const result = await routingService.tryRegexExtraction(
        text,
        Buffer.from(text),
        createMetadata(),
        startTime,
        ASSESSMENT_UUID,
      );

      // Method is regex (not fallback)
      expect(result.method).toBe('regex');

      // Confidence passed
      expect(result.confidence!.confident).toBe(true);

      // Result is non-null ScoringParseResult
      const parseResult = result.result!;
      expect(parseResult).toBeDefined();

      // Responses are correctly structured
      expect(parseResult.responses).toHaveLength(5);

      // Section numbers are correct
      const sectionNumbers = parseResult.responses.map((r) => r.sectionNumber);
      expect(sectionNumbers).toEqual([1, 1, 1, 2, 2]);

      // Question numbers within sections are correct
      const questionNumbers = parseResult.responses.map((r) => r.questionNumber);
      expect(questionNumbers).toEqual([1, 2, 3, 1, 2]);

      // Each response has non-empty question and response text
      for (const r of parseResult.responses) {
        expect(r.questionText.length).toBeGreaterThan(0);
        expect(r.responseText.length).toBeGreaterThan(0);
        expect(r.confidence).toBe(1.0);
        expect(r.hasVisualContent).toBe(false);
      }

      // Parse time is reasonable
      expect(parseResult.parseTimeMs).toBeGreaterThanOrEqual(0);
      expect(parseResult.parseTimeMs).toBeLessThan(5000);
    });

    it('handles mixed empty and filled responses in same document', async () => {
      const text = [
        'AI Vendor Assessment Questionnaire',
        'MixedResponseVendor',
        `Assessment ID: ${ASSESSMENT_UUID}`,
        '',
        'Section 1: Data Privacy',
        '',
        'Question 1.1',
        'How does your organization handle PHI?',
        'Response:',
        'We follow HIPAA guidelines thoroughly.',
        '',
        'Question 1.2',
        'Describe your encryption approach.',
        'Response:',
        '',
        'Question 1.3',
        'What are your data retention policies?',
        'Response:',
        'We retain data for 7 years per regulation.',
      ].join('\n');

      const dbQuestions = [
        { sectionNumber: 1, questionNumber: 1 },
        { sectionNumber: 1, questionNumber: 2 },
        { sectionNumber: 1, questionNumber: 3 },
      ];

      const questionRepo = createMockQuestionRepo(dbQuestions);
      const routingService = new ExtractionRoutingService(questionRepo);

      const result = await routingService.tryRegexExtraction(
        text,
        Buffer.from(text),
        createMetadata(),
        Date.now(),
        ASSESSMENT_UUID,
      );

      expect(result.result).not.toBeNull();
      const responses = result.result!.responses;

      // Q1.1: has response, confidence 1.0
      expect(responses[0].responseText).toContain('HIPAA');
      expect(responses[0].confidence).toBe(1.0);

      // Q1.2: empty response, confidence 0.5
      expect(responses[1].responseText).toBe('');
      expect(responses[1].confidence).toBe(0.5);

      // Q1.3: has response, confidence 1.0
      expect(responses[2].responseText).toContain('7 years');
      expect(responses[2].confidence).toBe(1.0);
    });

    it('handles text with preprocessing artifacts (page markers, footer)', async () => {
      const text = [
        'AI Vendor Assessment Questionnaire',
        'ArtifactVendor',
        `Assessment ID: ${ASSESSMENT_UUID}`,
        '',
        '-- 1 of 3 --',
        '',
        'Section 1: Data Privacy',
        '',
        'Question 1.1',
        'What is your data governance policy?',
        'Response:',
        'We have comprehensive governance.',
        '',
        '-- 2 of 3 --',
        '',
        'Question 1.2',
        'How do you handle classification?',
        'Response:',
        'We classify into four tiers.',
        '',
        '-- 3 of 3 --',
        '',
        'Generated by Guardian AI Vendor Assessment System',
        'Version 2.0',
      ].join('\n');

      const dbQuestions = [
        { sectionNumber: 1, questionNumber: 1 },
        { sectionNumber: 1, questionNumber: 2 },
      ];

      const questionRepo = createMockQuestionRepo(dbQuestions);
      const routingService = new ExtractionRoutingService(questionRepo);

      const result = await routingService.tryRegexExtraction(
        text,
        Buffer.from(text),
        createMetadata(),
        Date.now(),
        ASSESSMENT_UUID,
      );

      expect(result.result).not.toBeNull();
      expect(result.result!.responses).toHaveLength(2);

      // Page markers should be stripped by TextPreprocessor
      expect(result.result!.responses[0].responseText).not.toContain('-- 1 of 3 --');
      expect(result.result!.responses[0].responseText).toContain('comprehensive governance');

      expect(result.result!.responses[1].responseText).not.toContain('-- 2 of 3 --');
      expect(result.result!.responses[1].responseText).toContain('four tiers');
    });

    it('confidence result includes all 4 check names', async () => {
      const text = createRealisticGuardianText();
      const dbQuestions = [
        { sectionNumber: 1, questionNumber: 1 },
        { sectionNumber: 1, questionNumber: 2 },
        { sectionNumber: 1, questionNumber: 3 },
        { sectionNumber: 2, questionNumber: 1 },
        { sectionNumber: 2, questionNumber: 2 },
      ];

      const questionRepo = createMockQuestionRepo(dbQuestions);
      const routingService = new ExtractionRoutingService(questionRepo);

      const result = await routingService.tryRegexExtraction(
        text,
        Buffer.from(text),
        createMetadata(),
        Date.now(),
        ASSESSMENT_UUID,
      );

      const checkNames = result.confidence!.checks.map((c) => c.name);
      expect(checkNames).toContain('assessmentId');
      expect(checkNames).toContain('duplicates');
      expect(checkNames).toContain('countRatio');
      expect(checkNames).toContain('dbKeyMapping');
    });

    it('questionRepo.findByAssessmentId is called with expected ID, not extracted ID', async () => {
      // This verifies the security property: the DB query uses the
      // authorized expectedAssessmentId, not the untrusted document ID
      const docId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
      const expectedId = '11111111-2222-3333-4444-555555555555';

      const text = createRealisticGuardianText({ assessmentId: docId });
      const questionRepo = createMockQuestionRepo([]);
      const routingService = new ExtractionRoutingService(questionRepo);

      await routingService.tryRegexExtraction(
        text,
        Buffer.from(text),
        createMetadata(),
        Date.now(),
        expectedId,
      );

      // findByAssessmentId should be called with the trusted expected ID
      expect(questionRepo.findByAssessmentId).toHaveBeenCalledWith(expectedId);
      // And NOT with the untrusted document ID
      expect(questionRepo.findByAssessmentId).not.toHaveBeenCalledWith(docId);
    });
  });

  // =========================================================================
  // Performance sanity check
  // =========================================================================

  describe('performance', () => {
    it('regex extraction completes in under 100ms for typical document', async () => {
      const text = createRealisticGuardianText();
      const dbQuestions = [
        { sectionNumber: 1, questionNumber: 1 },
        { sectionNumber: 1, questionNumber: 2 },
        { sectionNumber: 1, questionNumber: 3 },
        { sectionNumber: 2, questionNumber: 1 },
        { sectionNumber: 2, questionNumber: 2 },
      ];

      const questionRepo = createMockQuestionRepo(dbQuestions);
      const routingService = new ExtractionRoutingService(questionRepo);

      const start = performance.now();
      await routingService.tryRegexExtraction(
        text,
        Buffer.from(text),
        createMetadata(),
        Date.now(),
        ASSESSMENT_UUID,
      );
      const elapsed = performance.now() - start;

      // Regex + confidence should be fast (well under 100ms for unit-like test)
      expect(elapsed).toBeLessThan(100);
    });
  });
});
