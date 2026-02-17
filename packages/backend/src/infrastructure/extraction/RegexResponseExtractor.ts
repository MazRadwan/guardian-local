/**
 * RegexResponseExtractor - Extracts Q&A pairs from Guardian questionnaire text
 *
 * Epic 39: Core regex-based extraction algorithm that parses Guardian
 * questionnaire documents into structured question/response pairs.
 *
 * Design constraints:
 * - Pure regex operations on preprocessed text
 * - No external API calls (Claude handles ambiguous cases separately)
 * - Confidence: 1.0 for non-empty responses, 0.5 for empty/skipped
 * - hasVisualContent always false (DocxImageDetector sets this later)
 */

import { TextPreprocessor } from './TextPreprocessor.js'

/**
 * Result of regex-based extraction from a Guardian questionnaire
 */
export interface RegexExtractionResult {
  assessmentId: string | null
  vendorName: string | null
  responses: Array<{
    sectionNumber: number
    questionNumber: number
    questionText: string
    responseText: string
    confidence: number
    hasVisualContent: boolean
  }>
  parseTimeMs: number
}

/** Pattern: Assessment ID (UUID format) after "Assessment ID:" label */
const ASSESSMENT_ID = /Assessment\s+ID:\s*\n?\s*([a-f0-9-]{36})/i

/** Pattern: "AI Vendor Assessment Questionnaire" title line */
const QUESTIONNAIRE_TITLE = /AI Vendor Assessment Questionnaire/i

/** Pattern: Question markers like "Question 1.2" on their own line */
const QUESTION_MARKER = /^Question\s+(\d+)\.(\d+)\s*$/gm

/** Pattern: "Response:" on its own line (separates question from answer) */
const RESPONSE_MARKER = /^Response:\s*$/m

/** Pattern: Section headers like "Section 3: Security" */
const SECTION_HEADER = /^Section\s+\d+:\s+[^\n]+$/gm

export class RegexResponseExtractor {
  private readonly preprocessor: TextPreprocessor

  constructor(preprocessor?: TextPreprocessor) {
    this.preprocessor = preprocessor ?? new TextPreprocessor()
  }

  /**
   * Extract structured Q&A pairs from raw questionnaire text
   *
   * Algorithm:
   * 1. Preprocess text (strip artifacts, normalize whitespace)
   * 2. Extract metadata (assessmentId, vendorName)
   * 3. Find all Question X.Y markers with positions
   * 4. For each marker, extract text block to next marker (or end)
   * 5. Split block on "Response:" line
   * 6. Clean question and response text (strip section headers)
   * 7. Assign confidence based on response content
   *
   * @param rawText - Raw text from document parser
   * @returns Structured extraction result
   */
  extract(rawText: string): RegexExtractionResult {
    const startTime = performance.now()

    const text = this.preprocessor.preprocess(rawText)

    const assessmentId = this.extractAssessmentId(text)
    const vendorName = this.extractVendorName(text)
    const responses = this.extractResponses(text)

    const parseTimeMs = Math.round(performance.now() - startTime)

    return { assessmentId, vendorName, responses, parseTimeMs }
  }

  /**
   * Extract assessment ID (UUID) from document header
   */
  private extractAssessmentId(text: string): string | null {
    const match = text.match(ASSESSMENT_ID)
    return match ? match[1] : null
  }

  /**
   * Extract vendor name from first non-empty line after questionnaire title
   */
  private extractVendorName(text: string): string | null {
    const titleMatch = text.match(QUESTIONNAIRE_TITLE)
    if (!titleMatch || titleMatch.index === undefined) {
      return null
    }

    const afterTitle = text.slice(titleMatch.index + titleMatch[0].length)
    const lines = afterTitle.split('\n')

    for (const line of lines) {
      const trimmed = line.trim()
      if (trimmed.length > 0) {
        // Skip metadata lines (Assessment ID, Date, etc.)
        if (/^(Assessment\s+ID|Date|Prepared|Version)\s*:/i.test(trimmed)) {
          continue
        }
        return trimmed
      }
    }

    return null
  }

  /**
   * Extract all question/response pairs from the document body
   */
  private extractResponses(text: string): RegexExtractionResult['responses'] {
    const markers = this.findQuestionMarkers(text)
    if (markers.length === 0) {
      return []
    }

    const responses: RegexExtractionResult['responses'] = []

    for (let i = 0; i < markers.length; i++) {
      const marker = markers[i]
      const blockStart = marker.endPosition
      const blockEnd = i < markers.length - 1 ? markers[i + 1].startPosition : text.length
      const block = text.slice(blockStart, blockEnd)

      const { questionText, responseText } = this.splitBlock(block)

      responses.push({
        sectionNumber: marker.sectionNumber,
        questionNumber: marker.questionNumber,
        questionText,
        responseText,
        confidence: responseText.trim().length > 0 ? 1.0 : 0.5,
        hasVisualContent: false,
      })
    }

    return responses
  }

  /**
   * Find all Question X.Y markers with their positions in the text
   */
  private findQuestionMarkers(
    text: string
  ): Array<{
    sectionNumber: number
    questionNumber: number
    startPosition: number
    endPosition: number
  }> {
    const markers: Array<{
      sectionNumber: number
      questionNumber: number
      startPosition: number
      endPosition: number
    }> = []

    // Reset lastIndex for global regex
    QUESTION_MARKER.lastIndex = 0
    let match: RegExpExecArray | null

    while ((match = QUESTION_MARKER.exec(text)) !== null) {
      markers.push({
        sectionNumber: parseInt(match[1], 10),
        questionNumber: parseInt(match[2], 10),
        startPosition: match.index,
        endPosition: match.index + match[0].length,
      })
    }

    return markers
  }

  /**
   * Split a question block into question text and response text
   *
   * Splits on "Response:" line. Everything before is question text,
   * everything after is response text. Section headers are stripped
   * from both parts.
   */
  private splitBlock(block: string): { questionText: string; responseText: string } {
    const responseSplit = block.split(RESPONSE_MARKER)

    if (responseSplit.length < 2) {
      // No "Response:" marker found - entire block is question text
      return {
        questionText: this.cleanText(responseSplit[0]),
        responseText: '',
      }
    }

    const rawQuestion = responseSplit[0]
    // Join remaining parts in case "Response:" appears multiple times
    const rawResponse = responseSplit.slice(1).join('\nResponse:\n')

    return {
      questionText: this.cleanText(rawQuestion),
      responseText: this.cleanText(rawResponse),
    }
  }

  /**
   * Clean extracted text by stripping section headers and trimming whitespace
   */
  private cleanText(text: string): string {
    return text.replace(SECTION_HEADER, '').trim()
  }
}
