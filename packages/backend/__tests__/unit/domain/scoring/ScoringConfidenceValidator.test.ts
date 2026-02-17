import { ScoringConfidenceValidator } from '../../../../src/domain/scoring/ScoringConfidenceValidator'

describe('ScoringConfidenceValidator', () => {
  let validator: ScoringConfidenceValidator

  beforeEach(() => {
    validator = new ScoringConfidenceValidator()
  })

  it('should return empty warnings when no findings present', () => {
    const scores = [
      { dimension: 'privacy_risk', score: 75, riskRating: 'low' },
      { dimension: 'security_risk', score: 60, riskRating: 'medium' },
    ]
    const warnings = validator.validateAllConfidence(scores)
    expect(warnings).toEqual([])
  })

  it('should warn when assessmentConfidence is missing from findings', () => {
    const scores = [
      {
        dimension: 'privacy_risk',
        score: 75,
        findings: { subScores: [] },
      },
    ]
    const warnings = validator.validateAllConfidence(scores)
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('missing assessmentConfidence')
    expect(warnings[0]).toContain('privacy_risk')
  })

  it('should warn when level is invalid', () => {
    const scores = [
      {
        dimension: 'security_risk',
        score: 60,
        findings: {
          assessmentConfidence: {
            level: 'very_high',
            rationale: 'This is a sufficiently long rationale for testing purposes.',
          },
        },
      },
    ]
    const warnings = validator.validateAllConfidence(scores)
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('assessmentConfidence.level must be one of')
    expect(warnings[0]).toContain('very_high')
  })

  it('should warn when rationale is too short (< 20 chars)', () => {
    const scores = [
      {
        dimension: 'ai_transparency',
        score: 80,
        findings: {
          assessmentConfidence: {
            level: 'high',
            rationale: 'Too short.',
          },
        },
      },
    ]
    const warnings = validator.validateAllConfidence(scores)
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('at least 20 characters')
  })

  it('should warn when rationale is missing', () => {
    const scores = [
      {
        dimension: 'regulatory_compliance',
        score: 50,
        findings: {
          assessmentConfidence: {
            level: 'medium',
          },
        },
      },
    ]
    const warnings = validator.validateAllConfidence(scores)
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('rationale must be at least 20 characters')
  })

  it('should accept valid confidence (level: high, rationale 20+ chars)', () => {
    const scores = [
      {
        dimension: 'privacy_risk',
        score: 85,
        findings: {
          assessmentConfidence: {
            level: 'high',
            rationale: 'Strong evidence from multiple vendor documents supports this assessment.',
          },
        },
      },
    ]
    const warnings = validator.validateAllConfidence(scores)
    expect(warnings).toEqual([])
  })

  it('should validate across multiple dimensions (returns warnings for each)', () => {
    const scores = [
      {
        dimension: 'privacy_risk',
        score: 85,
        findings: {
          assessmentConfidence: {
            level: 'invalid_level',
            rationale: 'Short',
          },
        },
      },
      {
        dimension: 'security_risk',
        score: 60,
        findings: {
          assessmentConfidence: {
            level: 'medium',
            rationale: 'x',
          },
        },
      },
    ]
    const warnings = validator.validateAllConfidence(scores)
    // privacy_risk: invalid level + short rationale = 2 warnings
    // security_risk: short rationale = 1 warning
    expect(warnings).toHaveLength(3)
    expect(warnings[0]).toContain('privacy_risk')
    expect(warnings[1]).toContain('privacy_risk')
    expect(warnings[2]).toContain('security_risk')
  })

  it('should skip dimensions without findings object', () => {
    const scores = [
      { dimension: 'clinical_risk', score: 70, riskRating: 'low' },
      null,
      'invalid',
      {
        dimension: 'privacy_risk',
        score: 85,
        findings: {
          assessmentConfidence: {
            level: 'high',
            rationale: 'Thorough documentation and evidence supports this score.',
          },
        },
      },
    ]
    const warnings = validator.validateAllConfidence(scores)
    expect(warnings).toEqual([])
  })

  it('should accept all three valid levels: high, medium, low', () => {
    const validRationale = 'This assessment is well-supported by vendor documentation and evidence.'
    const scores = [
      {
        dimension: 'privacy_risk',
        score: 85,
        findings: {
          assessmentConfidence: { level: 'high', rationale: validRationale },
        },
      },
      {
        dimension: 'security_risk',
        score: 60,
        findings: {
          assessmentConfidence: { level: 'medium', rationale: validRationale },
        },
      },
      {
        dimension: 'ai_transparency',
        score: 40,
        findings: {
          assessmentConfidence: { level: 'low', rationale: validRationale },
        },
      },
    ]
    const warnings = validator.validateAllConfidence(scores)
    expect(warnings).toEqual([])
  })
})
