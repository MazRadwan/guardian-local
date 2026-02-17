/**
 * Scoring Excel Exporter
 *
 * Generates Excel (.xlsx) workbooks for scoring reports with:
 * - Scoring Summary sheet (dimension scores, confidence, ISO refs)
 * - ISO Control Mapping sheet (per clause-dimension pair, conditional)
 *
 * Epic 38 Sprint 5: Created for ISO-enriched Excel export
 */

import ExcelJS from 'exceljs';
import { IScoringExcelExporter } from '../../application/interfaces/IScoringExcelExporter';
import { ScoringExportData, DimensionExportISOData } from '../../application/interfaces/IScoringPDFExporter';
import { DIMENSION_CONFIG } from '../../domain/scoring/rubric';
import { ISO_DISCLAIMER } from '../../domain/compliance/isoMessagingTerms';

const BRAND_COLOR = 'FF7C3AED';
const ISO_HEADER_COLOR = 'FF374151';

const CONFIDENCE_COLORS: Record<string, { bg: string; text: string }> = {
  high: { bg: 'FFDCFCE7', text: 'FF166534' },
  medium: { bg: 'FFFEF3C7', text: 'FF92400E' },
  low: { bg: 'FFFEE2E2', text: 'FF991B1B' },
};

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  aligned: { bg: 'FFDCFCE7', text: 'FF166534' },
  partial: { bg: 'FFFEF3C7', text: 'FF92400E' },
  not_evidenced: { bg: 'FFFEE2E2', text: 'FF991B1B' },
  not_applicable: { bg: 'FFF3F4F6', text: 'FF6B7280' },
};

export class ScoringExcelExporter implements IScoringExcelExporter {
  async generateExcel(data: ScoringExportData): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Guardian AI Vendor Assessment System';
    workbook.created = new Date();

    this.addScoringSummarySheet(workbook, data);

    // Add ISO Control Mapping sheet if any dimension has ISO clause references
    if (data.dimensionISOData.some((d) => d.isoClauseReferences.length > 0)) {
      this.addISOControlMappingSheet(workbook, data);
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  private addScoringSummarySheet(workbook: ExcelJS.Workbook, data: ScoringExportData): void {
    const ws = workbook.addWorksheet('Scoring Summary', {
      properties: { defaultRowHeight: 22 },
    });

    // Title row
    ws.mergeCells('A1:E1');
    const titleCell = ws.getCell('A1');
    titleCell.value = 'Guardian Risk Assessment - Scoring Report';
    titleCell.font = { size: 16, bold: true, color: { argb: BRAND_COLOR } };
    titleCell.alignment = { horizontal: 'center' };
    ws.getRow(1).height = 30;

    // Metadata rows
    ws.getCell('A2').value = 'Vendor:';
    ws.getCell('B2').value = data.vendorName;
    ws.getCell('C2').value = 'Solution:';
    ws.getCell('D2').value = data.solutionName;
    ws.getCell('A3').value = 'Composite Score:';
    ws.getCell('B3').value = data.report.payload.compositeScore;
    ws.getCell('C3').value = 'Recommendation:';
    ws.getCell('D3').value = data.report.payload.recommendation.toUpperCase();
    ws.getCell('A4').value = 'Overall Risk:';
    ws.getCell('B4').value = data.report.payload.overallRiskRating.toUpperCase();
    ws.getCell('C4').value = 'Date:';
    ws.getCell('D4').value = data.generatedAt.toLocaleDateString('en-US', {
      year: 'numeric', month: 'long', day: 'numeric',
    });

    // Style metadata labels
    for (let row = 2; row <= 4; row++) {
      ws.getCell(`A${row}`).font = { bold: true };
      ws.getCell(`C${row}`).font = { bold: true };
    }

    // Blank row
    ws.addRow([]);

    // Column widths
    ws.columns = [
      { key: 'dimension', width: 30 },
      { key: 'score', width: 12 },
      { key: 'rating', width: 12 },
      { key: 'confidence', width: 15 },
      { key: 'isoRefs', width: 20 },
    ];

    // Table header
    const headerRow = ws.addRow(['Dimension', 'Score', 'Rating', 'Confidence', 'ISO Refs']);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND_COLOR } };
    headerRow.alignment = { vertical: 'middle' };
    headerRow.height = 25;
    ws.views = [{ state: 'frozen', ySplit: headerRow.number }];

