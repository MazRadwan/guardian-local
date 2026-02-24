/**
 * Golden Sample Regression Baseline (Story 37.7.1 / SC-6)
 *
 * Validates that ISO prompt enrichment (Epic 37) does not degrade
 * existing scoring quality. Captures prompt structure and verifies:
 * - Rubric content is preserved (all 10 scored dimensions)
 * - Disqualifying factors remain present
 * - Recommendation logic is unchanged
 * - ISO/confidence sections are additive, not replacing
 * - Pipeline-level regression with mocked LLM
 */

import {
  buildScoringSystemPrompt,
  buildScoringUserPrompt,
} from '../../src/infrastructure/ai/prompts/scoringPrompt'
import { RUBRIC_VERSION, ALL_DIMENSIONS, DIMENSION_CONFIG } from '../../src/domain/scoring/rubric'
import { ScoringPayloadValidator } from '../../src/domain/scoring/ScoringPayloadValidator'
import type { ISOControlForPrompt } from '../../src/domain/compliance/types'

const sampleControls: ISOControlForPrompt[] = [
  {
    clauseRef: 'A.6.2.6',
    domain: 'Data management',
    title: 'Data quality management for AI systems',
    framework: 'ISO/IEC 42001',
    criteriaText: 'Organization implements systematic data quality processes.',
    assessmentGuidance: 'Evaluate data quality processes.',
    dimensions: ['regulatory_compliance'],
    relevanceWeights: { regulatory_compliance: 1.0 },
  },
  {
    clauseRef: '6.3',
    domain: 'Risk management',
    title: 'Risk treatment for AI systems',
    framework: 'ISO/IEC 23894',
    criteriaText: 'Organization applies systematic risk treatment.',
    dimensions: ['regulatory_compliance', 'operational_excellence'],
    relevanceWeights: { regulatory_compliance: 1.0, operational_excellence: 1.0 },
  },
]

