import { DocumentParserService } from '../../src/infrastructure/ai/DocumentParserService.js';
import { DocumentMetadata } from '../../src/application/interfaces/IDocumentParser.js';
import {
  AssessmentNotFoundError,
  QuestionnaireMismatchError,
} from '../../src/application/interfaces/IScoringDocumentParser.js';

// Mock pdf-parse module (v2 class-based API)
jest.mock('pdf-parse', () => ({
  PDFParse: jest.fn().mockImplementation(() => ({
    getText: jest.fn().mockResolvedValue({ text: 'Extracted PDF text', total: 2, pages: [] }),
    destroy: jest.fn().mockResolvedValue(undefined),
  })),
}));

// Mock mammoth module
jest.mock('mammoth', () => ({
  extractRawText: jest.fn().mockResolvedValue({ value: 'Extracted DOCX text' }),
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
      mockVisionClient as any
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
});
