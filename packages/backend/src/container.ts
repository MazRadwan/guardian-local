/**
 * Composition root: DI wiring for all repositories, services, controllers, and providers.
 * Extracted from index.ts to comply with the 300 LOC limit.
 */
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Compute __dirname for this module (ESM)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// --- Application services ---
import { AuthService } from './application/services/AuthService.js';
import { ConversationService } from './application/services/ConversationService.js';
import { AssessmentService } from './application/services/AssessmentService.js';
import { VendorService } from './application/services/VendorService.js';
import { QuestionService } from './application/services/QuestionService.js';
import { QuestionnaireReadyService } from './application/services/QuestionnaireReadyService.js';
import { QuestionnaireGenerationService } from './application/services/QuestionnaireGenerationService.js';
import { ExportService } from './application/services/ExportService.js';
import { ScoringExportService } from './application/services/ScoringExportService.js';
import { FileValidationService } from './application/services/FileValidationService.js';
import { ScoringService } from './application/services/ScoringService.js';
import { ScoringStorageService } from './application/services/ScoringStorageService.js';
import { ScoringLLMService } from './application/services/ScoringLLMService.js';
import { ScoringQueryService } from './application/services/ScoringQueryService.js';
import { VendorValidationService } from './application/services/VendorValidationService.js';
import { TitleGenerationService } from './application/services/TitleGenerationService.js';
import { ISOControlRetrievalService } from './application/services/ISOControlRetrievalService.js';

// --- Domain ---
import { ScoringPayloadValidator } from './domain/scoring/ScoringPayloadValidator.js';

// --- Infrastructure: repositories ---
import { DrizzleUserRepository } from './infrastructure/database/repositories/DrizzleUserRepository.js';
import { DrizzleConversationRepository } from './infrastructure/database/repositories/DrizzleConversationRepository.js';
import { DrizzleMessageRepository } from './infrastructure/database/repositories/DrizzleMessageRepository.js';
import { DrizzleVendorRepository } from './infrastructure/database/repositories/DrizzleVendorRepository.js';
import { DrizzleAssessmentRepository } from './infrastructure/database/repositories/DrizzleAssessmentRepository.js';
import { DrizzleQuestionRepository } from './infrastructure/database/repositories/DrizzleQuestionRepository.js';
import { DrizzleFileRepository } from './infrastructure/database/repositories/DrizzleFileRepository.js';
import { DrizzleResponseRepository } from './infrastructure/database/repositories/DrizzleResponseRepository.js';
import { DrizzleDimensionScoreRepository } from './infrastructure/database/repositories/DrizzleDimensionScoreRepository.js';
import { DrizzleAssessmentResultRepository } from './infrastructure/database/repositories/DrizzleAssessmentResultRepository.js';
import { DrizzleDimensionControlMappingRepository } from './infrastructure/database/repositories/DrizzleDimensionControlMappingRepository.js';
import { DrizzleInterpretiveCriteriaRepository } from './infrastructure/database/repositories/DrizzleInterpretiveCriteriaRepository.js';
import { DrizzleTransactionRunner } from './infrastructure/database/DrizzleTransactionRunner.js';

// --- Infrastructure: AI ---
import { ClaudeClient } from './infrastructure/ai/ClaudeClient.js';
import { ScoringPromptBuilder } from './infrastructure/ai/ScoringPromptBuilder.js';
import { PromptCacheManager } from './infrastructure/ai/PromptCacheManager.js';
import { DocumentParserService } from './infrastructure/ai/DocumentParserService.js';
import { IntakeDocumentParser } from './infrastructure/ai/IntakeDocumentParser.js';
import { VisionContentBuilder } from './infrastructure/ai/VisionContentBuilder.js';
import { getSystemPrompt } from './infrastructure/ai/prompts.js';
import { ExportNarrativePromptBuilder } from './infrastructure/ai/ExportNarrativePromptBuilder.js';
import { ExportNarrativeGenerator } from './infrastructure/ai/ExportNarrativeGenerator.js';

// --- Infrastructure: auth ---
import { JWTProvider } from './infrastructure/auth/JWTProvider.js';

// --- Infrastructure: export ---
import { PDFExporter } from './infrastructure/export/PDFExporter.js';
import { WordExporter } from './infrastructure/export/WordExporter.js';
import { ExcelExporter } from './infrastructure/export/ExcelExporter.js';
import { ScoringPDFExporter } from './infrastructure/export/ScoringPDFExporter.js';
import { ScoringWordExporter } from './infrastructure/export/ScoringWordExporter.js';
import { ScoringExcelExporter } from './infrastructure/export/ScoringExcelExporter.js';

