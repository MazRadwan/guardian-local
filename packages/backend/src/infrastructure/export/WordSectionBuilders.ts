/**
 * Word Document Section Builders
 *
 * Extracted from ScoringWordExporter.ts (Story 38.1.2).
 * Pure functions that build individual Word document sections.
 */

import {
  Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell,
  WidthType, BorderStyle, AlignmentType, ShadingType,
  convertInchesToTwip,
} from 'docx';
import { ScoringExportData } from '../../application/interfaces/IScoringPDFExporter';
import { DIMENSION_CONFIG } from '../../domain/scoring/rubric';

// Risk level color schemes
export const RISK_COLORS = {
  low: { background: 'DCFCE7', text: '166534' },
  medium: { background: 'FEF3C7', text: '92400E' },
  high: { background: 'FFEDD5', text: 'C2410C' },
  critical: { background: 'FEE2E2', text: '991B1B' },
};

export const RECOMMENDATION_COLORS = {
  approve: { background: 'DCFCE7', text: '166534' },
  conditional: { background: 'FEF3C7', text: '92400E' },
  decline: { background: 'FEE2E2', text: '991B1B' },
  more_info: { background: 'DBEAFE', text: '1E40AF' },
};

export const BRAND_COLOR = '7C3AED'; // Purple

export function createHeader(data: ScoringExportData): Paragraph[] {
  return [
    new Paragraph({
      children: [
        new TextRun({
          text: 'Guardian Risk Assessment Report',
          bold: true,
          size: 48,
          color: BRAND_COLOR,
        }),
      ],
      spacing: { after: 200 },
      border: {
        bottom: { color: BRAND_COLOR, size: 24, style: BorderStyle.SINGLE },
      },
    }),
    new Paragraph({
      children: [
        new TextRun({ text: 'Vendor: ', bold: true, size: 24 }),
        new TextRun({ text: data.vendorName, size: 24 }),
        new TextRun({ text: '  |  ', size: 24, color: '9CA3AF' }),
        new TextRun({ text: 'Solution: ', bold: true, size: 24 }),
        new TextRun({ text: data.solutionName, size: 24 }),
        new TextRun({ text: '  |  ', size: 24, color: '9CA3AF' }),
        new TextRun({ text: 'Date: ', bold: true, size: 24 }),
        new TextRun({ text: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }), size: 24 }),
      ],
      spacing: { after: 100 },
    }),
    new Paragraph({
      children: [
        new TextRun({ text: 'Assessment ID: ', bold: true, size: 20, color: '6B7280' }),
        new TextRun({ text: data.report.assessmentId, font: 'Courier New', size: 20, color: '6B7280' }),
      ],
      spacing: { after: 400 },
    }),
  ];
}

export function createScoreBanner(data: ScoringExportData): Paragraph[] {
  const { payload } = data.report;
  const recommendationLabels: Record<string, string> = {
    approve: 'APPROVED',
    conditional: 'CONDITIONAL APPROVAL',
    decline: 'DECLINED',
    more_info: 'MORE INFO NEEDED',
  };

  const recColors = RECOMMENDATION_COLORS[payload.recommendation as keyof typeof RECOMMENDATION_COLORS] || RECOMMENDATION_COLORS.more_info;
  const riskColors = RISK_COLORS[payload.overallRiskRating as keyof typeof RISK_COLORS] || RISK_COLORS.medium;

  return [
    // Score and recommendation on same line
    new Paragraph({
      children: [
        new TextRun({ text: `${payload.compositeScore}`, bold: true, size: 72, color: BRAND_COLOR }),
        new TextRun({ text: '/100', size: 36, color: '6B7280' }),
        new TextRun({ text: '     ' }),
        new TextRun({
          text: ` ${recommendationLabels[payload.recommendation]} `,
          bold: true,
          size: 28,
          color: recColors.text,
          shading: { type: ShadingType.CLEAR, fill: recColors.background },
        }),
      ],
      spacing: { after: 100 },
      shading: { type: ShadingType.CLEAR, fill: 'F5F3FF' },
    }),
    new Paragraph({
      children: [
        new TextRun({ text: 'Composite Score', size: 20, color: '6B7280' }),
        new TextRun({ text: '          ' }),
        new TextRun({ text: 'Overall Risk: ', size: 24, color: '6B7280' }),
        new TextRun({
          text: ` ${payload.overallRiskRating.toUpperCase()} `,
          bold: true,
          size: 24,
          color: riskColors.text,
          shading: { type: ShadingType.CLEAR, fill: riskColors.background },
        }),
      ],
      spacing: { after: 400 },
      shading: { type: ShadingType.CLEAR, fill: 'F5F3FF' },
    }),
  ];
}

