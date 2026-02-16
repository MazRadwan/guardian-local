/**
 * Unit tests for exportNarrativeUserPrompt
 *
 * Part of Epic 38: File splitting refactor
 * Story 38.1.3: Split exportNarrativePrompt into System and User Prompt Files
 */

import {
  buildExportNarrativeUserPrompt,
  truncateText,
  MAX_RESPONSE_LENGTH,
  MAX_TOP_RESPONSES,
} from '../../../../../src/infrastructure/ai/prompts/exportNarrativeUserPrompt.js';
import { DimensionScoreData } from '../../../../../src/domain/scoring/types.js';

describe('buildExportNarrativeUserPrompt', () => {
  const baseParams = {
    vendorName: 'Acme Healthcare AI',
    solutionName: 'DiagnosticAssist Pro',
    solutionType: 'clinical_ai' as const,
    compositeScore: 35,
    overallRiskRating: 'medium' as const,
    recommendation: 'conditional' as const,
    dimensionScores: [
      {
        dimension: 'clinical_risk' as const,
        score: 28,
        riskRating: 'medium' as const,
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
        dimension: 'privacy_risk' as const,
        score: 22,
        riskRating: 'medium' as const,
      },
    ] as DimensionScoreData[],
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

  it('includes vendor name', () => {
    const prompt = buildExportNarrativeUserPrompt(baseParams);
    expect(prompt).toContain('Acme Healthcare AI');
  });

  it('includes solution name', () => {
    const prompt = buildExportNarrativeUserPrompt(baseParams);
    expect(prompt).toContain('DiagnosticAssist Pro');
  });

  it('includes composite score', () => {
    const prompt = buildExportNarrativeUserPrompt(baseParams);
    expect(prompt).toContain('35/100');
  });

  it('includes overall risk rating', () => {
    const prompt = buildExportNarrativeUserPrompt(baseParams);
    expect(prompt).toContain('MEDIUM');
  });

  it('includes dimension scores for all provided dimensions', () => {
    const prompt = buildExportNarrativeUserPrompt(baseParams);
    expect(prompt).toContain('Clinical Risk');
    expect(prompt).toContain('28/100');
    expect(prompt).toContain('Privacy Risk');
    expect(prompt).toContain('22/100');
  });

  it('includes dimension sub-scores', () => {
    const prompt = buildExportNarrativeUserPrompt(baseParams);
    expect(prompt).toContain('evidence_quality: 10/40');
    expect(prompt).toContain('regulatory_status: 5/20');
  });

  it('includes formatted top responses', () => {
    const prompt = buildExportNarrativeUserPrompt(baseParams);
    expect(prompt).toContain('What clinical validation has been performed?');
    expect(prompt).toContain('prospective observational study');
    expect(prompt).toContain('[Section 1, Q 3]');
    expect(prompt).toContain('[Section 2, Q 5]');
  });

  it('truncates long responses to MAX_RESPONSE_LENGTH', () => {
    const longResponse = 'A'.repeat(600);
    const params = {
      ...baseParams,
      topResponses: [
        {
          sectionNumber: 1,
          questionNumber: 1,
          questionText: 'Test question?',
          responseText: longResponse,
        },
      ],
    };

    const prompt = buildExportNarrativeUserPrompt(params);
    expect(prompt).not.toContain('A'.repeat(600));
    expect(prompt).toContain('A'.repeat(MAX_RESPONSE_LENGTH - 3) + '...');
  });

  it('limits responses to MAX_TOP_RESPONSES', () => {
    const manyResponses = Array.from({ length: 50 }, (_, i) => ({
      sectionNumber: 1,
      questionNumber: i + 1,
      questionText: `Question ${i + 1}`,
      responseText: `Response ${i + 1}`,
    }));

    const prompt = buildExportNarrativeUserPrompt({
      ...baseParams,
      topResponses: manyResponses,
    });

    expect(prompt).toContain('Question 1');
    expect(prompt).toContain(`Question ${MAX_TOP_RESPONSES}`);
    expect(prompt).not.toContain(`Question ${MAX_TOP_RESPONSES + 1}`);
  });

  it('handles empty dimension scores', () => {
    const prompt = buildExportNarrativeUserPrompt({
      ...baseParams,
      dimensionScores: [],
    });
    expect(prompt).toContain('No dimension scores available');
  });

  it('handles empty key findings', () => {
    const prompt = buildExportNarrativeUserPrompt({
      ...baseParams,
      keyFindings: [],
    });
    expect(prompt).toContain('No key findings recorded');
  });

  it('handles empty executive summary', () => {
    const prompt = buildExportNarrativeUserPrompt({
      ...baseParams,
      executiveSummary: '',
    });
    expect(prompt).toContain('No executive summary available');
  });

  it('handles empty top responses', () => {
    const prompt = buildExportNarrativeUserPrompt({
      ...baseParams,
      topResponses: [],
    });
    expect(prompt).toContain('No vendor responses available');
  });

  // Epic 38 Story 38.2.3: ISO enrichment tests
  describe('ISO enrichment in formatDimensionScore (Story 38.2.3)', () => {
    it('includes assessment confidence when present in findings', () => {
      const params = {
        ...baseParams,
        dimensionScores: [
          {
            dimension: 'regulatory_compliance' as const,
            score: 72,
            riskRating: 'medium' as const,
            findings: {
              subScores: [],
              keyRisks: [],
              mitigations: [],
              evidenceRefs: [],
              assessmentConfidence: {
                level: 'high' as const,
                rationale: 'Strong documentation and clear evidence trail',
              },
            },
          },
        ] as DimensionScoreData[],
      };

      const prompt = buildExportNarrativeUserPrompt(params);
      expect(prompt).toContain('**Assessment Confidence:** HIGH');
      expect(prompt).toContain('Strong documentation and clear evidence trail');
    });

    it('includes ISO clause references when present in findings', () => {
      const params = {
        ...baseParams,
        dimensionScores: [
          {
            dimension: 'security_risk' as const,
            score: 45,
            riskRating: 'high' as const,
            findings: {
              subScores: [],
              keyRisks: [],
              mitigations: [],
              evidenceRefs: [],
              isoClauseReferences: [
                {
                  clauseRef: 'A.6.2.6',
                  title: 'Data quality management for AI systems',
                  framework: 'ISO/IEC 42001',
                  status: 'aligned' as const,
                },
                {
                  clauseRef: 'A.8.4',
                  title: 'Security controls for AI',
                  framework: 'ISO/IEC 42001',
                  status: 'partial' as const,
                },
              ],
            },
          },
        ] as DimensionScoreData[],
      };

      const prompt = buildExportNarrativeUserPrompt(params);
      expect(prompt).toContain('**ISO Clause Alignment:**');
      expect(prompt).toContain('A.6.2.6 (ISO/IEC 42001): Data quality management for AI systems - **ALIGNED**');
      expect(prompt).toContain('A.8.4 (ISO/IEC 42001): Security controls for AI - **PARTIAL**');
    });

    it('omits ISO sections when findings have no ISO data', () => {
      // baseParams already has clinical_risk with findings but no ISO data
      const prompt = buildExportNarrativeUserPrompt(baseParams);
      expect(prompt).not.toContain('**Assessment Confidence:**');
      expect(prompt).not.toContain('**ISO Clause Alignment:**');
    });

    it('omits ISO sections when findings are undefined', () => {
      const params = {
        ...baseParams,
        dimensionScores: [
          {
            dimension: 'privacy_risk' as const,
            score: 30,
            riskRating: 'medium' as const,
            // no findings at all
          },
        ] as DimensionScoreData[],
      };

      const prompt = buildExportNarrativeUserPrompt(params);
      expect(prompt).not.toContain('**Assessment Confidence:**');
      expect(prompt).not.toContain('**ISO Clause Alignment:**');
    });

    it('shows clause status NOT_EVIDENCED correctly', () => {
      const params = {
        ...baseParams,
        dimensionScores: [
          {
            dimension: 'ai_transparency' as const,
            score: 55,
            riskRating: 'high' as const,
            findings: {
              subScores: [],
              keyRisks: [],
              mitigations: [],
              evidenceRefs: [],
              isoClauseReferences: [
                {
                  clauseRef: 'A.5.3',
                  title: 'AI transparency requirements',
                  framework: 'ISO/IEC 42001',
                  status: 'not_evidenced' as const,
                },
              ],
            },
          },
        ] as DimensionScoreData[],
      };

      const prompt = buildExportNarrativeUserPrompt(params);
      expect(prompt).toContain('A.5.3 (ISO/IEC 42001): AI transparency requirements - **NOT_EVIDENCED**');
    });

    it('shows clause status NOT_APPLICABLE correctly', () => {
      const params = {
        ...baseParams,
        dimensionScores: [
          {
            dimension: 'operational_excellence' as const,
            score: 60,
            riskRating: 'medium' as const,
            findings: {
              subScores: [],
              keyRisks: [],
              mitigations: [],
              evidenceRefs: [],
              isoClauseReferences: [
                {
                  clauseRef: 'A.7.1',
                  title: 'Operational monitoring',
                  framework: 'ISO/IEC 42001',
                  status: 'not_applicable' as const,
                },
              ],
            },
          },
        ] as DimensionScoreData[],
      };

      const prompt = buildExportNarrativeUserPrompt(params);
      expect(prompt).toContain('A.7.1 (ISO/IEC 42001): Operational monitoring - **NOT_APPLICABLE**');
    });
  });

  describe('Guardian-native dimensions note (Story 38.2.3)', () => {
    it('includes Guardian-native dimension note when Guardian-native dimensions are present', () => {
      const prompt = buildExportNarrativeUserPrompt(baseParams);
      // baseParams has clinical_risk which is Guardian-native
      expect(prompt).toContain('**Guardian-Native Dimensions:**');
      expect(prompt).toContain('Clinical Risk');
      expect(prompt).toContain('Guardian healthcare-specific criteria without ISO control mapping');
    });

    it('lists multiple Guardian-native dimensions', () => {
      const params = {
        ...baseParams,
        dimensionScores: [
          { dimension: 'clinical_risk' as const, score: 28, riskRating: 'medium' as const },
          { dimension: 'vendor_capability' as const, score: 65, riskRating: 'medium' as const },
          { dimension: 'sustainability' as const, score: 50, riskRating: 'high' as const },
          { dimension: 'security_risk' as const, score: 35, riskRating: 'medium' as const },
        ] as DimensionScoreData[],
      };

      const prompt = buildExportNarrativeUserPrompt(params);
      expect(prompt).toContain('Clinical Risk');
      expect(prompt).toContain('Vendor Capability');
      expect(prompt).toContain('Sustainability');
    });

    it('omits Guardian-native note when no Guardian-native dimensions present', () => {
      const params = {
        ...baseParams,
        dimensionScores: [
          { dimension: 'security_risk' as const, score: 35, riskRating: 'medium' as const },
          { dimension: 'privacy_risk' as const, score: 22, riskRating: 'medium' as const },
        ] as DimensionScoreData[],
      };

      const prompt = buildExportNarrativeUserPrompt(params);
      expect(prompt).not.toContain('**Guardian-Native Dimensions:**');
    });
  });
});

describe('truncateText', () => {
  it('returns text unchanged if under limit', () => {
    const text = 'Short text';
    expect(truncateText(text, 100)).toBe(text);
  });

  it('returns text unchanged if exactly at limit', () => {
    const text = 'Exactly ten';
    expect(truncateText(text, 11)).toBe(text);
  });

  it('truncates text over limit with ellipsis', () => {
    const text = 'This is a long text that needs to be truncated';
    const truncated = truncateText(text, 20);
    expect(truncated).toBe('This is a long te...');
    expect(truncated.length).toBe(20);
  });

  it('handles empty string', () => {
    expect(truncateText('', 10)).toBe('');
  });

  it('handles very short limit', () => {
    const text = 'Testing';
    expect(truncateText(text, 5)).toBe('Te...');
  });
});

describe('constants', () => {
  it('MAX_RESPONSE_LENGTH is 500', () => {
    expect(MAX_RESPONSE_LENGTH).toBe(500);
  });

  it('MAX_TOP_RESPONSES is 30', () => {
    expect(MAX_TOP_RESPONSES).toBe(30);
  });
});
