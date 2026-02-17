/**
 * Word Document ISO Section Builders
 *
 * Builds ISO Standards Alignment section for Word exports.
 * Extracted to its own file to keep WordSectionBuilders.ts under 300 LOC.
 * Mirrors ScoringPDFExporter.buildISOAlignmentSection() but uses docx library.
 */

import {
  Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell,
  WidthType, BorderStyle, AlignmentType, ShadingType, PageBreak,
} from 'docx';
import { ScoringExportData } from '../../application/interfaces/IScoringPDFExporter';
import { BRAND_COLOR } from './WordSectionBuilders';

/** Worst-case precedence: lower number = worse status (shown first in dedup). */
const STATUS_PRECEDENCE: Record<string, number> = {
  not_evidenced: 0,
  partial: 1,
  not_applicable: 2,
  aligned: 3,
};

/** Status display colors for ISO clause alignment. */
const STATUS_COLORS: Record<string, { background: string; text: string }> = {
  aligned: { background: 'DCFCE7', text: '166534' },
  partial: { background: 'FEF3C7', text: '92400E' },
  not_evidenced: { background: 'FEE2E2', text: '991B1B' },
  not_applicable: { background: 'F3F4F6', text: '6B7280' },
};

interface DedupedClause {
  clauseRef: string;
  title: string;
  framework: string;
  status: string;
  dimensions: string[];
}

/**
 * Create ISO Standards Alignment section for Word export.
 * Lists all ISO clauses referenced across dimensions with status.
 * Returns empty array if no ISO clauses exist.
 */
export function createISOAlignmentSection(data: ScoringExportData): (Paragraph | Table)[] {
  const clauseMap = new Map<string, DedupedClause>();

  for (const dim of data.dimensionISOData) {
    for (const ref of dim.isoClauseReferences) {
      const dedupKey = `${ref.framework}::${ref.clauseRef}`;
      const existing = clauseMap.get(dedupKey);
      if (existing) {
        if (!existing.dimensions.includes(dim.label)) {
          existing.dimensions.push(dim.label);
        }
        // Keep worst-case status across dimensions
        const existingPrecedence = STATUS_PRECEDENCE[existing.status] ?? 3;
        const newPrecedence = STATUS_PRECEDENCE[ref.status] ?? 3;
        if (newPrecedence < existingPrecedence) {
          existing.status = ref.status;
        }
      } else {
        clauseMap.set(dedupKey, {
          clauseRef: ref.clauseRef, title: ref.title,
          framework: ref.framework, status: ref.status, dimensions: [dim.label],
        });
      }
    }
  }

  if (clauseMap.size === 0) return [];

  const elements: (Paragraph | Table)[] = [
    new Paragraph({ children: [new PageBreak()] }),
    new Paragraph({
      text: 'ISO Standards Alignment',
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 200, after: 150 },
      border: { bottom: { color: '374151', size: 6, style: BorderStyle.SINGLE } },
    }),
  ];

  // Group by framework
  const byFramework = new Map<string, DedupedClause[]>();
  for (const [, clause] of clauseMap) {
    const list = byFramework.get(clause.framework) ?? [];
    list.push(clause);
    byFramework.set(clause.framework, list);
  }

  for (const [framework, clauses] of byFramework) {
    // Framework label
    elements.push(new Paragraph({
      children: [new TextRun({ text: framework, bold: true, size: 24, color: BRAND_COLOR })],
      spacing: { before: 200, after: 100 },
    }));

    // Table header
    const headerRow = new TableRow({
      tableHeader: true,
      children: ['Clause', 'Title', 'Status', 'Dimensions'].map((text) =>
        new TableCell({
          children: [new Paragraph({
            children: [new TextRun({ text, bold: true, color: 'FFFFFF', size: 20 })],
            alignment: AlignmentType.CENTER,
          })],
          shading: { type: ShadingType.CLEAR, fill: '374151' },
          verticalAlign: 'center',
        })
      ),
    });

    // Data rows sorted by clauseRef
    const sortedClauses = clauses.sort((a, b) => a.clauseRef.localeCompare(b.clauseRef));
    const dataRows = sortedClauses.map((clause, index) => {
      const isEven = index % 2 === 0;
      const statusColors = STATUS_COLORS[clause.status] || STATUS_COLORS.not_applicable;
      const statusLabel = clause.status.replace(/_/g, ' ').toUpperCase();

      return new TableRow({
        children: [
          new TableCell({
            children: [new Paragraph({
              children: [new TextRun({ text: clause.clauseRef, bold: true, size: 20 })],
            })],
            shading: { type: ShadingType.CLEAR, fill: isEven ? 'FFFFFF' : 'F9FAFB' },
          }),
          new TableCell({
            children: [new Paragraph({
              children: [new TextRun({ text: clause.title, size: 20 })],
            })],
            shading: { type: ShadingType.CLEAR, fill: isEven ? 'FFFFFF' : 'F9FAFB' },
          }),
          new TableCell({
            children: [new Paragraph({
              children: [new TextRun({
                text: statusLabel, bold: true, size: 18, color: statusColors.text,
              })],
              alignment: AlignmentType.CENTER,
            })],
            shading: { type: ShadingType.CLEAR, fill: statusColors.background },
          }),
          new TableCell({
            children: [new Paragraph({
              children: [new TextRun({ text: clause.dimensions.join(', '), size: 20 })],
            })],
            shading: { type: ShadingType.CLEAR, fill: isEven ? 'FFFFFF' : 'F9FAFB' },
          }),
        ],
      });
    });

    elements.push(new Table({
      rows: [headerRow, ...dataRows],
      width: { size: 100, type: WidthType.PERCENTAGE },
    }));
  }

  elements.push(new Paragraph({ spacing: { after: 400 } }));
  return elements;
}
