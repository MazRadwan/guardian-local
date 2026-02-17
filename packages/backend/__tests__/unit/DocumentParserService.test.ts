import { DocumentParserService } from '../../src/infrastructure/ai/DocumentParserService.js';
import { DocumentMetadata } from '../../src/application/interfaces/IDocumentParser.js';
import {
  AssessmentNotFoundError,
  QuestionnaireMismatchError,
} from '../../src/application/interfaces/IScoringDocumentParser.js';

// Mock pdf-parse module (v2 class-based API)
// Default content includes Guardian markers to pass pre-check (Story 20.4.1)
jest.mock('pdf-parse', () => ({
  PDFParse: jest.fn().mockImplementation(() => ({
    getText: jest.fn().mockResolvedValue({
      text: `Assessment ID: 12345678-1234-1234-1234-123456789012
GUARDIAN Security Assessment
Section 1: Clinical Risk
Question 1.1 - How do you validate AI outputs?`,
      total: 2,
      pages: [],
    }),
    destroy: jest.fn().mockResolvedValue(undefined),
  })),
}));

// Mock mammoth module - includes Guardian markers for pre-check
jest.mock('mammoth', () => ({
  extractRawText: jest.fn().mockResolvedValue({
    value: `Assessment ID: 12345678-1234-1234-1234-123456789012
GUARDIAN Security Assessment
Section 1: Clinical Risk
Question 1.1 - How do you validate AI outputs?`,
  }),
  convertToHtml: jest.fn().mockResolvedValue({
    value: '<p>mock html</p>',
  }),
}));

// Mock dependencies
const mockClaudeClient = {
  sendMessage: jest.fn(),
  streamMessage: jest.fn(),
};

const mockVisionClient = {
  analyzeImages: jest.fn(),
  prepareDocument: jest.fn(),
};

const mockQuestionRepo = {
  bulkCreate: jest.fn(),
  findByAssessmentId: jest.fn().mockResolvedValue([]),
  findById: jest.fn(),
  deleteByAssessmentId: jest.fn(),
  replaceAllForAssessment: jest.fn(),
};

// Helper to create valid intake extraction response
function createIntakeExtractionResponse(overrides = {}) {
  return {
    vendorName: 'Test Vendor',
    solutionName: 'Test Solution',
    solutionType: 'Clinical Decision Support',
    industry: 'Healthcare',
    features: ['Feature 1', 'Feature 2'],
    claims: ['Claim 1'],
    integrations: ['Epic', 'Cerner'],
    complianceMentions: ['HIPAA', 'SOC2'],
    securityMentions: ['AES-256 encryption'],
    architectureNotes: ['Cloud-based'],
    confidence: 0.9,
    suggestedQuestions: ['How do you handle PHI?'],
    coveredCategories: ['privacy_risk', 'security_risk'],
    gapCategories: ['clinical_risk'],
    ...overrides,
  };
}

// Helper to create valid scoring extraction response
function createScoringExtractionResponse(overrides = {}) {
  return {
    assessmentId: 'assessment-123',
    vendorName: 'Test Vendor',
    solutionName: 'Test Solution',
    responses: [
      {
        sectionNumber: 1,
        sectionTitle: 'Clinical Risk',
        questionNumber: 1,
        questionText: 'How do you validate AI outputs?',
        responseText: 'We use multiple validation steps...',
        confidence: 0.95,
        hasVisualContent: false,
        visualContentDescription: null,
      },
      {
        sectionNumber: 1,
        sectionTitle: 'Clinical Risk',
        questionNumber: 2,
        questionText: 'Describe your testing process',
        responseText: 'Our testing includes...',
        confidence: 0.88,
        hasVisualContent: true,
        visualContentDescription: 'Screenshot of testing dashboard',
      },
    ],
    expectedQuestionCount: 10,
    parsedQuestionCount: 2,
    unparsedQuestions: [],
    isComplete: false,
    overallConfidence: 0.91,
    parsingNotes: [],
    ...overrides,
  };
}

// Helper to create document metadata
function createMetadata(overrides = {}): DocumentMetadata {
  return {
    filename: 'test-document.pdf',
    mimeType: 'application/pdf',
    documentType: 'pdf',
    sizeBytes: 1024,
    storagePath: '/uploads/test-document.pdf',
    uploadedAt: new Date(),
    uploadedBy: 'user-123',
    ...overrides,
  };
}

