import { MarkdownQuestionnaireConverter } from '../../src/infrastructure/ai/converters/MarkdownQuestionnaireConverter';

describe('MarkdownQuestionnaireConverter', () => {
  describe('convert', () => {
    it('converts valid markdown with multiple sections', () => {
      const markdown = `
## Section 1: Privacy Compliance
1. Does the vendor have a documented privacy policy?
2. How is personal health information (PHI) stored and protected?

## Section 2: Security Architecture
1. What encryption standards are used for data at rest?
2. Is data encrypted in transit using TLS 1.2 or higher?
`;

      const result = MarkdownQuestionnaireConverter.convert(markdown);

      expect(result.questions).toHaveLength(4);
      expect(result.questions[0]).toMatchObject({
        sectionNumber: 1,
        sectionName: 'Privacy Compliance',
        questionNumber: 1,
        questionText: 'Does the vendor have a documented privacy policy?',
        questionType: 'boolean',
      });
      expect(result.questions[2]).toMatchObject({
        sectionNumber: 2,
        sectionName: 'Security Architecture',
        questionNumber: 1,
      });
    });

    it('handles sections with varying question counts', () => {
      const markdown = `
## Section 1: Short Section
1. Single question in this section?

## Section 2: Longer Section
1. First question?
2. Second question?
3. Third question?
4. Fourth question?
`;

      const result = MarkdownQuestionnaireConverter.convert(markdown);

      expect(result.questions.filter(q => q.sectionNumber === 1)).toHaveLength(1);
      expect(result.questions.filter(q => q.sectionNumber === 2)).toHaveLength(4);
    });

    it('infers boolean type for yes/no questions', () => {
      const markdown = `
## Section 1: Test
1. Does the vendor comply with HIPAA requirements? (yes/no)
2. Is multi-factor authentication enabled?
3. Describe the vendor's security certifications.
`;

      const result = MarkdownQuestionnaireConverter.convert(markdown);

      expect(result.questions[0].questionType).toBe('boolean');
      expect(result.questions[1].questionType).toBe('boolean');
      expect(result.questions[2].questionType).toBe('text');
    });

    it('handles multi-line questions', () => {
      const markdown = `
## Section 1: Complex Questions
1. This is a long question that spans
   multiple lines and should be combined
   into a single question text.
2. Short question?
`;

      const result = MarkdownQuestionnaireConverter.convert(markdown);

      expect(result.questions[0].questionText).toContain('multiple lines');
      expect(result.questions[0].questionText).not.toContain('\n');
    });

    it('throws error for empty markdown', () => {
      expect(() => MarkdownQuestionnaireConverter.convert('')).toThrow('No sections found');
    });

    it('throws error for markdown without sections', () => {
      const markdown = 'Just some text without any section headers.';
      expect(() => MarkdownQuestionnaireConverter.convert(markdown)).toThrow('No sections found');
    });

    it('throws error for sections without questions', () => {
      const markdown = `
## Section 1: Empty Section
This section has no numbered questions, just text.

## Section 2: Also Empty
More text but no questions.
`;
      expect(() => MarkdownQuestionnaireConverter.convert(markdown)).toThrow('No questions found');
    });

    it('skips questions shorter than 10 characters', () => {
      const markdown = `
## Section 1: Test
1. Too short
2. This is a valid question with enough characters?
3. Nope
`;

      const result = MarkdownQuestionnaireConverter.convert(markdown);

      expect(result.questions).toHaveLength(1);
      expect(result.questions[0].questionText).toContain('valid question');
    });

    it('handles case-insensitive section headers', () => {
      const markdown = `
## SECTION 1: UPPERCASE
1. Question in uppercase section?

## section 2: lowercase
1. Question in lowercase section?
`;

      const result = MarkdownQuestionnaireConverter.convert(markdown);

      expect(result.questions).toHaveLength(2);
    });

    it('preserves section names with special characters', () => {
      const markdown = `
## Section 1: Privacy & Data Protection
1. How is PII handled?
`;

      const result = MarkdownQuestionnaireConverter.convert(markdown);

      expect(result.questions[0].sectionName).toBe('Privacy & Data Protection');
    });

    it('sets required metadata to true', () => {
      const markdown = `
## Section 1: Test
1. Test question with required metadata?
`;

      const result = MarkdownQuestionnaireConverter.convert(markdown);

      expect(result.questions[0].questionMetadata?.required).toBe(true);
    });

    it('handles questions starting with boolean indicators', () => {
      const markdown = `
## Section 1: Boolean Detection
1. Does the system support MFA?
2. Is encryption enabled?
3. Are backups automated?
4. Has the vendor been audited?
5. Have security patches been applied?
6. Can users export their data?
7. Will the vendor sign a BAA?
8. Do you store PHI?
`;

      const result = MarkdownQuestionnaireConverter.convert(markdown);

      // All should be detected as boolean
      result.questions.forEach(q => {
        expect(q.questionType).toBe('boolean');
      });
    });
  });
});
