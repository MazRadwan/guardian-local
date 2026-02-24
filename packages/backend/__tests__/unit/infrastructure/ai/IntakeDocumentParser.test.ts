import { IntakeDocumentParser } from '../../../../src/infrastructure/ai/IntakeDocumentParser.js';
import { DocumentMetadata } from '../../../../src/application/interfaces/IDocumentParser.js';

// Mock pdf-parse module (v2 class-based API)
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

// Mock mammoth module
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

describe('IntakeDocumentParser', () => {
  let parser: IntakeDocumentParser;

  beforeEach(() => {
    jest.clearAllMocks();

    parser = new IntakeDocumentParser(
      mockClaudeClient as any,
      mockVisionClient as any,
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

  describe('parseForContext', () => {
    it('extracts context from PDF document using text-based API', async () => {
      const metadata = createMetadata();
      const buffer = Buffer.from('PDF content');

      const result = await parser.parseForContext(buffer, metadata);

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

      const result = await parser.parseForContext(buffer, metadata);

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

      const result = await parser.parseForContext(buffer, metadata);

      expect(mockVisionClient.analyzeImages).toHaveBeenCalled();
      expect(mockVisionClient.prepareDocument).toHaveBeenCalledWith(buffer, 'image/png');
      expect(result.success).toBe(true);
    });

    it('handles JSON response in markdown code block', async () => {
      mockClaudeClient.sendMessage.mockResolvedValue({
        content: '```json\n' + JSON.stringify(createIntakeExtractionResponse()) + '\n```',
      });

      const result = await parser.parseForContext(
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

      const result = await parser.parseForContext(
        Buffer.from('content'),
        createMetadata()
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to parse extraction response');
      expect(result.context).toBeNull();
    });

    it('returns failed result on API error', async () => {
      mockClaudeClient.sendMessage.mockRejectedValue(new Error('API timeout'));

      const result = await parser.parseForContext(
        Buffer.from('content'),
        createMetadata()
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('API timeout');
      expect(result.confidence).toBe(0);
    });

    it('includes raw text excerpt in context', async () => {
      const result = await parser.parseForContext(
        Buffer.from('content'),
        createMetadata()
      );

      expect(result.success).toBe(true);
      expect(result.context?.rawTextExcerpt).toBeDefined();
    });

    it('includes storage path in context', async () => {
      const result = await parser.parseForContext(
        Buffer.from('content'),
        createMetadata({ storagePath: '/uploads/vendor-doc.pdf' })
      );

      expect(result.success).toBe(true);
      expect(result.context?.sourceFilePath).toBe('/uploads/vendor-doc.pdf');
    });

    it('passes focus categories to prompt builder', async () => {
      await parser.parseForContext(
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
      const result = await parser.parseForContext(
        Buffer.from('content'),
        createMetadata()
      );

      expect(result.parseTimeMs).toBeGreaterThanOrEqual(0);
      expect(typeof result.parseTimeMs).toBe('number');
    });
  });

  describe('Document type handling', () => {
    it('rejects unsupported document types', async () => {
      const metadata = createMetadata({
        documentType: 'xlsx' as any,
      });

      const result = await parser.parseForContext(
        Buffer.from('content'),
        metadata
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Unsupported document type');
    });
  });

  describe('createFailedIntakeResult', () => {
    it('returns correct error shape with null context', async () => {
      mockClaudeClient.sendMessage.mockRejectedValue(new Error('Test error'));

      const result = await parser.parseForContext(
        Buffer.from('content'),
        createMetadata()
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Test error');
      expect(result.confidence).toBe(0);
      expect(result.context).toBeNull();
      expect(result.suggestedQuestions).toEqual([]);
      expect(result.coveredCategories).toEqual([]);
      expect(result.gapCategories).toEqual([]);
      expect(result.parseTimeMs).toBeGreaterThanOrEqual(0);
    });
  });
});
