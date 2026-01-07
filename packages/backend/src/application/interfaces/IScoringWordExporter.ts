import { ScoringExportData } from './IScoringPDFExporter';

export interface IScoringWordExporter {
  generateWord(data: ScoringExportData): Promise<Buffer>;
}
