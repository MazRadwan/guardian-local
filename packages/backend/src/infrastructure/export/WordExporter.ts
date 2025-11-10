/**
 * Word Exporter
 *
 * Generates Word (.docx) files from assessment questionnaires using docx library
 */

import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  BorderStyle,
  Table,
  TableRow,
  TableCell,
  WidthType,
} from 'docx'
import {
  IWordExporter,
  QuestionnaireData,
} from '../../application/interfaces/IWordExporter'
import { Question } from '../../domain/entities/Question'

export class WordExporter implements IWordExporter {
  /**
   * Generates Word document from questionnaire data
   */
  async generateWord(data: QuestionnaireData): Promise<Buffer> {
    const { assessment, vendor, questions } = data

    // Group questions by section
    const sections = this.groupQuestionsBySection(questions)

    // Create document sections - flatten all paragraphs
    const documentSections: Paragraph[] = [
      // Header
      ...this.createHeader(vendor, assessment, questions.length),

      // Introduction
      ...this.createIntroduction(),

      // Sections with questions
      ...sections.flatMap((section) =>
        this.createSection(section)
      ),

      // Footer
      ...this.createFooter(),
    ]

    // Create document
    const doc = new Document({
      sections: [
        {
          properties: {},
          children: documentSections,
        },
      ],
    })

    // Convert to buffer
    const buffer = await Packer.toBuffer(doc)
    return Buffer.from(buffer)
  }

  /**
   * Creates document header
   */
  private createHeader(
    vendor: Vendor,
    assessment: Assessment,
    totalQuestions: number
  ): Paragraph[] {
    return [
      new Paragraph({
        text: 'AI Vendor Assessment Questionnaire',
        heading: HeadingLevel.TITLE,
        alignment: AlignmentType.CENTER,
        spacing: { after: 200 },
      }),
      new Paragraph({
        text: vendor.name,
        heading: HeadingLevel.HEADING_1,
        alignment: AlignmentType.CENTER,
        spacing: { after: 400 },
      }),
      new Paragraph({
        children: [
          new TextRun({
            text: 'Assessment Type: ',
            bold: true,
          }),
          new TextRun({
            text: assessment.assessmentType,
          }),
        ],
        spacing: { after: 100 },
      }),
      new Paragraph({
        children: [
          new TextRun({
            text: 'Solution: ',
            bold: true,
          }),
          new TextRun({
            text: assessment.solutionName || 'N/A',
          }),
        ],
        spacing: { after: 100 },
      }),
      new Paragraph({
        children: [
          new TextRun({
            text: 'Created: ',
            bold: true,
          }),
          new TextRun({
            text: new Date(assessment.createdAt).toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            }),
          }),
        ],
        spacing: { after: 100 },
      }),
      new Paragraph({
        children: [
          new TextRun({
            text: 'Total Questions: ',
            bold: true,
          }),
          new TextRun({
            text: totalQuestions.toString(),
          }),
        ],
        spacing: { after: 400 },
      }),
    ]
  }

  /**
   * Creates introduction section
   */
  private createIntroduction(): Paragraph[] {
    return [
      new Paragraph({
        text: 'Introduction',
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 200, after: 200 },
      }),
      new Paragraph({
        text: 'This questionnaire is designed to comprehensively assess the AI vendor\'s capabilities, compliance posture, and risk profile across multiple dimensions including privacy, security, clinical safety, and operational resilience.',
        spacing: { after: 200 },
      }),
      new Paragraph({
        text: 'Please provide detailed responses to all questions. Your answers will be used to evaluate the vendor\'s suitability and identify any gaps that need to be addressed.',
        spacing: { after: 400 },
      }),
    ]
  }

  /**
   * Creates a section with questions
   */
  private createSection(section: {
    sectionNumber: number
    sectionName: string
    questions: Question[]
  }): Paragraph[] {
    const elements: Paragraph[] = []

    // Section header
    elements.push(
      new Paragraph({
        text: `Section ${section.sectionNumber}: ${section.sectionName}`,
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 400, after: 200 },
        border: {
          bottom: {
            color: '2563EB',
            space: 1,
            style: BorderStyle.SINGLE,
            size: 6,
          },
        },
      })
    )

    // Questions
    for (const question of section.questions) {
      elements.push(...this.createQuestion(question, section.sectionNumber))
    }

    return elements
  }

  /**
   * Creates a question element
   */
  private createQuestion(
    question: Question,
    sectionNumber: number
  ): Paragraph[] {
    const elements: Paragraph[] = []

    // Question number and text
    elements.push(
      new Paragraph({
        children: [
          new TextRun({
            text: `Question ${sectionNumber}.${question.questionNumber}`,
            bold: true,
            color: '2563EB',
          }),
        ],
        spacing: { before: 200, after: 100 },
      })
    )

    elements.push(
      new Paragraph({
        text: question.questionText,
        spacing: { after: 100 },
      })
    )

    // Metadata (help text, required)
    const metadata = question.questionMetadata || {}
    if (metadata.helpText) {
      elements.push(
        new Paragraph({
          children: [
            new TextRun({
              text: 'Help: ',
              italics: true,
              size: 18,
            }),
            new TextRun({
              text: metadata.helpText,
              italics: true,
              size: 18,
            }),
          ],
          spacing: { after: 50 },
        })
      )
    }

    if (metadata.required) {
      elements.push(
        new Paragraph({
          children: [
            new TextRun({
              text: '* Required',
              italics: true,
              color: 'DC2626',
              size: 18,
            }),
          ],
          spacing: { after: 100 },
        })
      )
    }

    // Response area (fillable text box using table)
    elements.push(
      new Paragraph({
        text: 'Response:',
        spacing: { after: 50 },
      })
    )

    // Create a simple bordered paragraph for response area
    elements.push(
      new Paragraph({
        text: '',
        spacing: { after: 300 },
        border: {
          top: {
            color: 'E2E8F0',
            space: 1,
            style: BorderStyle.SINGLE,
            size: 6,
          },
          bottom: {
            color: 'E2E8F0',
            space: 1,
            style: BorderStyle.SINGLE,
            size: 6,
          },
          left: {
            color: 'E2E8F0',
            space: 1,
            style: BorderStyle.SINGLE,
            size: 6,
          },
          right: {
            color: 'E2E8F0',
            space: 1,
            style: BorderStyle.SINGLE,
            size: 6,
          },
        },
        shading: {
          fill: 'F8FAFC',
        },
      })
    )

    // Add some space for manual entry
    for (let i = 0; i < 3; i++) {
      elements.push(
        new Paragraph({
          text: '',
          spacing: { after: 100 },
        })
      )
    }

    return elements
  }

  /**
   * Creates footer section
   */
  private createFooter(): Paragraph[] {
    return [
      new Paragraph({
        text: '',
        spacing: { before: 600 },
        border: {
          top: {
            color: 'E2E8F0',
            space: 1,
            style: BorderStyle.DOUBLE,
            size: 6,
          },
        },
      }),
      new Paragraph({
        text: 'Generated by Guardian AI Vendor Assessment System',
        alignment: AlignmentType.CENTER,
        spacing: { before: 200, after: 100 },
      }),
      new Paragraph({
        text: '© 2025 - Confidential Assessment Document',
        alignment: AlignmentType.CENTER,
      }),
    ]
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
}
