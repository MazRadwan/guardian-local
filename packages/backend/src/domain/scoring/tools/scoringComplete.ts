/**
 * scoring_complete Tool Definition
 *
 * Claude tool for submitting structured scoring results after narrative analysis.
 */

import { ALL_DIMENSIONS } from '../rubric'

/**
 * Claude tool definition for structured score extraction
 */
export const scoringCompleteTool = {
  name: 'scoring_complete',
  description: 'Submit structured scoring results after narrative analysis. Call this tool after completing the risk assessment narrative to provide scores for database storage.',
  input_schema: {
    type: 'object' as const,
    required: ['compositeScore', 'recommendation', 'overallRiskRating', 'dimensionScores', 'executiveSummary'],
    properties: {
      compositeScore: {
        type: 'integer',
        minimum: 0,
        maximum: 100,
        description: 'Weighted average score across all dimensions (0-100)',
      },
      recommendation: {
        type: 'string',
        enum: ['approve', 'conditional', 'decline', 'more_info'],
        description: 'Overall recommendation based on scoring',
      },
      overallRiskRating: {
        type: 'string',
        enum: ['low', 'medium', 'high', 'critical'],
        description: 'Aggregate risk level',
      },
      executiveSummary: {
        type: 'string',
        description: 'Brief summary for leadership (2-3 sentences)',
      },
      keyFindings: {
        type: 'array',
        items: { type: 'string' },
        description: 'Top 3-5 key findings',
      },
      disqualifyingFactors: {
        type: 'array',
        items: { type: 'string' },
        description: 'Any factors that automatically fail the assessment',
      },
      dimensionScores: {
        type: 'array',
        items: {
          type: 'object',
          required: ['dimension', 'score', 'riskRating'],
          properties: {
            dimension: {
              type: 'string',
              enum: ALL_DIMENSIONS,
              description: 'Risk dimension name',
            },
            score: {
              type: 'integer',
              minimum: 0,
              maximum: 100,
              description: 'Dimension score (0-100)',
            },
            riskRating: {
              type: 'string',
              enum: ['low', 'medium', 'high', 'critical'],
              description: 'Risk rating for this dimension',
            },
            findings: {
              type: 'object',
              description: 'Optional detailed findings',
            },
          },
        },
        minItems: 10,
        maxItems: 10,
        description: 'Scores for all 10 risk dimensions',
      },
    },
  },
}

/**
 * TypeScript type derived from tool schema
 */
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
    findings?: object
  }>
}
