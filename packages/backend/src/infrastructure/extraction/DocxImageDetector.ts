/**
 * DocxImageDetector - Detects images embedded in docx questionnaire responses
 *
 * Epic 39: When a vendor embeds an infrastructure diagram as their answer,
 * mammoth.extractRawText() strips the image completely - the response appears
 * empty. This detector uses mammoth.convertToHtml() which preserves <img> tags,
 * allowing us to identify responses that contain visual content.
 *
 * Only works for docx files. PDF image detection requires Vision API.
 */

import mammoth from 'mammoth'

/**
 * Image detection flags for a single question response
 */
export interface QuestionImageFlag {
  /** Whether the response block contains visual content (an <img> tag) */
  hasVisualContent: boolean
}

/**
 * Result of scanning a docx file for embedded images in question responses
 */
export interface ImageDetectionResult {
  /** Map of "sectionNumber.questionNumber" -> image flags */
  questionImages: Map<string, QuestionImageFlag>
  /** Total images detected across all responses */
  totalImagesDetected: number
}

/** Regex to find Question X.Y markers in HTML text content */
const QUESTION_MARKER_REGEX = /Question\s+(\d+)\.(\d+)/g

/** Regex to detect <img tags in an HTML block */
const IMG_TAG_REGEX = /<img\b/i

export class DocxImageDetector {
  /**
   * Detect images in docx responses using mammoth HTML extraction.
   *
   * Algorithm:
   * 1. Convert docx buffer to HTML (preserves <img> tags with base64 data)
   * 2. Find all "Question X.Y" markers in the HTML
   * 3. Split HTML into blocks between consecutive question markers
   * 4. Check each block for <img> tags
   * 5. Return map of question keys to image flags
   *
   * @param buffer - Valid docx file buffer
   * @returns Detection result with per-question image flags
   */
  async detect(buffer: Buffer): Promise<ImageDetectionResult> {
    const questionImages = new Map<string, QuestionImageFlag>()
    let totalImagesDetected = 0

    let html: string
    try {
      const htmlResult = await mammoth.convertToHtml({ buffer })
      html = htmlResult.value
    } catch {
      // Graceful failure: return empty result on conversion error
      console.warn('[DocxImageDetector] mammoth conversion failed, returning empty result')
      return { questionImages, totalImagesDetected }
    }

    // Find all question marker positions in the HTML
    const markers = this.findQuestionMarkers(html)

    if (markers.length === 0) {
      return { questionImages, totalImagesDetected }
    }

    // Process each question block (text between consecutive markers)
    for (let i = 0; i < markers.length; i++) {
      const marker = markers[i]
      const startIndex = marker.endIndex
      const endIndex = i + 1 < markers.length ? markers[i + 1].startIndex : html.length

      const block = html.slice(startIndex, endIndex)
      const hasImage = IMG_TAG_REGEX.test(block)

      const key = `${marker.section}.${marker.question}`
      questionImages.set(key, { hasVisualContent: hasImage })

      if (hasImage) {
        totalImagesDetected++
      }
    }

    return { questionImages, totalImagesDetected }
  }

  /**
   * Find all "Question X.Y" markers in the HTML string, returning their
   * positions, section numbers, and question numbers.
   */
  private findQuestionMarkers(
    html: string
  ): Array<{ section: number; question: number; startIndex: number; endIndex: number }> {
    const markers: Array<{
      section: number
      question: number
      startIndex: number
      endIndex: number
    }> = []

    // Reset regex state for each invocation
    QUESTION_MARKER_REGEX.lastIndex = 0

    let match: RegExpExecArray | null
    while ((match = QUESTION_MARKER_REGEX.exec(html)) !== null) {
      markers.push({
        section: parseInt(match[1], 10),
        question: parseInt(match[2], 10),
        startIndex: match.index,
        endIndex: match.index + match[0].length,
      })
    }

    return markers
  }
}
