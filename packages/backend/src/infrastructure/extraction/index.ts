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
export {
  DocxImageDetector,
  type QuestionImageFlag,
  type ImageDetectionResult,
} from './DocxImageDetector.js'
export { TextPreprocessor } from './TextPreprocessor.js'
export {
  RegexResponseExtractor,
  type RegexExtractionResult,
} from './RegexResponseExtractor.js'
export {
  ExtractionConfidenceCalculator,
  type ConfidenceCheck,
  type ConfidenceResult,
} from './ExtractionConfidenceCalculator.js'
export {
  ExtractionRoutingService,
  type RegexRoutingResult,
} from './ExtractionRoutingService.js'
