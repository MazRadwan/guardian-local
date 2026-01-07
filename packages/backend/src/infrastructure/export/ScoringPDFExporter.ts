import puppeteer, { Browser } from 'puppeteer';
import * as fs from 'fs/promises';
import { marked } from 'marked';
import DOMPurify from 'isomorphic-dompurify';
import { IScoringPDFExporter, ScoringExportData } from '../../application/interfaces/IScoringPDFExporter';
import { DIMENSION_CONFIG } from '../../domain/scoring/rubric';

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

    // Prepare dimension scores with labels
    const dimensionScoresWithLabels = payload.dimensionScores.map((d) => ({
      ...d,
      label: DIMENSION_CONFIG[d.dimension as keyof typeof DIMENSION_CONFIG]?.label || d.dimension,
    }));

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
      .replace(/{{assessmentId}}/g, report.assessmentId)
      .replace(/{{compositeScore}}/g, payload.compositeScore.toString())
      .replace(/{{recommendation}}/g, payload.recommendation)
      .replace(/{{recommendationLabel}}/g, recommendationLabels[payload.recommendation])
      .replace(/{{overallRiskRating}}/g, payload.overallRiskRating.toUpperCase())
      .replace(/{{executiveSummary}}/g, this.escapeHtml(payload.executiveSummary))
      .replace(/{{narrativeReport}}/g, this.renderMarkdown(narrativeReport))
      .replace(/{{rubricVersion}}/g, rubricVersion)
      .replace(/{{batchId}}/g, batchId);

    // Render key findings
    const findingsHtml = payload.keyFindings
      .map((f) => `<li>${this.escapeHtml(f)}</li>`)
      .join('\n');
    html = html.replace(/{{#keyFindings}}[\s\S]*?{{\/keyFindings}}/, findingsHtml);

    // Render dimension scores
    const dimensionsHtml = dimensionScoresWithLabels
      .map((d) => `
        <tr>
          <td>${this.escapeHtml(d.label)}</td>
          <td>${d.score}/100</td>
          <td><span class="risk-badge ${d.riskRating}">${d.riskRating}</span></td>
          <td>
            <div class="score-bar">
              <div class="score-bar-fill risk-${d.riskRating}" style="width: ${d.score}%"></div>
            </div>
          </td>
        </tr>
      `)
      .join('\n');
    html = html.replace(/{{#dimensionScores}}[\s\S]*?{{\/dimensionScores}}/, dimensionsHtml);

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
