export type ScoringStatus =
  | 'idle'
  | 'uploading'
  | 'parsing'
  | 'scoring'
  | 'validating'
  | 'complete'
  | 'error';

export interface ScoringProgressEvent {
  status: ScoringStatus;
  message: string;
  progress?: number;
  error?: string;
}

export type DocumentWarning =
  | 'docx_screenshots'
  | 'scanned_pdf'
  | 'no_assessment_id'
  | 'legacy_export';

export const WARNING_MESSAGES: Record<DocumentWarning, string> = {
  docx_screenshots: 'Note: Screenshots in Word documents won\'t be analyzed. For best results, upload as PDF.',
  scanned_pdf: 'This appears to be a scanned document. Please upload a text-based PDF or the original Word file.',
  no_assessment_id: 'I couldn\'t find a Guardian Assessment ID in this document. Please upload a questionnaire exported from Guardian.',
  legacy_export: 'This questionnaire was exported before Assessment ID tracking. Please generate a new questionnaire or re-export.',
};

// Scoring result types (Story 4.2)
export type RiskRating = 'low' | 'medium' | 'high' | 'critical';
export type Recommendation = 'approve' | 'conditional' | 'decline' | 'more_info';

// ISO enrichment types (mirrors backend domain/compliance/types.ts)
export type AssessmentConfidenceLevel = 'high' | 'medium' | 'low';

export interface AssessmentConfidence {
  level: AssessmentConfidenceLevel;
  rationale: string;
}

export interface ISOClauseReference {
  clauseRef: string;
  title: string;
  framework: string;
  status: 'aligned' | 'partial' | 'not_evidenced' | 'not_applicable';
}

export interface DimensionScoreData {
  dimension: string;
  score: number;
  riskRating: RiskRating;
  findings?: {
    subScores?: Array<{
      name: string;
      score: number;
      maxScore: number;
      notes: string;
    }>;
    keyRisks?: string[];
    mitigations?: string[];
    evidenceRefs?: Array<{
      sectionNumber: number;
      questionNumber: number;
      quote: string;
    }>;
    // ISO enrichment (Epic 37/38)
    assessmentConfidence?: AssessmentConfidence;
    isoClauseReferences?: ISOClauseReference[];
  };
}

export interface ScoringResultData {
  compositeScore: number;
  recommendation: Recommendation;
  overallRiskRating: RiskRating;
  executiveSummary: string;
  keyFindings: string[];
  dimensionScores: DimensionScoreData[];
  batchId: string;
  assessmentId: string;
}
