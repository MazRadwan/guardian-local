/**
 * Barrel export for extraction infrastructure
 */

export { BackgroundExtractor } from './BackgroundExtractor.js'
export {
  detectDocumentType,
  extractVendorName,
  classifyDocument,
  type DetectedDocType,
  type ClassificationResult,
} from './DocumentClassifier.js'
export { TextExtractionService } from './TextExtractionService.js'
