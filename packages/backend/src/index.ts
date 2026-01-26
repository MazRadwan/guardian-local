// Load environment variables FIRST (before any imports that need env vars)
import { config } from 'dotenv';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables (support both repo root .env and backend/.env)
config({ path: resolve(__dirname, '../../../.env') });
config({ path: resolve(__dirname, '../../.env') });

import { Server } from './infrastructure/http/server.js';
import { ChatServer } from './infrastructure/websocket/ChatServer.js';
import { RateLimiter } from './infrastructure/websocket/RateLimiter.js';
import { AuthService } from './application/services/AuthService.js';
import { ConversationService } from './application/services/ConversationService.js';
import { AssessmentService } from './application/services/AssessmentService.js';
import { VendorService } from './application/services/VendorService.js';
import { QuestionService } from './application/services/QuestionService.js';
import { QuestionnaireReadyService } from './application/services/QuestionnaireReadyService.js';
import { QuestionnaireGenerationService } from './application/services/QuestionnaireGenerationService.js';
import { ExportService } from './application/services/ExportService.js';
import { ScoringExportService } from './application/services/ScoringExportService.js';
import { PDFExporter } from './infrastructure/export/PDFExporter.js';
import { WordExporter } from './infrastructure/export/WordExporter.js';
import { ExcelExporter } from './infrastructure/export/ExcelExporter.js';
import { ScoringPDFExporter } from './infrastructure/export/ScoringPDFExporter.js';
import { ScoringWordExporter } from './infrastructure/export/ScoringWordExporter.js';
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
import { ClaudeClient } from './infrastructure/ai/ClaudeClient.js';
import { ScoringPromptBuilder } from './infrastructure/ai/ScoringPromptBuilder.js';
import { JWTProvider } from './infrastructure/auth/JWTProvider.js';
import { AuthController } from './infrastructure/http/controllers/AuthController.js';
import { VendorController } from './infrastructure/http/controllers/VendorController.js';
import { AssessmentController } from './infrastructure/http/controllers/AssessmentController.js';
import { QuestionController } from './infrastructure/http/controllers/QuestionController.js';
import { ExportController } from './infrastructure/http/controllers/ExportController.js';
import { ScoringExportController } from './infrastructure/http/controllers/ScoringExportController.js';
import { DocumentUploadController } from './infrastructure/http/controllers/DocumentUploadController.js';
import { createAuthRoutes } from './infrastructure/http/routes/auth.routes.js';
import { createVendorRoutes } from './infrastructure/http/routes/vendor.routes.js';
import { createAssessmentRoutes } from './infrastructure/http/routes/assessment.routes.js';
import { createQuestionRoutes } from './infrastructure/http/routes/question.routes.js';
import { createExportRoutes } from './infrastructure/http/routes/export.routes.js';
import { createScoringExportRoutes } from './infrastructure/http/routes/scoring.export.routes.js';
import { createScoringRoutes } from './infrastructure/http/routes/scoring.routes.js';
import { createDocumentRoutes } from './infrastructure/http/routes/document.routes.js';
import { createConversationRoutes } from './infrastructure/http/routes/conversation.routes.js';
import { ConversationController } from './infrastructure/http/controllers/ConversationController.js';
import { ScoringRehydrationController } from './infrastructure/http/controllers/ScoringRehydrationController.js';
import { PromptCacheManager } from './infrastructure/ai/PromptCacheManager.js';
import { DocumentParserService } from './infrastructure/ai/DocumentParserService.js';
import { createFileStorage } from './infrastructure/storage/index.js';
import { FileValidationService } from './application/services/FileValidationService.js';
import { ScoringService } from './application/services/ScoringService.js';
import { ScoringPayloadValidator } from './domain/scoring/ScoringPayloadValidator.js';
import { getSystemPrompt } from './infrastructure/ai/prompts.js';
import { TextExtractionService } from './infrastructure/extraction/TextExtractionService.js';
import { VendorValidationService } from './application/services/VendorValidationService.js';
import { TitleGenerationService } from './application/services/TitleGenerationService.js';
import { ExportNarrativePromptBuilder } from './infrastructure/ai/ExportNarrativePromptBuilder.js';
import { ExportNarrativeGenerator } from './infrastructure/ai/ExportNarrativeGenerator.js';
import { DrizzleTransactionRunner } from './infrastructure/database/DrizzleTransactionRunner.js';
import { errorHandler } from './infrastructure/http/middleware/error.middleware.js';

