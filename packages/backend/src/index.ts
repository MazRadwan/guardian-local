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

// --- Composition root (repositories, services, controllers, providers) ---
import {
  PORT,
  CORS_ORIGIN,
  JWT_SECRET,
  authService,
  authController,
  vendorController,
  assessmentController,
  questionController,
  exportController,
  scoringExportController,
  scoringRehydrationController,
  conversationService,
  claudeClient,
  promptCacheManager,
  assessmentService,
  vendorService,
  questionnaireReadyService,
  questionnaireGenerationService,
  questionService,
  fileRepo,
  scoringService,
  fileStorage,
  textExtractionService,
  intakeDocumentParser,
  documentParserService,
  vendorValidationService,
  titleGenerationService,
  visionContentBuilder,
  jinaClient,
  fileValidationService,
  backgroundExtractor,
} from './container.js';

// --- Infrastructure: server, websocket, routes, middleware ---
import { Server } from './infrastructure/http/server.js';
import { ChatServer } from './infrastructure/websocket/ChatServer.js';
import { RateLimiter } from './infrastructure/websocket/RateLimiter.js';
import { DocumentUploadController } from './infrastructure/http/controllers/DocumentUploadController.js';
import { ConversationController } from './infrastructure/http/controllers/ConversationController.js';
import { createAuthRoutes } from './infrastructure/http/routes/auth.routes.js';
import { createVendorRoutes } from './infrastructure/http/routes/vendor.routes.js';
import { createAssessmentRoutes } from './infrastructure/http/routes/assessment.routes.js';
import { createQuestionRoutes } from './infrastructure/http/routes/question.routes.js';
import { createExportRoutes } from './infrastructure/http/routes/export.routes.js';
import { createScoringExportRoutes } from './infrastructure/http/routes/scoring.export.routes.js';
import { createScoringRoutes } from './infrastructure/http/routes/scoring.routes.js';
import { createDocumentRoutes } from './infrastructure/http/routes/document.routes.js';
import { createConversationRoutes } from './infrastructure/http/routes/conversation.routes.js';
import { errorHandler } from './infrastructure/http/middleware/error.middleware.js';

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
  intakeDocumentParser,     // Epic 18: Background enrichment (IIntakeDocumentParser)
  vendorValidationService,  // Epic 18.4: Vendor validation for multi-vendor clarification
  titleGenerationService,   // Story 28.11.1: LLM-based title generation
  visionContentBuilder,     // Epic 30 Sprint 3: Vision API for image files
  jinaClient,               // Epic 33: Jina client for web search
  authService               // Auth: DB validation for WebSocket connections
);

console.log('[App] ChatServer initialized');

// Initialize DocumentUploadController (Epic 16)
// Must be after ChatServer to access the /chat namespace
const chatNamespace = server.getIO().of('/chat');
const documentUploadController = new DocumentUploadController(
  fileStorage,
  fileValidationService,
  intakeDocumentParser,    // IIntakeDocumentParser (Story 39.4.1: separate implementation)
  documentParserService,   // IScoringDocumentParser
  conversationService,    // Ownership validation + save assistant messages
  chatNamespace,
  fileRepo,               // Epic 16.6.9: File registration in database
  scoringService,         // Epic 15 Sprint 5a: Auto-trigger scoring after parse
  textExtractionService,  // Epic 18: Fast text extraction during upload
  backgroundExtractor     // Epic 31: Async text extraction
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
