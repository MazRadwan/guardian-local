import { ScoringReportData } from '../../domain/scoring/types';

export interface ScoringExportData {
  report: ScoringReportData;
  vendorName: string;
  solutionName: string;
  assessmentType: string;
  generatedAt: Date;
}

export interface IScoringPDFExporter {
  generatePDF(data: ScoringExportData): Promise<Buffer>;
}
