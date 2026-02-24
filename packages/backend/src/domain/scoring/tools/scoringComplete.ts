/**
 * scoring_complete Tool Definition
 *
 * Claude tool for submitting structured scoring results after narrative analysis.
 */

import { ALL_DIMENSIONS, ALL_DISQUALIFYING_FACTORS } from '../rubric'

/** Claude tool definition for structured score extraction */
export const scoringCompleteTool = {
  name: 'scoring_complete',
  description: 'Submit structured scoring results after narrative analysis.',
  input_schema: {
    type: 'object' as const,
    required: ['compositeScore', 'recommendation', 'overallRiskRating', 'dimensionScores', 'executiveSummary'],
    properties: {
      compositeScore: {
        type: 'integer', minimum: 0, maximum: 100,
        description: 'Weighted average score across all dimensions (0-100)',
      },
      recommendation: {
        type: 'string', enum: ['approve', 'conditional', 'decline', 'more_info'],
        description: 'Overall recommendation based on scoring',
      },
      overallRiskRating: {
        type: 'string', enum: ['low', 'medium', 'high', 'critical'],
        description: 'Aggregate risk level',
      },
      executiveSummary: {
        type: 'string', description: 'Brief summary for leadership (2-3 sentences)',
      },
      keyFindings: {
        type: 'array', items: { type: 'string' }, description: 'Top 3-5 key findings',
      },
      disqualifyingFactors: {
        type: 'array',
        items: { type: 'string', enum: ALL_DISQUALIFYING_FACTORS },
        description: 'Canonical disqualifying factor keys. Use exact keys from the rubric.',
      },
      dimensionScores: {
        type: 'array',
        minItems: 10,
        maxItems: 10,
        description: 'Scores for all 10 risk dimensions',
        items: {
          type: 'object',
          required: ['dimension', 'score', 'riskRating'],
          properties: {
            dimension: { type: 'string', enum: ALL_DIMENSIONS, description: 'Risk dimension name' },
            score: { type: 'integer', minimum: 0, maximum: 100, description: 'Dimension score (0-100)' },
            riskRating: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
            findings: {
              type: 'object',
              description: 'Detailed findings including sub-scores, evidence, confidence, and ISO references',
              properties: {
                subScores: {
                  type: 'array', description: 'Component sub-scores per rubric criteria',
                  items: {
                    type: 'object',
                    properties: {
                      name: { type: 'string' }, score: { type: 'number' },
                      maxScore: { type: 'number' }, notes: { type: 'string' },
                    },
                  },
                },
                keyRisks: { type: 'array', items: { type: 'string' }, description: 'Key risks identified' },
                mitigations: { type: 'array', items: { type: 'string' }, description: 'Suggested mitigations' },
                evidenceRefs: {
                  type: 'array', description: 'References to specific questionnaire responses',
                  items: {
                    type: 'object',
                    properties: {
                      sectionNumber: { type: 'integer' },
                      questionNumber: { type: 'integer' },
                      quote: { type: 'string' },
                    },
                  },
                },
                assessmentConfidence: {
                  type: 'object', description: 'Confidence assessment for this dimension score.',
                  properties: {
                    level: { type: 'string', enum: ['high', 'medium', 'low'] },
                    rationale: { type: 'string', description: 'Explanation citing evidence for this confidence level.' },
                  },
                  required: ['level', 'rationale'],
                },
                isoClauseReferences: {
                  type: 'array', description: 'ISO clause references relevant to this dimension.',
                  items: {
                    type: 'object',
                    required: ['clauseRef', 'title', 'framework', 'status'],
                    properties: {
                      clauseRef: { type: 'string', description: 'ISO clause reference (e.g., "A.6.2.6")' },
                      title: { type: 'string', description: 'Control title' },
                      framework: { type: 'string', description: 'Framework name (e.g., "ISO/IEC 42001")' },
                      status: {
                        type: 'string',
                        enum: ['aligned', 'partial', 'not_evidenced', 'not_applicable'],
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
}

/** TypeScript type derived from tool schema */
export type ScoringCompleteInput = {
  compositeScore: number
  recommendation: 'approve' | 'conditional' | 'decline' | 'more_info'
  overallRiskRating: 'low' | 'medium' | 'high' | 'critical'
  executiveSummary: string
  keyFindings?: string[]
  disqualifyingFactors?: string[]
  dimensionScores: Array<{
    dimension: string
    score: number
    riskRating: 'low' | 'medium' | 'high' | 'critical'
    findings?: {
      subScores?: Array<{ name: string; score: number; maxScore: number; notes: string }>
      keyRisks?: string[]
      mitigations?: string[]
      evidenceRefs?: Array<{ sectionNumber: number; questionNumber: number; quote: string }>
      assessmentConfidence?: { level: 'high' | 'medium' | 'low'; rationale: string }
      isoClauseReferences?: Array<{
        clauseRef: string; title: string; framework: string
        status: 'aligned' | 'partial' | 'not_evidenced' | 'not_applicable'
      }>
    }
  }>
}
