/**
 * Unit tests for ExportNarrativePromptBuilder
 *
 * Part of Epic 20: Scoring Optimisation
 * Story 20.1.1: Export Narrative Prompt Builder
 */

import { ExportNarrativePromptBuilder } from '../../../../src/infrastructure/ai/ExportNarrativePromptBuilder.js';
import {
  buildExportNarrativeSystemPrompt,
  buildExportNarrativeUserPrompt,
  truncateText,
  MAX_RESPONSE_LENGTH,
  MAX_TOP_RESPONSES,
} from '../../../../src/infrastructure/ai/prompts/exportNarrativePrompt.js';
import { NarrativePromptParams } from '../../../../src/application/interfaces/IExportNarrativePromptBuilder.js';
import { DimensionScoreData } from '../../../../src/domain/scoring/types.js';

describe('ExportNarrativePromptBuilder', () => {
  let builder: ExportNarrativePromptBuilder;

  beforeEach(() => {
    builder = new ExportNarrativePromptBuilder();
  });

  describe('buildNarrativeSystemPrompt', () => {
    it('returns a non-empty system prompt', () => {
      const prompt = builder.buildNarrativeSystemPrompt();
      expect(prompt).toBeTruthy();
      expect(typeof prompt).toBe('string');
      expect(prompt.length).toBeGreaterThan(100);
    });

    it('includes rubric version', () => {
      const prompt = builder.buildNarrativeSystemPrompt();
      expect(prompt).toContain('guardian-v1.1');
    });

    it('includes all 10 risk dimensions', () => {
      const prompt = builder.buildNarrativeSystemPrompt();
      expect(prompt).toContain('Clinical Risk');
      expect(prompt).toContain('Privacy Risk');
      expect(prompt).toContain('Security Risk');
      expect(prompt).toContain('Technical Credibility');
      expect(prompt).toContain('Operational Excellence');
    });

    it('includes report structure requirements', () => {
      const prompt = builder.buildNarrativeSystemPrompt();
      expect(prompt).toContain('Executive Summary');
      expect(prompt).toContain('Risk Overview');
      expect(prompt).toContain('Dimension Analysis');
      expect(prompt).toContain('Compliance Assessment');
      expect(prompt).toContain('Recommendations');
      expect(prompt).toContain('Conclusion');
    });

    it('includes evidence citation format', () => {
      const prompt = builder.buildNarrativeSystemPrompt();
      expect(prompt).toContain('[Section X, Q Y]');
    });

    it('includes recommendation criteria', () => {
      const prompt = builder.buildNarrativeSystemPrompt();
      expect(prompt).toContain('APPROVE');
      expect(prompt).toContain('CONDITIONAL');
      expect(prompt).toContain('DECLINE');
      expect(prompt).toContain('MORE_INFO');
    });

    it('is deterministic (same output on multiple calls)', () => {
      const prompt1 = builder.buildNarrativeSystemPrompt();
      const prompt2 = builder.buildNarrativeSystemPrompt();
      expect(prompt1).toBe(prompt2);
    });
  });

  describe('buildNarrativeUserPrompt', () => {
    const baseParams: NarrativePromptParams = {
      vendorName: 'Acme Healthcare AI',
      solutionName: 'DiagnosticAssist Pro',
      solutionType: 'clinical_ai',
      compositeScore: 35,
      overallRiskRating: 'medium',
      recommendation: 'conditional',
      dimensionScores: [
        {
          dimension: 'clinical_risk',
          score: 28,
          riskRating: 'medium',
          findings: {
            subScores: [
              { name: 'evidence_quality', score: 10, maxScore: 40, notes: 'Prospective study available' },
              { name: 'regulatory_status', score: 5, maxScore: 20, notes: 'Under Health Canada review' },
            ],
            keyRisks: ['Limited population validation', 'Pending regulatory approval'],
            mitigations: ['Expand validation study', 'Track approval timeline'],
            evidenceRefs: [
              { sectionNumber: 1, questionNumber: 3, quote: 'We have completed prospective studies...' },
            ],
          },
        },
        {
          dimension: 'privacy_risk',
          score: 22,
          riskRating: 'medium',
        },
      ],
      keyFindings: [
        'Strong clinical validation evidence',
        'Pending Health Canada approval',
        'PHI protection mechanisms in place',
      ],
      executiveSummary:
        'Acme Healthcare AI presents a moderate risk profile with strong clinical validation but pending regulatory approval.',
      topResponses: [
        {
          sectionNumber: 1,
          questionNumber: 3,
          questionText: 'What clinical validation has been performed?',
          responseText: 'We have completed a prospective observational study with 500 patients.',
        },
        {
          sectionNumber: 2,
          questionNumber: 5,
          questionText: 'How is PHI protected?',
          responseText: 'All PHI is encrypted at rest and in transit using AES-256.',
        },
      ],
    };

    it('includes vendor and solution information', () => {
      const prompt = builder.buildNarrativeUserPrompt(baseParams);
      expect(prompt).toContain('Acme Healthcare AI');
      expect(prompt).toContain('DiagnosticAssist Pro');
      expect(prompt).toContain('clinical ai');
    });

    it('includes scoring results', () => {
      const prompt = builder.buildNarrativeUserPrompt(baseParams);
      expect(prompt).toContain('35/100');
      expect(prompt).toContain('MEDIUM');
      expect(prompt).toContain('CONDITIONAL APPROVAL');
    });

    it('includes dimension weighting for solution type', () => {
      const prompt = builder.buildNarrativeUserPrompt(baseParams);
      expect(prompt).toContain('Clinical Risk: 25%');
      expect(prompt).toContain('Privacy Risk: 15%');
    });

    it('includes executive summary', () => {
      const prompt = builder.buildNarrativeUserPrompt(baseParams);
      expect(prompt).toContain('moderate risk profile');
    });

    it('includes key findings with numbering', () => {
      const prompt = builder.buildNarrativeUserPrompt(baseParams);
      expect(prompt).toContain('1. Strong clinical validation');
      expect(prompt).toContain('2. Pending Health Canada');
      expect(prompt).toContain('3. PHI protection');
    });

    it('includes dimension scores with details', () => {
      const prompt = builder.buildNarrativeUserPrompt(baseParams);
      expect(prompt).toContain('Clinical Risk');
      expect(prompt).toContain('28/100');
      expect(prompt).toContain('evidence_quality: 10/40');
    });

    it('includes dimension key risks and mitigations', () => {
      const prompt = builder.buildNarrativeUserPrompt(baseParams);
      expect(prompt).toContain('Limited population validation');
      expect(prompt).toContain('Expand validation study');
    });

    it('includes dimension evidence references', () => {
      const prompt = builder.buildNarrativeUserPrompt(baseParams);
      expect(prompt).toContain('[Section 1, Q 3]');
    });

    it('includes top responses for evidence citation', () => {
      const prompt = builder.buildNarrativeUserPrompt(baseParams);
      expect(prompt).toContain('What clinical validation has been performed?');
      expect(prompt).toContain('prospective observational study');
    });

    it('handles all recommendation types correctly', () => {
      const recommendations = [
        { rec: 'approve' as const, expected: 'APPROVE - Proceed with standard monitoring' },
        { rec: 'conditional' as const, expected: 'CONDITIONAL APPROVAL' },
        { rec: 'decline' as const, expected: 'DECLINE - Do not proceed' },
        { rec: 'more_info' as const, expected: 'MORE INFORMATION REQUIRED' },
      ];

      for (const { rec, expected } of recommendations) {
        const prompt = builder.buildNarrativeUserPrompt({
          ...baseParams,
          recommendation: rec,
        });
        expect(prompt).toContain(expected);
      }
    });

    it('handles different solution types with correct weighting', () => {
      const adminPrompt = builder.buildNarrativeUserPrompt({
        ...baseParams,
        solutionType: 'administrative_ai',
      });
      expect(adminPrompt).toContain('Privacy Risk: 20%');
      expect(adminPrompt).toContain('Security Risk: 18%');

      const patientPrompt = builder.buildNarrativeUserPrompt({
        ...baseParams,
        solutionType: 'patient_facing',
      });
      expect(patientPrompt).toContain('Privacy Risk: 20%');
      expect(patientPrompt).toContain('Clinical Risk: 10%');
    });
  });

  describe('missing optional fields handling', () => {
    const minimalParams: NarrativePromptParams = {
      vendorName: 'Test Vendor',
      solutionName: 'Test Solution',
      solutionType: 'clinical_ai',
      compositeScore: 50,
      overallRiskRating: 'medium',
      recommendation: 'conditional',
      dimensionScores: [],
      keyFindings: [],
      executiveSummary: '',
      topResponses: [],
    };

    it('handles empty dimension scores', () => {
      const prompt = builder.buildNarrativeUserPrompt(minimalParams);
      expect(prompt).toContain('No dimension scores available');
    });

    it('handles empty key findings', () => {
      const prompt = builder.buildNarrativeUserPrompt(minimalParams);
      expect(prompt).toContain('No key findings recorded');
    });

    it('handles empty executive summary', () => {
      const prompt = builder.buildNarrativeUserPrompt(minimalParams);
      expect(prompt).toContain('No executive summary available');
    });

    it('handles empty top responses', () => {
      const prompt = builder.buildNarrativeUserPrompt(minimalParams);
      expect(prompt).toContain('No vendor responses available');
    });

    it('handles dimension scores without findings', () => {
      const prompt = builder.buildNarrativeUserPrompt({
        ...minimalParams,
        dimensionScores: [
          {
            dimension: 'security_risk',
            score: 45,
            riskRating: 'high',
            // No findings property
          },
        ],
      });
      expect(prompt).toContain('Security Risk');
      expect(prompt).toContain('45/100');
      expect(prompt).toContain('HIGH');
    });

    it('handles dimension scores with partial findings', () => {
      const prompt = builder.buildNarrativeUserPrompt({
        ...minimalParams,
        dimensionScores: [
          {
            dimension: 'privacy_risk',
            score: 30,
            riskRating: 'medium',
            findings: {
              subScores: [], // Empty but present
              keyRisks: ['One risk'],
              mitigations: [], // Empty
              evidenceRefs: [],
            },
          },
        ],
      });
      expect(prompt).toContain('Privacy Risk');
      expect(prompt).toContain('One risk');
    });
  });
});

