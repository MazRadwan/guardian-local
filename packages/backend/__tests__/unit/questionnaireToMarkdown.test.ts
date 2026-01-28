/**
 * questionnaireToMarkdown Unit Tests
 *
 * Tests the deterministic markdown renderer for questionnaire schemas.
 */

import {
  questionnaireToMarkdown,
  chunkMarkdown,
} from '../../src/infrastructure/rendering/questionnaireToMarkdown.js';
import type {
  QuestionnaireSchema,
  QuestionnaireSection,
  QuestionnaireQuestion,
} from '../../src/domain/types/QuestionnaireSchema.js';

/**
 * Create a fixture question
 */
function createQuestion(
  overrides: Partial<QuestionnaireQuestion> = {}
): QuestionnaireQuestion {
  return {
    id: 'test_1',
    text: 'Test question text here?',
    category: 'Test Category',
    riskDimension: 'privacy_risk',
    questionType: 'text',
    required: true,
    ...overrides,
  };
}

/**
 * Create a fixture section
 */
function createSection(
  overrides: Partial<QuestionnaireSection> = {}
): QuestionnaireSection {
  return {
    id: 'privacy_risk',
    title: 'Privacy Risk',
    riskDimension: 'privacy_risk',
    description: 'Assess privacy and data protection practices.',
    questions: [createQuestion()],
    ...overrides,
  };
}

/**
 * Create a fixture schema
 */
function createSchema(
  overrides: Partial<QuestionnaireSchema> = {}
): QuestionnaireSchema {
  return {
    version: '1.0',
    metadata: {
      assessmentId: 'test-assessment-id',
      assessmentType: 'comprehensive',
      vendorName: 'Test Vendor',
      solutionName: 'Test Solution',
      generatedAt: '2025-01-15T10:00:00Z',
      questionCount: 1,
    },
    sections: [createSection()],
    ...overrides,
  };
}

