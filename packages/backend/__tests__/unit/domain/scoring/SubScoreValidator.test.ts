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
    it('should return empty warnings when no findings are present', () => {
      const dimensionScores = createBaseDimensionScores();
      const warnings = validator.validateAllSubScores(dimensionScores);
      expect(warnings).toHaveLength(0);
    });

    it('should return empty warnings for valid sub-scores', () => {
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

      const warnings = validator.validateAllSubScores(dimensionScores);
      expect(warnings).toHaveLength(0);
    });

    it('should warn on unknown sub-score name', () => {
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

      const warnings = validator.validateAllSubScores(dimensionScores);
      expect(warnings.length).toBeGreaterThan(0);
      expect(warnings).toContainEqual(
        expect.stringContaining("unknown sub-score name 'made_up_score'")
      );
    });

    it('should warn on invalid sub-score value', () => {
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

      const warnings = validator.validateAllSubScores(dimensionScores);
      expect(warnings).toContainEqual(
        expect.stringContaining("sub-score 'evidence_quality_score' has value 17")
      );
      expect(warnings).toContainEqual(
        expect.stringContaining('allowed values: [0, 10, 20, 30, 40]')
      );
    });

    it('should warn when sub-score sum differs from dimension score', () => {
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

      const warnings = validator.validateAllSubScores(dimensionScores);
      expect(warnings).toContainEqual(
        expect.stringContaining('sub-score sum 30 differs from dimension score 50')
      );
    });

    it('should skip dimensions without rules', () => {
      const dimensionScores = createBaseDimensionScores();
      // vendor_capability has no sub-score rules
      const vendorIdx = dimensionScores.findIndex(d => d.dimension === 'vendor_capability');
      dimensionScores[vendorIdx].score = 60;
      (dimensionScores[vendorIdx] as any).findings = {
        subScores: [
          { name: 'any_name', score: 60, maxScore: 100, notes: 'No rules defined' },
        ],
        keyRisks: [],
        mitigations: [],
        evidenceRefs: [],
      };

      const warnings = validator.validateAllSubScores(dimensionScores);
      expect(warnings).toHaveLength(0);
    });

    it('should not warn when sub-score sum is within +/-2 tolerance', () => {
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

      const warnings = validator.validateAllSubScores(dimensionScores);
      // Sum is 45, dimension is 46, diff is 1 -- within tolerance
      expect(warnings.filter(w => w.includes('sub-score sum'))).toHaveLength(0);
    });

    it('should warn when sub-score sum exceeds +/-2 tolerance', () => {
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

      const warnings = validator.validateAllSubScores(dimensionScores);
      expect(warnings).toContainEqual(
        expect.stringContaining('sub-score sum 45 differs from dimension score 48')
      );
    });

    it('should skip entries that are null or not objects', () => {
      const dimensionScores = [null, undefined, 'string', 42];
      const warnings = validator.validateAllSubScores(dimensionScores);
      expect(warnings).toHaveLength(0);
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

      const warnings = validator.validateAllSubScores(dimensionScores);
      expect(warnings).toHaveLength(0);
    });
  });
});