// --- Infrastructure: controllers ---
import { AuthController } from './infrastructure/http/controllers/AuthController.js';
import { VendorController } from './infrastructure/http/controllers/VendorController.js';
import { AssessmentController } from './infrastructure/http/controllers/AssessmentController.js';
import { QuestionController } from './infrastructure/http/controllers/QuestionController.js';
import { ExportController } from './infrastructure/http/controllers/ExportController.js';
import { ScoringExportController } from './infrastructure/http/controllers/ScoringExportController.js';
import { ScoringRehydrationController } from './infrastructure/http/controllers/ScoringRehydrationController.js';

// --- Infrastructure: storage & extraction ---
import { createFileStorage } from './infrastructure/storage/index.js';
import { TextExtractionService } from './infrastructure/extraction/TextExtractionService.js';
import { BackgroundExtractor } from './infrastructure/extraction/BackgroundExtractor.js';

// --- Infrastructure: web search (Epic 33) ---
import { JinaClient } from './infrastructure/ai/JinaClient.js';
import type { IJinaClient } from './application/interfaces/IJinaClient.js';

// ============================================================
// Environment configuration
// ============================================================
export const PORT = parseInt(process.env.PORT || '8000', 10);
export const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:3000';
export const JWT_SECRET = process.env.JWT_SECRET || 'your-jwt-secret-here';
const PROMPT_CACHE_ENABLED = process.env.CLAUDE_PROMPT_CACHE === 'true';
const PROMPT_CACHE_PREFIX = process.env.CLAUDE_PROMPT_CACHE_PREFIX || 'guardian';

// Validate ANTHROPIC_API_KEY (required for Claude integration)
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
if (!ANTHROPIC_API_KEY && process.env.NODE_ENV !== 'test') {
  throw new Error(
    'ANTHROPIC_API_KEY environment variable is required. Please set it in packages/backend/.env'
  );
}
if (!ANTHROPIC_API_KEY && process.env.NODE_ENV === 'test') {
  console.warn('[App] ANTHROPIC_API_KEY not set - Claude features will fail in tests');
}

// Epic 33: Web search configuration
const JINA_API_KEY = process.env.JINA_API_KEY || '';
const ENABLE_WEB_SEARCH = process.env.ENABLE_WEB_SEARCH !== 'false'; // Default: true
if (!JINA_API_KEY && ENABLE_WEB_SEARCH && process.env.NODE_ENV !== 'test') {
  console.warn('[App] JINA_API_KEY not set - web search will be disabled in consult mode');
}

// ============================================================
// Repository instantiation
// ============================================================
export const userRepo = new DrizzleUserRepository();
export const conversationRepo = new DrizzleConversationRepository();
export const messageRepo = new DrizzleMessageRepository();
export const vendorRepo = new DrizzleVendorRepository();
export const assessmentRepo = new DrizzleAssessmentRepository();
export const questionRepo = new DrizzleQuestionRepository();
export const fileRepo = new DrizzleFileRepository();

// Scoring repositories (Epic 15)
export const responseRepo = new DrizzleResponseRepository();
export const dimensionScoreRepo = new DrizzleDimensionScoreRepository();
export const assessmentResultRepo = new DrizzleAssessmentResultRepository();

// ISO compliance repositories (Epic 37)
const dimensionControlMappingRepo = new DrizzleDimensionControlMappingRepository();
const interpretiveCriteriaRepo = new DrizzleInterpretiveCriteriaRepository();
const isoControlRetrievalService = new ISOControlRetrievalService(
  dimensionControlMappingRepo,
  interpretiveCriteriaRepo
);

// ============================================================
// Provider / client instantiation
// ============================================================
export const jwtProvider = new JWTProvider(JWT_SECRET);
export const claudeClient = new ClaudeClient(ANTHROPIC_API_KEY);
export const promptCacheManager = new PromptCacheManager(
  { enabled: PROMPT_CACHE_ENABLED, prefix: PROMPT_CACHE_PREFIX },
  getSystemPrompt
);

// ============================================================
// Exporter instantiation
// ============================================================
const pdfTemplatePath = resolve(
  __dirname,
  'infrastructure/export/templates/questionnaire-template.html'
);
const pdfExporter = new PDFExporter(pdfTemplatePath);
const wordExporter = new WordExporter();
const excelExporter = new ExcelExporter();

// Scoring exporters (Epic 15)
const scoringPdfTemplatePath = resolve(
  __dirname,
  'infrastructure/export/templates/scoring-report.html'
);
const scoringPDFExporter = new ScoringPDFExporter(scoringPdfTemplatePath);
const scoringWordExporter = new ScoringWordExporter();
const scoringExcelExporter = new ScoringExcelExporter();