describe('questionnaireToMarkdown', () => {
  describe('determinism', () => {
    it('produces identical output for identical input', () => {
      const schema = createSchema();
      const markdown1 = questionnaireToMarkdown(schema);
      const markdown2 = questionnaireToMarkdown(schema);

      expect(markdown1).toBe(markdown2);
    });

    it('produces different output for different input', () => {
      const schema1 = createSchema({
        metadata: { ...createSchema().metadata, vendorName: 'Vendor A' },
      });
      const schema2 = createSchema({
        metadata: { ...createSchema().metadata, vendorName: 'Vendor B' },
      });

      const markdown1 = questionnaireToMarkdown(schema1);
      const markdown2 = questionnaireToMarkdown(schema2);

      expect(markdown1).not.toBe(markdown2);
    });
  });

  describe('header formatting', () => {
    it('includes vendor name in title', () => {
      const schema = createSchema({
        metadata: { ...createSchema().metadata, vendorName: 'Acme Corp' },
      });
      const markdown = questionnaireToMarkdown(schema);

      expect(markdown).toContain('# Acme Corp Assessment Questionnaire');
    });

    it('uses "Vendor" when vendorName is null', () => {
      const schema = createSchema({
        metadata: { ...createSchema().metadata, vendorName: null },
      });
      const markdown = questionnaireToMarkdown(schema);

      expect(markdown).toContain('# Vendor Assessment Questionnaire');
    });

    it('includes question count calculated from sections', () => {
      // Create schema with 3 questions
      const questions = [
        createQuestion({ id: 'q1', text: 'First question text here?' }),
        createQuestion({ id: 'q2', text: 'Second question text here?' }),
        createQuestion({ id: 'q3', text: 'Third question text here?' }),
      ];
      const schema = createSchema({
        sections: [createSection({ questions })],
      });
      const markdown = questionnaireToMarkdown(schema);

      expect(markdown).toContain('**Questions:** 3');
    });

    it('includes solution name when present', () => {
      const schema = createSchema({
        metadata: { ...createSchema().metadata, solutionName: 'AI Diagnostics' },
      });
      const markdown = questionnaireToMarkdown(schema);

      expect(markdown).toContain('**Solution:** AI Diagnostics');
    });

    it('omits solution name when null', () => {
      const schema = createSchema({
        metadata: { ...createSchema().metadata, solutionName: null },
      });
      const markdown = questionnaireToMarkdown(schema);

      expect(markdown).not.toContain('**Solution:**');
    });
  });

  describe('assessment type formatting', () => {
    it('formats quick assessment', () => {
      const schema = createSchema({
        metadata: { ...createSchema().metadata, assessmentType: 'quick' },
      });
      const markdown = questionnaireToMarkdown(schema);

      expect(markdown).toContain('Quick Assessment (Red Flag Screening)');
    });

    it('formats comprehensive assessment', () => {
      const schema = createSchema({
        metadata: { ...createSchema().metadata, assessmentType: 'comprehensive' },
      });
      const markdown = questionnaireToMarkdown(schema);

      expect(markdown).toContain('Comprehensive Assessment');
    });

    it('formats category_focused assessment', () => {
      const schema = createSchema({
        metadata: { ...createSchema().metadata, assessmentType: 'category_focused' },
      });
      const markdown = questionnaireToMarkdown(schema);

      expect(markdown).toContain('Category-Focused Assessment');
    });
  });

  describe('section formatting', () => {
    it('uses risk dimension label for section header', () => {
      const schema = createSchema({
        sections: [createSection({ riskDimension: 'security_risk' })],
      });
      const markdown = questionnaireToMarkdown(schema);

      expect(markdown).toContain('## Security Risk');
    });

    it('includes section description', () => {
      const schema = createSchema({
        sections: [createSection({ description: 'Evaluate security posture.' })],
      });
      const markdown = questionnaireToMarkdown(schema);

      expect(markdown).toContain('*Evaluate security posture.*');
    });

    it('renders all sections in order', () => {
      const schema = createSchema({
        sections: [
          createSection({ riskDimension: 'privacy_risk' }),
          createSection({ riskDimension: 'security_risk' }),
          createSection({ riskDimension: 'clinical_risk' }),
        ],
      });
      const markdown = questionnaireToMarkdown(schema);

      const privacyIndex = markdown.indexOf('## Privacy Risk');
      const securityIndex = markdown.indexOf('## Security Risk');
      const clinicalIndex = markdown.indexOf('## Clinical Risk');

      expect(privacyIndex).toBeLessThan(securityIndex);
      expect(securityIndex).toBeLessThan(clinicalIndex);
    });
  });

  describe('question formatting', () => {
    it('numbers questions sequentially', () => {
      const questions = [
        createQuestion({ id: 'q1', text: 'First question here?' }),
        createQuestion({ id: 'q2', text: 'Second question here?' }),
        createQuestion({ id: 'q3', text: 'Third question here?' }),
      ];
      const schema = createSchema({
        sections: [createSection({ questions })],
        metadata: { ...createSchema().metadata, questionCount: 3 },
      });
      const markdown = questionnaireToMarkdown(schema);

      expect(markdown).toContain('**1.** First question here?');
      expect(markdown).toContain('**2.** Second question here?');
      expect(markdown).toContain('**3.** Third question here?');
    });

    it('does not include guidance in output (removed from rendering)', () => {
      const schema = createSchema({
        sections: [
          createSection({
            questions: [
              createQuestion({ guidance: 'Consider HIPAA requirements.' }),
            ],
          }),
        ],
      });
      const markdown = questionnaireToMarkdown(schema);

      // Guidance should not be rendered (removed from display)
      expect(markdown).not.toContain('> *Guidance:');
      expect(markdown).not.toContain('Consider HIPAA requirements.');
    });

    it('formats multiple choice options', () => {
      const schema = createSchema({
        sections: [
          createSection({
            questions: [
              createQuestion({
                questionType: 'multiple_choice',
                options: ['Option A', 'Option B', 'Option C'],
              }),
            ],
          }),
        ],
      });
      const markdown = questionnaireToMarkdown(schema);

      expect(markdown).toContain('- [ ] Option A');
      expect(markdown).toContain('- [ ] Option B');
      expect(markdown).toContain('- [ ] Option C');
    });

    it('does not include options for non-multiple-choice questions', () => {
      const schema = createSchema({
        sections: [
          createSection({
            questions: [createQuestion({ questionType: 'text' })],
          }),
        ],
      });
      const markdown = questionnaireToMarkdown(schema);

      expect(markdown).not.toContain('- [ ]');
    });
  });

  describe('question count accuracy', () => {
    it('includes all questions from schema', () => {
      const questions = Array.from({ length: 35 }, (_, i) =>
        createQuestion({ id: `q${i + 1}`, text: `Question number ${i + 1} text?` })
      );
      const schema = createSchema({
        sections: [createSection({ questions })],
        metadata: { ...createSchema().metadata, questionCount: 35 },
      });
      const markdown = questionnaireToMarkdown(schema);

      // Count numbered questions (bold numbers: **1.**, **2.**, etc.)
      const questionMatches = markdown.match(/\*\*\d+\.\*\*/gm) || [];
      expect(questionMatches.length).toBe(35);
    });
  });

  describe('footer', () => {
    it('includes Guardian attribution', () => {
      const schema = createSchema();
      const markdown = questionnaireToMarkdown(schema);

      expect(markdown).toContain('Generated by Guardian');
    });

    it('includes divider before footer', () => {
      const schema = createSchema();
      const markdown = questionnaireToMarkdown(schema);

      // Should have "---" before the footer
      const lines = markdown.split('\n');
      const footerIndex = lines.findIndex((line) =>
        line.includes('Generated by Guardian')
      );
      expect(lines[footerIndex - 2]).toBe('---');
    });
  });

  describe('no markers', () => {
    it('does not contain QUESTIONNAIRE_START marker', () => {
      const schema = createSchema();
      const markdown = questionnaireToMarkdown(schema);

      expect(markdown).not.toContain('QUESTIONNAIRE_START');
    });

    it('does not contain QUESTIONNAIRE_END marker', () => {
      const schema = createSchema();
      const markdown = questionnaireToMarkdown(schema);

      expect(markdown).not.toContain('QUESTIONNAIRE_END');
    });

    it('does not contain HTML comments', () => {
      const schema = createSchema();
      const markdown = questionnaireToMarkdown(schema);

      expect(markdown).not.toContain('<!--');
      expect(markdown).not.toContain('-->');
    });
  });

  describe('markdown injection prevention', () => {
    it('escapes markdown control characters in vendor name', () => {
      const schema = createSchema({
        metadata: {
          ...createSchema().metadata,
          vendorName: 'Vendor **bold** [link](http://evil.com)',
        },
      });
      const markdown = questionnaireToMarkdown(schema);

      // Should escape **, [], () - breaking link syntax
      // URL is visible as plain text (safe) but not as clickable link
      expect(markdown).toContain('\\*\\*bold\\*\\*');
      expect(markdown).toContain('\\[link\\]\\(http://evil.com\\)');
    });

    it('escapes markdown control characters in solution name', () => {
      const schema = createSchema({
        metadata: {
          ...createSchema().metadata,
          solutionName: 'Solution <script>alert(1)</script>',
        },
      });
      const markdown = questionnaireToMarkdown(schema);

      // Should escape < >
      expect(markdown).toContain('\\<script\\>');
      expect(markdown).not.toContain('<script>');
    });

    it('escapes markdown control characters in question text', () => {
      const schema = createSchema({
        sections: [
          createSection({
            questions: [
              createQuestion({
                text: 'Is `code injection` possible via _underscores_?',
              }),
            ],
          }),
        ],
      });
      const markdown = questionnaireToMarkdown(schema);

      // Should escape backticks and underscores
      expect(markdown).toContain('\\`code injection\\`');
      expect(markdown).toContain('\\_underscores\\_');
    });

    it('does not render guidance even with markdown control characters', () => {
      const schema = createSchema({
        sections: [
          createSection({
            questions: [
              createQuestion({
                guidance: 'Check for `code` and *emphasis*',
              }),
            ],
          }),
        ],
      });
      const markdown = questionnaireToMarkdown(schema);

      // Guidance should not be rendered at all (removed from display)
      expect(markdown).not.toContain('Guidance:');
      expect(markdown).not.toContain('Check for');
    });

    it('escapes markdown control characters in multiple choice options', () => {
      const schema = createSchema({
        sections: [
          createSection({
            questions: [
              createQuestion({
                questionType: 'multiple_choice',
                options: ['Option *with* markup', '[link](http://test.com)'],
              }),
            ],
          }),
        ],
      });
      const markdown = questionnaireToMarkdown(schema);

      // Should escape *, [], ()
      expect(markdown).toContain('\\*with\\*');
      expect(markdown).toContain('\\[link\\]\\(http://test.com\\)');
    });

    it('escapes markdown control characters in section description', () => {
      const schema = createSchema({
        sections: [
          createSection({
            description: 'Review the **important** policies at <http://example.com>',
          }),
        ],
      });
      const markdown = questionnaireToMarkdown(schema);

      // Should escape ** and <>
      expect(markdown).toContain('\\*\\*important\\*\\*');
      expect(markdown).toContain('\\<http://example.com\\>');
    });
  });

  describe('calculated question count', () => {
    it('displays actual count from sections, not metadata', () => {
      // Create schema with mismatched metadata count
      const schema = createSchema({
        metadata: {
          ...createSchema().metadata,
          questionCount: 999, // Wrong count in metadata
        },
        sections: [
          createSection({
            questions: [
              createQuestion({ id: 'q1', text: 'First question here?' }),
              createQuestion({ id: 'q2', text: 'Second question here?' }),
            ],
          }),
        ],
      });
      const markdown = questionnaireToMarkdown(schema);

      // Should show actual count (2), not metadata count (999)
      expect(markdown).toContain('**Questions:** 2');
      expect(markdown).not.toContain('**Questions:** 999');
    });

    it('sums questions across multiple sections', () => {
      const schema = createSchema({
        metadata: { ...createSchema().metadata, questionCount: 0 },
        sections: [
          createSection({
            riskDimension: 'privacy_risk',
            questions: [
              createQuestion({ id: 'p1', text: 'Privacy question one?' }),
              createQuestion({ id: 'p2', text: 'Privacy question two?' }),
            ],
          }),
          createSection({
            riskDimension: 'security_risk',
            questions: [
              createQuestion({ id: 's1', text: 'Security question one?' }),
              createQuestion({ id: 's2', text: 'Security question two?' }),
              createQuestion({ id: 's3', text: 'Security question three?' }),
            ],
          }),
        ],
      });
      const markdown = questionnaireToMarkdown(schema);

      // Should show 5 (2 + 3)
      expect(markdown).toContain('**Questions:** 5');
    });
  });
});