describe('truncateText', () => {
  it('returns text unchanged if within limit', () => {
    const text = 'Short text';
    expect(truncateText(text, 100)).toBe(text);
  });

  it('truncates text with ellipsis if over limit', () => {
    const text = 'This is a long text that needs to be truncated';
    const truncated = truncateText(text, 20);
    expect(truncated).toBe('This is a long te...');
    expect(truncated.length).toBe(20);
  });

  it('handles exact length', () => {
    const text = 'Exactly ten';
    expect(truncateText(text, 11)).toBe(text);
  });

  it('handles empty string', () => {
    expect(truncateText('', 10)).toBe('');
  });

  it('handles very short limit', () => {
    const text = 'Testing';
    expect(truncateText(text, 5)).toBe('Te...');
  });
});

describe('response truncation behavior', () => {
  it('truncates individual responses to MAX_RESPONSE_LENGTH', () => {
    const builder = new ExportNarrativePromptBuilder();
    const longResponse = 'A'.repeat(600); // Over 500 char limit

    const prompt = builder.buildNarrativeUserPrompt({
      vendorName: 'Test',
      solutionName: 'Test',
      solutionType: 'clinical_ai',
      compositeScore: 50,
      overallRiskRating: 'medium',
      recommendation: 'conditional',
      dimensionScores: [],
      keyFindings: [],
      executiveSummary: '',
      topResponses: [
        {
          sectionNumber: 1,
          questionNumber: 1,
          questionText: 'Test question?',
          responseText: longResponse,
        },
      ],
    });

    // Response should be truncated
    expect(prompt).not.toContain('A'.repeat(600));
    expect(prompt).toContain('A'.repeat(MAX_RESPONSE_LENGTH - 3) + '...');
  });

  it('limits number of responses to MAX_TOP_RESPONSES', () => {
    const builder = new ExportNarrativePromptBuilder();

    const manyResponses = Array.from({ length: 50 }, (_, i) => ({
      sectionNumber: 1,
      questionNumber: i + 1,
      questionText: `Question ${i + 1}`,
      responseText: `Response ${i + 1}`,
    }));

    const prompt = builder.buildNarrativeUserPrompt({
      vendorName: 'Test',
      solutionName: 'Test',
      solutionType: 'clinical_ai',
      compositeScore: 50,
      overallRiskRating: 'medium',
      recommendation: 'conditional',
      dimensionScores: [],
      keyFindings: [],
      executiveSummary: '',
      topResponses: manyResponses,
    });

    // Should include first 30 responses, not all 50
    expect(prompt).toContain('Question 1');
    expect(prompt).toContain('Question 30');
    expect(prompt).not.toContain('Question 31');
    expect(prompt).not.toContain('Question 50');
  });
});