// ============================================================
// Service instantiation
// ============================================================
export const authService = new AuthService(userRepo, jwtProvider);
export const conversationService = new ConversationService(conversationRepo, messageRepo, fileRepo);
export const vendorService = new VendorService(vendorRepo);
export const assessmentService = new AssessmentService(vendorRepo, assessmentRepo);
export const questionService = new QuestionService(claudeClient, questionRepo, assessmentRepo);
export const questionnaireReadyService = new QuestionnaireReadyService(conversationService);
export const questionnaireGenerationService = new QuestionnaireGenerationService(
  claudeClient,
  questionRepo,
  assessmentService,
  vendorService,
  conversationService
);
export const exportService = new ExportService(
  assessmentRepo,
  questionRepo,
  vendorRepo,
  pdfExporter,
  wordExporter,
  excelExporter
);

// Scoring export service (Epic 15, extended in Epic 20)
const exportNarrativePromptBuilder = new ExportNarrativePromptBuilder();
const exportNarrativeGenerator = new ExportNarrativeGenerator(
  exportNarrativePromptBuilder,
  claudeClient
);
export const scoringExportService = new ScoringExportService(
  assessmentRepo,
  assessmentResultRepo,
  dimensionScoreRepo,
  responseRepo,
  scoringPDFExporter,
  scoringWordExporter,
  exportNarrativeGenerator,
  scoringExcelExporter
);

// File storage and validation (Epic 16)
export const fileStorage = createFileStorage();
export const fileValidationService = new FileValidationService();
export const intakeDocumentParser = new IntakeDocumentParser(
  claudeClient,  // IClaudeClient
  claudeClient,  // IVisionClient - ClaudeClient implements both
);
export const documentParserService = new DocumentParserService(
  claudeClient,  // IClaudeClient
  claudeClient,  // IVisionClient - ClaudeClient implements both
  questionRepo   // IQuestionRepository - for regex extraction routing (Epic 39)
);

// Epic 30: VisionContentBuilder for Vision API image processing
export const visionContentBuilder = new VisionContentBuilder(fileStorage);

// Epic 18: Text extraction service for fast context injection
export const textExtractionService = new TextExtractionService();

// Epic 31: Background extractor for async text extraction
export const backgroundExtractor = new BackgroundExtractor(textExtractionService, fileRepo);

// Epic 18.4: Vendor validation service
export const vendorValidationService = new VendorValidationService(fileRepo);

// Story 28.11.1: TitleGenerationService for LLM-based title generation
export const titleGenerationService = new TitleGenerationService(ANTHROPIC_API_KEY);

// Scoring components (Epic 15, Epic 20, Epic 22, Epic 37: split into sub-services)
const scoringPromptBuilder = new ScoringPromptBuilder(isoControlRetrievalService);
const scoringPayloadValidator = new ScoringPayloadValidator();
const transactionRunner = new DrizzleTransactionRunner();
const scoringStorageService = new ScoringStorageService(
  responseRepo,
  dimensionScoreRepo,
  assessmentResultRepo,
  transactionRunner,
  claudeClient           // ILLMClient for modelId in storeScores
);
const scoringLLMService = new ScoringLLMService(claudeClient, scoringPromptBuilder);
const scoringQueryService = new ScoringQueryService(
  assessmentResultRepo,
  dimensionScoreRepo,
  conversationRepo       // Epic 22: IConversationRepository for scoring rehydration
);
export const scoringService = new ScoringService(
  assessmentResultRepo,
  assessmentRepo,
  fileRepo,
  fileStorage,
  documentParserService, // IScoringDocumentParser
  scoringPayloadValidator,
  scoringStorageService,
  scoringLLMService,
  scoringQueryService
);

// ============================================================
// Controller instantiation
// ============================================================
export const authController = new AuthController(authService);
export const vendorController = new VendorController(assessmentService);
export const assessmentController = new AssessmentController(assessmentService);
export const questionController = new QuestionController(questionService);
export const exportController = new ExportController(exportService, assessmentRepo, vendorRepo);
export const scoringExportController = new ScoringExportController(
  scoringExportService,
  assessmentRepo
);

// Epic 22.1.1: Scoring rehydration controller
export const scoringRehydrationController = new ScoringRehydrationController(scoringService);

// ============================================================
// Jina client (Epic 33: web search, optional)
// ============================================================
export let jinaClient: IJinaClient | undefined;
if (ENABLE_WEB_SEARCH && JINA_API_KEY) {
  try {
    jinaClient = new JinaClient(JINA_API_KEY);
    console.log('[App] Jina client initialized for web search');
  } catch (error) {
    console.warn('[App] Failed to initialize Jina client:', error instanceof Error ? error.message : 'Unknown error');
  }
} else if (!ENABLE_WEB_SEARCH) {
  console.log('[App] Web search disabled via ENABLE_WEB_SEARCH=false');
}