const PORT = parseInt(process.env.PORT || '8000', 10);
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:3000';
const JWT_SECRET = process.env.JWT_SECRET || 'your-jwt-secret-here';
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

// Initialize repositories
const userRepo = new DrizzleUserRepository();
const conversationRepo = new DrizzleConversationRepository();
const messageRepo = new DrizzleMessageRepository();
const vendorRepo = new DrizzleVendorRepository();
const assessmentRepo = new DrizzleAssessmentRepository();
const questionRepo = new DrizzleQuestionRepository();
const fileRepo = new DrizzleFileRepository();

// Initialize scoring repositories (Epic 15)
const responseRepo = new DrizzleResponseRepository();
const dimensionScoreRepo = new DrizzleDimensionScoreRepository();
const assessmentResultRepo = new DrizzleAssessmentResultRepository();

// Initialize providers
const jwtProvider = new JWTProvider(JWT_SECRET);

// Initialize Claude client
const claudeClient = new ClaudeClient(ANTHROPIC_API_KEY);
const promptCacheManager = new PromptCacheManager(
  { enabled: PROMPT_CACHE_ENABLED, prefix: PROMPT_CACHE_PREFIX },
  getSystemPrompt
);

// Initialize exporters
// Compute template path from __dirname (derived from import.meta.url at top of file)
// This works in ESM and the template will be copied to dist/ during build
const pdfTemplatePath = resolve(
  __dirname,
  'infrastructure/export/templates/questionnaire-template.html'
);
const pdfExporter = new PDFExporter(pdfTemplatePath);
const wordExporter = new WordExporter();
const excelExporter = new ExcelExporter();

// Initialize scoring exporters (Epic 15)
const scoringPdfTemplatePath = resolve(
  __dirname,
  'infrastructure/export/templates/scoring-report.html'
);
const scoringPDFExporter = new ScoringPDFExporter(scoringPdfTemplatePath);
const scoringWordExporter = new ScoringWordExporter();

// Initialize services
const authService = new AuthService(userRepo, jwtProvider);
const conversationService = new ConversationService(conversationRepo, messageRepo, fileRepo);
const vendorService = new VendorService(vendorRepo);
const assessmentService = new AssessmentService(vendorRepo, assessmentRepo);
const questionService = new QuestionService(claudeClient, questionRepo, assessmentRepo);
const questionnaireReadyService = new QuestionnaireReadyService(
  conversationService
);
const questionnaireGenerationService = new QuestionnaireGenerationService(
  claudeClient,
  questionRepo,
  assessmentService,
  vendorService,
  conversationService
);
const exportService = new ExportService(
  assessmentRepo,
  questionRepo,
  vendorRepo,
  pdfExporter,
  wordExporter,
  excelExporter
);

// Initialize scoring export service (Epic 15, extended in Epic 20)
const exportNarrativePromptBuilder = new ExportNarrativePromptBuilder();
const exportNarrativeGenerator = new ExportNarrativeGenerator(
  exportNarrativePromptBuilder,
  claudeClient
);
const scoringExportService = new ScoringExportService(
  assessmentRepo,
  assessmentResultRepo,
  dimensionScoreRepo,
  responseRepo,
  scoringPDFExporter,
  scoringWordExporter,
  exportNarrativeGenerator
);

// Initialize file storage and validation (Epic 16)
const fileStorage = createFileStorage();
const fileValidationService = new FileValidationService();
const documentParserService = new DocumentParserService(
  claudeClient,  // IClaudeClient
  claudeClient   // IVisionClient - ClaudeClient implements both
);

// Epic 18: Initialize text extraction service for fast context injection
const textExtractionService = new TextExtractionService();

// Epic 18.4: Initialize vendor validation service
const vendorValidationService = new VendorValidationService(fileRepo);

// Story 28.11.1: Initialize TitleGenerationService for LLM-based title generation
const titleGenerationService = new TitleGenerationService(ANTHROPIC_API_KEY);

