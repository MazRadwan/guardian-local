/**
 * DocumentClassifier - Heuristic document type detection
 *
 * Epic 18.4.1: Detects whether an uploaded document is a questionnaire
 * (for scoring) or a general document (marketing materials, etc.).
 *
 * Design constraints:
 * - Must complete within 100ms (pure regex/string operations)
 * - NO external API calls (no Claude)
 * - Uses text excerpt from extraction, not raw file
 * - Returns 'unknown' when confidence is low
 */

/**
 * Detected document types for upload classification
 */
export type DetectedDocType = 'questionnaire' | 'document' | 'unknown'

/**
 * Classification result with confidence indicators
 */
export interface ClassificationResult {
  docType: DetectedDocType
  vendorName: string | null
  /** Raw indicator scores for debugging */
  indicators: {
    questionnaire: number
    document: number
  }
}

/**
 * Detect document type using heuristic pattern matching
 *
 * Scoring logic:
 * - Questionnaire indicators: Excel MIME, Q&A headers, numbered questions, assessment IDs
 * - Document indicators: Long narrative prose, marketing language
 * - Returns 'questionnaire' if score >= 3
 * - Returns 'document' if score >= 2 (and questionnaire < 3)
 * - Returns 'unknown' otherwise
 *
 * @param excerpt - Text excerpt from document (max 10k chars)
 * @param mimeType - Original MIME type of uploaded file
 * @returns Detected document type
 */
export function detectDocumentType(excerpt: string, mimeType: string): DetectedDocType {
  const indicators = { questionnaire: 0, document: 0 }

  // === QUESTIONNAIRE INDICATORS ===

  // Excel files with Q&A structure are likely questionnaires
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel')) {
    indicators.questionnaire += 2
  }

  // Header patterns common in questionnaires
  if (/question|response|answer|vendor response/i.test(excerpt)) {
    indicators.questionnaire += 2
  }

  // Numbered questions (Q1, Q2, 1., 2., etc.)
  if (/(?:Q\d+|^\d+\.)/m.test(excerpt)) {
    indicators.questionnaire += 1
  }

  // Guardian assessment ID reference
  if (/assessment[:\s-]*[A-Z]{2,}-?\d+/i.test(excerpt)) {
    indicators.questionnaire += 2
  }

  // Risk dimension keywords (common in Guardian questionnaires)
  if (/(?:data\s*governance|security|privacy|integration|scalability|compliance)/i.test(excerpt)) {
    indicators.questionnaire += 1
  }

  // === DOCUMENT INDICATORS ===

  // Long narrative prose (>5000 chars without many line breaks in first 1000)
  // Indicates marketing whitepaper or general document
  const firstChunk = excerpt.slice(0, 1000)
  const lineBreakCount = (firstChunk.match(/\n/g) || []).length
  if (excerpt.length > 5000 && lineBreakCount < 5) {
    indicators.document += 2
  }

  // Marketing language
  if (/leading provider|industry-leading|innovative solution|trusted by|world-class/i.test(excerpt)) {
    indicators.document += 1
  }

  // Company overview language
  if (/our mission|we believe|our team|founded in|headquartered/i.test(excerpt)) {
    indicators.document += 1
  }

  // === CLASSIFICATION ===

  if (indicators.questionnaire >= 3) return 'questionnaire'
  if (indicators.document >= 2) return 'document'
  return 'unknown'
}

/**
 * Extract vendor name from document text using common patterns
 *
 * Searches for patterns like:
 * - "Vendor: Acme Corp"
 * - "Company: Acme Corp"
 * - "Prepared for: Acme Corp"
 * - "Assessment of: Acme Corp"
 *
 * @param excerpt - Text excerpt from document
 * @returns Extracted vendor name or null if not found
 */
export function extractVendorName(excerpt: string): string | null {
  // Patterns require a colon to distinguish "Vendor: Name" from "vendor information"
  const patterns = [
    // Direct labels - require colon for specificity
    /\bvendor\s*:\s*([A-Z][A-Za-z0-9\s&.-]+?)(?:\n|,|\.|$)/i,
    /\bcompany\s*:\s*([A-Z][A-Za-z0-9\s&.-]+?)(?:\n|,|\.|$)/i,
    /\borganization\s*:\s*([A-Z][A-Za-z0-9\s&.-]+?)(?:\n|,|\.|$)/i,
    // Document context - require colon
    /\bprepared for\s*:\s*([A-Z][A-Za-z0-9\s&.-]+?)(?:\n|,|\.|$)/i,
    /\bassessment of\s*:\s*([A-Z][A-Za-z0-9\s&.-]+?)(?:\n|,|\.|$)/i,
    /\bsubmitted by\s*:\s*([A-Z][A-Za-z0-9\s&.-]+?)(?:\n|,|\.|$)/i,
    // Response context - require colon
    /\brespondent\s*:\s*([A-Z][A-Za-z0-9\s&.-]+?)(?:\n|,|\.|$)/i,
  ]

  for (const pattern of patterns) {
    const match = excerpt.match(pattern)
    if (match && match[1]) {
      const name = match[1].trim()
      // Filter out generic/invalid names
      if (name.length > 2 && name.length < 100 && !isGenericName(name)) {
        return name
      }
    }
  }

  return null
}

/**
 * Check if a name is too generic to be a vendor name
 */
function isGenericName(name: string): boolean {
  const genericPatterns = [
    /^the$/i,
    /^n\/?a$/i,
    /^none$/i,
    /^yes$/i,
    /^no$/i,
    /^unknown$/i,
    /^vendor$/i,
    /^company$/i,
    /^organization$/i,
    /^\d+$/,
  ]

  return genericPatterns.some((pattern) => pattern.test(name))
}

/**
 * Classify document with full result including vendor name
 *
 * Convenience function that combines type detection and vendor extraction.
 *
 * @param excerpt - Text excerpt from document
 * @param mimeType - Original MIME type
 * @returns Full classification result
 */
export function classifyDocument(excerpt: string, mimeType: string): ClassificationResult {
  const indicators = { questionnaire: 0, document: 0 }

  // Excel files
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel')) {
    indicators.questionnaire += 2
  }

  // Header patterns
  if (/question|response|answer|vendor response/i.test(excerpt)) {
    indicators.questionnaire += 2
  }

  // Numbered questions
  if (/(?:Q\d+|^\d+\.)/m.test(excerpt)) {
    indicators.questionnaire += 1
  }

  // Assessment ID
  if (/assessment[:\s-]*[A-Z]{2,}-?\d+/i.test(excerpt)) {
    indicators.questionnaire += 2
  }

  // Risk dimensions
  if (/(?:data\s*governance|security|privacy|integration|scalability|compliance)/i.test(excerpt)) {
    indicators.questionnaire += 1
  }

  // Narrative prose
  const firstChunk = excerpt.slice(0, 1000)
  const lineBreakCount = (firstChunk.match(/\n/g) || []).length
  if (excerpt.length > 5000 && lineBreakCount < 5) {
    indicators.document += 2
  }

  // Marketing language
  if (/leading provider|industry-leading|innovative solution|trusted by|world-class/i.test(excerpt)) {
    indicators.document += 1
  }

  // Company overview
  if (/our mission|we believe|our team|founded in|headquartered/i.test(excerpt)) {
    indicators.document += 1
  }

  // Determine type
  let docType: DetectedDocType = 'unknown'
  if (indicators.questionnaire >= 3) {
    docType = 'questionnaire'
  } else if (indicators.document >= 2) {
    docType = 'document'
  }

  return {
    docType,
    vendorName: extractVendorName(excerpt),
    indicators,
  }
}
