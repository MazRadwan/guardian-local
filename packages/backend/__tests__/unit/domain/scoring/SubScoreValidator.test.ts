import { SubScoreValidator } from '../../../../src/domain/scoring/SubScoreValidator';
import { ALL_DIMENSIONS } from '../../../../src/domain/scoring/rubric';

describe('SubScoreValidator', () => {
  let validator: SubScoreValidator;

  beforeEach(() => {
    validator = new SubScoreValidator();
  });

  /**
   * Helper: build a minimal dimensionScores array with all 10 dimensions
   * and no findings (backwards-compatible baseline).
   */
  const createBaseDimensionScores = () =>
    ALL_DIMENSIONS.map(dimension => ({
      dimension,
      score: 70,
      riskRating: 'medium',
    }));

  describe('validateAllSubScores', () => {
    it('should return empty results when no findings are present', () => {
      const dimensionScores = createBaseDimensionScores();
      const result = validator.validateAllSubScores(dimensionScores);
      expect(result.structuralViolations).toHaveLength(0);
      expect(result.softWarnings).toHaveLength(0);
    });

    it('should return empty results for valid sub-scores', () => {
      const dimensionScores = createBaseDimensionScores();
      const clinicalIdx = dimensionScores.findIndex(d => d.dimension === 'clinical_risk');
      dimensionScores[clinicalIdx].score = 45;
      (dimensionScores[clinicalIdx] as any).findings = {
        subScores: [
          { name: 'evidence_quality_score', score: 20, maxScore: 40, notes: 'Retrospective' },
          { name: 'regulatory_status_score', score: 10, maxScore: 20, notes: 'Under review' },
          { name: 'patient_safety_score', score: 10, maxScore: 20, notes: 'Adequate' },
          { name: 'population_relevance_score', score: 5, maxScore: 10, notes: '' },
          { name: 'workflow_integration_score', score: 0, maxScore: 10, notes: '' },
        ],
        keyRisks: [],
        mitigations: [],
        evidenceRefs: [],
      };

      const result = validator.validateAllSubScores(dimensionScores);
      expect(result.structuralViolations).toHaveLength(0);
      expect(result.softWarnings).toHaveLength(0);
    });

    it('should produce soft warning on unknown sub-score name', () => {
      const dimensionScores = createBaseDimensionScores();
      const clinicalIdx = dimensionScores.findIndex(d => d.dimension === 'clinical_risk');
      dimensionScores[clinicalIdx].score = 20;
      (dimensionScores[clinicalIdx] as any).findings = {
        subScores: [
          { name: 'made_up_score', score: 20, maxScore: 40, notes: 'Invalid name' },
        ],
        keyRisks: [],
        mitigations: [],
        evidenceRefs: [],
      };

      const result = validator.validateAllSubScores(dimensionScores);
      expect(result.softWarnings.length).toBeGreaterThan(0);
      expect(result.softWarnings).toContainEqual(
        expect.stringContaining("unknown sub-score name 'made_up_score'")
      );
    });

    it('should exclude unknown sub-scores from sum check (causes sum mismatch)', () => {
      const dimensionScores = createBaseDimensionScores();
      const clinicalIdx = dimensionScores.findIndex(d => d.dimension === 'clinical_risk');
      // Only unknown sub-score provided -> excluded from sum -> sum=0 vs score=20
      dimensionScores[clinicalIdx].score = 20;
      (dimensionScores[clinicalIdx] as any).findings = {
        subScores: [
          { name: 'made_up_score', score: 20, maxScore: 40, notes: 'Unknown name' },
        ],
        keyRisks: [],
        mitigations: [],
        evidenceRefs: [],
      };

      const result = validator.validateAllSubScores(dimensionScores);
      // Unknown name produces soft warning
      expect(result.softWarnings).toContainEqual(
        expect.stringContaining("unknown sub-score name 'made_up_score'")
      );
      // Unknown score excluded from sum -> sum=0 vs dimension=20 -> soft warning (reconciler auto-corrects)
      expect(result.softWarnings).toContainEqual(
        expect.stringContaining('sub-score sum 0 differs from dimension score 20')
      );
    });

    it('should produce structural violation on invalid sub-score value', () => {
      const dimensionScores = createBaseDimensionScores();
      const clinicalIdx = dimensionScores.findIndex(d => d.dimension === 'clinical_risk');
      dimensionScores[clinicalIdx].score = 17;
      (dimensionScores[clinicalIdx] as any).findings = {
        subScores: [
          { name: 'evidence_quality_score', score: 17, maxScore: 40, notes: 'Not a valid rubric value' },
        ],
        keyRisks: [],
        mitigations: [],
        evidenceRefs: [],
      };

      const result = validator.validateAllSubScores(dimensionScores);
      expect(result.structuralViolations).toContainEqual(
        expect.stringContaining("sub-score 'evidence_quality_score' has value 17")
      );
      expect(result.structuralViolations).toContainEqual(
        expect.stringContaining('allowed values: [0, 10, 20, 30, 40]')
      );
    });

    it('should produce soft warning when sub-score sum differs from dimension score', () => {
      const dimensionScores = createBaseDimensionScores();
      const clinicalIdx = dimensionScores.findIndex(d => d.dimension === 'clinical_risk');
      // Set dimension score to 50, but sub-scores sum to 30
      dimensionScores[clinicalIdx].score = 50;
      (dimensionScores[clinicalIdx] as any).findings = {
        subScores: [
          { name: 'evidence_quality_score', score: 20, maxScore: 40, notes: '' },
          { name: 'regulatory_status_score', score: 10, maxScore: 20, notes: '' },
        ],
        keyRisks: [],
        mitigations: [],
        evidenceRefs: [],
      };

      const result = validator.validateAllSubScores(dimensionScores);
      expect(result.softWarnings).toContainEqual(
        expect.stringContaining('sub-score sum 30 differs from dimension score 50')
      );
    });

    it('should validate vendor_capability sub-scores against rules', () => {
      const dimensionScores = createBaseDimensionScores();
      // vendor_capability now has sub-score rules defined
      const vendorIdx = dimensionScores.findIndex(d => d.dimension === 'vendor_capability');
      dimensionScores[vendorIdx].score = 60;
      (dimensionScores[vendorIdx] as any).findings = {
        subScores: [
          { name: 'company_stability_score', score: 25, maxScore: 25, notes: '' },
          { name: 'healthcare_experience_score', score: 15, maxScore: 25, notes: '' },
          { name: 'customer_references_score', score: 12, maxScore: 20, notes: '' },
          { name: 'support_capability_score', score: 5, maxScore: 15, notes: '' },
          { name: 'roadmap_credibility_score', score: 5, maxScore: 15, notes: '' },
        ],
        keyRisks: [],
        mitigations: [],
        evidenceRefs: [],
      };

      const result = validator.validateAllSubScores(dimensionScores);
      // Sub-scores sum to 62, dimension score is 60, diff is 2 -- within tolerance
      expect(result.structuralViolations).toHaveLength(0);
      expect(result.softWarnings).toHaveLength(0);
    });

    it('should not produce violation when sub-score sum is within +/-2 tolerance', () => {
      const dimensionScores = createBaseDimensionScores();
      const clinicalIdx = dimensionScores.findIndex(d => d.dimension === 'clinical_risk');
      // Sub-scores sum to 45, dimension score 46 -- within tolerance
      dimensionScores[clinicalIdx].score = 46;
      (dimensionScores[clinicalIdx] as any).findings = {
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

      const result = validator.validateAllSubScores(dimensionScores);
      // Sum is 45, dimension is 46, diff is 1 -- within tolerance
      expect(result.structuralViolations.filter(v => v.includes('sub-score sum'))).toHaveLength(0);
    });

    it('should produce soft warning when sub-score sum exceeds +/-2 tolerance', () => {
      const dimensionScores = createBaseDimensionScores();
      const clinicalIdx = dimensionScores.findIndex(d => d.dimension === 'clinical_risk');
      // Sub-scores sum to 45, dimension score 48 -- diff is 3, beyond tolerance
      dimensionScores[clinicalIdx].score = 48;
      (dimensionScores[clinicalIdx] as any).findings = {
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

      const result = validator.validateAllSubScores(dimensionScores);
      expect(result.softWarnings).toContainEqual(
        expect.stringContaining('sub-score sum 45 differs from dimension score 48')
      );
    });

    it('should skip entries that are null or not objects', () => {
      const dimensionScores = [null, undefined, 'string', 42];
      const result = validator.validateAllSubScores(dimensionScores);
      expect(result.structuralViolations).toHaveLength(0);
      expect(result.softWarnings).toHaveLength(0);
    });

    it('should skip dimensions without findings', () => {
      const dimensionScores = createBaseDimensionScores();
      const clinicalIdx = dimensionScores.findIndex(d => d.dimension === 'clinical_risk');
      // Findings present but no subScores key
      (dimensionScores[clinicalIdx] as any).findings = {
        keyRisks: ['Some risk'],
        mitigations: [],
        evidenceRefs: [],
      };

      const result = validator.validateAllSubScores(dimensionScores);
      expect(result.structuralViolations).toHaveLength(0);
      expect(result.softWarnings).toHaveLength(0);
    });
  });
});
