/**
 * Unit tests for ScoringPromptBuilder multi-block user prompt (Story 39.3.4)
 *
 * Tests verify that ScoringPromptBuilder.buildScoringUserPrompt():
 * 1. Returns string when no ISO catalog is provided (backward compatible)
 * 2. Returns ContentBlockForPrompt[] with cacheable hint when ISO catalog is provided
 * 3. Separates ISO catalog (cached) from vendor data (uncached)
 */

import { ScoringPromptBuilder } from '../../../../src/infrastructure/ai/ScoringPromptBuilder.js';
import type { ContentBlockForPrompt } from '../../../../src/application/interfaces/ILLMClient.js';
import type { ISOControlForPrompt } from '../../../../src/domain/compliance/types.js';

describe('ScoringPromptBuilder - multi-block user prompt (Story 39.3.4)', () => {
  let builder: ScoringPromptBuilder;

  const baseParams = {
    vendorName: 'TestVendor',
    solutionName: 'TestSolution',
    solutionType: 'clinical_ai' as const,
    responses: [
      {
        sectionNumber: 1,
        questionNumber: 1,
        questionText: 'What is your security posture?',
        responseText: 'We implement zero trust architecture.',
      },
    ],
  };

  const mockCatalog: ISOControlForPrompt[] = [
    {
      clauseRef: 'A.6.1',
      domain: 'Data management',
      title: 'Data governance',
      framework: 'ISO/IEC 42001',
      criteriaText: 'Data governance processes must be established.',
      dimensions: ['regulatory_compliance'],
      relevanceWeights: { regulatory_compliance: 0.8 },
    },
    {
      clauseRef: 'A.7.1',
      domain: 'Privacy',
      title: 'Privacy impact assessment',
      framework: 'ISO/IEC 42001',
      criteriaText: 'Privacy impact assessments must be conducted.',
      dimensions: ['privacy_risk'],
      relevanceWeights: { privacy_risk: 0.9 },
    },
  ];

  const mockApplicableControls: ISOControlForPrompt[] = [
    {
      clauseRef: 'A.7.1',
      domain: 'Privacy',
      title: 'Privacy impact assessment',
      framework: 'ISO/IEC 42001',
      criteriaText: 'Privacy impact assessments must be conducted.',
      dimensions: ['privacy_risk'],
      relevanceWeights: { privacy_risk: 0.9 },
    },
  ];

  beforeEach(() => {
    builder = new ScoringPromptBuilder();
  });

  describe('returns string when no ISO catalog', () => {
    it('should return string when no isoCatalog provided', () => {
      const result = builder.buildScoringUserPrompt(baseParams);

      expect(typeof result).toBe('string');
      expect(result as string).toContain('## Vendor Assessment');
      expect(result as string).toContain('TestVendor');
    });

    it('should return string when isoCatalog is empty array', () => {
      const result = builder.buildScoringUserPrompt({
        ...baseParams,
        isoCatalog: [],
      });

      expect(typeof result).toBe('string');
    });

    it('should return string when isoCatalog is undefined', () => {
      const result = builder.buildScoringUserPrompt({
        ...baseParams,
        isoCatalog: undefined,
      });

      expect(typeof result).toBe('string');
    });

    it('string result should contain vendor info and responses', () => {
      const result = builder.buildScoringUserPrompt(baseParams) as string;

      expect(result).toContain('**Vendor:** TestVendor');
      expect(result).toContain('**Solution:** TestSolution');
      expect(result).toContain('What is your security posture?');
      expect(result).toContain('We implement zero trust architecture.');
    });
  });

  describe('returns ContentBlockForPrompt[] when ISO catalog provided', () => {
    it('should return array of ContentBlockForPrompt when isoCatalog has controls', () => {
      const result = builder.buildScoringUserPrompt({
        ...baseParams,
        isoCatalog: mockCatalog,
      });

      expect(Array.isArray(result)).toBe(true);
      const blocks = result as ContentBlockForPrompt[];
      expect(blocks.length).toBe(2);
    });

    it('first block should contain ISO catalog with cacheable: true', () => {
      const result = builder.buildScoringUserPrompt({
        ...baseParams,
        isoCatalog: mockCatalog,
      });

      const blocks = result as ContentBlockForPrompt[];
      const catalogBlock = blocks[0];

      expect(catalogBlock.type).toBe('text');
      expect(catalogBlock.cacheable).toBe(true);
      expect(catalogBlock.text).toContain('ISO Standards Reference Catalog');
      expect(catalogBlock.text).toContain('A.6.1');
      expect(catalogBlock.text).toContain('Data governance');
      expect(catalogBlock.text).toContain('A.7.1');
      expect(catalogBlock.text).toContain('Privacy impact assessment');
    });

    it('second block should contain vendor data without cacheable hint', () => {
      const result = builder.buildScoringUserPrompt({
        ...baseParams,
        isoCatalog: mockCatalog,
      });

      const blocks = result as ContentBlockForPrompt[];
      const vendorBlock = blocks[1];

      expect(vendorBlock.type).toBe('text');
      expect(vendorBlock.cacheable).toBeUndefined();
      expect(vendorBlock.text).toContain('## Vendor Assessment');
      expect(vendorBlock.text).toContain('TestVendor');
      expect(vendorBlock.text).toContain('What is your security posture?');
    });

    it('should include ISO applicability in vendor block when both provided', () => {
      const result = builder.buildScoringUserPrompt({
        ...baseParams,
        isoCatalog: mockCatalog,
        isoControls: mockApplicableControls,
      });

      const blocks = result as ContentBlockForPrompt[];

      // Catalog block has ISO catalog
      expect(blocks[0].text).toContain('ISO Standards Reference Catalog');

      // Vendor block has applicability section
      expect(blocks[1].text).toContain('Applicable ISO Controls');
      expect(blocks[1].text).toContain('A.7.1');
    });

    it('catalog block should be identical across calls with same catalog', () => {
      const result1 = builder.buildScoringUserPrompt({
        ...baseParams,
        isoCatalog: mockCatalog,
      });

      const result2 = builder.buildScoringUserPrompt({
        vendorName: 'DifferentVendor',
        solutionName: 'DifferentSolution',
        solutionType: 'administrative_ai',
        responses: [
          {
            sectionNumber: 2,
            questionNumber: 3,
            questionText: 'Different question?',
            responseText: 'Different answer.',
          },
        ],
        isoCatalog: mockCatalog,
      });

      const blocks1 = result1 as ContentBlockForPrompt[];
      const blocks2 = result2 as ContentBlockForPrompt[];

      // Catalog blocks should be identical (cache-friendly)
      expect(blocks1[0].text).toBe(blocks2[0].text);
      expect(blocks1[0].cacheable).toEqual(blocks2[0].cacheable);

      // Vendor blocks should differ
      expect(blocks1[1].text).not.toBe(blocks2[1].text);
    });

    it('all blocks should have type "text"', () => {
      const result = builder.buildScoringUserPrompt({
        ...baseParams,
        isoCatalog: mockCatalog,
        isoControls: mockApplicableControls,
      });

      const blocks = result as ContentBlockForPrompt[];
      for (const block of blocks) {
        expect(block.type).toBe('text');
      }
    });
  });

  describe('buildScoringSystemPrompt (unchanged)', () => {
    it('should still return a string', () => {
      const result = builder.buildScoringSystemPrompt();
      expect(typeof result).toBe('string');
      expect(result).toContain('Guardian');
      expect(result).toContain('scoring_complete');
    });
  });
});
