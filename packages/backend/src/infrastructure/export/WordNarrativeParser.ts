/**
 * Word Document Narrative Report Parser
 *
 * Extracted from WordSectionBuilders.ts to comply with the 300 LOC limit.
 * Converts markdown narrative text into Word document paragraphs.
 */

import {
  Paragraph, TextRun, HeadingLevel, BorderStyle, ShadingType,
  convertInchesToTwip,
} from 'docx';
import { ScoringExportData } from '../../application/interfaces/IScoringPDFExporter';

// Duplicated from WordSectionBuilders to avoid circular dependency
// (WordSectionBuilders re-exports from this file)
const BRAND_COLOR = '7C3AED';

export function createNarrativeReport(data: ScoringExportData): Paragraph[] {
  const paragraphs: Paragraph[] = [
    new Paragraph({
      text: 'Detailed Analysis',
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 200, after: 150 },
      border: { bottom: { color: BRAND_COLOR, size: 12, style: BorderStyle.SINGLE } },
    }),
  ];

  // Parse markdown and convert to Word paragraphs
  const lines = data.report.narrativeReport.split('\n');
  let inList = false;

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed) {
      if (inList) {
        inList = false;
      }
      paragraphs.push(new Paragraph({ spacing: { after: 100 } }));
      continue;
    }

    // Handle headings
    if (trimmed.startsWith('## ')) {
      const headingText = trimmed.replace(/^## /, '').replace(/\*\*/g, '');
      paragraphs.push(new Paragraph({
        children: [new TextRun({ text: headingText, bold: true, size: 28, color: '374151' })],
        spacing: { before: 300, after: 150 },
        border: { bottom: { color: 'E5E7EB', size: 6, style: BorderStyle.SINGLE } },
      }));
      continue;
    }

    if (trimmed.startsWith('### ')) {
      const headingText = trimmed.replace(/^### /, '').replace(/\*\*/g, '');
      paragraphs.push(new Paragraph({
        children: [new TextRun({ text: headingText, bold: true, size: 24, color: '4B5563' })],
        spacing: { before: 200, after: 100 },
      }));
      continue;
    }

    // Handle horizontal rules
    if (trimmed === '---' || trimmed === '***' || trimmed === '___') {
      paragraphs.push(new Paragraph({
        spacing: { before: 200, after: 200 },
        border: { bottom: { color: 'E5E7EB', size: 6, style: BorderStyle.SINGLE } },
      }));
      continue;
    }

    // Handle bullet points
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      inList = true;
      const bulletText = trimmed.replace(/^[-*] /, '');
      paragraphs.push(new Paragraph({
        children: parseInlineFormatting(bulletText),
        bullet: { level: 0 },
        spacing: { after: 80 },
      }));
      continue;
    }

    // Handle numbered lists
    const numberedMatch = trimmed.match(/^(\d+)\. (.+)/);
    if (numberedMatch) {
      inList = true;
      paragraphs.push(new Paragraph({
        children: [
          new TextRun({ text: `${numberedMatch[1]}. `, bold: true, color: BRAND_COLOR, size: 24 }),
          ...parseInlineFormatting(numberedMatch[2]),
        ],
        spacing: { after: 80 },
        indent: { left: convertInchesToTwip(0.25) },
      }));
      continue;
    }

    // Handle table rows (basic markdown tables)
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      // Skip table separator rows
      if (trimmed.includes('---')) continue;

      const cells = trimmed.split('|').filter(c => c.trim()).map(c => c.trim());
      // Simple approach: render as tab-separated text
      paragraphs.push(new Paragraph({
        children: cells.flatMap((cell, i) => [
          new TextRun({ text: cell, size: 22 }),
          i < cells.length - 1 ? new TextRun({ text: '\t' }) : new TextRun({ text: '' }),
        ]),
        spacing: { after: 50 },
        shading: { type: ShadingType.CLEAR, fill: 'F9FAFB' },
      }));
      continue;
    }

    // Regular paragraph with inline formatting
    paragraphs.push(new Paragraph({
      children: parseInlineFormatting(trimmed),
      spacing: { after: 120 },
    }));
  }

  return paragraphs;
}

/**
 * Parse inline markdown formatting (bold, italic, code)
 */
export function parseInlineFormatting(text: string): TextRun[] {
  const runs: TextRun[] = [];

  // Simple regex-based parsing for **bold**, *italic*, `code`
  const patterns = [
    { regex: /\*\*([^*]+)\*\*/g, style: { bold: true } },
    { regex: /\*([^*]+)\*/g, style: { italics: true } },
    { regex: /`([^`]+)`/g, style: { font: 'Courier New', shading: { type: ShadingType.CLEAR, fill: 'F3F4F6' } } },
  ];

  // Find all matches and their positions
  const matches: Array<{ start: number; end: number; text: string; style: object }> = [];

  for (const pattern of patterns) {
    let match;
    const tempRegex = new RegExp(pattern.regex.source, 'g');
    while ((match = tempRegex.exec(text)) !== null) {
      matches.push({
        start: match.index,
        end: match.index + match[0].length,
        text: match[1],
        style: pattern.style,
      });
    }
  }

  // Sort matches by position
  matches.sort((a, b) => a.start - b.start);

  // Build runs
  let lastEnd = 0;
  for (const match of matches) {
    // Add text before match
    if (match.start > lastEnd) {
      runs.push(new TextRun({ text: text.slice(lastEnd, match.start), size: 24 }));
    }
    // Add formatted text
    runs.push(new TextRun({ text: match.text, size: 24, ...match.style }));
    lastEnd = match.end;
  }

  // Add remaining text
  if (lastEnd < text.length) {
    runs.push(new TextRun({ text: text.slice(lastEnd), size: 24 }));
  }

  // If no matches, just return the plain text
  if (runs.length === 0) {
    runs.push(new TextRun({ text, size: 24 }));
  }

  return runs;
}
