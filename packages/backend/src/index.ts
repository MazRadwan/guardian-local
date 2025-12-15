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
import { PDFExporter } from './infrastructure/export/PDFExporter.js';
import { WordExporter } from './infrastructure/export/WordExporter.js';
import { ExcelExporter } from './infrastructure/export/ExcelExporter.js';
import { DrizzleUserRepository } from './infrastructure/database/repositories/DrizzleUserRepository.js';
import { DrizzleConversationRepository } from './infrastructure/database/repositories/DrizzleConversationRepository.js';
import { DrizzleMessageRepository } from './infrastructure/database/repositories/DrizzleMessageRepository.js';
import { DrizzleVendorRepository } from './infrastructure/database/repositories/DrizzleVendorRepository.js';
import { DrizzleAssessmentRepository } from './infrastructure/database/repositories/DrizzleAssessmentRepository.js';
import { DrizzleQuestionRepository } from './infrastructure/database/repositories/DrizzleQuestionRepository.js';
import { ClaudeClient } from './infrastructure/ai/ClaudeClient.js';
import { JWTProvider } from './infrastructure/auth/JWTProvider.js';
import { AuthController } from './infrastructure/http/controllers/AuthController.js';
import { VendorController } from './infrastructure/http/controllers/VendorController.js';
import { AssessmentController } from './infrastructure/http/controllers/AssessmentController.js';
import { QuestionController } from './infrastructure/http/controllers/QuestionController.js';
import { ExportController } from './infrastructure/http/controllers/ExportController.js';
import { DocumentUploadController } from './infrastructure/http/controllers/DocumentUploadController.js';
import { createAuthRoutes } from './infrastructure/http/routes/auth.routes.js';
import { createVendorRoutes } from './infrastructure/http/routes/vendor.routes.js';
import { createAssessmentRoutes } from './infrastructure/http/routes/assessment.routes.js';
import { createQuestionRoutes } from './infrastructure/http/routes/question.routes.js';
import { createExportRoutes } from './infrastructure/http/routes/export.routes.js';
import { createDocumentRoutes } from './infrastructure/http/routes/document.routes.js';
import { PromptCacheManager } from './infrastructure/ai/PromptCacheManager.js';
import { DocumentParserService } from './infrastructure/ai/DocumentParserService.js';
import { createFileStorage } from './infrastructure/storage/index.js';
import { FileValidationService } from './application/services/FileValidationService.js';
import { getSystemPrompt } from './infrastructure/ai/prompts.js';

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

// Initialize providers
const jwtProvider = new JWTProvider(JWT_SECRET);

// Initialize Claude client
const claudeClient = new ClaudeClient(ANTHROPIC_API_KEY);
const promptCacheManager = new PromptCacheManager(
  { enabled: PROMPT_CACHE_ENABLED, prefix: PROMPT_CACHE_PREFIX },
  getSystemPrompt
);

// Initialize exporters
const pdfExporter = new PDFExporter();
const wordExporter = new WordExporter();
const excelExporter = new ExcelExporter();

// Initialize services
const authService = new AuthService(userRepo, jwtProvider);
const conversationService = new ConversationService(conversationRepo, messageRepo);
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

// Initialize file storage and validation (Epic 16)
const fileStorage = createFileStorage();
const fileValidationService = new FileValidationService();
const documentParserService = new DocumentParserService(
  claudeClient,  // IClaudeClient
  claudeClient   // IVisionClient - ClaudeClient implements both
);

// Initialize controllers
const authController = new AuthController(authService);
const vendorController = new VendorController(assessmentService);
const assessmentController = new AssessmentController(assessmentService);
const questionController = new QuestionController(questionService);
const exportController = new ExportController(exportService, assessmentRepo);

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
server.registerRoutes('/api', createQuestionRoutes(questionController, authService));

// Finalize 404 handler (after all routes)
server.finalize404Handler();

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
  questionService
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
  conversationRepo,
  conversationService,    // Story 4.3: Save context as assistant message
  chatNamespace
);

// Register document routes (Epic 16)
server.registerRoutes('/api/documents', createDocumentRoutes(documentUploadController, authService));

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
