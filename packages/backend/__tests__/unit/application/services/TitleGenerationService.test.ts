/**
 * Unit Tests for TitleGenerationService
 *
 * Epic 25: Chat Title Intelligence
 * Tests title generation for all modes and edge cases
 */

import {
  TitleGenerationService,
  TitleContext,
  PLACEHOLDER_TITLES,
  isPlaceholderTitle,
} from '../../../../src/application/services/TitleGenerationService';

// Mock Anthropic SDK
const mockCreate = jest.fn();

jest.mock('@anthropic-ai/sdk', () => {
  return jest.fn().mockImplementation(() => ({
    messages: {
      create: mockCreate,
    },
  }));
});

describe('TitleGenerationService', () => {
  let service: TitleGenerationService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new TitleGenerationService('test-api-key');
  });

  describe('generateTitle (Story 25.1)', () => {
    it('should generate title from user and assistant messages', async () => {
      mockCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'AI Governance Best Practices' }],
      });

      const context: TitleContext = {
        mode: 'consult',
        userMessage: 'What are the best practices for AI governance?',
        assistantResponse: 'AI governance involves several key principles including...',
      };

      const result = await service.generateTitle(context);

      expect(result).toBe('AI Governance Best Practices');
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'claude-3-haiku-20240307',
          max_tokens: 100,
        })
      );
    });

    it('should truncate long titles to 50 characters', async () => {
      const longTitle =
        'This is a very long title that exceeds the maximum allowed length for display in the sidebar';
      mockCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: longTitle }],
      });

      const context: TitleContext = {
        mode: 'consult',
        userMessage: 'Tell me about AI',
        assistantResponse: 'AI is...',
      };

      const result = await service.generateTitle(context);

      expect(result).not.toBeNull();
      expect(result!.length).toBeLessThanOrEqual(50);
      expect(result!.endsWith('...')).toBe(true);
    });

    it('should return null on API error', async () => {
      mockCreate.mockRejectedValueOnce(new Error('API Error'));

      const context: TitleContext = {
        mode: 'consult',
        userMessage: 'Hello',
        assistantResponse: 'Hi there!',
      };

      const result = await service.generateTitle(context);

      expect(result).toBeNull();
    });

    it('should return null for empty context', async () => {
      const context: TitleContext = {
        mode: 'consult',
      };

      const result = await service.generateTitle(context);

      expect(result).toBeNull();
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it('should return null when no API key configured', async () => {
      const serviceWithoutKey = new TitleGenerationService();

      const context: TitleContext = {
        mode: 'consult',
        userMessage: 'Hello',
        assistantResponse: 'Hi!',
      };

      const result = await serviceWithoutKey.generateTitle(context);

      expect(result).toBeNull();
    });

    it('should remove surrounding quotes from generated title', async () => {
      mockCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: '"AI Security Discussion"' }],
      });

      const context: TitleContext = {
        mode: 'consult',
        userMessage: 'Tell me about AI security',
        assistantResponse: 'AI security involves...',
      };

      const result = await service.generateTitle(context);

      expect(result).toBe('AI Security Discussion');
    });

    it('should handle single quotes in title', async () => {
      mockCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: "'Healthcare AI Compliance'" }],
      });

      const context: TitleContext = {
        mode: 'consult',
        userMessage: 'Healthcare AI questions',
        assistantResponse: 'Here are the compliance requirements...',
      };

      const result = await service.generateTitle(context);

      expect(result).toBe('Healthcare AI Compliance');
    });
  });

  describe('generateModeAwareTitle (Story 25.2)', () => {
    describe('Consult mode', () => {
      it('should use LLM to generate title', async () => {
        mockCreate.mockResolvedValueOnce({
          content: [{ type: 'text', text: 'Privacy Policy Questions' }],
        });

        const context: TitleContext = {
          mode: 'consult',
          userMessage: 'What are HIPAA requirements?',
          assistantResponse: 'HIPAA requires covered entities to...',
        };

        const result = await service.generateModeAwareTitle(context);

        expect(result.title).toBe('Privacy Policy Questions');
        expect(result.source).toBe('llm');
      });

      it('should fallback to default when LLM fails', async () => {
        mockCreate.mockRejectedValueOnce(new Error('API Error'));

        const context: TitleContext = {
          mode: 'consult',
          userMessage: 'Hello',
          assistantResponse: 'Hi!',
        };

        const result = await service.generateModeAwareTitle(context);

        expect(result.title).toBe('New Chat');
        expect(result.source).toBe('default');
      });
    });

    describe('Assessment mode', () => {
      it('should use vendor_name when available', async () => {
        const context: TitleContext = {
          mode: 'assessment',
          metadata: {
            vendorName: 'Acme AI Platform',
          },
        };

        const result = await service.generateModeAwareTitle(context);

        expect(result.title).toBe('Assessment: Acme AI Platform');
        expect(result.source).toBe('vendor');
        expect(mockCreate).not.toHaveBeenCalled();
      });

      it('should use solution_name when vendor not available', async () => {
        const context: TitleContext = {
          mode: 'assessment',
          metadata: {
            solutionName: 'Smart Diagnosis Tool',
          },
        };

        const result = await service.generateModeAwareTitle(context);

        expect(result.title).toBe('Assessment: Smart Diagnosis Tool');
        expect(result.source).toBe('vendor');
      });

      it('should fallback to "New Assessment" when no metadata', async () => {
        const context: TitleContext = {
          mode: 'assessment',
        };

        const result = await service.generateModeAwareTitle(context);

        expect(result.title).toBe('New Assessment');
        expect(result.source).toBe('default');
      });

      it('should truncate long vendor names', async () => {
        const context: TitleContext = {
          mode: 'assessment',
          metadata: {
            vendorName: 'A Very Long Vendor Name That Exceeds The Maximum Allowed Length',
          },
        };

        const result = await service.generateModeAwareTitle(context);

        expect(result.title.length).toBeLessThanOrEqual(50);
        expect(result.title.startsWith('Assessment:')).toBe(true);
      });
    });

    describe('Scoring mode', () => {
      it('should use filename when available', async () => {
        const context: TitleContext = {
          mode: 'scoring',
          metadata: {
            filename: 'vendor-questionnaire.pdf',
          },
        };

        const result = await service.generateModeAwareTitle(context);

        expect(result.title).toBe('Scoring: vendor-questionnaire.pdf');
        expect(result.source).toBe('filename');
        expect(mockCreate).not.toHaveBeenCalled();
      });

      it('should fallback to "Scoring Analysis" when no filename', async () => {
        const context: TitleContext = {
          mode: 'scoring',
        };

        const result = await service.generateModeAwareTitle(context);

        expect(result.title).toBe('Scoring Analysis');
        expect(result.source).toBe('default');
      });
    });
  });

  describe('Assessment title updates (Story 25.3)', () => {
    it('should generate assessment title with vendor name', async () => {
      const context: TitleContext = {
        mode: 'assessment',
        metadata: {
          vendorName: 'Acme Healthcare AI',
        },
      };

      const result = await service.generateModeAwareTitle(context);

      expect(result.title).toBe('Assessment: Acme Healthcare AI');
      expect(result.source).toBe('vendor');
    });

    it('should prefer vendor_name over solution_name', async () => {
      const context: TitleContext = {
        mode: 'assessment',
        metadata: {
          vendorName: 'Acme Corp',
          solutionName: 'AI Diagnostic Tool',
        },
      };

      const result = await service.generateModeAwareTitle(context);

      expect(result.title).toBe('Assessment: Acme Corp');
      expect(result.source).toBe('vendor');
    });

    it('should not call LLM for assessment mode', async () => {
      const context: TitleContext = {
        mode: 'assessment',
        metadata: {
          vendorName: 'Test Vendor',
        },
      };

      await service.generateModeAwareTitle(context);

      // LLM should not be called for assessment titles
      expect(mockCreate).not.toHaveBeenCalled();
    });
  });

  describe('formatScoringTitle (Story 25.4)', () => {
    it('should format short filenames correctly', () => {
      const title = service.formatScoringTitle('report.pdf');

      expect(title).toBe('Scoring: report.pdf');
    });

    it('should truncate long filenames while preserving extension', () => {
      const longFilename = 'this-is-a-very-long-filename-that-exceeds-the-limit.pdf';
      const title = service.formatScoringTitle(longFilename);

      expect(title.length).toBeLessThanOrEqual(50);
      expect(title.startsWith('Scoring:')).toBe(true);
      expect(title.endsWith('.pdf')).toBe(true);
      expect(title).toContain('...');
    });

    it('should handle filenames without extension', () => {
      const filename = 'very-long-filename-without-any-extension-at-all-whatsoever';
      const title = service.formatScoringTitle(filename);

      expect(title.length).toBeLessThanOrEqual(50);
      expect(title.startsWith('Scoring:')).toBe(true);
      expect(title.endsWith('...')).toBe(true);
    });

    it('should handle filenames with multiple dots', () => {
      const filename = 'report.v2.final.docx';
      const title = service.formatScoringTitle(filename);

      expect(title).toBe('Scoring: report.v2.final.docx');
    });

    it('should handle very long extensions', () => {
      // Edge case: filename with very long extension
      const filename = 'a.verylongextensionthatshouldbehandled';
      const title = service.formatScoringTitle(filename);

      expect(title.length).toBeLessThanOrEqual(50);
      expect(title.startsWith('Scoring:')).toBe(true);
    });

    it('should handle exact max length filename', () => {
      // "Scoring: " is 9 chars, so max filename is 41 chars
      const filename = 'exactly-forty-one-characters-long.pdf'; // 37 chars
      const title = service.formatScoringTitle(filename);

      expect(title.length).toBeLessThanOrEqual(50);
      expect(title).toContain(filename.slice(0, 20)); // Contains start of filename
    });
  });

  describe('PLACEHOLDER_TITLES constants (Story 25.9)', () => {
    it('should have correct placeholder values', () => {
      expect(PLACEHOLDER_TITLES.DEFAULT).toBe('New Chat');
      expect(PLACEHOLDER_TITLES.ASSESSMENT).toBe('New Assessment');
      expect(PLACEHOLDER_TITLES.SCORING).toBe('Scoring Analysis');
    });

    it('should use placeholder constants in default fallbacks', async () => {
      // Test consult mode fallback
      mockCreate.mockRejectedValueOnce(new Error('API Error'));
      const consultResult = await service.generateModeAwareTitle({
        mode: 'consult',
        userMessage: 'Hello',
        assistantResponse: 'Hi!',
      });
      expect(consultResult.title).toBe(PLACEHOLDER_TITLES.DEFAULT);

      // Test assessment mode fallback
      const assessmentResult = await service.generateModeAwareTitle({
        mode: 'assessment',
      });
      expect(assessmentResult.title).toBe(PLACEHOLDER_TITLES.ASSESSMENT);

      // Test scoring mode fallback
      const scoringResult = await service.generateModeAwareTitle({
        mode: 'scoring',
      });
      expect(scoringResult.title).toBe(PLACEHOLDER_TITLES.SCORING);
    });
  });

  describe('isPlaceholderTitle helper (Story 25.9)', () => {
    it('should return true for null title', () => {
      expect(isPlaceholderTitle(null)).toBe(true);
    });

    it('should return true for undefined title', () => {
      expect(isPlaceholderTitle(undefined)).toBe(true);
    });

    it('should return true for empty string', () => {
      // Empty string is falsy, so should return true
      expect(isPlaceholderTitle('')).toBe(true);
    });

    it('should return true for "New Chat" placeholder', () => {
      expect(isPlaceholderTitle('New Chat')).toBe(true);
    });

    it('should return true for "New Assessment" placeholder', () => {
      expect(isPlaceholderTitle('New Assessment')).toBe(true);
    });

    it('should return true for "Scoring Analysis" placeholder', () => {
      expect(isPlaceholderTitle('Scoring Analysis')).toBe(true);
    });

    it('should return false for real generated titles', () => {
      expect(isPlaceholderTitle('AI Governance Discussion')).toBe(false);
      expect(isPlaceholderTitle('Assessment: Acme Corp')).toBe(false);
      expect(isPlaceholderTitle('Scoring: vendor-questionnaire.pdf')).toBe(false);
    });

    it('should return false for partial placeholder matches', () => {
      // These contain placeholder text but are not exact matches
      expect(isPlaceholderTitle('New Chat about AI')).toBe(false);
      expect(isPlaceholderTitle('My New Assessment')).toBe(false);
      expect(isPlaceholderTitle('Scoring Analysis Results')).toBe(false);
    });

    it('should return false for uploaded file placeholder text', () => {
      // This is the problematic case - should NOT be treated as a valid placeholder
      expect(isPlaceholderTitle('[Uploaded file for analysis: test.pdf]')).toBe(false);
    });
  });

  describe('Title generation guards (Story 25.9)', () => {
    it('should NOT call LLM for scoring mode (titles come from filename)', async () => {
      // In scoring mode, title generation skips LLM entirely
      // Even if there's a userMessage, scoring mode should not use LLM
      const context: TitleContext = {
        mode: 'scoring',
        userMessage: 'Here is my questionnaire',
        assistantResponse: 'Processing your file...',
      };

      const result = await service.generateModeAwareTitle(context);

      // Should fall back to default placeholder since no filename provided
      expect(result.title).toBe(PLACEHOLDER_TITLES.SCORING);
      expect(result.source).toBe('default');
      // LLM should not be called
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it('should use filename for scoring mode title (not LLM)', async () => {
      const context: TitleContext = {
        mode: 'scoring',
        userMessage: '[Uploaded file for analysis: vendor-responses.pdf]',
        metadata: {
          filename: 'vendor-responses.pdf',
        },
      };

      const result = await service.generateModeAwareTitle(context);

      expect(result.title).toBe('Scoring: vendor-responses.pdf');
      expect(result.source).toBe('filename');
      // LLM should not be called
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it('should still use LLM for consult mode', async () => {
      mockCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'HIPAA Compliance Questions' }],
      });

      const context: TitleContext = {
        mode: 'consult',
        userMessage: 'What are the HIPAA requirements?',
        assistantResponse: 'HIPAA requires covered entities to...',
      };

      const result = await service.generateModeAwareTitle(context);

      expect(result.title).toBe('HIPAA Compliance Questions');
      expect(result.source).toBe('llm');
      expect(mockCreate).toHaveBeenCalled();
    });

    it('should still use vendor/solution for assessment mode (not LLM)', async () => {
      const context: TitleContext = {
        mode: 'assessment',
        userMessage: 'I want to assess this vendor',
        metadata: {
          vendorName: 'HealthTech AI',
        },
      };

      const result = await service.generateModeAwareTitle(context);

      expect(result.title).toBe('Assessment: HealthTech AI');
      expect(result.source).toBe('vendor');
      // LLM should not be called for assessment mode
      expect(mockCreate).not.toHaveBeenCalled();
    });
  });
});
