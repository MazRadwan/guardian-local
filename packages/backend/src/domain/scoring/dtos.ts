import { RiskRating, Recommendation } from './types'

/**
 * Domain DTO for extracted response (no Drizzle dependency)
 */
export interface ResponseDTO {
  id: string
  assessmentId: string
  batchId: string
  fileId?: string
  sectionNumber: number
  questionNumber: number
  questionText: string
  responseText: string
  confidence?: number
  hasVisualContent: boolean
  visualContentDescription?: string
  createdAt: Date
}

export interface CreateResponseDTO {
  assessmentId: string
  batchId: string
  fileId?: string
  sectionNumber: number
  questionNumber: number
  questionText: string
  responseText: string
  confidence?: number
  hasVisualContent?: boolean
  visualContentDescription?: string
}

/**
 * Domain DTO for dimension score
 */
export interface DimensionScoreDTO {
  id: string
  assessmentId: string
  batchId: string
  dimension: string
  score: number
  riskRating: RiskRating
  findings?: {
    subScores: Array<{ name: string; score: number; maxScore: number; notes: string }>
    keyRisks: string[]
    mitigations: string[]
    evidenceRefs: Array<{ sectionNumber: number; questionNumber: number; quote: string }>
  }
  createdAt: Date
}

export interface CreateDimensionScoreDTO {
  assessmentId: string
  batchId: string
  dimension: string
  score: number
  riskRating: RiskRating
  findings?: DimensionScoreDTO['findings']
}

/**
 * Domain DTO for assessment result
 */
export interface AssessmentResultDTO {
  id: string
  assessmentId: string
  batchId: string
  compositeScore: number
  recommendation: Recommendation
  overallRiskRating: RiskRating
  narrativeReport?: string
  executiveSummary?: string
  keyFindings?: string[]
  disqualifyingFactors?: string[]
  rubricVersion: string
  modelId: string
  rawToolPayload?: unknown
  scoredAt: Date
  scoringDurationMs?: number
}

export interface CreateAssessmentResultDTO {
  assessmentId: string
  batchId: string
  compositeScore: number
  recommendation: Recommendation
  overallRiskRating: RiskRating
  narrativeReport?: string
  executiveSummary?: string
  keyFindings?: string[]
  disqualifyingFactors?: string[]
  rubricVersion: string
  modelId: string
  rawToolPayload?: unknown
  scoringDurationMs?: number
}