export function createExecutiveSummary(data: ScoringExportData): Paragraph[] {
  return [
    new Paragraph({
      text: 'Executive Summary',
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 200, after: 100 },
      border: { bottom: { color: 'E5E7EB', size: 6, style: BorderStyle.SINGLE } },
    }),
    new Paragraph({
      children: [new TextRun({ text: data.report.payload.executiveSummary, size: 24 })],
      spacing: { after: 400 },
      shading: { type: ShadingType.CLEAR, fill: 'F9FAFB' },
    }),
  ];
}

export function createKeyFindings(data: ScoringExportData): Paragraph[] {
  const { keyFindings } = data.report.payload;
  return [
    new Paragraph({
      text: 'Key Findings',
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 200, after: 100 },
      border: { bottom: { color: 'E5E7EB', size: 6, style: BorderStyle.SINGLE } },
    }),
    ...keyFindings.map((f) => new Paragraph({
      children: [
        new TextRun({ text: '\u2022 ', color: 'F59E0B', bold: true, size: 24 }),
        new TextRun({ text: f, size: 24 }),
      ],
      spacing: { after: 100 },
      indent: { left: convertInchesToTwip(0.25) },
    })),
    new Paragraph({ spacing: { after: 200 } }),
  ];
}

export function createDimensionTable(data: ScoringExportData): (Paragraph | Table)[] {
  const { dimensionScores } = data.report.payload;

  const headerRow = new TableRow({
    tableHeader: true,
    children: ['Dimension', 'Score', 'Rating'].map((text) =>
      new TableCell({
        children: [new Paragraph({
          children: [new TextRun({ text, bold: true, color: 'FFFFFF', size: 22 })],
          alignment: AlignmentType.CENTER,
        })],
        shading: { type: ShadingType.CLEAR, fill: BRAND_COLOR },
        verticalAlign: 'center',
      })
    ),
  });

  const dataRows = dimensionScores.map((d, index) => {
    const riskColors = RISK_COLORS[d.riskRating as keyof typeof RISK_COLORS] || RISK_COLORS.medium;
    const isEven = index % 2 === 0;

    return new TableRow({
      children: [
        new TableCell({
          children: [new Paragraph({
            children: [new TextRun({
              text: DIMENSION_CONFIG[d.dimension as keyof typeof DIMENSION_CONFIG]?.label || d.dimension,
              size: 22,
            })],
          })],
          shading: { type: ShadingType.CLEAR, fill: isEven ? 'FFFFFF' : 'F9FAFB' },
        }),
        new TableCell({
          children: [new Paragraph({
            children: [new TextRun({ text: `${d.score}/100`, size: 22 })],
            alignment: AlignmentType.CENTER,
          })],
          shading: { type: ShadingType.CLEAR, fill: isEven ? 'FFFFFF' : 'F9FAFB' },
        }),
        new TableCell({
          children: [new Paragraph({
            children: [new TextRun({
              text: d.riskRating.toUpperCase(),
              bold: true,
              size: 20,
              color: riskColors.text,
            })],
            alignment: AlignmentType.CENTER,
          })],
          shading: { type: ShadingType.CLEAR, fill: riskColors.background },
        }),
      ],
    });
  });

  return [
    new Paragraph({
      text: 'Dimension Scores',
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 200, after: 150 },
      border: { bottom: { color: 'E5E7EB', size: 6, style: BorderStyle.SINGLE } },
    }),
    new Table({
      rows: [headerRow, ...dataRows],
      width: { size: 100, type: WidthType.PERCENTAGE },
    }),
    new Paragraph({ spacing: { after: 400 } }),
  ];
}

// Re-export narrative functions for backward compatibility
export { createNarrativeReport, parseInlineFormatting } from './WordNarrativeParser';
