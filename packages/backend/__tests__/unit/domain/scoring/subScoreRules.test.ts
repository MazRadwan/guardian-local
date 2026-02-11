import {
  SUB_SCORE_RULES,
  getExpectedMaxTotal,
  getValidSubScoreNames,
  SubScoreRule,
} from '../../../../src/domain/scoring/subScoreRules';
import { RiskDimension } from '../../../../src/domain/types/QuestionnaireSchema';

describe('subScoreRules', () => {
  describe('SUB_SCORE_RULES structure', () => {
    it('should define rules for the 5 primary scored dimensions', () => {
      const definedDimensions = Object.keys(SUB_SCORE_RULES);
      expect(definedDimensions).toContain('clinical_risk');
      expect(definedDimensions).toContain('privacy_risk');
      expect(definedDimensions).toContain('security_risk');
      expect(definedDimensions).toContain('technical_credibility');
      expect(definedDimensions).toContain('operational_excellence');
    });

    it('should not define rules for non-rubric dimensions', () => {
      const definedDimensions = Object.keys(SUB_SCORE_RULES);
      expect(definedDimensions).not.toContain('vendor_capability');
      expect(definedDimensions).not.toContain('ai_transparency');
      expect(definedDimensions).not.toContain('ethical_considerations');
      expect(definedDimensions).not.toContain('regulatory_compliance');
      expect(definedDimensions).not.toContain('sustainability');
    });

    it('should have unique sub-score names within each dimension', () => {
      for (const [dimension, rules] of Object.entries(SUB_SCORE_RULES)) {
        const names = rules!.map(r => r.name);
        const uniqueNames = new Set(names);
        expect(uniqueNames.size).toBe(names.length);
      }
    });

    it('should have allowed values that do not exceed maxPoints', () => {
      for (const [dimension, rules] of Object.entries(SUB_SCORE_RULES)) {
        for (const rule of rules!) {
          for (const value of rule.allowedValues) {
            expect(value).toBeLessThanOrEqual(rule.maxPoints);
            expect(value).toBeGreaterThanOrEqual(0);
          }
        }
      }
    });

    it('should have maxPoints as the maximum allowed value for each sub-score', () => {
      for (const [dimension, rules] of Object.entries(SUB_SCORE_RULES)) {
        for (const rule of rules!) {
          expect(rule.allowedValues).toContain(rule.maxPoints);
        }
      }
    });

    it('should have allowed values in ascending order', () => {
      for (const [dimension, rules] of Object.entries(SUB_SCORE_RULES)) {
        for (const rule of rules!) {
          const sorted = [...rule.allowedValues].sort((a, b) => a - b);
          expect(rule.allowedValues).toEqual(sorted);
        }
      }
    });
  });

  describe('clinical_risk sub-scores', () => {
    it('should sum to 100 points max', () => {
      expect(getExpectedMaxTotal('clinical_risk' as RiskDimension)).toBe(100);
    });

    it('should have 5 sub-scores', () => {
      expect(SUB_SCORE_RULES['clinical_risk']!.length).toBe(5);
    });
  });

  describe('privacy_risk sub-scores', () => {
    it('should sum to 100 points max', () => {
      expect(getExpectedMaxTotal('privacy_risk' as RiskDimension)).toBe(100);
    });

    it('should have 5 sub-scores', () => {
      expect(SUB_SCORE_RULES['privacy_risk']!.length).toBe(5);
    });
  });

  describe('security_risk sub-scores', () => {
    it('should sum to 100 points max', () => {
      expect(getExpectedMaxTotal('security_risk' as RiskDimension)).toBe(100);
    });

    it('should have 6 sub-scores', () => {
      expect(SUB_SCORE_RULES['security_risk']!.length).toBe(6);
    });
  });

  describe('technical_credibility sub-scores', () => {
    it('should sum to 100 points max', () => {
      expect(getExpectedMaxTotal('technical_credibility' as RiskDimension)).toBe(100);
    });

    it('should have 5 sub-scores', () => {
      expect(SUB_SCORE_RULES['technical_credibility']!.length).toBe(5);
    });
  });

  describe('operational_excellence sub-scores', () => {
    it('should sum to 100 points max', () => {
      expect(getExpectedMaxTotal('operational_excellence' as RiskDimension)).toBe(100);
    });

    it('should have 5 sub-scores', () => {
      expect(SUB_SCORE_RULES['operational_excellence']!.length).toBe(5);
    });
  });

  describe('getExpectedMaxTotal', () => {
    it('should return undefined for dimensions without rules', () => {
      expect(getExpectedMaxTotal('vendor_capability' as RiskDimension)).toBeUndefined();
      expect(getExpectedMaxTotal('sustainability' as RiskDimension)).toBeUndefined();
    });

    it('should return 100 for all defined dimensions', () => {
      for (const dimension of Object.keys(SUB_SCORE_RULES)) {
        expect(getExpectedMaxTotal(dimension as RiskDimension)).toBe(100);
      }
    });
  });

  describe('getValidSubScoreNames', () => {
    it('should return undefined for dimensions without rules', () => {
      expect(getValidSubScoreNames('vendor_capability' as RiskDimension)).toBeUndefined();
    });

    it('should return a Set of valid names for defined dimensions', () => {
      const names = getValidSubScoreNames('clinical_risk' as RiskDimension);
      expect(names).toBeDefined();
      expect(names!.has('evidence_quality_score')).toBe(true);
      expect(names!.has('regulatory_status_score')).toBe(true);
      expect(names!.has('patient_safety_score')).toBe(true);
      expect(names!.has('population_relevance_score')).toBe(true);
      expect(names!.has('workflow_integration_score')).toBe(true);
      expect(names!.has('nonexistent_score')).toBe(false);
    });

    it('should return correct names for privacy_risk', () => {
      const names = getValidSubScoreNames('privacy_risk' as RiskDimension);
      expect(names).toBeDefined();
      expect(names!.has('pipeda_compliance_score')).toBe(true);
      expect(names!.has('atipp_compliance_score')).toBe(true);
      expect(names!.has('phi_protection_score')).toBe(true);
      expect(names!.has('consent_mechanism_score')).toBe(true);
      expect(names!.has('data_subject_rights_score')).toBe(true);
    });
  });
});
