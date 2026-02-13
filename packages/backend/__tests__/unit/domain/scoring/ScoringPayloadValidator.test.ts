import { ScoringPayloadValidator } from '../../../../src/domain/scoring/ScoringPayloadValidator';
import { ALL_DIMENSIONS } from '../../../../src/domain/scoring/rubric';

describe('ScoringPayloadValidator', () => {
  let validator: ScoringPayloadValidator;

  beforeEach(() => {
    validator = new ScoringPayloadValidator();
  });

  const createValidPayload = () => ({
    compositeScore: 75,
    recommendation: 'conditional',
    overallRiskRating: 'medium',
    executiveSummary: 'This vendor shows moderate risk with some concerns.',
    keyFindings: ['Good privacy practices', 'Weak security controls'],
    disqualifyingFactors: [],
    dimensionScores: ALL_DIMENSIONS.map(dimension => ({
      dimension,
      score: 70,
      riskRating: 'medium',
    })),
  });

  describe('valid payloads', () => {
    it('should accept a valid complete payload', () => {
      const result = validator.validate(createValidPayload());
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
      expect(result.sanitized).toBeDefined();
    });

    it('should accept payload without optional keyFindings', () => {
      const payload = createValidPayload();
      delete (payload as any).keyFindings;
      const result = validator.validate(payload);
      expect(result.valid).toBe(true);
    });

    it('should accept boundary scores (0 and 100)', () => {
      const payload = createValidPayload();
      payload.compositeScore = 0;
      payload.dimensionScores[0].score = 100;
      const result = validator.validate(payload);
      expect(result.valid).toBe(true);
    });
  });

  describe('invalid payloads', () => {
    it('should reject non-object payload', () => {
      const nullResult = validator.validate(null);
      expect(nullResult.valid).toBe(false);
      expect(nullResult.warnings).toHaveLength(0);
      expect(validator.validate(undefined).valid).toBe(false);
      expect(validator.validate('string').valid).toBe(false);
    });

    it('should reject score out of range', () => {
      const payload = createValidPayload();
      payload.compositeScore = 101;
      const result = validator.validate(payload);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(expect.stringContaining('compositeScore'));
    });

    it('should reject negative score', () => {
      const payload = createValidPayload();
      payload.compositeScore = -1;
      const result = validator.validate(payload);
      expect(result.valid).toBe(false);
    });

    it('should reject invalid recommendation', () => {
      const payload = createValidPayload();
      (payload as any).recommendation = 'maybe';
      const result = validator.validate(payload);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(expect.stringContaining('recommendation'));
    });

    it('should reject invalid riskRating', () => {
      const payload = createValidPayload();
      (payload as any).overallRiskRating = 'extreme';
      const result = validator.validate(payload);
      expect(result.valid).toBe(false);
    });

    it('should reject missing executiveSummary', () => {
      const payload = createValidPayload();
      delete (payload as any).executiveSummary;
      const result = validator.validate(payload);
      expect(result.valid).toBe(false);
    });

    it('should reject too short executiveSummary', () => {
      const payload = createValidPayload();
      payload.executiveSummary = 'Short';
      const result = validator.validate(payload);
      expect(result.valid).toBe(false);
    });

    it('should reject wrong number of dimensions', () => {
      const payload = createValidPayload();
      payload.dimensionScores = payload.dimensionScores.slice(0, 5);
      const result = validator.validate(payload);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(expect.stringContaining('exactly 10'));
    });

    it('should reject duplicate dimensions', () => {
      const payload = createValidPayload();
      payload.dimensionScores[1].dimension = payload.dimensionScores[0].dimension;
      const result = validator.validate(payload);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(expect.stringContaining('duplicated'));
    });

    it('should reject invalid dimension name', () => {
      const payload = createValidPayload();
      (payload.dimensionScores[0] as any).dimension = 'fake_dimension';
      const result = validator.validate(payload);
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(expect.stringContaining('not a valid dimension'));
    });

    it('should reject dimension score out of range', () => {
      const payload = createValidPayload();
      payload.dimensionScores[0].score = 150;
      const result = validator.validate(payload);
      expect(result.valid).toBe(false);
    });

    it('should reject non-integer scores', () => {
      const payload = createValidPayload();
      payload.compositeScore = 75.5;
      const result = validator.validate(payload);
      expect(result.valid).toBe(false);
    });
  });

  describe('error messages', () => {
    it('should return all errors, not just first', () => {
      const payload = {
        compositeScore: 101,
        recommendation: 'invalid',
        overallRiskRating: 'invalid',
        dimensionScores: [],
      };
      const result = validator.validate(payload);
      expect(result.errors.length).toBeGreaterThan(3);
    });

    it('should include field path in dimension errors', () => {
      const payload = createValidPayload();
      payload.dimensionScores[3].score = -5;
      const result = validator.validate(payload);
      expect(result.errors).toContainEqual(expect.stringContaining('dimensionScores[3]'));
    });
  });

  describe('sub-score validation (soft warnings)', () => {
    it('should accept payload without findings (backwards compatible)', () => {
      const result = validator.validate(createValidPayload());
      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(0);
    });

    it('should accept payload with valid sub-scores and confidence, and produce no warnings', () => {
      const payload = createValidPayload();
      // clinical_risk is the first dimension
      const clinicalIdx = payload.dimensionScores.findIndex(
        (d: any) => d.dimension === 'clinical_risk'
      );
      payload.dimensionScores[clinicalIdx].score = 45;
      (payload.dimensionScores[clinicalIdx] as any).findings = {
        subScores: [
          { name: 'evidence_quality_score', score: 20, maxScore: 40, notes: 'Retrospective analysis' },
          { name: 'regulatory_status_score', score: 10, maxScore: 20, notes: 'Under review' },
          { name: 'patient_safety_score', score: 10, maxScore: 20, notes: 'Adequate' },
          { name: 'population_relevance_score', score: 5, maxScore: 10, notes: 'Different population' },
          { name: 'workflow_integration_score', score: 0, maxScore: 10, notes: 'Clinician in control' },
        ],
        keyRisks: ['Retrospective only'],
        mitigations: [],
        evidenceRefs: [],
        assessmentConfidence: {
          level: 'high',
          rationale: 'Strong evidence from retrospective analysis and regulatory submissions.',
        },
      };

      const result = validator.validate(payload);
      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(0);
    });

    it('should warn on unknown sub-score name', () => {
      const payload = createValidPayload();
      const clinicalIdx = payload.dimensionScores.findIndex(
        (d: any) => d.dimension === 'clinical_risk'
      );
      payload.dimensionScores[clinicalIdx].score = 20;
      (payload.dimensionScores[clinicalIdx] as any).findings = {
        subScores: [
          { name: 'made_up_score', score: 20, maxScore: 40, notes: 'Invalid name' },
        ],
        keyRisks: [],
        mitigations: [],
        evidenceRefs: [],
      };

      const result = validator.validate(payload);
      expect(result.valid).toBe(true); // Still valid — soft warning
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings).toContainEqual(
        expect.stringContaining("unknown sub-score name 'made_up_score'")
      );
    });

    it('should warn on invalid sub-score value', () => {
      const payload = createValidPayload();
      const clinicalIdx = payload.dimensionScores.findIndex(
        (d: any) => d.dimension === 'clinical_risk'
      );
      payload.dimensionScores[clinicalIdx].score = 17;
      (payload.dimensionScores[clinicalIdx] as any).findings = {
        subScores: [
          { name: 'evidence_quality_score', score: 17, maxScore: 40, notes: 'Not a valid rubric value' },
        ],
        keyRisks: [],
        mitigations: [],
        evidenceRefs: [],
      };

      const result = validator.validate(payload);
      expect(result.valid).toBe(true); // Still valid — soft warning
      expect(result.warnings).toContainEqual(
        expect.stringContaining("sub-score 'evidence_quality_score' has value 17")
      );
      expect(result.warnings).toContainEqual(
        expect.stringContaining('allowed values: [0, 10, 20, 30, 40]')
      );
    });

    it('should warn when sub-score sum differs from dimension score', () => {
      const payload = createValidPayload();
      const clinicalIdx = payload.dimensionScores.findIndex(
        (d: any) => d.dimension === 'clinical_risk'
      );
      // Set dimension score to 50, but sub-scores sum to 30
      payload.dimensionScores[clinicalIdx].score = 50;
      (payload.dimensionScores[clinicalIdx] as any).findings = {
        subScores: [
          { name: 'evidence_quality_score', score: 20, maxScore: 40, notes: '' },
          { name: 'regulatory_status_score', score: 10, maxScore: 20, notes: '' },
        ],
        keyRisks: [],
        mitigations: [],
        evidenceRefs: [],
      };

      const result = validator.validate(payload);
      expect(result.valid).toBe(true);
      expect(result.warnings).toContainEqual(
        expect.stringContaining('sub-score sum 30 differs from dimension score 50')
      );
    });

    it('should not warn when sub-score sum is within tolerance', () => {
      const payload = createValidPayload();
      const clinicalIdx = payload.dimensionScores.findIndex(
        (d: any) => d.dimension === 'clinical_risk'
      );
      // Sub-scores sum to 45, dimension score 46 — within +/-2 tolerance
      payload.dimensionScores[clinicalIdx].score = 46;
      (payload.dimensionScores[clinicalIdx] as any).findings = {
        subScores: [
          { name: 'evidence_quality_score', score: 20, maxScore: 40, notes: '' },
          { name: 'regulatory_status_score', score: 10, maxScore: 20, notes: '' },
          { name: 'patient_safety_score', score: 10, maxScore: 20, notes: '' },
          { name: 'population_relevance_score', score: 5, maxScore: 10, notes: '' },
          { name: 'workflow_integration_score', score: 0, maxScore: 10, notes: '' },
        ],
        keyRisks: [],
        mitigations: [],
        evidenceRefs: [],
      };

      const result = validator.validate(payload);
      expect(result.valid).toBe(true);
      // Sum is 45, dimension is 46, diff is 1 — within tolerance
      expect(result.warnings.filter(w => w.includes('sub-score sum'))).toHaveLength(0);
    });

    it('should skip sub-score validation for dimensions without rules', () => {
      const payload = createValidPayload();
      // vendor_capability has no sub-score rules
      const vendorIdx = payload.dimensionScores.findIndex(
        (d: any) => d.dimension === 'vendor_capability'
      );
      payload.dimensionScores[vendorIdx].score = 60;
      (payload.dimensionScores[vendorIdx] as any).findings = {
        subScores: [
          { name: 'any_name', score: 60, maxScore: 100, notes: 'No rules defined' },
        ],
        keyRisks: [],
        mitigations: [],
        evidenceRefs: [],
        assessmentConfidence: {
          level: 'medium',
          rationale: 'Partial vendor documentation provided for capability assessment.',
        },
      };

      const result = validator.validate(payload);
      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(0);
    });

    it('should validate sub-scores across multiple dimensions', () => {
      const payload = createValidPayload();
      const clinicalIdx = payload.dimensionScores.findIndex(
        (d: any) => d.dimension === 'clinical_risk'
      );
      const privacyIdx = payload.dimensionScores.findIndex(
        (d: any) => d.dimension === 'privacy_risk'
      );

      // Invalid sub-score value on clinical_risk
      payload.dimensionScores[clinicalIdx].score = 99;
      (payload.dimensionScores[clinicalIdx] as any).findings = {
        subScores: [
          { name: 'evidence_quality_score', score: 99, maxScore: 40, notes: '' },
        ],
        keyRisks: [],
        mitigations: [],
        evidenceRefs: [],
      };

      // Unknown sub-score name on privacy_risk
      payload.dimensionScores[privacyIdx].score = 10;
      (payload.dimensionScores[privacyIdx] as any).findings = {
        subScores: [
          { name: 'nonexistent_score', score: 10, maxScore: 30, notes: '' },
        ],
        keyRisks: [],
        mitigations: [],
        evidenceRefs: [],
      };

      const result = validator.validate(payload);
      expect(result.valid).toBe(true);
      // Should have warnings from both dimensions
      expect(result.warnings.length).toBeGreaterThanOrEqual(2);
      expect(result.warnings).toContainEqual(
        expect.stringContaining('clinical_risk')
      );
      expect(result.warnings).toContainEqual(
        expect.stringContaining('privacy_risk')
      );
    });

    it('should skip findings without subScores array', () => {
      const payload = createValidPayload();
      const clinicalIdx = payload.dimensionScores.findIndex(
        (d: any) => d.dimension === 'clinical_risk'
      );
      // Findings present but no subScores
      (payload.dimensionScores[clinicalIdx] as any).findings = {
        keyRisks: ['Some risk'],
        mitigations: [],
        evidenceRefs: [],
        assessmentConfidence: {
          level: 'low',
          rationale: 'Limited documentation available for clinical risk assessment.',
        },
      };

      const result = validator.validate(payload);
      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(0);
    });
  });

  describe('confidence validation (soft warnings, Epic 37)', () => {
    it('should produce warning when assessmentConfidence missing from findings', () => {
      const payload = createValidPayload();
      const idx = payload.dimensionScores.findIndex((d: any) => d.dimension === 'privacy_risk');
      (payload.dimensionScores[idx] as any).findings = {
        subScores: [],
        keyRisks: [],
        mitigations: [],
        evidenceRefs: [],
      };

      const result = validator.validate(payload);
      expect(result.valid).toBe(true);
      expect(result.warnings).toContainEqual(
        expect.stringContaining('missing assessmentConfidence')
      );
    });

    it('should produce no confidence warning when valid assessmentConfidence present', () => {
      const payload = createValidPayload();
      const idx = payload.dimensionScores.findIndex((d: any) => d.dimension === 'privacy_risk');
      (payload.dimensionScores[idx] as any).findings = {
        subScores: [],
        keyRisks: [],
        mitigations: [],
        evidenceRefs: [],
        assessmentConfidence: {
          level: 'high',
          rationale: 'Strong evidence from privacy impact assessments and PIPEDA compliance documentation.',
        },
      };

      const result = validator.validate(payload);
      expect(result.valid).toBe(true);
      const privacyWarnings = result.warnings.filter(w => w.includes('privacy_risk') && w.includes('Confidence'));
      expect(privacyWarnings).toHaveLength(0);
    });

    it('should produce warning for invalid confidence level', () => {
      const payload = createValidPayload();
      const idx = payload.dimensionScores.findIndex((d: any) => d.dimension === 'security_risk');
      (payload.dimensionScores[idx] as any).findings = {
        subScores: [],
        assessmentConfidence: {
          level: 'very_high',
          rationale: 'This is a sufficiently long rationale for testing purposes.',
        },
      };

      const result = validator.validate(payload);
      expect(result.valid).toBe(true);
      expect(result.warnings).toContainEqual(
        expect.stringContaining('assessmentConfidence.level must be one of')
      );
    });

    it('should produce warning for short confidence rationale', () => {
      const payload = createValidPayload();
      const idx = payload.dimensionScores.findIndex((d: any) => d.dimension === 'security_risk');
      (payload.dimensionScores[idx] as any).findings = {
        subScores: [],
        assessmentConfidence: {
          level: 'medium',
          rationale: 'Too short.',
        },
      };

      const result = validator.validate(payload);
      expect(result.valid).toBe(true);
      expect(result.warnings).toContainEqual(
        expect.stringContaining('rationale must be at least 20 characters')
      );
    });

    it('should NOT reject payload for confidence issues (soft warnings only)', () => {
      const payload = createValidPayload();
      const idx = payload.dimensionScores.findIndex((d: any) => d.dimension === 'privacy_risk');
      (payload.dimensionScores[idx] as any).findings = {
        subScores: [],
        assessmentConfidence: {
          level: 'invalid_level',
          rationale: 'x',
        },
      };

      const result = validator.validate(payload);
      expect(result.valid).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('ISO clause reference validation (soft warnings, Epic 37)', () => {
    it('should produce no warning for valid isoClauseReferences', () => {
      const payload = createValidPayload();
      const idx = payload.dimensionScores.findIndex((d: any) => d.dimension === 'privacy_risk');
      (payload.dimensionScores[idx] as any).findings = {
        subScores: [],
        assessmentConfidence: {
          level: 'high',
          rationale: 'Strong evidence from privacy documentation provided by vendor.',
        },
        isoClauseReferences: [
          {
            clauseRef: 'A.8.4',
            title: 'Privacy impact assessment',
            framework: 'ISO/IEC 42001',
            status: 'aligned',
          },
        ],
      };

      const result = validator.validate(payload);
      expect(result.valid).toBe(true);
      const isoWarnings = result.warnings.filter(w => w.includes('isoClauseReferences'));
      expect(isoWarnings).toHaveLength(0);
    });

    it('should produce warning for invalid ISO status', () => {
      const payload = createValidPayload();
      const idx = payload.dimensionScores.findIndex((d: any) => d.dimension === 'security_risk');
      (payload.dimensionScores[idx] as any).findings = {
        subScores: [],
        assessmentConfidence: {
          level: 'medium',
          rationale: 'Moderate evidence from vendor security documentation provided.',
        },
        isoClauseReferences: [
          {
            clauseRef: 'A.6.2.6',
            title: 'Data quality management',
            framework: 'ISO/IEC 42001',
            status: 'invalid_status',
          },
        ],
      };

      const result = validator.validate(payload);
      expect(result.valid).toBe(true);
      expect(result.warnings).toContainEqual(
        expect.stringContaining('isoClauseReferences[0].status must be one of')
      );
    });

    it('should produce warning for empty clauseRef', () => {
      const payload = createValidPayload();
      const idx = payload.dimensionScores.findIndex((d: any) => d.dimension === 'security_risk');
      (payload.dimensionScores[idx] as any).findings = {
        subScores: [],
        assessmentConfidence: {
          level: 'medium',
          rationale: 'Moderate evidence from vendor security documentation provided.',
        },
        isoClauseReferences: [
          { clauseRef: '', title: 'Control', framework: 'ISO/IEC 42001', status: 'aligned' },
        ],
      };

      const result = validator.validate(payload);
      expect(result.valid).toBe(true);
      expect(result.warnings).toContainEqual(
        expect.stringContaining('isoClauseReferences[0].clauseRef is required')
      );
    });

    it('should produce warning for empty title', () => {
      const payload = createValidPayload();
      const idx = payload.dimensionScores.findIndex((d: any) => d.dimension === 'security_risk');
      (payload.dimensionScores[idx] as any).findings = {
        subScores: [],
        assessmentConfidence: {
          level: 'medium',
          rationale: 'Moderate evidence from vendor security documentation provided.',
        },
        isoClauseReferences: [
          { clauseRef: 'A.6.2', title: '', framework: 'ISO/IEC 42001', status: 'aligned' },
        ],
      };

      const result = validator.validate(payload);
      expect(result.valid).toBe(true);
      expect(result.warnings).toContainEqual(
        expect.stringContaining('isoClauseReferences[0].title is required')
      );
    });

    it('should produce warning for empty framework', () => {
      const payload = createValidPayload();
      const idx = payload.dimensionScores.findIndex((d: any) => d.dimension === 'security_risk');
      (payload.dimensionScores[idx] as any).findings = {
        subScores: [],
        assessmentConfidence: {
          level: 'medium',
          rationale: 'Moderate evidence from vendor security documentation provided.',
        },
        isoClauseReferences: [
          { clauseRef: 'A.6.2', title: 'Control', framework: '', status: 'aligned' },
        ],
      };

      const result = validator.validate(payload);
      expect(result.valid).toBe(true);
      expect(result.warnings).toContainEqual(
        expect.stringContaining('isoClauseReferences[0].framework is required')
      );
    });

    it('should produce no warning when isoClauseReferences not present', () => {
      const payload = createValidPayload();
      // No findings at all -- completely backwards compatible
      const result = validator.validate(payload);
      expect(result.valid).toBe(true);
      const isoWarnings = result.warnings.filter(w => w.includes('isoClauseReferences'));
      expect(isoWarnings).toHaveLength(0);
    });

    it('should NOT reject payload for ISO reference issues (soft warnings only)', () => {
      const payload = createValidPayload();
      const idx = payload.dimensionScores.findIndex((d: any) => d.dimension === 'privacy_risk');
      (payload.dimensionScores[idx] as any).findings = {
        subScores: [],
        assessmentConfidence: {
          level: 'high',
          rationale: 'Strong evidence from multiple vendor documents and certifications.',
        },
        isoClauseReferences: [
          { clauseRef: '', title: '', framework: '', status: 'bad' },
        ],
      };

      const result = validator.validate(payload);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      // Should have multiple ISO warnings
      const isoWarnings = result.warnings.filter(w => w.includes('isoClauseReferences'));
      expect(isoWarnings.length).toBeGreaterThanOrEqual(3);
    });
  });
});