describe('chunkMarkdown', () => {
  it('chunks markdown into smaller pieces', () => {
    const markdown = 'This is a test markdown string that should be chunked.';
    const chunks = chunkMarkdown(markdown, 20);

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.join('')).toBe(markdown);
  });

  it('preserves content when joined', () => {
    const markdown = `# Heading\n\nParagraph with **bold** and *italic* text.\n\n- Item 1\n- Item 2`;
    const chunks = chunkMarkdown(markdown, 15);

    expect(chunks.join('')).toBe(markdown);
  });

  it('tries to break at word boundaries', () => {
    const markdown = 'Hello world this is a test';
    const chunks = chunkMarkdown(markdown, 12);

    // Verify content preserved
    expect(chunks.join('')).toBe(markdown);
  });

  it('handles empty string', () => {
    const chunks = chunkMarkdown('', 50);
    expect(chunks).toEqual([]);
  });

  it('handles string shorter than chunk size', () => {
    const markdown = 'Short';
    const chunks = chunkMarkdown(markdown, 50);

    expect(chunks).toEqual(['Short']);
  });

  it('handles string exactly chunk size', () => {
    const markdown = '12345';
    const chunks = chunkMarkdown(markdown, 5);

    expect(chunks).toEqual(['12345']);
  });

  it('handles newlines as break points', () => {
    const markdown = 'Line one\nLine two\nLine three';
    const chunks = chunkMarkdown(markdown, 12);

    // Should break at newlines when possible
    expect(chunks.join('')).toBe(markdown);
  });

  it('defaults to chunk size of 50', () => {
    const markdown = 'A'.repeat(200);
    const chunks = chunkMarkdown(markdown);

    // With default chunk size of 50, should have ~4 chunks
    expect(chunks.length).toBeGreaterThanOrEqual(4);
    expect(chunks.join('')).toBe(markdown);
  });

  describe('chunkSize validation', () => {
    it('throws error when chunkSize is 0', () => {
      expect(() => chunkMarkdown('test', 0)).toThrow('chunkSize must be at least 1');
    });

    it('throws error when chunkSize is negative', () => {
      expect(() => chunkMarkdown('test', -1)).toThrow('chunkSize must be at least 1');
      expect(() => chunkMarkdown('test', -100)).toThrow('chunkSize must be at least 1');
    });

    it('works with chunkSize of 1', () => {
      const markdown = 'ABC';
      const chunks = chunkMarkdown(markdown, 1);

      expect(chunks).toEqual(['A', 'B', 'C']);
    });
  });
});

describe('golden file tests', () => {
  it('produces expected output for golden fixture', () => {
    // Use require for JSON to get typed object
    const goldenSchema = require('../fixtures/questionnaire-golden.json') as QuestionnaireSchema;

    // Read expected markdown (using fs to get raw string)
    const fs = require('fs');
    const path = require('path');
    const expectedMarkdown = fs.readFileSync(
      path.join(__dirname, '../fixtures/questionnaire-golden.md'),
      'utf-8'
    );

    const actualMarkdown = questionnaireToMarkdown(goldenSchema);
    expect(actualMarkdown).toBe(expectedMarkdown);
  });
});
