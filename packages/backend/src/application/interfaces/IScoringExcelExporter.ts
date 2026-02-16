import { ScoringExportData } from './IScoringPDFExporter';

export interface IScoringExcelExporter {
  generateExcel(data: ScoringExportData): Promise<Buffer>;
}