// Initialize scoring components (Epic 15, Epic 20: added transactionRunner, Epic 22: added conversationRepo)
const scoringPromptBuilder = new ScoringPromptBuilder();
const scoringPayloadValidator = new ScoringPayloadValidator();
const transactionRunner = new DrizzleTransactionRunner();
const scoringService = new ScoringService(
  responseRepo,
  dimensionScoreRepo,
  assessmentResultRepo,
  assessmentRepo,
  fileRepo,
  fileStorage,
  documentParserService, // IScoringDocumentParser
  claudeClient,          // ILLMClient - ClaudeClient implements this
  scoringPromptBuilder,
  scoringPayloadValidator,
  transactionRunner,     // ITransactionRunner for atomic score storage
  conversationRepo       // Epic 22: IConversationRepository for scoring rehydration
);

// Initialize controllers
const authController = new AuthController(authService);
const vendorController = new VendorController(assessmentService);
const assessmentController = new AssessmentController(assessmentService);
const questionController = new QuestionController(questionService);
const exportController = new ExportController(exportService, assessmentRepo, vendorRepo);
const scoringExportController = new ScoringExportController(
  scoringExportService,
  assessmentRepo
);

// Epic 22.1.1: Initialize scoring rehydration controller
const scoringRehydrationController = new ScoringRehydrationController(scoringService);

// Initialize server
const server = new Server({
  port: PORT,
  corsOrigin: CORS_ORIGIN,
});

// Register routes
server.registerRoutes('/api/auth', createAuthRoutes(authController));
server.registerRoutes('/api/vendors', createVendorRoutes(vendorController, authService));
server.registerRoutes('/api/assessments', createAssessmentRoutes(assessmentController, authService));
server.registerRoutes('/api/assessments', createExportRoutes(exportController, authService));
server.registerRoutes('/api/export/scoring', createScoringExportRoutes(scoringExportController, authService));
server.registerRoutes('/api/scoring', createScoringRoutes(scoringRehydrationController, authService));
server.registerRoutes('/api', createQuestionRoutes(questionController, authService));

// Initialize rate limiter (10 messages per user per minute)
const rateLimiter = new RateLimiter(
  parseInt(process.env.RATE_LIMIT_MAX_MESSAGES || '10', 10),
  parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10)
);

// Initialize ChatServer with WebSocket
const chatServer = new ChatServer(
  server.getIO(),
  conversationService,
  claudeClient,
  rateLimiter,
  JWT_SECRET,
  promptCacheManager,
  assessmentService,
  vendorService,
  questionnaireReadyService,
  questionnaireGenerationService,
  questionService,
  fileRepo,
  scoringService,           // Epic 15
  fileStorage,              // Epic 18: Context injection fallback
  textExtractionService,    // Epic 18: Context injection fallback
  documentParserService,    // Epic 18: Background enrichment (implements IIntakeDocumentParser)
  vendorValidationService,  // Epic 18.4: Vendor validation for multi-vendor clarification
  titleGenerationService    // Story 28.11.1: LLM-based title generation
);

console.log('[App] ChatServer initialized');

// Initialize DocumentUploadController (Epic 16)
// Must be after ChatServer to access the /chat namespace
const chatNamespace = server.getIO().of('/chat');
const documentUploadController = new DocumentUploadController(
  fileStorage,
  fileValidationService,
  documentParserService,  // IIntakeDocumentParser
  documentParserService,  // IScoringDocumentParser (same implementation)
  conversationService,    // Ownership validation + save assistant messages
  chatNamespace,
  fileRepo,               // Epic 16.6.9: File registration in database
  scoringService,         // Epic 15 Sprint 5a: Auto-trigger scoring after parse
  textExtractionService   // Epic 18: Fast text extraction during upload
);

// Register document routes (Epic 16)
server.registerRoutes('/api/documents', createDocumentRoutes(documentUploadController, authService));

// Epic 25: Initialize conversation controller for title updates
const conversationController = new ConversationController(conversationService, server.getIO());
server.registerRoutes('/api/conversations', createConversationRoutes(conversationController, authService));

// Finalize 404 handler (MUST be after all routes are registered)
server.finalize404Handler();

// Register global error handler (MUST be after 404 handler)
server.registerErrorHandler(errorHandler);

console.log('[App] Vendor, Assessment, Question, and Document routes registered');

// Graceful shutdown handlers
const shutdown = async (signal: string) => {
  console.log(`\n[App] Received ${signal}, starting graceful shutdown...`);
  try {
    await server.stop();
    console.log('[App] Graceful shutdown complete');
    process.exit(0);
  } catch (error) {
    console.error('[App] Error during shutdown:', error);
    process.exit(1);
  }
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Start server
server.start().catch((error) => {
  console.error('[App] Failed to start server:', error);
  process.exit(1);
});
