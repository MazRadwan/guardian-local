import puppeteer, { Browser } from 'puppeteer';
import * as fs from 'fs/promises';
import { marked } from 'marked';
import DOMPurify from 'isomorphic-dompurify';
import { DimensionExportISOData, IScoringPDFExporter, ScoringExportData } from '../../application/interfaces/IScoringPDFExporter';
import { DIMENSION_CONFIG } from '../../domain/scoring/rubric';
import { ISO_DISCLAIMER } from '../../domain/compliance/isoMessagingTerms.js';

/** Worst-case precedence: lower number = worse status (shown first in dedup). */
const STATUS_PRECEDENCE: Record<string, number> = {
  not_evidenced: 0,
  partial: 1,
  not_applicable: 2,
  aligned: 3,
};

export class ScoringPDFExporter implements IScoringPDFExporter {
  constructor(private templatePath: string) {
    if (!templatePath) {
      throw new Error('ScoringPDFExporter requires templatePath');
    }
  }

  async generatePDF(data: ScoringExportData): Promise<Buffer> {
    const template = await fs.readFile(this.templatePath, 'utf-8');
    const html = this.renderTemplate(template, data);
    return await this.htmlToPDF(html);
  }

  private renderTemplate(template: string, data: ScoringExportData): string {
    const { report, vendorName, solutionName, generatedAt } = data;
    const { payload, narrativeReport, rubricVersion, batchId } = report;

    // Prepare dimension scores with labels and ISO data
    const dimensionScoresWithLabels = payload.dimensionScores.map((d) => {
      const isoData = data.dimensionISOData.find((iso) => iso.dimension === d.dimension);
      const baseLabel = DIMENSION_CONFIG[d.dimension as keyof typeof DIMENSION_CONFIG]?.label || d.dimension;

      // Build confidence badge HTML
      let confidenceHtml = '<span class="no-data">--</span>';
      if (isoData?.confidence) {
        const lvl = isoData.confidence.level;
        confidenceHtml = `<span class="confidence-badge ${lvl}">${lvl.toUpperCase()}</span>`;
      }

      // Build ISO ref count HTML
      let isoRefHtml = '<span class="no-data">--</span>';
      if (isoData && !isoData.isGuardianNative && isoData.isoClauseReferences.length > 0) {
        const count = isoData.isoClauseReferences.length;
        isoRefHtml = `<span class="iso-ref-count">${count} clause${count !== 1 ? 's' : ''}</span>`;
      }

      // Build label with optional Guardian-native indicator
      const labelHtml = isoData?.isGuardianNative
        ? `${this.escapeHtml(baseLabel)}<span class="guardian-native-label">Guardian Healthcare-Specific</span>`
        : this.escapeHtml(baseLabel);

      return {
        ...d,
        label: labelHtml,
        confidenceHtml,
        isoRefHtml,
      };
    });

    // Recommendation labels
    const recommendationLabels: Record<string, string> = {
      approve: 'Approved',
      conditional: 'Conditional Approval',
      decline: 'Declined',
      more_info: 'More Information Needed',
    };

    let html = template
      .replace(/{{vendorName}}/g, this.escapeHtml(vendorName))
      .replace(/{{solutionName}}/g, this.escapeHtml(solutionName))
      .replace(/{{generatedAt}}/g, this.formatDate(generatedAt))
      .replace(/{{assessmentId}}/g, this.escapeHtml(report.assessmentId))
      .replace(/{{compositeScore}}/g, payload.compositeScore.toString())
      .replace(/{{recommendation}}/g, payload.recommendation)
      .replace(/{{recommendationLabel}}/g, recommendationLabels[payload.recommendation])
      .replace(/{{overallRiskRating}}/g, payload.overallRiskRating.toUpperCase())
      .replace(/{{executiveSummary}}/g, this.escapeHtml(payload.executiveSummary))
      .replace(/{{narrativeReport}}/g, this.renderMarkdown(narrativeReport))
      .replace(/{{rubricVersion}}/g, this.escapeHtml(rubricVersion))
      .replace(/{{batchId}}/g, this.escapeHtml(batchId));

    // Render key findings
    const findingsHtml = payload.keyFindings
      .map((f) => `<li>${this.escapeHtml(f)}</li>`)
      .join('\n');
    html = html.replace(/{{#keyFindings}}[\s\S]*?{{\/keyFindings}}/, findingsHtml);

    // Render dimension scores
    const dimensionsHtml = dimensionScoresWithLabels
      .map((d) => `
        <tr>
          <td>${d.label}</td>
          <td>${d.score}/100</td>
          <td><span class="risk-badge ${d.riskRating}">${d.riskRating}</span></td>
          <td>${d.confidenceHtml}</td>
          <td>${d.isoRefHtml}</td>
          <td>
            <div class="score-bar">
              <div class="score-bar-fill risk-${d.riskRating}" style="width: ${d.score}%"></div>
            </div>
          </td>
        </tr>
      `)
      .join('\n');
    html = html.replace(/{{#dimensionScores}}[\s\S]*?{{\/dimensionScores}}/, dimensionsHtml);

    // Render ISO alignment section
    const isoAlignmentHtml = this.buildISOAlignmentSection(data.dimensionISOData);
    html = html.replace('{{{isoAlignmentSection}}}', isoAlignmentHtml);

    // Inject ISO disclaimer (escaped for defense-in-depth)
    html = html.replace(/{{isoDisclaimer}}/g, this.escapeHtml(ISO_DISCLAIMER));

    return html;
  }

  private async htmlToPDF(html: string): Promise<Buffer> {
    let browser: Browser | null = null;
    try {
      browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0' });
      const pdf = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '20mm', right: '15mm', bottom: '20mm', left: '15mm' },
      });
      return Buffer.from(pdf);
    } finally {
      if (browser) await browser.close();
    }
  }

  private buildISOAlignmentSection(isoData: DimensionExportISOData[]): string {
    // Collect all unique clauses across dimensions (dedup by framework::clauseRef)
    const clauseMap = new Map<string, {
      clauseRef: string; title: string; framework: string; status: string; dimensions: string[];
    }>();

    for (const dim of isoData) {
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

    if (clauseMap.size === 0) return '';

    // Group by framework
    const byFramework = new Map<string, Array<{ clauseRef: string; title: string; framework: string; status: string; dimensions: string[] }>>();
    for (const [, clause] of clauseMap) {
      const list = byFramework.get(clause.framework) ?? [];
      list.push(clause);
      byFramework.set(clause.framework, list);
    }

    let html = '<div class="section page-break">\n<h2>ISO Standards Alignment</h2>\n';
    for (const [framework, clauses] of byFramework) {
      html += `<p class="framework-label">${this.escapeHtml(framework)}</p>\n`;
      html += '<table class="iso-alignment-table">\n';
      html += '<thead><tr><th>Clause</th><th>Title</th><th>Status</th><th>Dimensions</th></tr></thead>\n';
      html += '<tbody>\n';
      for (const clause of clauses.sort((a, b) => a.clauseRef.localeCompare(b.clauseRef))) {
        const statusClass = clause.status.replace(/ /g, '_');
        const statusLabel = clause.status.replace(/_/g, ' ').toUpperCase();
        html += `<tr>`;
        html += `<td><strong>${this.escapeHtml(clause.clauseRef)}</strong></td>`;
        html += `<td>${this.escapeHtml(clause.title)}</td>`;
        html += `<td><span class="iso-status ${statusClass}">${statusLabel}</span></td>`;
        html += `<td>${clause.dimensions.map((d) => this.escapeHtml(d)).join(', ')}</td>`;
        html += `</tr>\n`;
      }
      html += '</tbody></table>\n';
    }
    html += '</div>\n';
    return html;
  }

  private escapeHtml(text: string): string {
    const map: Record<string, string> = {
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
    };
    return text.replace(/[&<>"']/g, (m) => map[m]);
  }

  private formatDate(date: Date): string {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric', month: 'long', day: 'numeric',
    });
  }

  /**
   * Safely render markdown to HTML
   *
   * SECURITY: Uses marked for parsing and DOMPurify for sanitization.
   * Never trust LLM output - always sanitize before rendering.
   */
  private renderMarkdown(markdown: string): string {
    // Use marked for proper markdown parsing
    const rawHtml = marked.parse(markdown, {
      breaks: true,
      gfm: true, // GitHub Flavored Markdown
    });

    // Sanitize HTML to prevent XSS
    // Allow safe tags for formatting but strip scripts, event handlers, etc.
    const sanitizedHtml = DOMPurify.sanitize(rawHtml, {
      ALLOWED_TAGS: [
        'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        'p', 'br', 'hr',
        'ul', 'ol', 'li',
        'strong', 'em', 'b', 'i', 'u',
        'code', 'pre', 'blockquote',
        'table', 'thead', 'tbody', 'tr', 'th', 'td',
        'a', 'span', 'div',
      ],
      ALLOWED_ATTR: ['href', 'class', 'id'],
      ALLOW_DATA_ATTR: false,
    });

    return sanitizedHtml;
  }
}
