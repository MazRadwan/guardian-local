import {
  SUB_SCORE_RULES,
  getExpectedMaxTotal,
  getValidSubScoreNames,
  SubScoreRule,
} from '../../../../src/domain/scoring/subScoreRules';
import { RiskDimension, ALL_RISK_DIMENSIONS } from '../../../../src/domain/types/QuestionnaireSchema';

describe('subScoreRules', () => {
  describe('SUB_SCORE_RULES structure', () => {
    it('should define rules for all 10 risk dimensions', () => {
      const definedDimensions = Object.keys(SUB_SCORE_RULES);
      for (const dimension of ALL_RISK_DIMENSIONS) {
        expect(definedDimensions).toContain(dimension);
      }
      expect(definedDimensions.length).toBe(10);
    });

    it('should have unique sub-score names within each dimension', () => {
      for (const [dimension, rules] of Object.entries(SUB_SCORE_RULES)) {
        const names = rules.map(r => r.name);
        const uniqueNames = new Set(names);
        expect(uniqueNames.size).toBe(names.length);
      }
    });

    it('should have allowed values that do not exceed maxPoints', () => {
      for (const [dimension, rules] of Object.entries(SUB_SCORE_RULES)) {
        for (const rule of rules) {
          for (const value of rule.allowedValues) {
            expect(value).toBeLessThanOrEqual(rule.maxPoints);
            expect(value).toBeGreaterThanOrEqual(0);
          }
        }
      }
    });

    it('should have maxPoints as the maximum allowed value for each sub-score', () => {
      for (const [dimension, rules] of Object.entries(SUB_SCORE_RULES)) {
        for (const rule of rules) {
          expect(rule.allowedValues).toContain(rule.maxPoints);
        }
      }
    });

    it('should have allowed values in ascending order', () => {
      for (const [dimension, rules] of Object.entries(SUB_SCORE_RULES)) {
        for (const rule of rules) {
          const sorted = [...rule.allowedValues].sort((a, b) => a - b);
          expect(rule.allowedValues).toEqual(sorted);
        }
      }
    });

    it('should have all allowed values as valid non-negative numbers', () => {
      for (const [dimension, rules] of Object.entries(SUB_SCORE_RULES)) {
        for (const rule of rules) {
          for (const value of rule.allowedValues) {
            expect(typeof value).toBe('number');
            expect(Number.isFinite(value)).toBe(true);
            expect(value).toBeGreaterThanOrEqual(0);
          }
        }
      }
    });
  });

  describe('existing dimensions', () => {
    it('clinical_risk should sum to 100 with 5 sub-scores', () => {
      expect(getExpectedMaxTotal('clinical_risk')).toBe(100);
      expect(SUB_SCORE_RULES['clinical_risk'].length).toBe(5);
    });

    it('privacy_risk should sum to 100 with 5 sub-scores', () => {
      expect(getExpectedMaxTotal('privacy_risk')).toBe(100);
      expect(SUB_SCORE_RULES['privacy_risk'].length).toBe(5);
    });

    it('security_risk should sum to 100 with 6 sub-scores', () => {
      expect(getExpectedMaxTotal('security_risk')).toBe(100);
      expect(SUB_SCORE_RULES['security_risk'].length).toBe(6);
    });

    it('technical_credibility should sum to 100 with 5 sub-scores', () => {
      expect(getExpectedMaxTotal('technical_credibility')).toBe(100);
      expect(SUB_SCORE_RULES['technical_credibility'].length).toBe(5);
    });

    it('operational_excellence should sum to 100 with 5 sub-scores', () => {
      expect(getExpectedMaxTotal('operational_excellence')).toBe(100);
      expect(SUB_SCORE_RULES['operational_excellence'].length).toBe(5);
    });
  });

  describe('new dimensions', () => {
    it('vendor_capability should sum to 100 with 5 sub-scores', () => {
      expect(getExpectedMaxTotal('vendor_capability')).toBe(100);
      expect(SUB_SCORE_RULES['vendor_capability'].length).toBe(5);
    });

    it('vendor_capability should have correct sub-score names', () => {
      const names = getValidSubScoreNames('vendor_capability')!;
      expect(names.has('company_stability_score')).toBe(true);
      expect(names.has('healthcare_experience_score')).toBe(true);
      expect(names.has('customer_references_score')).toBe(true);
      expect(names.has('support_capability_score')).toBe(true);
      expect(names.has('roadmap_credibility_score')).toBe(true);
      expect(names.size).toBe(5);
    });

    it('ai_transparency should sum to 100 with 5 sub-scores', () => {
      expect(getExpectedMaxTotal('ai_transparency')).toBe(100);
      expect(SUB_SCORE_RULES['ai_transparency'].length).toBe(5);
    });

    it('ai_transparency should have correct sub-score names', () => {
      const names = getValidSubScoreNames('ai_transparency')!;
      expect(names.has('model_explainability_score')).toBe(true);
      expect(names.has('audit_trail_score')).toBe(true);
      expect(names.has('confidence_scoring_score')).toBe(true);
      expect(names.has('limitations_documentation_score')).toBe(true);
      expect(names.has('interpretability_score')).toBe(true);
      expect(names.size).toBe(5);
    });

    it('ethical_considerations should sum to 100 with 5 sub-scores', () => {
      expect(getExpectedMaxTotal('ethical_considerations')).toBe(100);
      expect(SUB_SCORE_RULES['ethical_considerations'].length).toBe(5);
    });

    it('ethical_considerations should have correct sub-score names', () => {
      const names = getValidSubScoreNames('ethical_considerations')!;
      expect(names.has('bias_testing_score')).toBe(true);
      expect(names.has('population_fairness_score')).toBe(true);
      expect(names.has('equity_impact_score')).toBe(true);
      expect(names.has('indigenous_rural_health_score')).toBe(true);
      expect(names.has('algorithmic_justice_score')).toBe(true);
      expect(names.size).toBe(5);
    });

    it('regulatory_compliance should sum to 100 with 5 sub-scores', () => {
      expect(getExpectedMaxTotal('regulatory_compliance')).toBe(100);
      expect(SUB_SCORE_RULES['regulatory_compliance'].length).toBe(5);
    });

    it('regulatory_compliance should have correct sub-score names', () => {
      const names = getValidSubScoreNames('regulatory_compliance')!;
      expect(names.has('health_canada_status_score')).toBe(true);
      expect(names.has('qms_maturity_score')).toBe(true);
      expect(names.has('clinical_evidence_score')).toBe(true);
      expect(names.has('post_market_surveillance_score')).toBe(true);
      expect(names.has('regulatory_roadmap_score')).toBe(true);
      expect(names.size).toBe(5);
    });

    it('sustainability should sum to 100 with 5 sub-scores', () => {
      expect(getExpectedMaxTotal('sustainability')).toBe(100);
      expect(SUB_SCORE_RULES['sustainability'].length).toBe(5);
    });

    it('sustainability should have correct sub-score names', () => {
      const names = getValidSubScoreNames('sustainability')!;
      expect(names.has('itil4_service_maturity_score')).toBe(true);
      expect(names.has('nist_csf_alignment_score')).toBe(true);
      expect(names.has('support_model_sustainability_score')).toBe(true);
      expect(names.has('bcp_disaster_recovery_score')).toBe(true);
      expect(names.has('total_cost_of_ownership_score')).toBe(true);
      expect(names.size).toBe(5);
    });
  });

  describe('getExpectedMaxTotal', () => {
    it('should return 100 for all dimensions', () => {
      for (const dimension of ALL_RISK_DIMENSIONS) {
        expect(getExpectedMaxTotal(dimension)).toBe(100);
      }
    });
  });

  describe('getValidSubScoreNames', () => {
    it('should return a Set for all dimensions', () => {
      for (const dimension of ALL_RISK_DIMENSIONS) {
        const names = getValidSubScoreNames(dimension);
        expect(names).toBeDefined();
        expect(names).toBeInstanceOf(Set);
        expect(names!.size).toBeGreaterThan(0);
      }
    });

    it('should return correct names for clinical_risk', () => {
      const names = getValidSubScoreNames('clinical_risk');
      expect(names).toBeDefined();
      expect(names!.has('evidence_quality_score')).toBe(true);
      expect(names!.has('regulatory_status_score')).toBe(true);
      expect(names!.has('patient_safety_score')).toBe(true);
      expect(names!.has('population_relevance_score')).toBe(true);
      expect(names!.has('workflow_integration_score')).toBe(true);
      expect(names!.has('nonexistent_score')).toBe(false);
    });

    it('should return correct names for privacy_risk', () => {
      const names = getValidSubScoreNames('privacy_risk');
      expect(names).toBeDefined();
      expect(names!.has('pipeda_compliance_score')).toBe(true);
      expect(names!.has('atipp_compliance_score')).toBe(true);
      expect(names!.has('phi_protection_score')).toBe(true);
      expect(names!.has('consent_mechanism_score')).toBe(true);
      expect(names!.has('data_subject_rights_score')).toBe(true);
    });
  });
});
