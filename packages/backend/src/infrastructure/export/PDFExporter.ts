/**
 * PDF Exporter
 *
 * Generates PDF files from assessment questionnaires using Puppeteer
 */

import puppeteer, { Browser } from 'puppeteer'
import * as fs from 'fs/promises'
import * as path from 'path'
import {
  IPDFExporter,
  QuestionnaireData,
} from '../../application/interfaces/IPDFExporter'
import { Question } from '../../domain/entities/Question'

export class PDFExporter implements IPDFExporter {
  private templatePath: string

  /**
   * Creates a PDFExporter instance.
   *
   * @param templatePath - Absolute path to the HTML template file.
   *   In production (ESM), compute this from import.meta.url at the composition root.
   *   In tests, compute from process.cwd() or pass a known test fixture path.
   *
   * @throws Error if templatePath is not provided
   */
  constructor(templatePath: string) {
    if (!templatePath) {
      throw new Error(
        'PDFExporter requires templatePath. ' +
          'Compute it from import.meta.url at the composition root (src/index.ts).'
      )
    }
    this.templatePath = templatePath
  }

  /**
   * Generates PDF from questionnaire data
   */
  async generatePDF(data: QuestionnaireData): Promise<Buffer> {
    // Load HTML template
    const template = await this.loadTemplate()

    // Render template with data
    const html = await this.renderTemplate(template, data)

    // Convert HTML to PDF using Puppeteer
    const pdf = await this.htmlToPDF(html)

    return pdf
  }

  /**
   * Loads the HTML template
   */
  private async loadTemplate(): Promise<string> {
    try {
      return await fs.readFile(this.templatePath, 'utf-8')
    } catch (error) {
      throw new Error(
        `Failed to load PDF template: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
    }
  }

  /**
   * Renders template with data using simple string replacement
   * (Using Mustache-like syntax but implementing manually for simplicity)
   */
  private async renderTemplate(
    template: string,
    data: QuestionnaireData
  ): Promise<string> {
    const { assessment, vendor, questions } = data

    // Group questions by section
    const sections = this.groupQuestionsBySection(questions)

    // Replace simple variables
    let html = template
      .replace(/{{assessmentId}}/g, this.escapeHtml(assessment.id))
      .replace(/{{vendorName}}/g, this.escapeHtml(vendor.name))
      .replace(
        /{{assessmentType}}/g,
        this.escapeHtml(assessment.assessmentType)
      )
      .replace(
        /{{solutionName}}/g,
        this.escapeHtml(assessment.solutionName || 'N/A')
      )
      .replace(
        /{{createdAt}}/g,
        this.formatDate(assessment.createdAt)
      )
      .replace(/{{totalQuestions}}/g, questions.length.toString())

    // Render sections
    const sectionsHtml = sections
      .map((section, index) => this.renderSection(section, index === 0))
      .join('\n')

    // Replace sections placeholder
    html = html.replace(
      /{{#sections}}[\s\S]*?{{\/sections}}/,
      sectionsHtml
    )

    return html
  }

  /**
   * Groups questions by section
   */
  private groupQuestionsBySection(
    questions: Question[]
  ): Array<{
    sectionNumber: number
    sectionName: string
    questions: Question[]
  }> {
    const sectionsMap = new Map<
      number,
      {
        sectionNumber: number
        sectionName: string
        questions: Question[]
      }
    >()

    // Sort questions by section and question number
    const sortedQuestions = [...questions].sort((a, b) => {
      if (a.sectionNumber !== b.sectionNumber) {
        return a.sectionNumber - b.sectionNumber
      }
      return a.questionNumber - b.questionNumber
    })

    for (const question of sortedQuestions) {
      if (!sectionsMap.has(question.sectionNumber)) {
        sectionsMap.set(question.sectionNumber, {
          sectionNumber: question.sectionNumber,
          sectionName: question.sectionName,
          questions: [],
        })
      }
      sectionsMap.get(question.sectionNumber)!.questions.push(question)
    }

    return Array.from(sectionsMap.values())
  }

  /**
   * Renders a single section
   */
  private renderSection(
    section: {
      sectionNumber: number
      sectionName: string
      questions: Question[]
    },
    isFirstSection: boolean
  ): string {
    const pageBreakClass = isFirstSection ? '' : 'page-break'

    const questionsHtml = section.questions
      .map((q) => this.renderQuestion(q, section.sectionNumber))
      .join('\n')

    return `
      <div class="section ${pageBreakClass}">
        <div class="section-header">
          <h2 class="section-title">Section ${section.sectionNumber}: ${this.escapeHtml(section.sectionName)}</h2>
        </div>
        ${questionsHtml}
      </div>
    `
  }

  /**
   * Renders a single question
   */
  private renderQuestion(question: Question, sectionNumber: number): string {
    const metadata = question.questionMetadata || {}
    const requiredText = metadata.required
      ? `<div class="question-metadata" style="color: #dc2626;">* Required</div>`
      : ''

    return `
      <div class="question">
        <div class="question-number">
          Question ${sectionNumber}.${question.questionNumber}
        </div>
        <div class="question-text">
          ${this.escapeHtml(question.questionText)}
        </div>
        ${requiredText}
        <div class="response-area">
          <!-- Response area for vendor to fill in -->
        </div>
      </div>
    `
  }

  /**
   * Converts HTML to PDF using Puppeteer
   */
  private async htmlToPDF(html: string): Promise<Buffer> {
    let browser: Browser | null = null

    try {
      browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      })

      const page = await browser.newPage()

      // Set content
      await page.setContent(html, {
        waitUntil: 'networkidle0',
      })

      // Generate PDF
      const pdf = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: {
          top: '20mm',
          right: '15mm',
          bottom: '20mm',
          left: '15mm',
        },
      })

      return Buffer.from(pdf)
    } catch (error) {
      throw new Error(
        `Failed to generate PDF: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
    } finally {
      if (browser) {
        await browser.close()
      }
    }
  }

  /**
   * Escapes HTML special characters
   */
  private escapeHtml(text: string): string {
    const map: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;',
    }
    return text.replace(/[&<>"']/g, (m) => map[m])
  }

  /**
   * Formats date for display
   */
  private formatDate(date: Date): string {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  }
}
