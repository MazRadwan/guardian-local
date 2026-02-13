import { scoringCompleteTool } from '../../../../src/domain/scoring/tools/scoringComplete';
import { ScoringPayloadValidator } from '../../../../src/domain/scoring/ScoringPayloadValidator';
import { ALL_DIMENSIONS } from '../../../../src/domain/scoring/rubric';

/**
 * Contract test: verifies tool schema and validator are aligned
 *
 * This test ensures that:
 * 1. A payload matching the tool schema passes validation
 * 2. The tool schema's required fields match validator expectations
 * 3. Enum values in schema match validator's accepted values
 */
describe('Scoring Contract Test', () => {
  const validator = new ScoringPayloadValidator();
  const schema = scoringCompleteTool.input_schema;

  it('should have aligned required fields between schema and validator', () => {
    // Schema requires these fields
    const schemaRequired = schema.required;

    // Create minimal payload with only required fields
    const minimalPayload = {
      compositeScore: 50,
      recommendation: 'conditional',
      overallRiskRating: 'medium',
      executiveSummary: 'This is a test summary for the assessment.',
      dimensionScores: ALL_DIMENSIONS.map(d => ({
        dimension: d,
        score: 50,
        riskRating: 'medium',
      })),
    };

    const result = validator.validate(minimalPayload);

    // If schema says it's required, validator should require it too
    expect(result.valid).toBe(true);
    expect(schemaRequired).toContain('compositeScore');
    expect(schemaRequired).toContain('recommendation');
    expect(schemaRequired).toContain('overallRiskRating');
    expect(schemaRequired).toContain('dimensionScores');
    expect(schemaRequired).toContain('executiveSummary');
  });

  it('should have aligned recommendation enum values', () => {
    const schemaEnum = schema.properties.recommendation.enum;

    // Each schema value should be accepted by validator
    for (const value of schemaEnum) {
      const payload = createPayloadWithRecommendation(value);
      const result = validator.validate(payload);
      expect(result.valid).toBe(true);
    }
  });

  it('should have aligned riskRating enum values', () => {
    const schemaEnum = schema.properties.overallRiskRating.enum;

    for (const value of schemaEnum) {
      const payload = createPayloadWithRiskRating(value);
      const result = validator.validate(payload);
      expect(result.valid).toBe(true);
    }
  });

  it('should have aligned dimension names', () => {
    const schemaDimensionEnum = schema.properties.dimensionScores.items.properties.dimension.enum;

    // Schema dimensions should match ALL_DIMENSIONS
    expect(schemaDimensionEnum).toEqual(expect.arrayContaining(ALL_DIMENSIONS));
    expect(ALL_DIMENSIONS).toEqual(expect.arrayContaining(schemaDimensionEnum));
  });

  it('should have aligned score boundaries', () => {
    const schemaMin = schema.properties.compositeScore.minimum;
    const schemaMax = schema.properties.compositeScore.maximum;

    // Boundary values should pass
    expect(validator.validate(createPayloadWithScore(schemaMin)).valid).toBe(true);
    expect(validator.validate(createPayloadWithScore(schemaMax)).valid).toBe(true);

    // Out of bounds should fail
    expect(validator.validate(createPayloadWithScore(schemaMin - 1)).valid).toBe(false);
    expect(validator.validate(createPayloadWithScore(schemaMax + 1)).valid).toBe(false);
  });

  it('should have assessmentConfidence in findings schema', () => {
    const findingsSchema = schema.properties.dimensionScores.items.properties.findings;
    expect(findingsSchema.properties).toHaveProperty('assessmentConfidence');
    expect(findingsSchema.properties.assessmentConfidence.properties.level.enum).toEqual(['high', 'medium', 'low']);
    expect(findingsSchema.properties.assessmentConfidence.required).toEqual(['level', 'rationale']);
  });

  it('should have isoClauseReferences in findings schema', () => {
    const findingsSchema = schema.properties.dimensionScores.items.properties.findings;
    expect(findingsSchema.properties).toHaveProperty('isoClauseReferences');
    const isoRefSchema = findingsSchema.properties.isoClauseReferences.items;
    expect(isoRefSchema.required).toEqual(['clauseRef', 'title', 'framework', 'status']);
    expect(isoRefSchema.properties.status.enum).toEqual(['aligned', 'partial', 'not_evidenced', 'not_applicable']);
  });

  it('should accept payload with assessmentConfidence (backwards compatible)', () => {
    const payload = {
      compositeScore: 50,
      recommendation: 'conditional',
      overallRiskRating: 'medium',
      executiveSummary: 'This is a test summary for the assessment.',
      dimensionScores: ALL_DIMENSIONS.map(d => ({
        dimension: d,
        score: 50,
        riskRating: 'medium',
        findings: {
          subScores: [],
          keyRisks: [],
          mitigations: [],
          evidenceRefs: [],
          assessmentConfidence: {
            level: 'high',
            rationale: 'Strong evidence from vendor documentation provided.',
          },
        },
      })),
    };

    const result = validator.validate(payload);
    expect(result.valid).toBe(true);
  });

  it('should accept payload with isoClauseReferences (backwards compatible)', () => {
    const payload = {
      compositeScore: 50,
      recommendation: 'conditional',
      overallRiskRating: 'medium',
      executiveSummary: 'This is a test summary for the assessment.',
      dimensionScores: ALL_DIMENSIONS.map(d => ({
        dimension: d,
        score: 50,
        riskRating: 'medium',
        findings: {
          subScores: [],
          keyRisks: [],
          mitigations: [],
          evidenceRefs: [],
          assessmentConfidence: {
            level: 'medium',
            rationale: 'Partial evidence from vendor documentation provided.',
          },
          isoClauseReferences: [
            { clauseRef: 'A.6.2.6', title: 'Data quality', framework: 'ISO/IEC 42001', status: 'aligned' },
          ],
        },
      })),
    };

    const result = validator.validate(payload);
    expect(result.valid).toBe(true);
  });

  it('should accept payload without new ISO fields (backwards compatible)', () => {
    // This is the original test - minimal payload without any ISO fields
    const payload = {
      compositeScore: 50,
      recommendation: 'conditional',
      overallRiskRating: 'medium',
      executiveSummary: 'This is a test summary for the assessment.',
      dimensionScores: ALL_DIMENSIONS.map(d => ({
        dimension: d,
        score: 50,
        riskRating: 'medium',
      })),
    };

    const result = validator.validate(payload);
    expect(result.valid).toBe(true);
  });

  // Helper functions
  function createPayloadWithRecommendation(recommendation: string) {
    return {
      compositeScore: 50,
      recommendation,
      overallRiskRating: 'medium',
      executiveSummary: 'Test summary for assessment validation.',
      dimensionScores: ALL_DIMENSIONS.map(d => ({ dimension: d, score: 50, riskRating: 'medium' })),
    };
  }

  function createPayloadWithRiskRating(riskRating: string) {
    return {
      compositeScore: 50,
      recommendation: 'conditional',
      overallRiskRating: riskRating,
      executiveSummary: 'Test summary for assessment validation.',
      dimensionScores: ALL_DIMENSIONS.map(d => ({ dimension: d, score: 50, riskRating: 'medium' })),
    };
  }

  function createPayloadWithScore(score: number) {
    return {
      compositeScore: score,
      recommendation: 'conditional',
      overallRiskRating: 'medium',
      executiveSummary: 'Test summary for assessment validation.',
      dimensionScores: ALL_DIMENSIONS.map(d => ({ dimension: d, score: 50, riskRating: 'medium' })),
    };
  }
});