describe('DocumentParserService', () => {
  let service: DocumentParserService;

  beforeEach(() => {
    jest.clearAllMocks();

    service = new DocumentParserService(
      mockClaudeClient as any,
      mockVisionClient as any,
      mockQuestionRepo as any
    );

    // Default mock for Claude text-based response
    mockClaudeClient.sendMessage.mockResolvedValue({
      content: JSON.stringify(createIntakeExtractionResponse()),
    });

    // Default mock for Vision response
    mockVisionClient.analyzeImages.mockResolvedValue({
      content: JSON.stringify(createIntakeExtractionResponse()),
      usage: { inputTokens: 1000, outputTokens: 500 },
      stopReason: 'end_turn',
    });

    mockVisionClient.prepareDocument.mockResolvedValue([]);
  });

  describe('parseForContext (Intake)', () => {
    it('extracts context from PDF document using text-based API', async () => {
      const metadata = createMetadata();
      const buffer = Buffer.from('PDF content');

      const result = await service.parseForContext(buffer, metadata);

      expect(result.success).toBe(true);
      expect(result.confidence).toBe(0.9);
      expect(result.context).toEqual(expect.objectContaining({
        vendorName: 'Test Vendor',
        solutionName: 'Test Solution',
        features: ['Feature 1', 'Feature 2'],
      }));
      expect(result.suggestedQuestions).toEqual(['How do you handle PHI?']);
      expect(result.coveredCategories).toEqual(['privacy_risk', 'security_risk']);
      expect(result.gapCategories).toEqual(['clinical_risk']);
    });

    it('extracts context from DOCX document', async () => {
      const metadata = createMetadata({
        filename: 'test.docx',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        documentType: 'docx',
      });
      const buffer = Buffer.from('DOCX content');

      const result = await service.parseForContext(buffer, metadata);

      expect(result.success).toBe(true);
      expect(result.context?.vendorName).toBe('Test Vendor');
    });

    it('uses Vision API for image documents', async () => {
      mockVisionClient.prepareDocument.mockResolvedValue([
        {
          type: 'image',
          source: { type: 'base64', media_type: 'image/png', data: 'base64data' },
        },
      ]);

      const metadata = createMetadata({
        filename: 'screenshot.png',
        mimeType: 'image/png',
        documentType: 'image',
      });
      const buffer = Buffer.from('PNG content');

      const result = await service.parseForContext(buffer, metadata);

      expect(mockVisionClient.analyzeImages).toHaveBeenCalled();
      expect(mockVisionClient.prepareDocument).toHaveBeenCalledWith(buffer, 'image/png');
      expect(result.success).toBe(true);
    });

    it('handles JSON response in markdown code block', async () => {
      mockClaudeClient.sendMessage.mockResolvedValue({
        content: '```json\n' + JSON.stringify(createIntakeExtractionResponse()) + '\n```',
      });

      const result = await service.parseForContext(
        Buffer.from('content'),
        createMetadata()
      );

      expect(result.success).toBe(true);
      expect(result.context?.vendorName).toBe('Test Vendor');
    });

    it('returns failed result on JSON parse error', async () => {
      mockClaudeClient.sendMessage.mockResolvedValue({
        content: 'Invalid JSON response',
      });

      const result = await service.parseForContext(
        Buffer.from('content'),
        createMetadata()
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to parse extraction response');
      expect(result.context).toBeNull();
    });

    it('returns failed result on API error', async () => {
      mockClaudeClient.sendMessage.mockRejectedValue(new Error('API timeout'));

      const result = await service.parseForContext(
        Buffer.from('content'),
        createMetadata()
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('API timeout');
      expect(result.confidence).toBe(0);
    });

    it('includes raw text excerpt in context', async () => {
      const result = await service.parseForContext(
        Buffer.from('content'),
        createMetadata()
      );

      expect(result.success).toBe(true);
      expect(result.context?.rawTextExcerpt).toBeDefined();
    });

    it('includes storage path in context', async () => {
      const result = await service.parseForContext(
        Buffer.from('content'),
        createMetadata({ storagePath: '/uploads/vendor-doc.pdf' })
      );

      expect(result.success).toBe(true);
      expect(result.context?.sourceFilePath).toBe('/uploads/vendor-doc.pdf');
    });

    it('passes focus categories to prompt builder', async () => {
      await service.parseForContext(
        Buffer.from('content'),
        createMetadata(),
        { focusCategories: ['privacy_risk', 'security_risk'] }
      );

      expect(mockClaudeClient.sendMessage).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            content: expect.stringContaining('privacy_risk'),
          }),
        ]),
        expect.any(Object)
      );
    });

    it('tracks parse time in result', async () => {
      const result = await service.parseForContext(
        Buffer.from('content'),
        createMetadata()
      );

      // parseTimeMs can be 0 on fast execution; check it's a valid non-negative number
      expect(result.parseTimeMs).toBeGreaterThanOrEqual(0);
      expect(typeof result.parseTimeMs).toBe('number');
    });
  });

  describe('parseForResponses (Scoring)', () => {
    beforeEach(() => {
      mockClaudeClient.sendMessage.mockResolvedValue({
        content: JSON.stringify(createScoringExtractionResponse()),
      });
    });

    it('extracts responses from PDF questionnaire', async () => {
      const metadata = createMetadata();
      const buffer = Buffer.from('PDF content');

      const result = await service.parseForResponses(buffer, metadata);

      expect(result.success).toBe(true);
      expect(result.assessmentId).toBe('assessment-123');
      expect(result.responses).toHaveLength(2);
      expect(result.responses[0]).toEqual(expect.objectContaining({
        questionText: 'How do you validate AI outputs?',
        responseText: 'We use multiple validation steps...',
        confidence: 0.95,
      }));
    });

    it('throws AssessmentNotFoundError when assessment ID missing', async () => {
      mockClaudeClient.sendMessage.mockResolvedValue({
        content: JSON.stringify(createScoringExtractionResponse({ assessmentId: null })),
      });

      const metadata = createMetadata();

      await expect(
        service.parseForResponses(Buffer.from('content'), metadata)
      ).rejects.toThrow(AssessmentNotFoundError);
    });

    it('throws QuestionnaireMismatchError when assessment ID does not match expected', async () => {
      mockClaudeClient.sendMessage.mockResolvedValue({
        content: JSON.stringify(createScoringExtractionResponse({ assessmentId: 'different-id' })),
      });

      const metadata = createMetadata();

      await expect(
        service.parseForResponses(Buffer.from('content'), metadata, {
          expectedAssessmentId: 'expected-id',
        })
      ).rejects.toThrow(QuestionnaireMismatchError);
    });

    it('uses Vision API for scanned questionnaire images', async () => {
      mockVisionClient.prepareDocument.mockResolvedValue([
        {
          type: 'image',
          source: { type: 'base64', media_type: 'image/jpeg', data: 'base64data' },
        },
      ]);
      mockVisionClient.analyzeImages.mockResolvedValue({
        content: JSON.stringify(createScoringExtractionResponse()),
        usage: { inputTokens: 2000, outputTokens: 1000 },
        stopReason: 'end_turn',
      });

      const metadata = createMetadata({
        filename: 'scanned-questionnaire.jpg',
        mimeType: 'image/jpeg',
        documentType: 'image',
      });

      const result = await service.parseForResponses(
        Buffer.from('image content'),
        metadata
      );

      expect(mockVisionClient.analyzeImages).toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(result.assessmentId).toBe('assessment-123');
    });

    it('filters low confidence responses when threshold set', async () => {
      mockClaudeClient.sendMessage.mockResolvedValue({
        content: JSON.stringify(createScoringExtractionResponse({
          responses: [
            { ...createScoringExtractionResponse().responses[0], confidence: 0.95 },
            { ...createScoringExtractionResponse().responses[1], confidence: 0.5 }, // Below threshold
          ],
        })),
      });

      const result = await service.parseForResponses(
        Buffer.from('content'),
        createMetadata(),
        { minConfidence: 0.7 }
      );

      expect(result.responses).toHaveLength(1);
      expect(result.responses[0].confidence).toBe(0.95);
    });

    it('includes low confidence responses when includeLowConfidence is true', async () => {
      mockClaudeClient.sendMessage.mockResolvedValue({
        content: JSON.stringify(createScoringExtractionResponse({
          responses: [
            { ...createScoringExtractionResponse().responses[0], confidence: 0.95 },
            { ...createScoringExtractionResponse().responses[1], confidence: 0.5 },
          ],
        })),
      });

      const result = await service.parseForResponses(
        Buffer.from('content'),
        createMetadata(),
        { minConfidence: 0.7, includeLowConfidence: true }
      );

      expect(result.responses).toHaveLength(2);
    });

    it('validates expected assessment ID when provided', async () => {
      await service.parseForResponses(
        Buffer.from('content'),
        createMetadata(),
        { expectedAssessmentId: 'assessment-123' }
      );

      expect(mockClaudeClient.sendMessage).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            content: expect.stringContaining('assessment-123'),
          }),
        ]),
        expect.any(Object)
      );
    });

    it('returns failed result on JSON parse error', async () => {
      mockClaudeClient.sendMessage.mockResolvedValue({
        content: 'Invalid response',
      });

      const result = await service.parseForResponses(
        Buffer.from('content'),
        createMetadata()
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to parse extraction response');
    });

    it('returns failed result on API error (non-AssessmentNotFoundError)', async () => {
      mockClaudeClient.sendMessage.mockRejectedValue(new Error('Network error'));

      const result = await service.parseForResponses(
        Buffer.from('content'),
        createMetadata()
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Network error');
    });

    it('tracks unparsed questions', async () => {
      mockClaudeClient.sendMessage.mockResolvedValue({
        content: JSON.stringify(createScoringExtractionResponse({
          unparsedQuestions: ['Section 2, Question 5', 'Section 3, Question 1'],
        })),
      });

      const result = await service.parseForResponses(
        Buffer.from('content'),
        createMetadata()
      );

      expect(result.unparsedQuestions).toEqual([
        'Section 2, Question 5',
        'Section 3, Question 1',
      ]);
    });

    it('reports completion status', async () => {
      mockClaudeClient.sendMessage.mockResolvedValue({
        content: JSON.stringify(createScoringExtractionResponse({ isComplete: true })),
      });

      const result = await service.parseForResponses(
        Buffer.from('content'),
        createMetadata()
      );

      expect(result.isComplete).toBe(true);
    });

    it('handles responses with visual content', async () => {
      const result = await service.parseForResponses(
        Buffer.from('content'),
        createMetadata()
      );

      const responseWithVisual = result.responses.find(r => r.hasVisualContent);
      expect(responseWithVisual).toBeDefined();
      expect(responseWithVisual?.visualContentDescription).toBe('Screenshot of testing dashboard');
    });
  });

  describe('Document type handling', () => {
    it('rejects unsupported document types', async () => {
      const metadata = createMetadata({
        documentType: 'xlsx' as any, // Unsupported
      });

      const result = await service.parseForContext(
        Buffer.from('content'),
        metadata
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Unsupported document type');
    });
  });

  // Story 20.3.3: Abort support for parsing
  describe('Abort support (Story 20.3.3)', () => {
    beforeEach(() => {
      mockClaudeClient.sendMessage.mockResolvedValue({
        content: JSON.stringify(createScoringExtractionResponse()),
      });
    });

    it('returns failed result when aborted before extraction', async () => {
      const abortController = new AbortController();
      abortController.abort(); // Abort immediately

      const result = await service.parseForResponses(
        Buffer.from('content'),
        createMetadata(),
        { abortSignal: abortController.signal }
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Parse aborted');
      expect(mockClaudeClient.sendMessage).not.toHaveBeenCalled();
    });

    it('returns failed result when aborted after extraction but before LLM call', async () => {
      const abortController = new AbortController();

      // Mock extraction to take some time, then abort before LLM call
      // Since extraction is fast in tests, we need to abort during extraction
      // The check happens after extractContent returns
      const originalSendMessage = mockClaudeClient.sendMessage.getMockImplementation();
      mockClaudeClient.sendMessage.mockImplementation(async () => {
        // Should not reach here if abort check works
        return { content: JSON.stringify(createScoringExtractionResponse()) };
      });

      // Abort before calling (simulates abort happening after extraction completes)
      // We'll test this by aborting and verifying the error response
      abortController.abort();

      const result = await service.parseForResponses(
        Buffer.from('content'),
        createMetadata(),
        { abortSignal: abortController.signal }
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Parse aborted');
    });

    it('returns failed result when LLM call throws due to abort', async () => {
      const abortController = new AbortController();

      // Mock sendMessage to throw an abort error
      mockClaudeClient.sendMessage.mockRejectedValue(new Error('Request aborted'));

      // Abort to set the signal state
      abortController.abort();

      const result = await service.parseForResponses(
        Buffer.from('content'),
        createMetadata(),
        { abortSignal: abortController.signal }
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Parse aborted');
    });

    it('passes abort signal to Claude client for text documents', async () => {
      const abortController = new AbortController();

      await service.parseForResponses(
        Buffer.from('content'),
        createMetadata(),
        { abortSignal: abortController.signal }
      );

      expect(mockClaudeClient.sendMessage).toHaveBeenCalledWith(
        expect.any(Array),
        expect.objectContaining({
          abortSignal: abortController.signal,
        })
      );
    });

    it('passes abort signal to Vision client for image documents', async () => {
      const abortController = new AbortController();

      mockVisionClient.prepareDocument.mockResolvedValue([
        {
          type: 'image',
          source: { type: 'base64', media_type: 'image/jpeg', data: 'base64data' },
        },
      ]);
      mockVisionClient.analyzeImages.mockResolvedValue({
        content: JSON.stringify(createScoringExtractionResponse()),
        usage: { inputTokens: 2000, outputTokens: 1000 },
        stopReason: 'end_turn',
      });

      const metadata = createMetadata({
        filename: 'questionnaire.jpg',
        mimeType: 'image/jpeg',
        documentType: 'image',
      });

      await service.parseForResponses(
        Buffer.from('image content'),
        metadata,
        { abortSignal: abortController.signal }
      );

      expect(mockVisionClient.analyzeImages).toHaveBeenCalledWith(
        expect.objectContaining({
          abortSignal: abortController.signal,
        })
      );
    });

    it('continues normal operation when not aborted', async () => {
      const abortController = new AbortController();
      // Do NOT abort

      const result = await service.parseForResponses(
        Buffer.from('content'),
        createMetadata(),
        { abortSignal: abortController.signal }
      );

      expect(result.success).toBe(true);
      expect(result.assessmentId).toBe('assessment-123');
      expect(mockClaudeClient.sendMessage).toHaveBeenCalled();
    });

    it('works without abort signal (backward compatible)', async () => {
      const result = await service.parseForResponses(
        Buffer.from('content'),
        createMetadata()
        // No options, no abortSignal
      );

      expect(result.success).toBe(true);
      expect(result.assessmentId).toBe('assessment-123');
    });
  });

  // Story 20.4.1: Guardian Document Pre-Check
  describe('Guardian Document Pre-Check (Story 20.4.1)', () => {
    beforeEach(() => {
      // Mock pdf-parse to return custom text
      const { PDFParse } = require('pdf-parse');
      PDFParse.mockImplementation((opts: { data: Buffer }) => ({
        getText: jest.fn().mockResolvedValue({
          text: opts.data.toString(),
          total: 1,
          pages: [],
        }),
        destroy: jest.fn().mockResolvedValue(undefined),
      }));

      mockClaudeClient.sendMessage.mockResolvedValue({
        content: JSON.stringify(createScoringExtractionResponse()),
      });
    });

    it('passes pre-check when valid Guardian document with markers', async () => {
      const guardianText = `
        Assessment ID: 12345678-1234-1234-1234-123456789012
        GUARDIAN Security Assessment
        Section 1: Clinical Risk
        Question 1.1 - How do you validate outputs?
      `;

      const result = await service.parseForResponses(
        Buffer.from(guardianText),
        createMetadata()
      );

      expect(result.success).toBe(true);
      expect(mockClaudeClient.sendMessage).toHaveBeenCalled();
    });

    it('fails pre-check when document has no Guardian markers', async () => {
      const nonGuardianText = `
        This is just a random PDF document about something else entirely.
        No assessment ID here, no sections, no questions.
        Just regular content.
      `;

      const result = await service.parseForResponses(
        Buffer.from(nonGuardianText),
        createMetadata()
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('does not appear to be a Guardian questionnaire');
      expect(mockClaudeClient.sendMessage).not.toHaveBeenCalled();
    });

    it('requires at least 2 markers to pass', async () => {
      // Only one marker (Assessment ID)
      const oneMarkerText = `
        Assessment ID: 12345678-1234-1234-1234-123456789012
        This document has an ID but nothing else recognizable.
      `;

      const result = await service.parseForResponses(
        Buffer.from(oneMarkerText),
        createMetadata()
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('does not appear to be a Guardian questionnaire');
    });

    it('passes with alternative question format (1.1 - )', async () => {
      const altFormatText = `
        Assessment ID: 12345678-1234-1234-1234-123456789012
        1.1 - First question
        1.2 - Second question
      `;

      const result = await service.parseForResponses(
        Buffer.from(altFormatText),
        createMetadata()
      );

      expect(result.success).toBe(true);
    });

    it('bypasses pre-check for image documents', async () => {
      // Images require Vision API to read, so pre-check is skipped
      mockVisionClient.prepareDocument.mockResolvedValue([
        {
          type: 'image',
          source: { type: 'base64', media_type: 'image/jpeg', data: 'base64data' },
        },
      ]);
      mockVisionClient.analyzeImages.mockResolvedValue({
        content: JSON.stringify(createScoringExtractionResponse()),
        usage: { inputTokens: 2000, outputTokens: 1000 },
        stopReason: 'end_turn',
      });

      const metadata = createMetadata({
        filename: 'questionnaire.jpg',
        mimeType: 'image/jpeg',
        documentType: 'image',
      });

      const result = await service.parseForResponses(
        Buffer.from('image content'),
        metadata
      );

      // Should succeed because pre-check is bypassed for images
      expect(result.success).toBe(true);
      expect(mockVisionClient.analyzeImages).toHaveBeenCalled();
    });

    it('fails pre-check for empty/short documents', async () => {
      const shortText = 'Too short';

      const result = await service.parseForResponses(
        Buffer.from(shortText),
        createMetadata()
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('does not appear to be a Guardian questionnaire');
    });

    it('provides descriptive error message on pre-check failure', async () => {
      const nonGuardianText = 'Random document content without any markers';

      const result = await service.parseForResponses(
        Buffer.from(nonGuardianText),
        createMetadata()
      );

      expect(result.error).toBe(
        'Document does not appear to be a Guardian questionnaire. Please upload an exported questionnaire PDF or Word document.'
      );
    });
  });

  // Story 39.2.4: Extraction Progress Events
  describe('Extraction Progress Events (Story 39.2.4)', () => {
    // Guardian text that passes pre-check (needed because earlier tests may override pdf-parse mock)
    const guardianBuffer = Buffer.from(
      `Assessment ID: 12345678-1234-1234-1234-123456789012\nGUARDIAN Security Assessment\nSection 1: Clinical Risk\nQuestion 1.1 - How do you validate?`
    );

    describe('Claude fallback path', () => {
      beforeEach(() => {
        // Reset pdf-parse mock to use buffer content (may have been overridden)
        const { PDFParse } = require('pdf-parse');
        PDFParse.mockImplementation((opts: { data: Buffer }) => ({
          getText: jest.fn().mockResolvedValue({
            text: opts.data.toString(),
            total: 1,
            pages: [],
          }),
          destroy: jest.fn().mockResolvedValue(undefined),
        }));
        // Must mock scoring extraction response for Claude fallback
        mockClaudeClient.sendMessage.mockResolvedValue({
          content: JSON.stringify(createScoringExtractionResponse()),
        });
      });

      it('emits "Processing document with AI..." progress at 15% on Claude fallback', async () => {
        const onProgress = jest.fn();

        await service.parseForResponses(
          guardianBuffer,
          createMetadata(),
          { onProgress }
        );

        expect(onProgress).toHaveBeenCalledWith({
          status: 'parsing',
          message: 'Processing document with AI...',
          progress: 15,
        });
      });

      it('does not crash when onProgress is not provided', async () => {
        const result = await service.parseForResponses(
          guardianBuffer,
          createMetadata()
        );

        expect(result.success).toBe(true);
      });

      it('does not crash when options provided without onProgress', async () => {
        const result = await service.parseForResponses(
          guardianBuffer,
          createMetadata(),
          { minConfidence: 0.7 }
        );

        expect(result.success).toBe(true);
      });
    });

    describe('regex path', () => {
      beforeEach(() => {
        // Reset pdf-parse mock to use buffer content
        const { PDFParse } = require('pdf-parse');
        PDFParse.mockImplementation((opts: { data: Buffer }) => ({
          getText: jest.fn().mockResolvedValue({
            text: opts.data.toString(),
            total: 1,
            pages: [],
          }),
          destroy: jest.fn().mockResolvedValue(undefined),
        }));
      });

      it('emits per-section progress messages during regex extraction', async () => {
        const customService = new DocumentParserService(
          mockClaudeClient as any,
          mockVisionClient as any,
          mockQuestionRepo as any
        );

        const mockRegexResult = {
          result: {
            success: true, confidence: 0.95, metadata: createMetadata(), parseTimeMs: 50,
            assessmentId: 'assessment-123', vendorName: 'Test Vendor', solutionName: null,
            responses: [
              { sectionNumber: 1, sectionTitle: null, questionNumber: 1, questionText: 'Q1', responseText: 'A1', confidence: 0.95, hasVisualContent: false, visualContentDescription: null },
              { sectionNumber: 1, sectionTitle: null, questionNumber: 2, questionText: 'Q2', responseText: 'A2', confidence: 0.95, hasVisualContent: false, visualContentDescription: null },
              { sectionNumber: 2, sectionTitle: null, questionNumber: 1, questionText: 'Q3', responseText: 'A3', confidence: 0.90, hasVisualContent: false, visualContentDescription: null },
              { sectionNumber: 3, sectionTitle: null, questionNumber: 1, questionText: 'Q4', responseText: 'A4', confidence: 0.90, hasVisualContent: false, visualContentDescription: null },
            ],
            expectedQuestionCount: 4, parsedQuestionCount: 4, unparsedQuestions: [], isComplete: true,
          },
          method: 'regex',
          confidence: { confident: true, overallScore: 0.95 },
        };

        (customService as any).routingService = {
          tryRegexExtraction: jest.fn().mockResolvedValue(mockRegexResult),
        };

        const onProgress = jest.fn();
        const result = await customService.parseForResponses(
          guardianBuffer,
          createMetadata(),
          { onProgress }
        );

        expect(result.success).toBe(true);

        const progressCalls = onProgress.mock.calls.map((c: any[]) => c[0]);
        const sectionCalls = progressCalls.filter((c: any) =>
          c.message && c.message.startsWith('Matching responses...')
        );

        expect(sectionCalls).toHaveLength(3);
        expect(sectionCalls[0]).toEqual({ status: 'parsing', message: 'Matching responses... section 1 of 3', progress: 15 });
        expect(sectionCalls[1]).toEqual({ status: 'parsing', message: 'Matching responses... section 2 of 3', progress: expect.any(Number) });
        expect(sectionCalls[2]).toEqual({ status: 'parsing', message: 'Matching responses... section 3 of 3', progress: expect.any(Number) });
      });

      it('interpolates progress between 15% and 50%', async () => {
        const customService = new DocumentParserService(
          mockClaudeClient as any,
          mockVisionClient as any,
          mockQuestionRepo as any
        );

        const mockRegexResult = {
          result: {
            success: true, confidence: 0.95, metadata: createMetadata(), parseTimeMs: 50,
            assessmentId: 'assessment-123', vendorName: 'Test Vendor', solutionName: null,
            responses: [
              { sectionNumber: 1, sectionTitle: null, questionNumber: 1, questionText: 'Q1', responseText: 'A1', confidence: 0.95, hasVisualContent: false, visualContentDescription: null },
              { sectionNumber: 2, sectionTitle: null, questionNumber: 1, questionText: 'Q2', responseText: 'A2', confidence: 0.95, hasVisualContent: false, visualContentDescription: null },
              { sectionNumber: 3, sectionTitle: null, questionNumber: 1, questionText: 'Q3', responseText: 'A3', confidence: 0.95, hasVisualContent: false, visualContentDescription: null },
              { sectionNumber: 4, sectionTitle: null, questionNumber: 1, questionText: 'Q4', responseText: 'A4', confidence: 0.95, hasVisualContent: false, visualContentDescription: null },
            ],
            expectedQuestionCount: 4, parsedQuestionCount: 4, unparsedQuestions: [], isComplete: true,
          },
          method: 'regex',
          confidence: { confident: true, overallScore: 0.95 },
        };

        (customService as any).routingService = {
          tryRegexExtraction: jest.fn().mockResolvedValue(mockRegexResult),
        };

        const onProgress = jest.fn();
        await customService.parseForResponses(
          guardianBuffer,
          createMetadata(),
          { onProgress }
        );

        const progressCalls = onProgress.mock.calls.map((c: any[]) => c[0]);
        const sectionCalls = progressCalls.filter((c: any) =>
          c.message && c.message.startsWith('Matching responses...')
        );

        // All progress values should be >= 15 and <= 50
        for (const call of sectionCalls) {
          expect(call.progress).toBeGreaterThanOrEqual(15);
          expect(call.progress).toBeLessThanOrEqual(50);
        }
      });
    });
  });

  // Story 20.4.2: Per-Response Truncation
  describe('Per-Response Truncation (Story 20.4.2)', () => {
    beforeEach(() => {
      // Mock pdf-parse to return Guardian-like content
      const { PDFParse } = require('pdf-parse');
      PDFParse.mockImplementation(() => ({
        getText: jest.fn().mockResolvedValue({
          text: `Assessment ID: 12345678-1234-1234-1234-123456789012
                 Section 1: Test
                 Question 1.1 - Test question`,
          total: 1,
          pages: [],
        }),
        destroy: jest.fn().mockResolvedValue(undefined),
      }));
    });

    it('does not truncate short responses', async () => {
      const shortResponse = 'Short response text';
      mockClaudeClient.sendMessage.mockResolvedValue({
        content: JSON.stringify(createScoringExtractionResponse({
          responses: [{
            sectionNumber: 1,
            sectionTitle: 'Test',
            questionNumber: 1,
            questionText: 'Test question',
            responseText: shortResponse,
            confidence: 0.9,
            hasVisualContent: false,
            visualContentDescription: null,
          }],
        })),
      });

      const result = await service.parseForResponses(
        Buffer.from('content'),
        createMetadata()
      );

      expect(result.success).toBe(true);
      expect(result.responses[0].responseText).toBe(shortResponse);
      expect(result.responses[0].responseText).not.toContain('[truncated]');
    });

    it('truncates long responses to limit', async () => {
      const longResponse = 'A'.repeat(3000); // 3000 chars, over 2000 limit
      mockClaudeClient.sendMessage.mockResolvedValue({
        content: JSON.stringify(createScoringExtractionResponse({
          responses: [{
            sectionNumber: 1,
            sectionTitle: 'Test',
            questionNumber: 1,
            questionText: 'Test question',
            responseText: longResponse,
            confidence: 0.9,
            hasVisualContent: false,
            visualContentDescription: null,
          }],
        })),
      });

      const result = await service.parseForResponses(
        Buffer.from('content'),
        createMetadata()
      );

      expect(result.success).toBe(true);
      // 2000 - ' [truncated]'.length = 1988
      expect(result.responses[0].responseText.length).toBeLessThanOrEqual(2000);
      expect(result.responses[0].responseText).toContain('[truncated]');
    });

    it('appends [truncated] notice to truncated responses', async () => {
      const longResponse = 'B'.repeat(2500);
      mockClaudeClient.sendMessage.mockResolvedValue({
        content: JSON.stringify(createScoringExtractionResponse({
          responses: [{
            sectionNumber: 1,
            sectionTitle: 'Test',
            questionNumber: 1,
            questionText: 'Test question',
            responseText: longResponse,
            confidence: 0.9,
            hasVisualContent: false,
            visualContentDescription: null,
          }],
        })),
      });

      const result = await service.parseForResponses(
        Buffer.from('content'),
        createMetadata()
      );

      expect(result.responses[0].responseText.endsWith(' [truncated]')).toBe(true);
    });

    it('processes all responses (none dropped)', async () => {
      const responses = Array.from({ length: 5 }, (_, i) => ({
        sectionNumber: i + 1,
        sectionTitle: `Section ${i + 1}`,
        questionNumber: 1,
        questionText: `Question ${i + 1}`,
        responseText: i % 2 === 0 ? 'Short' : 'C'.repeat(3000), // Mix of short and long
        confidence: 0.9,
        hasVisualContent: false,
        visualContentDescription: null,
      }));

      mockClaudeClient.sendMessage.mockResolvedValue({
        content: JSON.stringify(createScoringExtractionResponse({ responses })),
      });

      const result = await service.parseForResponses(
        Buffer.from('content'),
        createMetadata()
      );

      expect(result.success).toBe(true);
      expect(result.responses).toHaveLength(5); // All responses preserved
    });

    it('respects custom maxResponseChars option', async () => {
      const longResponse = 'D'.repeat(1500); // 1500 chars
      mockClaudeClient.sendMessage.mockResolvedValue({
        content: JSON.stringify(createScoringExtractionResponse({
          responses: [{
            sectionNumber: 1,
            sectionTitle: 'Test',
            questionNumber: 1,
            questionText: 'Test question',
            responseText: longResponse,
            confidence: 0.9,
            hasVisualContent: false,
            visualContentDescription: null,
          }],
        })),
      });

      // Use custom limit of 1000 chars
      const result = await service.parseForResponses(
        Buffer.from('content'),
        createMetadata(),
        { maxResponseChars: 1000 }
      );

      expect(result.success).toBe(true);
      expect(result.responses[0].responseText.length).toBeLessThanOrEqual(1000);
      expect(result.responses[0].responseText).toContain('[truncated]');
    });

    it('uses default 2000 char limit when maxResponseChars not specified', async () => {
      const exactlyAtLimit = 'E'.repeat(2000); // Exactly 2000
      const justOverLimit = 'F'.repeat(2001); // Just over

      mockClaudeClient.sendMessage.mockResolvedValue({
        content: JSON.stringify(createScoringExtractionResponse({
          responses: [
            {
              sectionNumber: 1,
              sectionTitle: 'Test',
              questionNumber: 1,
              questionText: 'Q1',
              responseText: exactlyAtLimit,
              confidence: 0.9,
              hasVisualContent: false,
              visualContentDescription: null,
            },
            {
              sectionNumber: 1,
              sectionTitle: 'Test',
              questionNumber: 2,
              questionText: 'Q2',
              responseText: justOverLimit,
              confidence: 0.9,
              hasVisualContent: false,
              visualContentDescription: null,
            },
          ],
        })),
      });

      const result = await service.parseForResponses(
        Buffer.from('content'),
        createMetadata()
      );

      expect(result.success).toBe(true);
      // First response at exactly 2000 should NOT be truncated
      expect(result.responses[0].responseText).toBe(exactlyAtLimit);
      // Second response at 2001 should be truncated
      expect(result.responses[1].responseText).toContain('[truncated]');
    });
  });
});
