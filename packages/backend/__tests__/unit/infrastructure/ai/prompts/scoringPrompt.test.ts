import { buildScoringSystemPrompt, buildScoringUserPrompt } from '../../../../../src/infrastructure/ai/prompts/scoringPrompt';
import { ALL_DIMENSIONS, DIMENSION_CONFIG } from '../../../../../src/domain/scoring/rubric';

/**
 * Prompt stability regression tests.
 *
 * These tests verify that the refactoring into helpers + ISO placeholders
 * did not change the prompt output. They guard against regressions when
 * helpers are modified or new ISO sections are wired in.
 */
describe('scoringPrompt - stability regression', () => {
  describe('buildScoringSystemPrompt', () => {
    const systemPrompt = buildScoringSystemPrompt();

    it('should contain all 10 dimension headings', () => {
      for (const dim of ALL_DIMENSIONS) {
        const label = DIMENSION_CONFIG[dim].label;
        expect(systemPrompt).toContain(label);
      }
    });

    it('should contain disqualifying factors section with tier annotations', () => {
      expect(systemPrompt).toContain('Disqualifying Factors (Two-Tier System)');
      // Spot-check specific factors with canonical keys
      expect(systemPrompt).toContain('no_clinical_validation_for_diagnosis_treatment_ai');
      expect(systemPrompt).toContain('no_encryption_for_phi');
      expect(systemPrompt).toContain('cross_border_data_transfer_without_safeguards');
      // Spot-check tier labels
      expect(systemPrompt).toContain('AUTOMATIC DECLINE');
      expect(systemPrompt).toContain('REQUIRES REMEDIATION PLAN');
    });

    it('should contain output format instructions', () => {
      expect(systemPrompt).toContain('## Output Format');
      expect(systemPrompt).toContain('Stream narrative report in markdown');
      expect(systemPrompt).toContain('scoring_complete');
    });

    it('should contain rubric criteria for all 10 scored dimensions', () => {
      expect(systemPrompt).toContain('### CLINICAL RISK');
      expect(systemPrompt).toContain('### PRIVACY RISK');
      expect(systemPrompt).toContain('### SECURITY RISK');
      expect(systemPrompt).toContain('### TECHNICAL CREDIBILITY');
      expect(systemPrompt).toContain('### OPERATIONAL EXCELLENCE');
      expect(systemPrompt).toContain('### VENDOR CAPABILITY');
      expect(systemPrompt).toContain('### AI TRANSPARENCY');
      expect(systemPrompt).toContain('### ETHICAL CONSIDERATIONS');
      expect(systemPrompt).toContain('### REGULATORY COMPLIANCE');
      expect(systemPrompt).toContain('### SUSTAINABILITY');
    });

    it('should contain recommendation logic', () => {
      expect(systemPrompt).toContain('## Recommendation Logic');
      expect(systemPrompt).toContain('APPROVE');
      expect(systemPrompt).toContain('CONDITIONAL');
      expect(systemPrompt).toContain('DECLINE');
      expect(systemPrompt).toContain('MORE_INFO');
    });

    it('should contain rubric version', () => {
      expect(systemPrompt).toContain('guardian-v1.1');
    });

    it('should not contain ISO content (moved to user prompt in 39.3.3)', () => {
      // System prompt is static and fully cacheable -- no ISO controls
      expect(systemPrompt).toContain('scoring_complete` tool with structured scores');
      expect(systemPrompt).not.toContain('ISO Standards Reference Catalog');
    });

    it('should return identical content on every call (cache-friendly)', () => {
      const call1 = buildScoringSystemPrompt();
      const call2 = buildScoringSystemPrompt();
      expect(call1).toBe(call2);
    });
  });

  describe('buildScoringUserPrompt', () => {
    const userPrompt = buildScoringUserPrompt({
      vendorName: 'TestVendor',
      solutionName: 'TestSolution',
      solutionType: 'clinical_ai',
      responses: [
        {
          sectionNumber: 1,
          questionNumber: 1,
          questionText: 'What data do you collect?',
          responseText: 'We collect patient demographic data.',
        },
        {
          sectionNumber: 2,
          questionNumber: 1,
          questionText: 'How do you handle encryption?',
          responseText: 'AES-256 at rest and TLS 1.3 in transit.',
        },
      ],
    });

    it('should contain vendor information', () => {
      expect(userPrompt).toContain('**Vendor:** TestVendor');
      expect(userPrompt).toContain('**Solution:** TestSolution');
      expect(userPrompt).toContain('**Solution Type:** clinical ai');
    });

    it('should contain formatted responses', () => {
      expect(userPrompt).toContain('### Section 1, Question 1');
      expect(userPrompt).toContain('**Q:** What data do you collect?');
      expect(userPrompt).toContain('**A:** We collect patient demographic data.');
      expect(userPrompt).toContain('### Section 2, Question 1');
      expect(userPrompt).toContain('**Q:** How do you handle encryption?');
      expect(userPrompt).toContain('**A:** AES-256 at rest and TLS 1.3 in transit.');
    });

    it('should contain composite score weighting for clinical_ai', () => {
      expect(userPrompt).toContain('## COMPOSITE SCORE WEIGHTING');
      expect(userPrompt).toContain('Clinical Risk: 25%');
      expect(userPrompt).toContain('Privacy Risk: 15%');
      expect(userPrompt).toContain('Security Risk: 15%');
    });

    it('should contain the analysis instruction', () => {
      expect(userPrompt).toContain('Please analyze these responses and provide your risk assessment.');
    });

    it('should not contain ISO content when none provided', () => {
      // No isoCatalog or isoControls provided -- no ISO sections
      expect(userPrompt).not.toContain('ISO Standards Reference Catalog');
      expect(userPrompt).not.toContain('Applicable ISO Controls');
    });

    it('should include ISO catalog when isoCatalog provided', () => {
      const withCatalog = buildScoringUserPrompt({
        vendorName: 'TestVendor',
        solutionName: 'TestSolution',
        solutionType: 'clinical_ai',
        responses: [
          {
            sectionNumber: 1,
            questionNumber: 1,
            questionText: 'What data do you collect?',
            responseText: 'We collect patient demographic data.',
          },
        ],
        isoCatalog: [
          {
            clauseRef: 'A.6.1',
            domain: 'Data management',
            title: 'Data governance',
            framework: 'ISO/IEC 42001',
            criteriaText: 'Data governance processes.',
            dimensions: ['regulatory_compliance'],
            relevanceWeights: { regulatory_compliance: 0.8 },
          },
        ],
      });

      // ISO catalog should appear before vendor responses
      expect(withCatalog).toContain('ISO Standards Reference Catalog');
      expect(withCatalog).toContain('A.6.1');
      expect(withCatalog).toContain('Data governance');
      // Catalog should come before vendor section
      const catalogIdx = withCatalog.indexOf('ISO Standards Reference Catalog');
      const vendorIdx = withCatalog.indexOf('## Vendor Assessment');
      expect(catalogIdx).toBeLessThan(vendorIdx);
    });

    it('should include both ISO catalog and applicable controls when both provided', () => {
      const withBoth = buildScoringUserPrompt({
        vendorName: 'TestVendor',
        solutionName: 'TestSolution',
        solutionType: 'clinical_ai',
        responses: [
          {
            sectionNumber: 1,
            questionNumber: 1,
            questionText: 'Q?',
            responseText: 'A.',
          },
        ],
        isoCatalog: [
          {
            clauseRef: 'A.6.1',
            domain: 'Data',
            title: 'Data governance',
            framework: 'ISO/IEC 42001',
            criteriaText: 'Test',
            dimensions: ['regulatory_compliance'],
            relevanceWeights: {},
          },
        ],
        isoControls: [
          {
            clauseRef: 'A.7.1',
            domain: 'Privacy',
            title: 'Privacy controls',
            framework: 'ISO/IEC 42001',
            criteriaText: 'Test',
            dimensions: ['privacy_risk'],
            relevanceWeights: {},
          },
        ],
      });

      expect(withBoth).toContain('ISO Standards Reference Catalog');
      expect(withBoth).toContain('Applicable ISO Controls');
      expect(withBoth).toContain('A.6.1');
      expect(withBoth).toContain('A.7.1');
    });

    it('should work without ISO data (backward compatible)', () => {
      const withoutISO = buildScoringUserPrompt({
        vendorName: 'TestVendor',
        solutionName: 'TestSolution',
        solutionType: 'clinical_ai',
        responses: [
          {
            sectionNumber: 1,
            questionNumber: 1,
            questionText: 'Q?',
            responseText: 'A.',
          },
        ],
      });

      expect(withoutISO).toContain('## Vendor Assessment');
      expect(withoutISO).toContain('TestVendor');
      expect(withoutISO).not.toContain('ISO Standards Reference Catalog');
      expect(withoutISO).not.toContain('Applicable ISO Controls');
    });
  });

  describe('composite formula - dynamic dimension lists (Story 40.1.3)', () => {
    const prompt = buildScoringUserPrompt({
      vendorName: 'TestVendor',
      solutionName: 'TestSolution',
      solutionType: 'clinical_ai',
      responses: [
        { sectionNumber: 1, questionNumber: 1, questionText: 'Q?', responseText: 'A.' },
      ],
    });

    it('should contain all risk dimension names in the composite formula', () => {
      const riskDims = ALL_DIMENSIONS.filter(d => DIMENSION_CONFIG[d].type === 'risk');
      for (const dim of riskDims) {
        expect(prompt).toContain(dim);
      }
      // Verify they appear in the RISK dimensions line
      expect(prompt).toContain('RISK dimensions (clinical_risk, privacy_risk, security_risk)');
    });

    it('should contain all capability dimension names in the composite formula', () => {
      const capabilityDims = ALL_DIMENSIONS.filter(d => DIMENSION_CONFIG[d].type === 'capability');
      for (const dim of capabilityDims) {
        expect(prompt).toContain(dim);
      }
      // Verify they appear in the CAPABILITY dimensions line
      expect(prompt).toContain('CAPABILITY dimensions (technical_credibility');
      expect(prompt).toContain('vendor_capability');
      expect(prompt).toContain('ai_transparency');
      expect(prompt).toContain('ethical_considerations');
      expect(prompt).toContain('regulatory_compliance');
      expect(prompt).toContain('operational_excellence');
      expect(prompt).toContain('sustainability');
    });

    it('should NOT contain the old "do NOT contribute" line', () => {
      expect(prompt).not.toContain('do NOT contribute');
      expect(prompt).not.toContain('do not contribute');
    });

    it('should state all 10 dimensions contribute', () => {
      expect(prompt).toContain('All 10 dimensions contribute to the composite score');
    });

    it('should use v1.1 weight values in the example', () => {
      expect(prompt).toContain('weight 25%');
      expect(prompt).toContain('weight 5%');
      expect(prompt).toContain('5.0 + 1.0 = 6.0');
    });
  });
});
