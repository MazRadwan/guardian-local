import { CompositeScoreValidator } from '../../../../src/domain/scoring/CompositeScoreValidator';
import { DIMENSION_WEIGHTS, DIMENSION_CONFIG, SolutionType } from '../../../../src/domain/scoring/rubric';
import { ALL_DIMENSIONS } from '../../../../src/domain/scoring/rubric';
import { RiskDimension } from '../../../../src/domain/types/QuestionnaireSchema';

describe('CompositeScoreValidator', () => {
  let validator: CompositeScoreValidator;

  beforeEach(() => {
    validator = new CompositeScoreValidator();
  });

  /**
   * Helper: build dimension scores array with all 10 dimensions set to the same score.
   */
  const buildUniformScores = (score: number) =>
    ALL_DIMENSIONS.map(dimension => ({ dimension, score }));

  /**
   * Helper: compute expected composite score from dimension scores + solution type.
   * Mirrors the validator logic for test verification.
   */
  const computeExpected = (
    dimensionScores: Array<{ dimension: string; score: number }>,
    solutionType: SolutionType
  ): number => {
    const weights = DIMENSION_WEIGHTS[solutionType];
    let total = 0;
    for (const dim of Object.keys(weights) as RiskDimension[]) {
      const w = weights[dim];
      if (w <= 0) continue;
      const entry = dimensionScores.find(ds => ds.dimension === dim);
      if (!entry) continue;
      const config = DIMENSION_CONFIG[dim];
      const riskEq = config.type === 'capability' ? 100 - entry.score : entry.score;
      total += (w * riskEq) / 100;
    }
    return Math.round(total);
  };

  describe('valid composite scores', () => {
    it('should accept exact match for clinical_ai with uniform scores', () => {
      const scores = buildUniformScores(50);
      const expected = computeExpected(scores, 'clinical_ai');
      const result = validator.validate(expected, scores, 'clinical_ai');

      expect(result.valid).toBe(true);
      expect(result.expected).toBe(expected);
      expect(result.actual).toBe(expected);
      expect(result.violation).toBeUndefined();
    });

    it('should accept score within default tolerance of 3', () => {
      const scores = buildUniformScores(50);
      const expected = computeExpected(scores, 'clinical_ai');
      const result = validator.validate(expected + 2, scores, 'clinical_ai');

      expect(result.valid).toBe(true);
      expect(result.actual).toBe(expected + 2);
    });

    it('should accept score at exact tolerance boundary', () => {
      const scores = buildUniformScores(50);
      const expected = computeExpected(scores, 'clinical_ai');
      const result = validator.validate(expected + 3, scores, 'clinical_ai');

      expect(result.valid).toBe(true);
    });

    it('should accept exact match for administrative_ai', () => {
      const scores = buildUniformScores(30);
      const expected = computeExpected(scores, 'administrative_ai');
      const result = validator.validate(expected, scores, 'administrative_ai');

      expect(result.valid).toBe(true);
      expect(result.expected).toBe(expected);
    });

    it('should accept exact match for patient_facing', () => {
      const scores = buildUniformScores(70);
      const expected = computeExpected(scores, 'patient_facing');
      const result = validator.validate(expected, scores, 'patient_facing');

      expect(result.valid).toBe(true);
      expect(result.expected).toBe(expected);
    });
  });

  describe('capability dimension inversion', () => {
    it('should invert capability scores to risk scale', () => {
      // clinical_ai v1.1 weights: clinical_risk(25), privacy_risk(15), security_risk(15),
      //   technical_credibility(10), operational_excellence(10),
      //   vendor_capability(5), ai_transparency(5), ethical_considerations(5),
      //   regulatory_compliance(5), sustainability(5)
      // clinical_risk, privacy_risk, security_risk are 'risk' type
      // All others are 'capability' type
      const scores = ALL_DIMENSIONS.map(dim => ({
        dimension: dim,
        score: dim === 'technical_credibility' ? 80 : 50,
      }));

      // For technical_credibility (capability, weight 10 in clinical_ai):
      //   risk_equivalent = 100 - 80 = 20
      //   contribution = 10 * 20 / 100 = 2
      // Risk dimensions at 50:
      //   clinical_risk: 25 * 50 / 100 = 12.5
      //   privacy_risk: 15 * 50 / 100 = 7.5
      //   security_risk: 15 * 50 / 100 = 7.5
      // Other capability dimensions at 50 (risk_eq = 50):
      //   operational_excellence: 10 * 50 / 100 = 5
      //   vendor_capability: 5 * 50 / 100 = 2.5
      //   ai_transparency: 5 * 50 / 100 = 2.5
      //   ethical_considerations: 5 * 50 / 100 = 2.5
      //   regulatory_compliance: 5 * 50 / 100 = 2.5
      //   sustainability: 5 * 50 / 100 = 2.5
      // Total = 12.5 + 7.5 + 7.5 + 2 + 5 + 2.5 + 2.5 + 2.5 + 2.5 + 2.5 = 47 -> rounds to 47
      const expected = computeExpected(scores, 'clinical_ai');
      expect(expected).toBe(47);

      const result = validator.validate(expected, scores, 'clinical_ai');
      expect(result.valid).toBe(true);
      expect(result.expected).toBe(47);
    });

    it('should handle all-zero risk scores (best case) correctly', () => {
      // All risk dimensions at 0, all capability dimensions at 100
      const scores = ALL_DIMENSIONS.map(dim => ({
        dimension: dim,
        score: DIMENSION_CONFIG[dim].type === 'risk' ? 0 : 100,
      }));

      const expected = computeExpected(scores, 'clinical_ai');
      // All risk_equivalents = 0, so composite should be 0
      expect(expected).toBe(0);

      const result = validator.validate(0, scores, 'clinical_ai');
      expect(result.valid).toBe(true);
    });

    it('should handle worst-case scores correctly', () => {
      // All risk dimensions at 100, all capability dimensions at 0
      const scores = ALL_DIMENSIONS.map(dim => ({
        dimension: dim,
        score: DIMENSION_CONFIG[dim].type === 'risk' ? 100 : 0,
      }));

      const expected = computeExpected(scores, 'clinical_ai');
      // All risk_equivalents = 100, weighted sum = sum of all weights = 100
      expect(expected).toBe(100);

      const result = validator.validate(100, scores, 'clinical_ai');
      expect(result.valid).toBe(true);
    });
  });

  describe('invalid composite scores', () => {
    it('should reject score exceeding tolerance', () => {
      const scores = buildUniformScores(50);
      const expected = computeExpected(scores, 'clinical_ai');
      const result = validator.validate(expected + 4, scores, 'clinical_ai');

      expect(result.valid).toBe(false);
      expect(result.violation).toBeDefined();
      expect(result.violation).toContain('deviates from expected');
      expect(result.violation).toContain('tolerance: +/-3');
      expect(result.violation).toContain('clinical_ai');
    });

    it('should reject score below tolerance (negative deviation)', () => {
      const scores = buildUniformScores(50);
      const expected = computeExpected(scores, 'clinical_ai');
      // Ensure we have room to go below by at least 4
      const testScore = Math.max(0, expected - 4);
      if (expected >= 4) {
        const result = validator.validate(testScore, scores, 'clinical_ai');
        expect(result.valid).toBe(false);
        expect(result.violation).toContain('deviates from expected');
      }
    });

    it('should reject with large deviation for administrative_ai', () => {
      const scores = buildUniformScores(30);
      const expected = computeExpected(scores, 'administrative_ai');
      // Set composite to wildly different value
      const result = validator.validate(expected + 20, scores, 'administrative_ai');

      expect(result.valid).toBe(false);
      expect(result.violation).toContain('administrative_ai');
      expect(result.actual).toBe(expected + 20);
      expect(result.expected).toBe(expected);
    });
  });

  describe('missing weighted dimensions', () => {
    it('should report violation when a weighted dimension is missing', () => {
      // Remove clinical_risk which has weight 25 in clinical_ai v1.1
      const scores = ALL_DIMENSIONS
        .filter(d => d !== 'clinical_risk')
        .map(dim => ({ dimension: dim, score: 50 }));

      const result = validator.validate(50, scores, 'clinical_ai');
      expect(result.valid).toBe(false);
      expect(result.violation).toContain("Missing dimension 'clinical_risk'");
      expect(result.violation).toContain('weight 25%');
      expect(result.expected).toBe(-1);
    });

    it('should report violation for any missing weighted dimension (v1.1: all 10 have weight)', () => {
      // In v1.1, all 10 dimensions have non-zero weights for all solution types.
      // Remove vendor_capability (weight 5 in clinical_ai) -- should report violation.
      const scores = ALL_DIMENSIONS
        .filter(d => d !== 'vendor_capability')
        .map(dim => ({ dimension: dim, score: 50 }));

      const result = validator.validate(50, scores, 'clinical_ai');
      expect(result.valid).toBe(false);
      expect(result.violation).toContain("Missing dimension 'vendor_capability'");
      expect(result.violation).toContain('weight 5%');
    });
  });

  describe('custom tolerance', () => {
    it('should accept larger deviations with higher tolerance', () => {
      const scores = buildUniformScores(50);
      const expected = computeExpected(scores, 'clinical_ai');
      const result = validator.validate(expected + 8, scores, 'clinical_ai', 10);

      expect(result.valid).toBe(true);
    });

    it('should reject with zero tolerance unless exact match', () => {
      const scores = buildUniformScores(50);
      const expected = computeExpected(scores, 'clinical_ai');

      const exactResult = validator.validate(expected, scores, 'clinical_ai', 0);
      expect(exactResult.valid).toBe(true);

      const offByOneResult = validator.validate(expected + 1, scores, 'clinical_ai', 0);
      expect(offByOneResult.valid).toBe(false);
    });
  });

  describe('different solution types produce different expected scores', () => {
    it('should compute different expected values for same dimension scores', () => {
      // Use non-uniform scores to create divergence between solution types
      const scores = ALL_DIMENSIONS.map(dim => ({
        dimension: dim,
        score: dim === 'clinical_risk' ? 80 : dim === 'privacy_risk' ? 20 : 50,
      }));

      const clinicalExpected = computeExpected(scores, 'clinical_ai');
      const adminExpected = computeExpected(scores, 'administrative_ai');
      const patientExpected = computeExpected(scores, 'patient_facing');

      // clinical_ai weights clinical_risk at 25%, admin weights privacy_risk at 20%
      // With clinical_risk=80 and privacy_risk=20, these should diverge
      expect(clinicalExpected).not.toBe(adminExpected);

      // Validate each with its own expected
      expect(validator.validate(clinicalExpected, scores, 'clinical_ai').valid).toBe(true);
      expect(validator.validate(adminExpected, scores, 'administrative_ai').valid).toBe(true);
      expect(validator.validate(patientExpected, scores, 'patient_facing').valid).toBe(true);
    });
  });

  describe('weight verification', () => {
    it('should use all 10 non-zero weight dimensions', () => {
      // For clinical_ai v1.1, all 10 dimensions have non-zero weights
      const weights = DIMENSION_WEIGHTS['clinical_ai'];
      const nonZeroDims = Object.entries(weights).filter(([, w]) => w > 0);
      expect(nonZeroDims).toHaveLength(10);

      // Total weights should sum to 100
      const totalWeight = nonZeroDims.reduce((sum, [, w]) => sum + w, 0);
      expect(totalWeight).toBe(100);
    });

    it('should produce valid results with all 10 dimensions present', () => {
      // All 10 dimensions present and all have weight in clinical_ai v1.1
      const scores = buildUniformScores(50);
      const expected = computeExpected(scores, 'clinical_ai');
      const result = validator.validate(expected, scores, 'clinical_ai');
      expect(result.valid).toBe(true);
    });
  });
});
