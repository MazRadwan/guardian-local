import {
  Document, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell,
  WidthType, BorderStyle, AlignmentType, Packer,
} from 'docx';
import { IScoringWordExporter } from '../../application/interfaces/IScoringWordExporter';
import { ScoringExportData } from '../../application/interfaces/IScoringPDFExporter';
import { DIMENSION_CONFIG } from '../../domain/scoring/rubric';

export class ScoringWordExporter implements IScoringWordExporter {
  async generateWord(data: ScoringExportData): Promise<Buffer> {
    const doc = new Document({
      sections: [{
        children: [
          ...this.createHeader(data),
          ...this.createScoreBanner(data),
          ...this.createExecutiveSummary(data),
          ...this.createKeyFindings(data),
          ...this.createDimensionTable(data),
          ...this.createNarrativeReport(data),
          ...this.createFooter(data),
        ],
      }],
    });

    return await Packer.toBuffer(doc);
  }

  private createHeader(data: ScoringExportData): Paragraph[] {
    return [
      new Paragraph({
        text: 'Guardian Risk Assessment Report',
        heading: HeadingLevel.TITLE,
        spacing: { after: 200 },
      }),
      new Paragraph({
        children: [
          new TextRun({ text: 'Vendor: ', bold: true }),
          new TextRun({ text: data.vendorName }),
          new TextRun({ text: '  |  ' }),
          new TextRun({ text: 'Solution: ', bold: true }),
          new TextRun({ text: data.solutionName }),
        ],
        spacing: { after: 100 },
      }),
      new Paragraph({
        children: [
          new TextRun({ text: 'Assessment ID: ', bold: true }),
          new TextRun({ text: data.report.assessmentId, font: 'Courier New' }),
        ],
        spacing: { after: 400 },
      }),
    ];
  }

  private createScoreBanner(data: ScoringExportData): Paragraph[] {
    const { payload } = data.report;
    const recommendationLabels: Record<string, string> = {
      approve: 'APPROVED', conditional: 'CONDITIONAL', decline: 'DECLINED', more_info: 'MORE INFO NEEDED',
    };

    return [
      new Paragraph({
        children: [
          new TextRun({ text: 'Composite Score: ', bold: true, size: 28 }),
          new TextRun({ text: `${payload.compositeScore}/100`, size: 28 }),
          new TextRun({ text: '     ' }),
          new TextRun({ text: `Recommendation: ${recommendationLabels[payload.recommendation]}`, bold: true, size: 28 }),
        ],
        spacing: { after: 100 },
      }),
      new Paragraph({
        children: [
          new TextRun({ text: `Overall Risk Rating: ${payload.overallRiskRating.toUpperCase()}` }),
        ],
        spacing: { after: 400 },
      }),
    ];
  }

  private createExecutiveSummary(data: ScoringExportData): Paragraph[] {
    return [
      new Paragraph({ text: 'Executive Summary', heading: HeadingLevel.HEADING_1, spacing: { before: 200, after: 100 } }),
      new Paragraph({ text: data.report.payload.executiveSummary, spacing: { after: 400 } }),
    ];
  }

  private createKeyFindings(data: ScoringExportData): Paragraph[] {
    const { keyFindings } = data.report.payload;
    return [
      new Paragraph({ text: 'Key Findings', heading: HeadingLevel.HEADING_1, spacing: { before: 200, after: 100 } }),
      ...keyFindings.map((f) => new Paragraph({ text: `• ${f}`, spacing: { after: 50 } })),
      new Paragraph({ spacing: { after: 400 } }),
    ];
  }

  private createDimensionTable(data: ScoringExportData): (Paragraph | Table)[] {
    const { dimensionScores } = data.report.payload;

    const rows = [
      new TableRow({
        children: ['Dimension', 'Score', 'Rating'].map((text) =>
          new TableCell({
            children: [new Paragraph({ text, alignment: AlignmentType.CENTER })],
            shading: { fill: 'f3f4f6' },
          })
        ),
      }),
      ...dimensionScores.map((d) =>
        new TableRow({
          children: [
            new TableCell({ children: [new Paragraph({ text: DIMENSION_CONFIG[d.dimension as keyof typeof DIMENSION_CONFIG]?.label || d.dimension })] }),
            new TableCell({ children: [new Paragraph({ text: `${d.score}/100`, alignment: AlignmentType.CENTER })] }),
            new TableCell({ children: [new Paragraph({ text: d.riskRating.toUpperCase(), alignment: AlignmentType.CENTER })] }),
          ],
        })
      ),
    ];

    return [
      new Paragraph({ text: 'Dimension Scores', heading: HeadingLevel.HEADING_1, spacing: { before: 200, after: 100 } }),
      new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE } }),
      new Paragraph({ spacing: { after: 400 } }),
    ];
  }

  private createNarrativeReport(data: ScoringExportData): Paragraph[] {
    const lines = data.report.narrativeReport.split('\n');
    return [
      new Paragraph({ text: 'Detailed Analysis', heading: HeadingLevel.HEADING_1, spacing: { before: 400, after: 100 } }),
      ...lines.map((line) => new Paragraph({ text: line, spacing: { after: 100 } })),
    ];
  }

  private createFooter(data: ScoringExportData): Paragraph[] {
    return [
      new Paragraph({ spacing: { before: 400 } }),
      new Paragraph({
        children: [
          new TextRun({ text: `Generated by Guardian | Rubric: ${data.report.rubricVersion} | Report ID: ${data.report.batchId}`, size: 18, color: '9ca3af' }),
        ],
        alignment: AlignmentType.CENTER,
      }),
    ];
  }
}
