/**
 * Domain types for scoring analysis
 *
 * Part of Epic 15: Questionnaire Scoring & Analysis
 */

import { RiskDimension } from '../types/QuestionnaireSchema'

/**
 * Risk rating levels
 */
export type RiskRating = 'low' | 'medium' | 'high' | 'critical'

/**
 * Recommendation outcomes
 */
export type Recommendation = 'approve' | 'conditional' | 'decline' | 'more_info'

/**
 * Per-dimension score with findings
 */
export interface DimensionScoreData {
  dimension: RiskDimension
  score: number // 0-100
  riskRating: RiskRating
  findings?: {
    subScores: Array<{
      name: string
      score: number
      maxScore: number
      notes: string
    }>
    keyRisks: string[]
    mitigations: string[]
    evidenceRefs: Array<{
      sectionNumber: number
      questionNumber: number
      quote: string
    }>
  }
}

/**
 * Payload from scoring_complete tool call
 */
export interface ScoringCompletePayload {
  compositeScore: number // 0-100
  recommendation: Recommendation
  overallRiskRating: RiskRating
  executiveSummary: string
  keyFindings: string[]
  disqualifyingFactors: string[]
  dimensionScores: DimensionScoreData[]
}

/**
 * Full scoring report data for storage/display
 */
export interface ScoringReportData {
  assessmentId: string
  batchId: string
  payload: ScoringCompletePayload
  narrativeReport: string // Streamed markdown from Claude
  rubricVersion: string
  modelId: string
  scoringDurationMs: number
}

/**
 * Scoring status for progress tracking
 */
export type ScoringStatus =
  | 'idle'
  | 'uploading'
  | 'parsing'
  | 'scoring'
  | 'validating'
  | 'complete'
  | 'error'

/**
 * Progress event emitted during scoring
 * Epic 18: Added fileId for tracking which file is being processed
 */
export interface ScoringProgressEvent {
  status: ScoringStatus
  message: string
  progress?: number // 0-100
  error?: string
  fileId?: string // Epic 18: Track file being processed
}