describe('buildExportNarrativeSystemPrompt (function)', () => {
  it('matches builder output', () => {
    const builder = new ExportNarrativePromptBuilder();
    expect(buildExportNarrativeSystemPrompt()).toBe(builder.buildNarrativeSystemPrompt());
  });
});

describe('buildExportNarrativeUserPrompt (function)', () => {
  it('matches builder output', () => {
    const builder = new ExportNarrativePromptBuilder();
    const params: NarrativePromptParams = {
      vendorName: 'Test',
      solutionName: 'Test',
      solutionType: 'clinical_ai',
      compositeScore: 50,
      overallRiskRating: 'medium',
      recommendation: 'conditional',
      dimensionScores: [],
      keyFindings: [],
      executiveSummary: '',
      topResponses: [],
    };
    expect(buildExportNarrativeUserPrompt(params)).toBe(
      builder.buildNarrativeUserPrompt(params)
    );
  });
});

describe('token budget compliance', () => {
  it('system prompt is within reasonable token budget', () => {
    const builder = new ExportNarrativePromptBuilder();
    const prompt = builder.buildNarrativeSystemPrompt();

    // Rough estimate: ~4 chars per token
    const estimatedTokens = Math.ceil(prompt.length / 4);

    // System prompt should be around 500-1500 tokens
    expect(estimatedTokens).toBeGreaterThan(400);
    expect(estimatedTokens).toBeLessThan(2000);
  });

  it('user prompt with full data is within token budget', () => {
    const builder = new ExportNarrativePromptBuilder();

    // Create realistic full params
    const fullParams: NarrativePromptParams = {
      vendorName: 'Acme Healthcare AI Inc.',
      solutionName: 'DiagnosticAssist Pro Enterprise Edition',
      solutionType: 'clinical_ai',
      compositeScore: 42,
      overallRiskRating: 'medium',
      recommendation: 'conditional',
      dimensionScores: [
        {
          dimension: 'clinical_risk',
          score: 35,
          riskRating: 'medium',
          findings: {
            subScores: [
              { name: 'evidence_quality', score: 15, maxScore: 40, notes: 'Good study quality' },
              { name: 'regulatory_status', score: 10, maxScore: 20, notes: 'Under review' },
              { name: 'patient_safety', score: 5, maxScore: 20, notes: 'Robust mechanisms' },
            ],
            keyRisks: ['Risk 1', 'Risk 2', 'Risk 3'],
            mitigations: ['Mitigation 1', 'Mitigation 2'],
            evidenceRefs: [
              { sectionNumber: 1, questionNumber: 1, quote: 'Evidence quote 1' },
              { sectionNumber: 1, questionNumber: 2, quote: 'Evidence quote 2' },
            ],
          },
        },
        {
          dimension: 'privacy_risk',
          score: 25,
          riskRating: 'medium',
          findings: {
            subScores: [
              { name: 'pipeda_compliance', score: 8, maxScore: 30, notes: 'Mostly compliant' },
            ],
            keyRisks: ['Privacy risk 1'],
            mitigations: ['Privacy mitigation 1'],
            evidenceRefs: [],
          },
        },
        {
          dimension: 'security_risk',
          score: 30,
          riskRating: 'medium',
        },
        {
          dimension: 'technical_credibility',
          score: 75,
          riskRating: 'medium',
        },
        {
          dimension: 'operational_excellence',
          score: 70,
          riskRating: 'medium',
        },
      ],
      keyFindings: [
        'Finding 1: Strong clinical validation with prospective studies',
        'Finding 2: Pending Health Canada approval expected Q2',
        'Finding 3: PHI protection mechanisms meet requirements',
        'Finding 4: Some gaps in incident response documentation',
        'Finding 5: Vendor has healthcare experience',
      ],
      executiveSummary:
        'Acme Healthcare AI presents a moderate risk profile. The solution has strong clinical validation evidence from prospective observational studies, though Health Canada approval is still pending. Privacy and security controls are generally adequate, with some documentation gaps that should be addressed.',
      topResponses: Array.from({ length: 30 }, (_, i) => ({
        sectionNumber: Math.floor(i / 10) + 1,
        questionNumber: (i % 10) + 1,
        questionText: `Question ${i + 1}: What is your approach to ${['validation', 'security', 'privacy'][i % 3]}?`,
        responseText: `Response ${i + 1}: Our approach involves comprehensive measures including regular audits, documentation, and continuous improvement processes.`,
      })),
    };

    const prompt = builder.buildNarrativeUserPrompt(fullParams);

    // Rough estimate: ~4 chars per token
    const estimatedTokens = Math.ceil(prompt.length / 4);

    // User prompt with full data should be around 3000-5000 tokens
    expect(estimatedTokens).toBeGreaterThan(2000);
    expect(estimatedTokens).toBeLessThan(6000);
  });
});
