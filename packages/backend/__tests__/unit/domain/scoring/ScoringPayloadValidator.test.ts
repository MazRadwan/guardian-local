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
      expect(validator.validate(null).valid).toBe(false);
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
});