    // Data rows
    for (const d of data.report.payload.dimensionScores) {
      const isoData = data.dimensionISOData.find((iso) => iso.dimension === d.dimension);
      const label = DIMENSION_CONFIG[d.dimension as keyof typeof DIMENSION_CONFIG]?.label || d.dimension;
      const confidence = isoData?.confidence?.level?.toUpperCase() || '--';
      const isoRefs = this.formatISORefsCell(isoData);

      const row = ws.addRow([label, d.score, d.riskRating.toUpperCase(), confidence, isoRefs]);

      // Conditional formatting for confidence
      if (isoData?.confidence) {
        const colors = CONFIDENCE_COLORS[isoData.confidence.level];
        if (colors) {
          row.getCell(4).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.bg } };
          row.getCell(4).font = { bold: true, color: { argb: colors.text } };
        }
      }
    }

    // Footer with disclaimer
    ws.addRow([]);
    const footerRow = ws.addRow([ISO_DISCLAIMER]);
    ws.mergeCells(`A${footerRow.number}:E${footerRow.number}`);
    footerRow.getCell(1).font = { italic: true, size: 9, color: { argb: 'FF9CA3AF' } };
  }

  private addISOControlMappingSheet(workbook: ExcelJS.Workbook, data: ScoringExportData): void {
    const ws = workbook.addWorksheet('ISO Control Mapping', {
      properties: { defaultRowHeight: 20 },
    });

    // Title
    ws.mergeCells('A1:F1');
    const titleCell = ws.getCell('A1');
    titleCell.value = 'ISO Control Mapping - Assessment Traceability';
    titleCell.font = { size: 14, bold: true, color: { argb: ISO_HEADER_COLOR } };
    ws.getRow(1).height = 28;

    // Column widths
    ws.columns = [
      { key: 'framework', width: 18 },
      { key: 'clause', width: 12 },
      { key: 'title', width: 40 },
      { key: 'dimension', width: 25 },
      { key: 'status', width: 18 },
      { key: 'confidence', width: 15 },
    ];

    // Header row
    ws.addRow([]);
    const headerRow = ws.addRow(['Framework', 'Clause', 'Title', 'Dimension', 'Status', 'Confidence']);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ISO_HEADER_COLOR } };
    headerRow.height = 25;
    ws.views = [{ state: 'frozen', ySplit: headerRow.number }];

    // Data rows: one per clause-dimension pair
    for (const dim of data.dimensionISOData) {
      if (dim.isGuardianNative) continue;

      for (const ref of dim.isoClauseReferences) {
        const row = ws.addRow([
          ref.framework,
          ref.clauseRef,
          ref.title,
          dim.label,
          ref.status.replace(/_/g, ' ').toUpperCase(),
          dim.confidence?.level?.toUpperCase() || '--',
        ]);

        // Color-code status cell
        const statusColors = STATUS_COLORS[ref.status];
        if (statusColors) {
          row.getCell(5).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: statusColors.bg } };
          row.getCell(5).font = { bold: true, color: { argb: statusColors.text } };
        }
      }
    }

    // Summary row
    ws.addRow([]);
    const totalClauses = data.dimensionISOData
      .filter((d) => !d.isGuardianNative)
      .reduce((sum, d) => sum + d.isoClauseReferences.length, 0);
    const summaryRow = ws.addRow([`Total: ${totalClauses} clause-dimension mappings`]);
    ws.mergeCells(`A${summaryRow.number}:F${summaryRow.number}`);
    summaryRow.getCell(1).font = { italic: true, color: { argb: 'FF6B7280' } };
  }

  private formatISORefsCell(isoData: DimensionExportISOData | undefined): string {
    if (!isoData) return '--';
    if (isoData.isGuardianNative) return 'Guardian-Specific';
    if (isoData.isoClauseReferences.length > 0) {
      const count = isoData.isoClauseReferences.length;
      return `${count} clause${count !== 1 ? 's' : ''}`;
    }
    return '--';
  }
}