describe('Golden Sample Regression (SC-6)', () => {
  describe('System Prompt Stability', () => {
    it('should contain all 10 scored dimension rubric criteria', () => {
      const prompt = buildScoringSystemPrompt()
      expect(prompt).toContain('CLINICAL RISK')
      expect(prompt).toContain('PRIVACY RISK')
      expect(prompt).toContain('SECURITY RISK')
      expect(prompt).toContain('TECHNICAL CREDIBILITY')
      expect(prompt).toContain('OPERATIONAL EXCELLENCE')
      expect(prompt).toContain('VENDOR CAPABILITY')
      expect(prompt).toContain('AI TRANSPARENCY')
      expect(prompt).toContain('ETHICAL CONSIDERATIONS')
      expect(prompt).toContain('REGULATORY COMPLIANCE')
      expect(prompt).toContain('SUSTAINABILITY')
    })

    it('should contain sub-score definitions for each scored dimension', () => {
      const prompt = buildScoringSystemPrompt()
      // Clinical risk sub-scores
      expect(prompt).toContain('evidence_quality_score')
      expect(prompt).toContain('regulatory_status_score')
      expect(prompt).toContain('patient_safety_score')
      // Privacy sub-scores
      expect(prompt).toContain('pipeda_compliance_score')
      expect(prompt).toContain('phi_protection_score')
      // Security sub-scores
      expect(prompt).toContain('security_architecture_score')
      expect(prompt).toContain('access_control_score')
      // Technical credibility sub-scores
      expect(prompt).toContain('ai_architecture_score')
      expect(prompt).toContain('explainability_score')
      // Operational excellence sub-scores
      expect(prompt).toContain('itil4_maturity_score')
      expect(prompt).toContain('nist_csf_tier_score')
    })

    it('should contain disqualifying factors', () => {
      const prompt = buildScoringSystemPrompt()
      expect(prompt).toContain('Disqualifying Factors')
      expect(prompt).toContain('clinical_risk')
      expect(prompt).toContain('privacy_risk')
      expect(prompt).toContain('security_risk')
    })

    it('should contain recommendation logic for all outcomes', () => {
      const prompt = buildScoringSystemPrompt()
      expect(prompt).toContain('APPROVE')
      expect(prompt).toContain('CONDITIONAL')
      expect(prompt).toContain('DECLINE')
      expect(prompt).toContain('MORE_INFO')
    })

    it('should contain output format instructions', () => {
      const prompt = buildScoringSystemPrompt()
      expect(prompt).toContain('scoring_complete')
      expect(prompt).toContain('narrative report')
    })

    it('should contain rubric version', () => {
      const prompt = buildScoringSystemPrompt()
      expect(prompt).toContain(RUBRIC_VERSION)
    })

    it('should contain all 10 risk dimensions in the dimension list', () => {
      const prompt = buildScoringSystemPrompt()
      for (const dim of ALL_DIMENSIONS) {
        expect(prompt).toContain(DIMENSION_CONFIG[dim].label)
      }
    })

    it('should contain confidence instructions (Epic 37)', () => {
      const prompt = buildScoringSystemPrompt()
      expect(prompt).toContain('assessmentConfidence')
      expect(prompt).toContain('rationale')
      expect(prompt).toContain('"high"')
      expect(prompt).toContain('"medium"')
      expect(prompt).toContain('"low"')
    })

    it('should contain ISO messaging rules (Epic 37)', () => {
      const prompt = buildScoringSystemPrompt()
      expect(prompt).toContain('ISO-traceable')
      expect(prompt).toContain('ISO-informed')
    })

    it('should be static with no ISO catalog (moved to user prompt in 39.3.3)', () => {
      const prompt = buildScoringSystemPrompt()

      // System prompt contains rubric but NOT ISO catalog
      expect(prompt).toContain('CLINICAL RISK')
      expect(prompt).toContain('PRIVACY RISK')
      expect(prompt).toContain('SECURITY RISK')
      expect(prompt).toContain('TECHNICAL CREDIBILITY')
      expect(prompt).toContain('OPERATIONAL EXCELLENCE')
      expect(prompt).toContain('Disqualifying Factors')
      expect(prompt).toContain('APPROVE')
      expect(prompt).toContain(RUBRIC_VERSION)

      // ISO catalog no longer in system prompt
      expect(prompt).not.toContain('ISO Standards Reference Catalog')
      expect(prompt).not.toContain('Controls by Domain')
    })

    it('should be identical across multiple calls (cacheable)', () => {
      const call1 = buildScoringSystemPrompt()
      const call2 = buildScoringSystemPrompt()
      expect(call1).toBe(call2)
    })

    it('should match prompt structure snapshot', () => {
      const prompt = buildScoringSystemPrompt()
      expect(prompt.length).toBeGreaterThan(0)
      expect(prompt).toMatchSnapshot()
    })
  })

  describe('User Prompt Stability', () => {
    const baseParams = {
      vendorName: 'TestVendor',
      solutionName: 'TestSolution',
      solutionType: 'clinical_ai' as const,
      responses: [
        { sectionNumber: 1, questionNumber: 1, questionText: 'Q1', responseText: 'A1' },
        { sectionNumber: 2, questionNumber: 3, questionText: 'Q2', responseText: 'A2' },
      ],
    }

    it('should contain vendor info and responses', () => {
      const prompt = buildScoringUserPrompt(baseParams)
      expect(prompt).toContain('TestVendor')
      expect(prompt).toContain('TestSolution')
      expect(prompt).toContain('clinical ai')
      expect(prompt).toContain('Q1')
      expect(prompt).toContain('A1')
      expect(prompt).toContain('Q2')
      expect(prompt).toContain('A2')
    })

    it('should contain composite score weighting', () => {
      const prompt = buildScoringUserPrompt(baseParams)
      expect(prompt).toContain('COMPOSITE SCORE WEIGHTING')
    })

    it('should contain weighted dimension percentages for clinical_ai (v1.1)', () => {
      const prompt = buildScoringUserPrompt(baseParams)
      expect(prompt).toContain('Clinical Risk: 25%')
      expect(prompt).toContain('Privacy Risk: 15%')
      expect(prompt).toContain('Security Risk: 15%')
      // v1.1: all 10 dimensions have non-zero weights
      expect(prompt).toContain('Technical Credibility: 10%')
      expect(prompt).toContain('Operational Excellence: 10%')
      expect(prompt).toContain('Vendor Capability: 5%')
      expect(prompt).toContain('AI Transparency: 5%')
      expect(prompt).toContain('Ethical Considerations: 5%')
      expect(prompt).toContain('Regulatory Compliance: 5%')
      expect(prompt).toContain('Sustainability: 5%')
    })

    it('should preserve content when ISO applicability is appended', () => {
      const enrichedPrompt = buildScoringUserPrompt({
        ...baseParams,
        isoControls: sampleControls,
      })

      // Base content preserved
      expect(enrichedPrompt).toContain('TestVendor')
      expect(enrichedPrompt).toContain('COMPOSITE SCORE WEIGHTING')
      expect(enrichedPrompt).toContain('Q1')
      expect(enrichedPrompt).toContain('A1')

      // ISO content additive
      expect(enrichedPrompt).toContain('A.6.2.6')
      expect(enrichedPrompt).toContain('Applicable ISO Controls')
    })

    it('should include ISO catalog in user prompt when provided (39.3.3)', () => {
      const enrichedPrompt = buildScoringUserPrompt({
        ...baseParams,
        isoCatalog: sampleControls,
        isoControls: sampleControls,
      })

      // Catalog section (moved from system prompt)
      expect(enrichedPrompt).toContain('ISO Standards Reference Catalog')
      expect(enrichedPrompt).toContain('A.6.2.6')
      expect(enrichedPrompt).toContain('Data quality management for AI systems')

      // Applicability section
      expect(enrichedPrompt).toContain('Applicable ISO Controls')

      // Base content preserved
      expect(enrichedPrompt).toContain('TestVendor')
      expect(enrichedPrompt).toContain('COMPOSITE SCORE WEIGHTING')

      // Catalog comes before vendor assessment
      const catalogIdx = enrichedPrompt.indexOf('ISO Standards Reference Catalog')
      const vendorIdx = enrichedPrompt.indexOf('## Vendor Assessment')
      expect(catalogIdx).toBeLessThan(vendorIdx)
    })

    it('should match user prompt structure snapshot', () => {
      const prompt = buildScoringUserPrompt({
        ...baseParams,
        isoControls: sampleControls,
      })
      expect(prompt.length).toBeGreaterThan(0)
      expect(prompt).toMatchSnapshot()
    })
  })

  describe('Pipeline-Level Regression', () => {
    it('should accept a standard scoring payload (no regression)', () => {
      const validator = new ScoringPayloadValidator()
      const payload = buildMockScoringPayload()
      const result = validator.validate(payload)

      expect(result.valid).toBe(true)
      expect(result.errors).toHaveLength(0)
      expect(result.sanitized).toBeDefined()
    })

    it('should accept a payload with ISO/confidence fields (backwards-compatible)', () => {
      const validator = new ScoringPayloadValidator()
      const payload = buildMockScoringPayload({
        withConfidence: true,
        withISORefs: true,
      })
      const result = validator.validate(payload)

      expect(result.valid).toBe(true)
      expect(result.errors).toHaveLength(0)
      // Confidence/ISO warnings may appear but should NOT cause failure
    })

    it('should accept a payload WITHOUT ISO/confidence fields (optional)', () => {
      const validator = new ScoringPayloadValidator()
      const payload = buildMockScoringPayload({
        withConfidence: false,
        withISORefs: false,
      })
      const result = validator.validate(payload)

      expect(result.valid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it('should preserve all 10 dimension validation', () => {
      const validator = new ScoringPayloadValidator()
      const payload = buildMockScoringPayload()

      // Remove one dimension to test validation still catches it
      payload.dimensionScores = payload.dimensionScores.slice(0, 9)
      const result = validator.validate(payload)

      expect(result.valid).toBe(false)
      expect(result.errors.some((e: string) => e.includes('10'))).toBe(true)
    })

    it('should validate rating scale values unchanged', () => {
      const validator = new ScoringPayloadValidator()
      const payload = buildMockScoringPayload()
      payload.overallRiskRating = 'extreme' as never

      const result = validator.validate(payload)
      expect(result.valid).toBe(false)
      expect(result.errors.some((e: string) => e.includes('overallRiskRating'))).toBe(true)
    })
  })
})

/**
 * Build a mock scoring payload for pipeline-level regression tests.
 */
function buildMockScoringPayload(opts?: {
  withConfidence?: boolean
  withISORefs?: boolean
}) {
  const withConfidence = opts?.withConfidence ?? false
  const withISORefs = opts?.withISORefs ?? false

  const dimensionScores = ALL_DIMENSIONS.map((dim) => {
    const base: Record<string, unknown> = {
      dimension: dim,
      score: 50,
      riskRating: 'medium',
      findings: {
        subScores: [{ name: 'test_score', score: 50, maxScore: 100, notes: 'Test' }],
        keyRisks: ['Test risk'],
        mitigations: ['Test mitigation'],
        evidenceRefs: [{ sectionNumber: 1, questionNumber: 1, quote: 'Test quote' }],
        ...(withConfidence && {
          assessmentConfidence: {
            level: 'medium',
            rationale: 'This is a test confidence rationale with sufficient length for validation.',
          },
        }),
        ...(withISORefs && {
          isoClauseReferences: [
            {
              clauseRef: 'A.6.2.6',
              title: 'Data quality management',
              framework: 'ISO/IEC 42001',
              status: 'partial',
            },
          ],
        }),
      },
    }
    return base
  })

  return {
    compositeScore: 55,
    recommendation: 'conditional',
    overallRiskRating: 'medium',
    executiveSummary: 'This is a test executive summary with adequate length for validation purposes.',
    keyFindings: ['Finding 1', 'Finding 2'],
    disqualifyingFactors: [],
    dimensionScores,
  }
}
