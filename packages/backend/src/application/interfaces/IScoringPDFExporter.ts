import { ScoringReportData } from '../../domain/scoring/types';
import type { AssessmentConfidence, ISOClauseReference } from '../../domain/compliance/types.js';

/**
 * Per-dimension ISO export data, flattened for template rendering.
 * Populated from DimensionScoreData.findings JSONB.
 */
export interface DimensionExportISOData {
  /** Dimension key (e.g., 'regulatory_compliance') */
  dimension: string;
  /** Dimension display label (e.g., 'Regulatory Compliance') */
  label: string;
  /** Assessment confidence for this dimension (H/M/L + rationale) */
  confidence: AssessmentConfidence | null;
  /** ISO clause references for this dimension */
  isoClauseReferences: ISOClauseReference[];
  /** True if this is a Guardian-native dimension (no ISO mapping) */
  isGuardianNative: boolean;
}

export interface ScoringExportData {
  report: ScoringReportData;
  vendorName: string;
  solutionName: string;
  assessmentType: string;
  generatedAt: Date;
  /** Per-dimension ISO enrichment data for export templates */
  dimensionISOData: DimensionExportISOData[];
}

export interface IScoringPDFExporter {
  generatePDF(data: ScoringExportData): Promise<Buffer>;
}
