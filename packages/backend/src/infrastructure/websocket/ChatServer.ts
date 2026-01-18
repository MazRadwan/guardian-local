import { Server as SocketIOServer, Socket } from 'socket.io';
import { ConversationService } from '../../application/services/ConversationService.js';
import { AssessmentService } from '../../application/services/AssessmentService.js';
import { VendorService } from '../../application/services/VendorService.js';
import { QuestionnaireGenerationService } from '../../application/services/QuestionnaireGenerationService.js';
import { QuestionService } from '../../application/services/QuestionService.js';
import type { IScoringService, ScoringInput } from '../../application/interfaces/IScoringService.js';
import type { IClaudeClient, ClaudeMessage, ToolUseBlock } from '../../application/interfaces/IClaudeClient.js';
import type { IFileRepository, FileWithIntakeContext, FileWithExcerpt, FileRecord } from '../../application/interfaces/IFileRepository.js';
import type { IFileStorage } from '../../application/interfaces/IFileStorage.js';
import type { ITextExtractionService, ValidatedDocumentType } from '../../application/interfaces/ITextExtractionService.js';
import type { IIntakeDocumentParser } from '../../application/interfaces/IIntakeDocumentParser.js';
import { PromptCacheManager } from '../ai/PromptCacheManager.js';
import { RateLimiter } from './RateLimiter.js';
import jwt from 'jsonwebtoken';
import { QuestionnaireReadyService } from '../../application/services/QuestionnaireReadyService.js';
import { assessmentModeTools } from '../ai/tools/index.js';
import type { GenerationPhasePayload, GenerationPhaseId } from '@guardian/shared';
import type { IntakeDocumentContext } from '../../domain/entities/Conversation.js';
import type { MessageAttachment } from '../../domain/entities/Message.js';
import { sanitizeForPrompt } from '../../utils/sanitize.js';
import type { ScoringProgressEvent } from '../../domain/scoring/types.js';
import type { VendorValidationService } from '../../application/services/VendorValidationService.js';
// Epic 18: Scoring now triggered on user Send (trigger-on-send pattern)

/**
 * Epic 18: MIME type to validated document type mapping
 * Used for context injection fallback when re-reading from S3.
 * Handles DOCX-as-ZIP edge case by mapping to correct type.
 */
const MIME_TYPE_MAP: Record<string, ValidatedDocumentType> = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'image/png': 'image',
  'image/jpeg': 'image',
  'image/webp': 'image',
};

interface AuthenticatedSocket extends Socket {
  userId?: string;
  userEmail?: string;
  userRole?: string;
  conversationId?: string; // Auto-created conversation ID for this socket session
}

interface JWTPayload {
  userId: string;
  email: string;
  role: string;
}

interface SendMessagePayload {
  conversationId?: string; // Optional - can use socket.conversationId
  text?: string; // Message text (preferred)
  content?: string; // Backward compatibility with frontend
  components?: Array<{
    type: 'button' | 'link' | 'form' | 'download' | 'error' | 'scoring_result';
    data: unknown;
  }>;
  // Epic 16.6.9: File attachments now only send fileId (server validates and enriches)
  attachments?: Array<{ fileId: string }>;
  // Story 24.1: Flag for regenerate requests - tells LLM to provide different response
  isRegenerate?: boolean;
}

interface GetHistoryPayload {
  conversationId: string;
  limit?: number;
  offset?: number;
}

interface GenerateQuestionnairePayload {
  conversationId: string;
  assessmentType?: string;
  vendorName?: string;
  solutionName?: string;
  contextSummary?: string;
  selectedCategories?: string[];
}

// NOTE: StartScoringPayload removed in Sprint 5a - scoring now auto-triggers
// after successful document parse in DocumentUploadController.runScoring()

export class ChatServer {
  private io: SocketIOServer;
  private conversationService: ConversationService;
  private claudeClient: IClaudeClient;
  private rateLimiter: RateLimiter;
  private jwtSecret: string;
  private promptCacheManager: PromptCacheManager;
  private pendingConversationCreations: Map<string, { conversationId: string; timestamp: number }>;
  private abortedStreams: Set<string> = new Set();

  constructor(
    io: SocketIOServer,
    conversationService: ConversationService,
    claudeClient: IClaudeClient,
    rateLimiter: RateLimiter,
    jwtSecret: string,
    promptCacheManager: PromptCacheManager,
    private readonly assessmentService: AssessmentService,
    private readonly vendorService: VendorService,
    private readonly questionnaireReadyService: QuestionnaireReadyService,
    private readonly questionnaireGenerationService: QuestionnaireGenerationService,
    private readonly questionService: QuestionService,
    private readonly fileRepository: IFileRepository,
    private readonly scoringService?: IScoringService,
    // Epic 18: Dependencies for context injection fallback and background enrichment
    private readonly fileStorage?: IFileStorage,
    private readonly textExtractionService?: ITextExtractionService,
    // Epic 18 Sprint 3: Intake parser for background enrichment
    private readonly intakeParser?: IIntakeDocumentParser,
    // Epic 18.4: Vendor validation for multi-vendor clarification
    private readonly vendorValidationService?: VendorValidationService
  ) {
    this.io = io;
    this.conversationService = conversationService;
    this.claudeClient = claudeClient;
    this.rateLimiter = rateLimiter;
    this.jwtSecret = jwtSecret;
    this.promptCacheManager = promptCacheManager;
    this.pendingConversationCreations = new Map();
    this.setupNamespace();

    // Clean up stale pending creations every 5 seconds
    // .unref() allows Node.js to exit even if interval is running (for tests)
    setInterval(() => {
      const now = Date.now();
      for (const [userId, { timestamp }] of this.pendingConversationCreations.entries()) {
        if (now - timestamp > 1000) { // 1 second timeout (generous cleanup window)
          this.pendingConversationCreations.delete(userId);
        }
      }
    }, 5000).unref();
  }

  /**
   * Build conversation context for Claude API
   * Loads recent message history and selects appropriate system prompt
   *
   * Epic 16.6.1: Injects stored intake context as synthetic assistant message
   * This ensures Claude sees uploaded document context without a visible chat message
   */
  private async buildConversationContext(
    conversationId: string,
    isRegenerate?: boolean  // Story 24.1: Flag to add retry context to system prompt
  ): Promise<{
    messages: ClaudeMessage[];
    systemPrompt: string;
    mode: 'consult' | 'assessment' | 'scoring';
    promptCache: { usePromptCache: boolean; cachedPromptId?: string };
  }> {
    // Get conversation to determine mode
    const conversation = await this.conversationService.getConversation(conversationId);

    if (!conversation) {
      throw new Error(`Conversation ${conversationId} not found`);
    }

    // Load last 10 messages for context
    const history = await this.conversationService.getHistory(conversationId, 10);

    // Format messages for Claude API (only user/assistant, skip system messages)
    // Also filter out empty messages (Claude API requires non-empty content)
    const messages: ClaudeMessage[] = history
      .filter((msg) => msg.role === 'user' || msg.role === 'assistant')
      .map((msg) => ({
        role: msg.role as 'user' | 'assistant',
        content: typeof msg.content === 'string' ? msg.content : msg.content.text || '',
      }))
      .filter((msg) => msg.content.trim().length > 0);

    // Epic 17.3: Inject stored intake context(s) as synthetic assistant message
    // Query per-file contexts (sorted by parse time, oldest first)
    const filesWithContext = await this.fileRepository.findByConversationWithContext(conversationId);
    const contextsFromFiles = filesWithContext.filter(f => f.intakeContext);

    // Get legacy context from conversation
    const legacyContext = conversation.context?.intakeContext;
    const legacyGapCategories = conversation.context?.intakeGapCategories;

    // Inject combined context message if any contexts exist
    if (contextsFromFiles.length > 0 || legacyContext) {
      const contextMessage = contextsFromFiles.length > 0
        ? this.formatMultiDocContextForClaude(contextsFromFiles, legacyContext, legacyGapCategories)
        : this.formatIntakeContextForClaude(legacyContext!, legacyGapCategories);

      // Prepend as first assistant message (Claude sees it, user doesn't)
      messages.unshift({
        role: 'assistant',
        content: contextMessage,
      });
    }

    // Get system prompt (and cache metadata) based on conversation mode
    // Always include tool instructions (tool-based trigger is now the only path)
    const promptCache = this.promptCacheManager.ensureCached(conversation.mode, {
      includeToolInstructions: true,
    });

    // Story 24.1: Add retry context when regenerating to get different response
    let systemPrompt = promptCache.systemPrompt;
    if (isRegenerate) {
      systemPrompt = `${systemPrompt}\n\nIMPORTANT: The user has requested a different response. Please provide a fresh perspective with different wording, examples, or approach. Avoid repeating your previous answer.`;
    }

    return {
      messages,
      systemPrompt,
      mode: conversation.mode,
      promptCache: {
        usePromptCache: promptCache.usePromptCache,
        cachedPromptId: promptCache.cachedPromptId,
      },
    };
  }

  /**
   * Sanitize string for use in Claude prompts
   * Removes control characters, normalizes whitespace, and truncates to max length
   */
  private sanitizeForPrompt(str: string | null, maxLength: number = 200): string {
    if (!str) return '';
    const cleaned = str
      .replace(/[\x00-\x1F\x7F]/g, '') // Remove control chars
      .replace(/\s+/g, ' ')            // Normalize whitespace
      .trim();
    return cleaned.slice(0, maxLength);
  }

  /**
   * Sanitize error message for client
   * Prevents SQL queries and internal details from leaking to clients
   *
   * Sprint 17.3 Security Fix: Raw SQL was being sent to clients in error messages
   */
  private sanitizeErrorForClient(error: unknown, fallbackMessage: string): string {
    if (!(error instanceof Error)) {
      return fallbackMessage;
    }

    const message = error.message;

    // Detect SQL/database errors (contains SQL keywords or query patterns)
    const sqlPatterns = [
      /\bSELECT\b/i,
      /\bINSERT\b/i,
      /\bUPDATE\b/i,
      /\bDELETE\b/i,
      /\bFROM\b.*\bWHERE\b/i,
      /\$\d+/,  // PostgreSQL parameter placeholders
      /params:/i,
      /Failed query:/i,
      /ECONNREFUSED/,
      /ETIMEDOUT/,
      /duplicate key/i,
      /violates.*constraint/i,
    ];

    for (const pattern of sqlPatterns) {
      if (pattern.test(message)) {
        // Log the full error server-side, return generic message to client
        console.error('[ChatServer] Suppressed SQL error from client:', message);
        return fallbackMessage;
      }
    }

    // Safe to return (but still truncate for safety)
    return message.slice(0, 200);
  }

  /**
   * Format multiple document contexts as synthetic assistant message for Claude
   *
   * Epic 17.3: Multi-document support - aggregates context from all uploaded files
   * plus legacy context for backward compatibility.
   *
   * This is NOT displayed to users - it's injected into Claude's message history
   * so Claude "remembers" having analyzed all uploaded documents.
   */
  private formatMultiDocContextForClaude(
    files: FileWithIntakeContext[],
    legacyContext?: IntakeDocumentContext | null,
    legacyGapCategories?: string[] | null
  ): string {
    const parts: string[] = [
      `I have analyzed ${files.length} uploaded document(s) and extracted the following context:`,
    ];

    // Per-document summary
    files.forEach((file, i) => {
      const ctx = file.intakeContext!;
      parts.push(`\n**Document ${i + 1}: ${this.sanitizeForPrompt(file.filename, 100)}**`);
      if (ctx.vendorName) parts.push(`- Vendor: ${this.sanitizeForPrompt(ctx.vendorName)}`);
      if (ctx.solutionName) parts.push(`- Solution: ${this.sanitizeForPrompt(ctx.solutionName)}`);
      if (ctx.solutionType) parts.push(`- Type: ${this.sanitizeForPrompt(ctx.solutionType)}`);
      if (ctx.industry) parts.push(`- Industry: ${this.sanitizeForPrompt(ctx.industry)}`);
    });

    // Include legacy context if present AND not duplicate
    if (legacyContext && !files.some(f =>
      f.intakeContext?.vendorName === legacyContext.vendorName &&
      f.intakeContext?.solutionName === legacyContext.solutionName
    )) {
      parts.push(`\n**Prior Document (legacy):**`);
      if (legacyContext.vendorName) parts.push(`- Vendor: ${this.sanitizeForPrompt(legacyContext.vendorName)}`);
      if (legacyContext.solutionName) parts.push(`- Solution: ${this.sanitizeForPrompt(legacyContext.solutionName)}`);
    }

    // Sprint 17.3 Fix: Sanitize BEFORE dedup (prevents distinct raw strings collapsing to same sanitized value)
    const allFeatures = [...new Set(
      [
        ...files.flatMap(f => f.intakeContext?.features || []),
        ...(legacyContext?.features || []),
      ].map(f => this.sanitizeForPrompt(f, 100)).filter(Boolean)
    )];

    const allClaims = [...new Set(
      [
        ...files.flatMap(f => f.intakeContext?.claims || []),
        ...(legacyContext?.claims || []),
      ].map(c => this.sanitizeForPrompt(c, 100)).filter(Boolean)
    )];

    const allCompliance = [...new Set(
      [
        ...files.flatMap(f => f.intakeContext?.complianceMentions || []),
        ...(legacyContext?.complianceMentions || []),
      ].map(c => this.sanitizeForPrompt(c, 50)).filter(Boolean)
    )];

    const allGaps = [...new Set(
      [
        ...files.flatMap(f => f.intakeGapCategories || []),
        ...(legacyGapCategories || []),
      ].map(g => this.sanitizeForPrompt(g, 50)).filter(Boolean)
    )];

    if (allFeatures.length > 0) {
      parts.push(`\n**Combined Features:** ${allFeatures.slice(0, 10).join(', ')}`);
    }
    if (allClaims.length > 0) {
      parts.push(`**Combined Claims:** ${allClaims.slice(0, 5).join(', ')}`);
    }
    if (allCompliance.length > 0) {
      parts.push(`**Compliance Mentions:** ${allCompliance.join(', ')}`);
    }
    if (allGaps.length > 0) {
      parts.push(`**Areas Needing Clarification:** ${allGaps.join(', ')}`);
    }

    parts.push('', 'I will use this combined context to assist with the assessment.');
    return parts.join('\n');
  }

  /**
   * Format stored intake context as synthetic assistant message for Claude
   *
   * Epic 16.6.1: This is NOT displayed to users - it's injected into Claude's message history
   * so Claude "remembers" having analyzed the uploaded document.
   *
   * Sprint 17.3 Fix: Now uses sanitizeForPrompt for security (matches multi-doc path)
   */
  private formatIntakeContextForClaude(
    ctx: IntakeDocumentContext,
    gapCategories?: string[]
  ): string {
    const parts: string[] = [
      'I have analyzed the uploaded document and extracted the following context:',
    ];

    if (ctx.vendorName) parts.push(`- Vendor: ${this.sanitizeForPrompt(ctx.vendorName)}`);
    if (ctx.solutionName) parts.push(`- Solution: ${this.sanitizeForPrompt(ctx.solutionName)}`);
    if (ctx.solutionType) parts.push(`- Type: ${this.sanitizeForPrompt(ctx.solutionType)}`);
    if (ctx.industry) parts.push(`- Industry: ${this.sanitizeForPrompt(ctx.industry)}`);
    if (ctx.features?.length) {
      const sanitizedFeatures = ctx.features.slice(0, 5).map(f => this.sanitizeForPrompt(f, 100)).filter(Boolean);
      if (sanitizedFeatures.length) parts.push(`- Key Features: ${sanitizedFeatures.join(', ')}`);
    }
    if (ctx.claims?.length) {
      const sanitizedClaims = ctx.claims.slice(0, 3).map(c => this.sanitizeForPrompt(c, 100)).filter(Boolean);
      if (sanitizedClaims.length) parts.push(`- Claims: ${sanitizedClaims.join(', ')}`);
    }
    if (ctx.complianceMentions?.length) {
      const sanitizedCompliance = ctx.complianceMentions.map(c => this.sanitizeForPrompt(c, 50)).filter(Boolean);
      if (sanitizedCompliance.length) parts.push(`- Compliance Mentions: ${sanitizedCompliance.join(', ')}`);
    }
    if (gapCategories?.length) {
      const sanitizedGaps = gapCategories.map(g => this.sanitizeForPrompt(g, 50)).filter(Boolean);
      if (sanitizedGaps.length) parts.push(`- Areas Needing Clarification: ${sanitizedGaps.join(', ')}`);
    }

    parts.push('', 'I will use this context to assist with the assessment.');
    return parts.join('\n');
  }

  /**
   * Epic 18: Build context for Claude from attached files using fallback hierarchy
   *
   * Fallback hierarchy:
   * 1. intakeContext (structured, from Claude enrichment) - best
   * 2. textExcerpt (raw text, from upload extraction) - good
   * 3. Re-read from S3 (slow fallback for missing excerpt)
   *
   * @param conversationId - Conversation to get files for
   * @param scopeToFileIds - Optional array of file IDs to limit context to (for auto-summarize)
   * @returns Formatted context string for Claude (empty if no files)
   */
  private async buildFileContext(conversationId: string, scopeToFileIds?: string[]): Promise<string> {
    // Use new method that returns ALL files (not just those with intakeContext)
    let files = await this.fileRepository.findByConversationWithExcerpt(conversationId);

    // If scoped to specific files, filter to only those
    if (scopeToFileIds && scopeToFileIds.length > 0) {
      const scopeSet = new Set(scopeToFileIds);
      files = files.filter(f => scopeSet.has(f.id));
    }

    if (files.length === 0) {
      return '';
    }

    const contextParts: string[] = [];

    for (const file of files) {
      // Priority 1: Structured intake context (best)
      if (file.intakeContext) {
        contextParts.push(this.formatIntakeContextFile(file));
        continue;
      }

      // Priority 2: Text excerpt (good, fast)
      if (file.textExcerpt) {
        contextParts.push(this.formatTextExcerptFile(file));
        continue;
      }

      // Priority 3: Re-read from S3 (slow fallback for missing excerpt)
      console.warn(`[ChatServer] File ${file.id} has no excerpt, falling back to S3 read`);
      try {
        const excerpt = await this.extractExcerptFromStorage(file);
        if (excerpt) {
          contextParts.push(this.formatTextExcerptFile({ ...file, textExcerpt: excerpt }));

          // Lazy backfill: Store for next time (fire-and-forget)
          this.fileRepository.updateTextExcerpt(file.id, excerpt).catch(err => {
            console.error(`[ChatServer] Failed to backfill excerpt for ${file.id}:`, err);
          });
        }
      } catch (err) {
        console.error(`[ChatServer] Failed to extract excerpt for ${file.id}:`, err);
        // Continue without this file's context
      }
    }

    if (contextParts.length === 0) {
      return '';
    }

    return `\n\n--- Attached Documents ---\n${contextParts.join('\n\n')}`;
  }

  /**
   * Epic 18: Format structured intake context for a single file
   */
  private formatIntakeContextFile(file: FileWithExcerpt): string {
    const ctx = file.intakeContext!;
    const parts: string[] = [`[Document: ${this.sanitizeForPrompt(file.filename, 100)}]`];

    if (ctx.vendorName) parts.push(`Vendor: ${this.sanitizeForPrompt(ctx.vendorName)}`);
    if (ctx.solutionName) parts.push(`Solution: ${this.sanitizeForPrompt(ctx.solutionName)}`);
    if (ctx.solutionType) parts.push(`Type: ${this.sanitizeForPrompt(ctx.solutionType)}`);
    if (ctx.features?.length) {
      const features = ctx.features.slice(0, 5).map(f => this.sanitizeForPrompt(f, 100)).filter(Boolean);
      if (features.length) parts.push(`Features: ${features.join(', ')}`);
    }
    if (ctx.claims?.length) {
      const claims = ctx.claims.slice(0, 3).map(c => this.sanitizeForPrompt(c, 100)).filter(Boolean);
      if (claims.length) parts.push(`Claims: ${claims.join(', ')}`);
    }
    if (ctx.complianceMentions?.length) {
      const compliance = ctx.complianceMentions.map(c => this.sanitizeForPrompt(c, 50)).filter(Boolean);
      if (compliance.length) parts.push(`Compliance: ${compliance.join(', ')}`);
    }

    return parts.join('\n');
  }

  /**
   * Epic 18: Format raw text excerpt for a single file
   *
   * SECURITY: Uses sanitizeForPrompt to avoid injecting raw/malicious text
   */
  private formatTextExcerptFile(file: FileWithExcerpt): string {
    // Sanitize excerpt before injecting into Claude prompt
    const sanitizedExcerpt = sanitizeForPrompt(file.textExcerpt || '', {
      maxLength: 10000,
      stripControlChars: true,
      escapePromptInjection: true,
    });

    return `[Document: ${this.sanitizeForPrompt(file.filename, 100)}]
(Raw text excerpt - enrichment pending)

${sanitizedExcerpt}`;
  }

  /**
   * Epic 18: Extract excerpt from S3 storage (slow fallback)
   *
   * IMPORTANT: Uses validated documentType via MIME_TYPE_MAP
   * (not raw mimeType) to handle DOCX-as-ZIP edge case correctly.
   *
   * @param file - File record to extract from
   * @returns Extracted excerpt or null if extraction fails
   */
  private async extractExcerptFromStorage(file: FileWithExcerpt): Promise<string | null> {
    // Check if dependencies are available
    if (!this.fileStorage || !this.textExtractionService) {
      console.warn('[ChatServer] File storage or text extraction service not configured, skipping S3 fallback');
      return null;
    }

    const buffer = await this.fileStorage.retrieve(file.storagePath);

    // Map MIME type to validated document type (handles DOCX-as-ZIP)
    const documentType = MIME_TYPE_MAP[file.mimeType];
    if (!documentType) {
      console.warn(`[ChatServer] Unknown MIME type for extraction: ${file.mimeType}`);
      return null;
    }

    const result = await this.textExtractionService.extract(buffer, documentType);

    if (!result.success) {
      console.warn(`[ChatServer] Text extraction failed for ${file.id}: ${result.error}`);
      return null;
    }

    return result.excerpt;
  }

  // =========================================================================
  // Epic 18 Sprint 3: Mode-Specific Behavior
  // =========================================================================

  /**
   * Epic 18 Story 18.3.2: Background enrichment for Assessment mode
   *
   * Runs in background (fire-and-forget) after immediate response is sent.
   * Uses tryStartParsing() for idempotency - prevents duplicate processing.
   *
   * @param conversationId - Conversation containing files to enrich
   * @param fileIds - File IDs to process
   */
  private async enrichInBackground(
    conversationId: string,
    fileIds: string[]
  ): Promise<void> {
    // Check dependencies
    if (!this.intakeParser || !this.fileStorage) {
      console.warn('[ChatServer] Intake parser or file storage not configured, skipping background enrichment');
      return;
    }

    for (const fileId of fileIds) {
      try {
        // Use idempotency check (parseStatus column)
        // Only proceeds if status was 'pending' -> 'in_progress'
        const started = await this.fileRepository.tryStartParsing(fileId);
        if (!started) {
          console.log(`[ChatServer] File ${fileId} already being processed, skipping`);
          continue;
        }

        // Get file record for storage path
        const file = await this.fileRepository.findById(fileId);
        if (!file) {
          console.warn(`[ChatServer] File ${fileId} not found for enrichment`);
          await this.fileRepository.updateParseStatus(fileId, 'failed');
          continue;
        }

        // Retrieve file from storage
        const buffer = await this.fileStorage.retrieve(file.storagePath);

        // Map MIME type to document type
        const documentType = MIME_TYPE_MAP[file.mimeType];
        if (!documentType) {
          console.warn(`[ChatServer] Unsupported MIME type for enrichment: ${file.mimeType}`);
          await this.fileRepository.updateParseStatus(fileId, 'failed');
          continue;
        }

        // Parse for context (assessment mode uses standard enrichment)
        const result = await this.intakeParser.parseForContext(buffer, {
          filename: file.filename,
          mimeType: file.mimeType,
          sizeBytes: file.size,
          documentType,
          storagePath: file.storagePath,
          uploadedAt: file.createdAt,
          uploadedBy: file.userId,
        });

        if (result.success && result.context) {
          // Store enriched context
          await this.fileRepository.updateIntakeContext(
            fileId,
            {
              vendorName: result.context.vendorName,
              solutionName: result.context.solutionName,
              solutionType: result.context.solutionType,
              industry: result.context.industry,
              features: result.context.features,
              claims: result.context.claims,
              complianceMentions: result.context.complianceMentions,
            },
            result.gapCategories
          );
          await this.fileRepository.updateParseStatus(fileId, 'completed');
          console.log(`[ChatServer] Background enrichment completed for file ${fileId}`);
        } else {
          console.warn(`[ChatServer] Background enrichment failed for file ${fileId}: ${result.error}`);
          await this.fileRepository.updateParseStatus(fileId, 'failed');
        }
      } catch (err) {
        console.error(`[ChatServer] Error during background enrichment for file ${fileId}:`, err);
        // Mark as failed but continue with other files
        await this.fileRepository.updateParseStatus(fileId, 'failed').catch(() => {});
      }
    }
  }

  /**
   * Epic 18 Story 18.3.3: Trigger scoring on Send for Scoring mode
   *
   * Called when user sends a message in Scoring mode with attachments.
   * Uses tryStartParsing() for idempotency.
   * Emits scoring_progress events during processing.
   *
   * @param socket - Client socket to emit progress to
   * @param conversationId - Conversation being scored
   * @param userId - User who initiated scoring
   * @param fileIds - Files to parse and score
   */
  private async triggerScoringOnSend(
    socket: AuthenticatedSocket,
    conversationId: string,
    userId: string,
    fileIds: string[],
    userQuery?: string  // Epic 18.4.3: Optional user query to address after scoring
  ): Promise<void> {
    // Check dependencies
    if (!this.scoringService || !this.fileStorage) {
      console.warn('[ChatServer] Scoring service or file storage not configured');
      socket.emit('scoring_error', {
        conversationId,
        error: 'Scoring is not available',
        code: 'SERVICE_UNAVAILABLE',
      });
      return;
    }

    // Epic 18.4.2a: Validate single vendor before scoring
    // If multiple vendors detected, emit clarification event for user to choose
    if (this.vendorValidationService && fileIds.length > 0) {
      const validationResult = await this.vendorValidationService.validateSingleVendor(fileIds);

      if (!validationResult.valid && validationResult.vendors) {
        console.log(
          `[ChatServer] Multiple vendors detected (${validationResult.vendors.length}), requesting clarification`
        );

        // Initialize pending clarifications map if not exists (stores by conversationId)
        if (!socket.data.pendingVendorClarifications) {
          socket.data.pendingVendorClarifications = new Map();
        }

        // Store pending scoring request keyed by conversationId
        // This prevents overwrites when multiple conversations have pending clarifications
        socket.data.pendingVendorClarifications.set(conversationId, {
          conversationId,
          userId,
          fileIds,
          userQuery,
          vendors: validationResult.vendors,
        });

        // Emit clarification event - frontend will show vendor selection UI
        socket.emit('vendor_clarification_needed', {
          conversationId,
          vendors: validationResult.vendors,
          message: `I found documents from ${validationResult.vendors.length} different vendors. Which vendor would you like to score first?`,
        });

        return; // Wait for user selection before proceeding
      }
    }

    for (const fileId of fileIds) {
      try {
        // Get file record
        const file = await this.fileRepository.findById(fileId);
        if (!file) {
          console.warn(`[ChatServer] File ${fileId} not found for scoring`);
          continue;
        }

        // Epic 18: Short-circuit scoring if document is classified as non-questionnaire
        // This prevents the expensive 30-second Claude parse for obviously wrong documents
        if (file.detectedDocType === 'document') {
          console.log(`[ChatServer] File ${fileId} classified as 'document', not a questionnaire`);
          socket.emit('scoring_error', {
            conversationId,
            fileId,
            error: 'This appears to be a general document (like a product brief or marketing material), not a completed questionnaire. Questionnaires exported from Guardian have a specific format with numbered questions and vendor responses. Try uploading in Consult mode to discuss this document, or Assessment mode to start a new vendor assessment.',
            code: 'NOT_A_QUESTIONNAIRE',
          });
          // Reset parse status since we're not actually parsing
          await this.fileRepository.updateParseStatus(fileId, 'pending');
          continue;
        }

        // Check if already completed (idempotency)
        if (file.parseStatus === 'completed') {
          console.log(`[ChatServer] File ${fileId} already parsed, checking for scoring`);
          // File is parsed, but we still need to get the assessmentId
          // For now, emit an info message - scoring may have already happened
          continue;
        }

        // Try to start parsing (atomic idempotency check)
        const started = await this.fileRepository.tryStartParsing(fileId);
        if (!started) {
          console.log(`[ChatServer] File ${fileId} already being processed`);
          socket.emit('scoring_progress', {
            conversationId,
            fileId, // Epic 18: Include fileId for tracking
            status: 'parsing',
            message: 'Document is already being processed...',
          } as ScoringProgressEvent);
          continue;
        }

        // Emit initial progress
        socket.emit('scoring_progress', {
          conversationId,
          fileId, // Epic 18: Include fileId for tracking
          status: 'parsing',
          progress: 10,
          message: 'Analyzing questionnaire responses...',
        } as ScoringProgressEvent);

        // Epic 18: No longer require conversation.assessmentId - ScoringService will extract
        // the assessment ID from the uploaded questionnaire document. This supports the
        // workflow where users upload completed questionnaires in Scoring mode without
        // needing to first generate the questionnaire in the same conversation.

        // Emit scoring started (assessmentId will be determined from file)
        socket.emit('scoring_started', {
          fileId,
          conversationId,
        });

        // Build scoring input - assessmentId is optional, will be extracted from document
        const scoringInput: ScoringInput = {
          // assessmentId omitted - will be extracted from the uploaded questionnaire
          conversationId,
          fileId,
          userId,
        };

        // Run scoring with progress callback
        const scoringResult = await this.scoringService.score(scoringInput, (event: ScoringProgressEvent) => {
          console.log(`[ChatServer] Scoring progress: ${event.status} - ${event.message}`);
          socket.emit('scoring_progress', {
            conversationId,
            fileId, // Epic 18: Include fileId for tracking
            status: event.status,
            message: event.message,
            progress: event.progress,
          });
        });

        if (scoringResult.success && scoringResult.report) {
          // Epic 18: Get assessmentId from the scoring report (extracted from document)
          const assessmentId = scoringResult.report.assessmentId;

          // Build result data for frontend
          const resultData = {
            compositeScore: scoringResult.report.payload.compositeScore,
            recommendation: scoringResult.report.payload.recommendation,
            overallRiskRating: scoringResult.report.payload.overallRiskRating,
            executiveSummary: scoringResult.report.payload.executiveSummary,
            keyFindings: scoringResult.report.payload.keyFindings,
            dimensionScores: scoringResult.report.payload.dimensionScores.map(ds => ({
              dimension: ds.dimension,
              score: ds.score,
              riskRating: ds.riskRating,
            })),
            batchId: scoringResult.batchId,
            assessmentId,
          };

          // Emit scoring complete with results
          socket.emit('scoring_complete', {
            conversationId,
            result: resultData,
            narrativeReport: scoringResult.report.narrativeReport,
          });

          // Mark file as completed
          await this.fileRepository.updateParseStatus(fileId, 'completed');

          // Save narrative report as assistant message
          // Note: Don't include scoring_result component here - it's already displayed
          // from the store state set by scoring_complete event. Including it would cause
          // duplicate card rendering.
          const narrativeText = scoringResult.report.narrativeReport ||
            `Risk assessment complete. Composite score: ${scoringResult.report.payload.compositeScore}/100. ` +
            `Overall risk: ${scoringResult.report.payload.overallRiskRating}. ` +
            `Recommendation: ${scoringResult.report.payload.recommendation}.`;

          const reportMessage = await this.conversationService.sendMessage({
            conversationId,
            role: 'assistant',
            content: {
              text: narrativeText,
              // No components - scoring card rendered from store state via scoring_complete event
            },
          });

          // Emit the message for display (narrative only, card is from scoring_complete)
          socket.emit('message', {
            id: reportMessage.id,
            conversationId: reportMessage.conversationId,
            role: reportMessage.role,
            content: reportMessage.content,
            createdAt: reportMessage.createdAt,
          });

          // Epic 22.1.1: Link assessment to conversation for rehydration
          // Non-fatal - scoring already succeeded, don't emit scoring_error if this fails
          try {
            await this.conversationService.linkAssessment(conversationId, assessmentId);
          } catch (linkError) {
            console.warn(`[ChatServer] Failed to link assessment (non-fatal):`, linkError);
          }

          console.log(`[ChatServer] Scoring completed: assessmentId=${assessmentId}, score=${scoringResult.report.payload.compositeScore}`);

          // =========================================================
          // Epic 18.4.3: Address user query after scoring
          // =========================================================
          if (userQuery && userQuery.trim().length > 0) {
            console.log(`[ChatServer] Addressing user query after scoring: "${userQuery.slice(0, 50)}..."`);

            try {
              // Build context with scoring results
              const scoringContext = this.buildScoringFollowUpContext(scoringResult.report);

              // Get conversation history (includes scoring narrative)
              const { messages, systemPrompt } = await this.buildConversationContext(conversationId);

              // Build enhanced prompt with scoring context
              const enhancedPrompt = `${systemPrompt}

${scoringContext}

The user submitted this questionnaire with a question. The scoring has completed.
Now address their question using the scoring results above as context.
Be specific and reference actual scores and findings from the assessment.
If they asked about a specific dimension or topic, focus your answer on that area.`;

              // Emit typing indicator
              socket.emit('assistant_stream_start', { conversationId });

              // Stream Claude response
              let fullResponse = '';

              for await (const chunk of this.claudeClient.streamMessage(messages, { systemPrompt: enhancedPrompt })) {
                if (!chunk.isComplete && chunk.content) {
                  fullResponse += chunk.content;
                  socket.emit('assistant_token', {
                    conversationId,
                    token: chunk.content,
                  });
                }
              }

              // Save assistant response
              const followUpMessage = await this.conversationService.sendMessage({
                conversationId,
                role: 'assistant',
                content: { text: fullResponse },
              });

              // Emit stream complete
              socket.emit('assistant_done', {
                conversationId,
                messageId: followUpMessage.id,
                fullText: fullResponse,
              });

              console.log(`[ChatServer] User query addressed (${fullResponse.length} chars)`);
            } catch (error) {
              console.error('[ChatServer] Failed to address user query:', error);
              // Non-fatal - scoring already completed
              socket.emit('message', {
                role: 'assistant',
                content: "I've completed the scoring. I tried to address your question but encountered an issue. Feel free to ask again.",
                conversationId,
              });
            }
          }
        } else {
          // Scoring failed
          await this.fileRepository.updateParseStatus(fileId, 'failed');
          socket.emit('scoring_error', {
            conversationId,
            error: scoringResult.error || 'Scoring failed',
            code: scoringResult.code || 'SCORING_FAILED',
          });

          // Save error as system message
          await this.conversationService.sendMessage({
            conversationId,
            role: 'system',
            content: { text: `[System: Scoring failed - ${scoringResult.error || 'Unknown error'}]` },
          });
        }
      } catch (err) {
        console.error(`[ChatServer] Error during scoring for file ${fileId}:`, err);
        await this.fileRepository.updateParseStatus(fileId, 'failed').catch(() => {});
        socket.emit('scoring_error', {
          conversationId,
          error: err instanceof Error ? err.message : 'Scoring failed',
          code: 'SCORING_FAILED',
        });
      }
    }
  }

  /**
   * Epic 18.4.3: Build scoring context for follow-up questions
   *
   * Formats the scoring results as context for Claude to reference
   * when answering user questions about the assessment.
   */
  private buildScoringFollowUpContext(report: {
    payload: {
      compositeScore: number;
      overallRiskRating: string;
      recommendation: string;
      executiveSummary: string;
      keyFindings: string[];
      dimensionScores: Array<{
        dimension: string;
        score: number;
        riskRating: string;
      }>;
    };
  }): string {
    const { payload } = report;

    // Format dimension scores for context
    const dimensionSummary = payload.dimensionScores
      .map(ds => `- ${ds.dimension}: ${ds.score}/10 (${ds.riskRating})`)
      .join('\n');

    return `
## Scoring Results Context

**Composite Score:** ${payload.compositeScore}/100
**Overall Risk Rating:** ${payload.overallRiskRating}
**Recommendation:** ${payload.recommendation}

### Dimension Scores:
${dimensionSummary}

### Key Findings:
${payload.keyFindings.map(f => `- ${f}`).join('\n')}

### Executive Summary:
${payload.executiveSummary}
`;
  }

  /**
   * Epic 18.4.5: Auto-summarize documents in Consult mode
   *
   * When user sends file(s) without a message in Consult mode,
   * automatically generate a summary to kickstart the conversation.
   *
   * @param socket - Client socket to emit events to
   * @param conversationId - Conversation containing the files
   * @param userId - User who uploaded the files
   * @param fileIds - File IDs to summarize
   */
  private async autoSummarizeDocuments(
    socket: AuthenticatedSocket,
    conversationId: string,
    userId: string,
    fileIds: string[]
  ): Promise<void> {
    try {
      // Build file context scoped to the specific files being summarized
      // This prevents mixing unrelated documents from the conversation
      const fileContext = await this.buildFileContext(conversationId, fileIds);

      if (!fileContext) {
        // No context available - ask user to try again
        socket.emit('message', {
          role: 'assistant',
          content: "I received your file but couldn't extract the content. Could you try uploading it again?",
          conversationId,
        });
        return;
      }

      // Get file names for personalized response
      const files = await Promise.all(
        fileIds.map(id => this.fileRepository.findById(id))
      );
      const validFiles = files.filter(Boolean) as NonNullable<typeof files[number]>[];
      const fileNames = validFiles.map(f => f.filename).join(', ');

      // Build summarization prompt
      const isSingleFile = fileIds.length === 1;
      const fileLabel = isSingleFile
        ? `a document (${fileNames})`
        : `${fileIds.length} documents (${fileNames})`;
      const systemPrompt = this.buildAutoSummarizePrompt(fileLabel);

      // Get conversation context (messages for conversation history)
      const { messages } = await this.buildConversationContext(conversationId);

      // Emit typing indicator
      socket.emit('assistant_stream_start', { conversationId });

      // Stream Claude response
      let fullResponse = '';

      for await (const chunk of this.claudeClient.streamMessage(messages, {
        systemPrompt: `${systemPrompt}\n\n${fileContext}`,
      })) {
        if (!chunk.isComplete && chunk.content) {
          fullResponse += chunk.content;
          socket.emit('assistant_token', {
            conversationId,
            token: chunk.content,
          });
        }
      }

      // Save assistant response
      const summaryMessage = await this.conversationService.sendMessage({
        conversationId,
        role: 'assistant',
        content: { text: fullResponse },
      });

      // Emit stream complete
      socket.emit('assistant_done', {
        conversationId,
        messageId: summaryMessage.id,
        fullText: fullResponse,
      });

      console.log(`[ChatServer] Auto-summarize complete (${fullResponse.length} chars)`);
    } catch (error) {
      console.error('[ChatServer] Auto-summarize failed:', error);
      socket.emit('message', {
        role: 'assistant',
        content: "I had trouble summarizing the document. What would you like to know about it?",
        conversationId,
      });
    }
  }

  /**
   * Epic 18.4.5: Build system prompt for auto-summarization
   *
   * Creates a Guardian-style prompt that produces summaries focused on
   * AI governance and vendor assessment relevance.
   *
   * @param fileLabel - Description of the file(s) being summarized
   * @returns System prompt for Claude
   */
  private buildAutoSummarizePrompt(fileLabel: string): string {
    return `You are Guardian, an AI assistant helping healthcare organizations assess AI vendors.

The user has uploaded ${fileLabel} and wants to understand its contents.

Please provide a helpful summary that:
1. Identifies what type of document this is (security whitepaper, compliance cert, product doc, questionnaire, etc.)
2. Highlights key points relevant to AI governance and vendor assessment
3. Notes any security, privacy, or compliance information mentioned
4. Ends with an invitation to ask follow-up questions

Keep the summary concise (3-5 paragraphs) and focus on information relevant to vendor assessment.
If the document appears to be a completed questionnaire, mention that it can be scored in Scoring mode.`;
  }

  /**
   * Validate that a conversation belongs to the requesting user
   * @throws Error if conversation not found or doesn't belong to user
   */
  private async validateConversationOwnership(
    conversationId: string,
    userId: string
  ): Promise<void> {
    const conversation = await this.conversationService.getConversation(conversationId);

    if (!conversation) {
      throw new Error(`Conversation ${conversationId} not found`);
    }

    if (conversation.userId !== userId) {
      console.warn(`[ChatServer] SECURITY: User ${userId} attempted to access conversation ${conversationId} owned by ${conversation.userId}`);
      throw new Error('Unauthorized: You do not have access to this conversation');
    }
  }

  private setupNamespace(): void {
    const chatNamespace = this.io.of('/chat');

    // Authentication middleware
    chatNamespace.use((socket: AuthenticatedSocket, next) => {
      const token = socket.handshake.auth.token;

      if (!token) {
        return next(new Error('Authentication token required'));
      }

      try {
        const decoded = jwt.verify(token, this.jwtSecret) as JWTPayload;
        socket.userId = decoded.userId;
        socket.userEmail = decoded.email;
        socket.userRole = decoded.role;
        next();
      } catch (error) {
        console.error('[ChatServer] Authentication failed:', error);
        next(new Error('Invalid authentication token'));
      }
    });

    // Connection handler
    chatNamespace.on('connection', async (socket: AuthenticatedSocket) => {
      console.log(`[ChatServer] Client connected: ${socket.id} (User: ${socket.userId})`);

      // Join user-specific room for receiving document upload progress events
      // This room is used by DocumentUploadController to emit upload_progress,
      // intake_context_ready, and scoring_parse_ready events
      if (socket.userId) {
        socket.join(`user:${socket.userId}`);
        console.log(`[ChatServer] Socket ${socket.id} joined room user:${socket.userId}`);
      }

      // Check if client wants to resume an existing conversation
      const resumeConversationId = socket.handshake.auth.conversationId;
      let conversation = null;
      let resumed = false;

      if (resumeConversationId) {
        try {
          // Try to resume existing conversation
          const existing = await this.conversationService.getConversation(resumeConversationId);

          // Validate ownership - only allow resuming own conversations
          if (existing && existing.userId === socket.userId) {
            conversation = existing;
            resumed = true;
            console.log(`[ChatServer] Resumed conversation ${resumeConversationId} for user ${socket.userId}`);
          } else {
            // Invalid or not owned - do NOT auto-create
            console.log(`[ChatServer] Cannot resume conversation ${resumeConversationId} - user must create new conversation explicitly`);
          }
        } catch (error) {
          // Resume failed - do NOT auto-create
          console.error('[ChatServer] Error resuming conversation:', error);
          console.log('[ChatServer] User must create new conversation explicitly');
        }
      } else {
        // No saved conversation - do NOT auto-create
        // Frontend will request new conversation via start_new_conversation event
        console.log(`[ChatServer] No saved conversation - awaiting explicit new conversation request from user ${socket.userId}`);
      }

      // Store conversationId in socket for this session (may be null)
      socket.conversationId = conversation?.id;

      // Send connection confirmation with conversationId (may be undefined)
      socket.emit('connection_ready', {
        message: resumed ? 'Reconnected to existing conversation' : 'Connected to Guardian chat server',
        userId: socket.userId,
        conversationId: conversation?.id,
        resumed,
        hasActiveConversation: conversation !== null,
        assessmentId: conversation?.assessmentId || null,
      });

      // Handle send_message event
      socket.on('send_message', async (payload: SendMessagePayload) => {
        try {
          // Validate payload
          if (!payload || typeof payload !== 'object') {
            socket.emit('error', {
              event: 'send_message',
              message: 'Invalid message payload',
            });
            return;
          }

          // CRITICAL: conversationId MUST be provided by client
          const conversationId = payload.conversationId;
          const messageText = payload.text || payload.content; // Support both formats
          const attachments = payload.attachments; // Epic 16.6.8

          // Validate conversationId is provided
          if (!conversationId) {
            socket.emit('error', {
              event: 'send_message',
              message: 'Conversation ID required',
            });
            return;
          }

          // Epic 16.6.8: Allow file-only messages (no text, but has attachments)
          const hasAttachments = attachments && attachments.length > 0;
          const hasText = messageText && typeof messageText === 'string' && messageText.trim().length > 0;

          // Validate: must have text OR attachments (or both)
          if (!hasText && !hasAttachments) {
            socket.emit('error', {
              event: 'send_message',
              message: 'Message text or attachments required',
            });
            return;
          }

          // Validate conversation ownership
          if (!socket.userId) {
            socket.emit('error', {
              event: 'send_message',
              message: 'User not authenticated',
            });
            return;
          }

          try {
            await this.validateConversationOwnership(conversationId, socket.userId);
          } catch (error) {
            socket.emit('error', {
              event: 'send_message',
              message: error instanceof Error ? error.message : 'Unauthorized access',
            });
            return;
          }

          // Check rate limit
          if (socket.userId && this.rateLimiter.isRateLimited(socket.userId)) {
            const resetTime = this.rateLimiter.getResetTime(socket.userId);
            socket.emit('error', {
              event: 'send_message',
              message: `Rate limit exceeded. Please wait ${resetTime} seconds before sending more messages.`,
              code: 'RATE_LIMIT_EXCEEDED',
            });
            return;
          }

          console.log(
            `[ChatServer] Message received from ${socket.userId} for conversation ${conversationId}`
          );

          // Epic 16.6.9: Validate and enrich attachments
          let enrichedAttachments: MessageAttachment[] | undefined;
          if (hasAttachments) {
            enrichedAttachments = [];
            for (const att of attachments) {
              // Validate: file exists AND belongs to this user AND this conversation
              const file = await this.fileRepository.findByIdAndConversation(att.fileId, conversationId);

              if (!file) {
                socket.emit('error', {
                  event: 'send_message',
                  message: `Invalid attachment: file ${att.fileId} not found or not authorized`,
                });
                return;
              }

              // Verify user owns the file
              if (file.userId !== socket.userId) {
                socket.emit('error', {
                  event: 'send_message',
                  message: 'Attachment not authorized',
                });
                return;
              }

              // Enrich with server-side metadata (don't trust client)
              // Epic 16.6.9: storagePath intentionally NOT persisted in messages
              // (it stays in files table, resolved via fileId for downloads)
              enrichedAttachments.push({
                fileId: file.id,
                filename: file.filename,
                mimeType: file.mimeType,
                size: file.size,
              });
            }
          }

          // Save user message with enriched attachments (not client-supplied)
          // Generate placeholder text for file-only messages (Claude API requires non-empty content)
          let finalMessageText = messageText || '';
          if (!finalMessageText && enrichedAttachments && enrichedAttachments.length > 0) {
            const fileNames = enrichedAttachments.map(a => a.filename).join(', ');
            finalMessageText = `[Uploaded file for analysis: ${fileNames}]`;
          }

          const message = await this.conversationService.sendMessage({
            conversationId,
            role: 'user',
            content: {
              text: finalMessageText,
              components: payload.components,
            },
            attachments: enrichedAttachments,
          });

          // Emit confirmation with attachments
          // Epic 16.6.9: enrichedAttachments already excludes storagePath (never persisted)
          socket.emit('message_sent', {
            messageId: message.id,
            conversationId: message.conversationId,
            timestamp: message.createdAt,
            attachments: enrichedAttachments,
          });

          // Check if this is the first user message and emit title update
          const messageCount = await this.conversationService.getMessageCount(conversationId);
          if (messageCount === 1) {
            // This is the first user message - generate and emit title
            const title = await this.conversationService.getConversationTitle(conversationId);
            socket.emit('conversation_title_updated', {
              conversationId,
              title,
            });
          }

          // Get conversation context and generate Claude response
          // Note: buildConversationContext loads history which already includes
          // the message we just saved above, so no need to add it again
          // Story 24.1: Pass isRegenerate flag to add retry context to system prompt
          const { messages, systemPrompt, promptCache, mode } = await this.buildConversationContext(
            conversationId,
            payload.isRegenerate
          );

          // =========================================================
          // Epic 18 Sprint 3: Mode-Specific Behavior
          // =========================================================

          // Epic 18 Story 18.3.3: Scoring mode with attachments - trigger scoring on Send
          if (mode === 'scoring' && enrichedAttachments && enrichedAttachments.length > 0) {
            console.log(`[ChatServer] Scoring mode with ${enrichedAttachments.length} attachments - triggering scoring`);

            // Extract file IDs from enriched attachments
            const fileIds = enrichedAttachments.map(a => a.fileId);

            // Epic 25.4: Update conversation title with filename (if not manually edited)
            // Use first file's name for the title
            const firstFile = enrichedAttachments[0];
            if (firstFile && firstFile.filename) {
              const maxTitleLength = 50;
              const prefix = 'Scoring: ';
              const maxFilenameLength = maxTitleLength - prefix.length;

              let filename = firstFile.filename;
              if (filename.length > maxFilenameLength) {
                // Truncate while preserving extension
                const lastDot = filename.lastIndexOf('.');
                const extension = lastDot > 0 ? filename.slice(lastDot) : '';
                const baseName = lastDot > 0 ? filename.slice(0, lastDot) : filename;
                const availableLength = maxFilenameLength - 3 - extension.length;
                if (availableLength > 0) {
                  filename = baseName.slice(0, availableLength) + '...' + extension;
                } else {
                  filename = filename.slice(0, maxFilenameLength - 3) + '...';
                }
              }

              const scoringTitle = `${prefix}${filename}`;
              const titleUpdated = await this.conversationService.updateTitleIfNotManuallyEdited(
                conversationId,
                scoringTitle
              );

              if (titleUpdated) {
                socket.emit('conversation_title_updated', {
                  conversationId,
                  title: scoringTitle,
                });
                console.log(`[ChatServer] Updated scoring title: "${scoringTitle}"`);
              }
            }

            // Epic 18.4.3: Pass user message for follow-up addressing
            // Only pass actual user text, not placeholder text for file-only uploads
            const userQueryForFollowUp = messageText && !messageText.startsWith('[Uploaded file')
              ? messageText
              : undefined;

            // Trigger scoring (async, with progress events)
            await this.triggerScoringOnSend(
              socket,
              conversationId,
              socket.userId!,
              fileIds,
              userQueryForFollowUp  // Epic 18.4.3: Pass user query
            );

            // Scoring mode handles its own response - don't generate Claude response
            return;
          }

          // Epic 18 Story 18.3.2: Assessment mode with attachments - background enrichment
          // In assessment mode, we respond immediately using buildFileContext (which uses
          // textExcerpt), then start background enrichment for follow-up questions.
          let fileIdsForEnrichment: string[] = [];

          if (mode === 'assessment' && enrichedAttachments && enrichedAttachments.length > 0) {
            fileIdsForEnrichment = enrichedAttachments.map(a => a.fileId);
            console.log(`[ChatServer] Assessment mode with ${enrichedAttachments.length} attachments - will enrich in background`);
          }
          const shouldEnrichInBackground = fileIdsForEnrichment.length > 0;

          // =========================================================
          // Epic 18: Inject file context into Claude prompt
          // For consult/assessment modes, append attached document content
          // to the system prompt so Claude can answer questions about them.
          // =========================================================
          let enhancedSystemPrompt = systemPrompt;

          if (mode === 'consult' || mode === 'assessment') {
            const fileContext = await this.buildFileContext(conversationId);
            if (fileContext) {
              enhancedSystemPrompt = `${systemPrompt}${fileContext}`;
              console.log(`[ChatServer] Injected file context (${fileContext.length} chars) into ${mode} mode prompt`);
            }
          }

          // =========================================================
          // Epic 18.4.5: Auto-summarize in Consult mode
          // When user sends file(s) without a message in Consult mode,
          // automatically generate a summary to provide immediate value.
          // =========================================================
          const isEmptyMessageWithFile =
            mode === 'consult' &&
            enrichedAttachments &&
            enrichedAttachments.length > 0 &&
            (!messageText || messageText.trim().length === 0);

          if (isEmptyMessageWithFile && enrichedAttachments) {
            console.log(`[ChatServer] Consult mode: empty message with ${enrichedAttachments.length} files - auto-summarizing`);

            await this.autoSummarizeDocuments(
              socket,
              conversationId,
              socket.userId!,
              enrichedAttachments.map(a => a.fileId)
            );

            return; // Skip normal message handling
          }

          // Stream Claude response
          let fullResponse = '';

          try {
            // Reset abort flag before starting stream
            socket.data.abortRequested = false;

            // Emit stream start event (no partial message in DB yet)
            socket.emit('assistant_stream_start', {
              conversationId,
            });

            // Determine if we should pass tools (always in assessment mode)
            const shouldUseTool = mode === 'assessment';

            // Build Claude options with optional tools
            // Epic 18: Use enhancedSystemPrompt which includes file context for consult/assessment
            const claudeOptions = {
              systemPrompt: enhancedSystemPrompt,
              usePromptCache: promptCache?.usePromptCache || false,
              ...(promptCache?.cachedPromptId && { cachedPromptId: promptCache.cachedPromptId }),
              // Conditionally add tools
              ...(shouldUseTool && { tools: assessmentModeTools }),
            };

            // Track tool use during streaming
            let toolUseBlocks: ToolUseBlock[] = [];

            // Stream response chunks from Claude
            // Use messages directly - current message already in history
            for await (const chunk of this.claudeClient.streamMessage(messages, claudeOptions)) {
              // Check if stream was aborted by user
              if (socket.data.abortRequested) {
                console.log(`[ChatServer] Stream aborted by user, breaking loop`);
                break;
              }

              if (!chunk.isComplete && chunk.content) {
                fullResponse += chunk.content;

                // Emit each chunk to client
                socket.emit('assistant_token', {
                  conversationId,
                  token: chunk.content,
                });
              }

              // Capture tool use from final chunk
              if (chunk.isComplete && chunk.toolUse) {
                toolUseBlocks = chunk.toolUse;
              }
            }

            // Save message to database (even if aborted, save partial response)
            let savedMessageId: string | null = null;

            if (fullResponse.length > 0) {
              const completeMessage = await this.conversationService.sendMessage({
                conversationId,
                role: 'assistant',
                content: { text: fullResponse },
              });
              savedMessageId = completeMessage.id;
            }

            // Handle completion (only if not aborted)
            if (!socket.data.abortRequested) {
              // Emit assistant_done even for tool-only responses (no text)
              // This stops the "thinking" spinner in the UI
              socket.emit('assistant_done', {
                messageId: savedMessageId,
                conversationId,
                fullText: fullResponse,
                assessmentId: null,
              });

              // Handle tool use if present (works even when fullResponse is empty)
              if (toolUseBlocks.length > 0) {
                console.log(`[ChatServer] Processing ${toolUseBlocks.length} tool use block(s)`);
                await this.handleToolUse(socket, toolUseBlocks, {
                  conversationId,
                  userId: socket.userId!,
                  assessmentId: null,
                  mode: mode,
                });
              }

              // Epic 18 Story 18.3.2: Start background enrichment AFTER response sent
              // This is fire-and-forget - errors are logged but don't affect the user
              if (shouldEnrichInBackground && fileIdsForEnrichment.length > 0) {
                this.enrichInBackground(conversationId, fileIdsForEnrichment).catch(err => {
                  console.error('[ChatServer] Background enrichment failed:', err);
                  // Non-fatal - conversation continues with excerpt-based context
                });
              }
            } else {
              console.log(`[ChatServer] Stream aborted - partial response saved (${fullResponse.length} chars)`);
            }
          } catch (claudeError) {
            console.error('[ChatServer] Claude API error:', claudeError);

            // Send user-friendly error message
            const errorMessage = await this.conversationService.sendMessage({
              conversationId,
              role: 'system',
              content: {
                text: "I apologize, but I'm experiencing technical difficulties. Please try again in a moment.",
              },
            });

            socket.emit('message', {
              id: errorMessage.id,
              conversationId: errorMessage.conversationId,
              role: errorMessage.role,
              content: errorMessage.content,
              createdAt: errorMessage.createdAt,
            });
          }
        } catch (error) {
          console.error('[ChatServer] Error sending message:', error);
          socket.emit('error', {
            event: 'send_message',
            message: this.sanitizeErrorForClient(error, 'Failed to send message'),
          });
        }
      });

      // Handle get_history event
      socket.on('get_history', async (payload: GetHistoryPayload) => {
        try {
          console.log(
            `[ChatServer] History requested for conversation ${payload.conversationId}`
          );

          // Validate conversation ownership
          if (!socket.userId) {
            socket.emit('error', {
              event: 'get_history',
              message: 'User not authenticated',
            });
            return;
          }

          // CRITICAL FIX: Check if conversation exists first (idempotent history)
          const conversation = await this.conversationService.getConversation(payload.conversationId);

          if (!conversation) {
            // IDEMPOTENT: Conversation doesn't exist (likely deleted) - return empty history
            console.log(`[ChatServer] Conversation ${payload.conversationId} not found - returning empty history`);
            socket.emit('history', {
              conversationId: payload.conversationId,
              messages: [],
            });
            return;
          }

          // Only validate ownership if conversation exists
          await this.validateConversationOwnership(payload.conversationId, socket.userId);

          const messages = await this.conversationService.getHistory(
            payload.conversationId,
            payload.limit,
            payload.offset
          );

          socket.emit('history', {
            conversationId: payload.conversationId,
            messages: messages.map((msg) => ({
              id: msg.id,
              conversationId: msg.conversationId,
              role: msg.role,
              content: msg.content,
              createdAt: msg.createdAt,
              // Epic 16.6.9: Pass through attachments (storagePath no longer stored,
              // but strip defensively for backward compat with old messages)
              ...(msg.attachments && msg.attachments.length > 0 && {
                attachments: msg.attachments.map(att => ({
                  fileId: att.fileId,
                  filename: att.filename,
                  mimeType: att.mimeType,
                  size: att.size,
                })),
              }),
            })),
          });
        } catch (error) {
          console.error('[ChatServer] Error getting history:', error);
          socket.emit('error', {
            event: 'get_history',
            message: this.sanitizeErrorForClient(error, 'Failed to get history'),
          });
        }
      });

      // Handle get_conversations event
      socket.on('get_conversations', async () => {
        try {
          if (!socket.userId) {
            socket.emit('error', {
              event: 'get_conversations',
              message: 'User not authenticated',
            });
            return;
          }

          console.log(`[ChatServer] Fetching conversations for user ${socket.userId}`);

          const conversations = await this.conversationService.getUserConversations(socket.userId);

          console.log(`[ChatServer] Found ${conversations.length} conversations for user ${socket.userId}`);

          // Generate titles for each conversation
          const conversationsWithMetadata = await Promise.all(
            conversations.map(async (conv) => {
              const title = await this.conversationService.getConversationTitle(conv.id);

              return {
                id: conv.id,
                title,
                createdAt: conv.startedAt,
                updatedAt: conv.lastActivityAt,
                mode: conv.mode,
              };
            })
          );

          socket.emit('conversations_list', {
            conversations: conversationsWithMetadata,
          });

          console.log(`[ChatServer] Emitted conversations_list with ${conversations.length} conversations`);
        } catch (error) {
          console.error('[ChatServer] Error fetching conversations:', error);
          socket.emit('error', {
            event: 'get_conversations',
            message: this.sanitizeErrorForClient(error, 'Failed to fetch conversations'),
          });
        }
      });

      // Start a new conversation
      socket.on('start_new_conversation', async (payload: { mode?: 'consult' | 'assessment' }) => {
        try {
          if (!socket.userId) {
            socket.emit('error', {
              event: 'start_new_conversation',
              message: 'User not authenticated',
            });
            return;
          }

          // Check for pending conversation creation (idempotency guard - 200ms prevents accidental double-clicks)
          const pending = this.pendingConversationCreations.get(socket.userId);
          if (pending && Date.now() - pending.timestamp < 200) {
            console.log(`[ChatServer] Conversation creation already in progress for user ${socket.userId}, returning pending conversation`);

            // Return the pending conversation info (it should have been emitted already)
            const existingConv = await this.conversationService.getConversation(pending.conversationId);
            if (existingConv) {
              socket.emit('conversation_created', {
                conversation: {
                  id: existingConv.id,
                  title: `New Chat`,
                  createdAt: existingConv.startedAt,
                  updatedAt: existingConv.lastActivityAt,
                  mode: existingConv.mode,
                },
              });
            }
            return;
          }

          console.log(`[ChatServer] Starting new conversation for user ${socket.userId}`);

          // Create new conversation (always default to consult to avoid carrying over prior mode)
          const newConversation = await this.conversationService.createConversation({
            userId: socket.userId,
            mode: 'consult',
          });

          // Track this creation to prevent duplicates
          this.pendingConversationCreations.set(socket.userId, {
            conversationId: newConversation.id,
            timestamp: Date.now(),
          });

          // CRITICAL: Update socket's current conversation ID
          socket.conversationId = newConversation.id;

          // Emit conversation_created event
          socket.emit('conversation_created', {
            conversation: {
              id: newConversation.id,
              title: `New Chat`,
              createdAt: newConversation.startedAt,
              updatedAt: newConversation.lastActivityAt,
              mode: newConversation.mode,
            },
          });

          console.log(`[ChatServer] New conversation ${newConversation.id} created and set as active`);

          // Clear pending after a short delay (allows accidental double-clicks to use cached value)
          setTimeout(() => {
            this.pendingConversationCreations.delete(socket.userId!);
          }, 200); // 200ms - only prevents true accidents, allows intentional rapid clicks
        } catch (error) {
          console.error('[ChatServer] Error starting new conversation:', error);

          // Clear pending on error
          if (socket.userId) {
            this.pendingConversationCreations.delete(socket.userId);
          }

          socket.emit('error', {
            event: 'start_new_conversation',
            message: this.sanitizeErrorForClient(error, 'Failed to create conversation'),
          });
        }
      });

      // Delete conversation
      socket.on('delete_conversation', async (payload: { conversationId: string }) => {
        if (!socket.userId) {
          socket.emit('error', { event: 'delete_conversation', message: 'User not authenticated' });
          return;
        }

        const { conversationId } = payload;

        if (!conversationId) {
          socket.emit('error', { event: 'delete_conversation', message: 'conversationId is required' });
          return;
        }

        try {
          console.log(`[ChatServer] Deleting conversation ${conversationId} for user ${socket.userId}`);

          // CRITICAL FIX: Check if conversation exists first (idempotent DELETE)
          const conversation = await this.conversationService.getConversation(conversationId);

          if (!conversation) {
            // IDEMPOTENT: Already deleted - return success
            console.log(`[ChatServer] Conversation ${conversationId} already deleted - returning success`);
            socket.emit('conversation_deleted', { conversationId });

            // If this was the active conversation, clear it
            if (socket.conversationId === conversationId) {
              socket.conversationId = undefined;
            }
            return;
          }

          // Only validate ownership if conversation exists
          await this.validateConversationOwnership(conversationId, socket.userId);

          // Delete from database
          await this.conversationService.deleteConversation(conversationId);

          console.log(`[ChatServer] Successfully deleted conversation ${conversationId}`);

          // Emit confirmation to client
          socket.emit('conversation_deleted', { conversationId });

          // If this was the active conversation, clear it
          if (socket.conversationId === conversationId) {
            socket.conversationId = undefined;
          }
        } catch (error) {
          console.error('[ChatServer] Error deleting conversation:', error);
          socket.emit('error', {
            event: 'delete_conversation',
            message: this.sanitizeErrorForClient(error, 'Failed to delete conversation'),
          });
        }
      });

      // Switch conversation mode (consult ⟺ assessment ⟺ scoring)
      socket.on('switch_mode', async (payload: { conversationId?: string; mode?: 'consult' | 'assessment' | 'scoring' }) => {
        try {
          if (!socket.userId) {
            socket.emit('error', {
              event: 'switch_mode',
              message: 'User not authenticated',
            });
            return;
          }

          const { conversationId, mode } = payload;

          if (!conversationId || !mode) {
            socket.emit('error', {
              event: 'switch_mode',
              message: 'conversationId and mode are required',
            });
            return;
          }

          await this.validateConversationOwnership(conversationId, socket.userId);

          const conversation = await this.conversationService.getConversation(conversationId);
          if (!conversation) {
            socket.emit('error', {
              event: 'switch_mode',
              message: `Conversation ${conversationId} not found`,
            });
            return;
          }

          // Idempotent: already in requested mode
          if (conversation.mode === mode) {
            socket.emit('conversation_mode_updated', {
              conversationId,
              mode,
            });
            return;
          }

          await this.conversationService.switchMode(conversationId, mode);

          socket.emit('conversation_mode_updated', {
            conversationId,
            mode,
          });

          // Provide guidance when entering assessment mode (initial 1-3 only; categories flow later)
          if (mode === 'assessment') {
            const guidanceText = `
🔍 **Assessment Mode Activated**

Please select your assessment approach (reply with 1, 2, or 3):

1️⃣ **Quick Assessment** (30-40 questions)
   ↳ Fast red-flag screening, ~15 minutes

2️⃣ **Comprehensive Assessment** (85-95 questions)
   ↳ Full coverage across all 10 risk dimensions

3️⃣ **Category-Focused Assessment**
   ↳ Tailored to your AI solution type

Reply with: **1**, **2**, or **3**
`.trim();

            const guidanceMessage = await this.conversationService.sendMessage({
              conversationId,
              role: 'assistant',
              content: { text: guidanceText },
            });

            socket.emit('message', {
              id: guidanceMessage.id,
              conversationId: guidanceMessage.conversationId,
              role: guidanceMessage.role,
              content: guidanceMessage.content,
              createdAt: guidanceMessage.createdAt,
            });
          }

          // Provide guidance when entering scoring mode
          if (mode === 'scoring') {
            const scoringGuidanceText = `
📊 **Scoring Mode Activated**

Upload a completed vendor questionnaire for risk analysis.

**Important:** Only questionnaires exported from Guardian can be scored. These contain an embedded Assessment ID that links responses to your original assessment.

**How it works:**
1. Export a questionnaire from Guardian (Assessment Mode → Generate → Download)
2. Send it to the vendor to complete
3. Upload the completed questionnaire here

**Supported formats:** PDF or Word (.docx)

Once uploaded, I'll analyze the responses and provide:
- Composite risk score (0-100)
- Per-dimension breakdown
- Executive summary
- Recommendation (Approve/Conditional/Decline)

**Drag & drop** your file or click the upload button to begin.
`.trim();

            const scoringGuidanceMessage = await this.conversationService.sendMessage({
              conversationId,
              role: 'assistant',
              content: { text: scoringGuidanceText },
            });

            socket.emit('message', {
              id: scoringGuidanceMessage.id,
              conversationId: scoringGuidanceMessage.conversationId,
              role: scoringGuidanceMessage.role,
              content: scoringGuidanceMessage.content,
              createdAt: scoringGuidanceMessage.createdAt,
            });
          }
        } catch (error) {
          console.error('[ChatServer] Error switching mode:', error);
          socket.emit('error', {
            event: 'switch_mode',
            message: error instanceof Error ? error.message : 'Failed to switch mode',
          });
        }
      });

      // Abort streaming
      socket.on('abort_stream', () => {
        console.log(`[ChatServer] Stream abort requested by user ${socket.userId}`);

        // Mark for Claude streaming (original path)
        socket.data.abortRequested = true;

        // Mark for simulated streaming (Epic 12.5 path)
        if (socket.conversationId) {
          this.abortedStreams.add(socket.conversationId);

          // Abort scoring if in progress (Epic 15)
          if (this.scoringService) {
            this.scoringService.abort(socket.conversationId);
          }
        }

        // Emit acknowledgment - frontend will call finishStreaming()
        socket.emit('stream_aborted', { conversationId: socket.conversationId });
      });

      /**
       * Epic 18.4.2a: Handle user selecting a vendor from clarification prompt
       *
       * When multiple vendors are detected in uploaded files, the user must choose
       * which vendor to score. This handler receives their selection and resumes
       * scoring with only that vendor's files.
       */
      socket.on('vendor_selected', async (payload: { conversationId: string; vendorName: string }) => {
        const userId = socket.userId;
        if (!userId) {
          console.error('[ChatServer] vendor_selected called without authenticated user');
          socket.emit('error', { event: 'vendor_selected', message: 'Not authenticated' });
          return;
        }

        // Guard: Validate vendorName is present and non-empty
        if (!payload.vendorName || typeof payload.vendorName !== 'string' || payload.vendorName.trim().length === 0) {
          console.warn('[ChatServer] vendor_selected called with missing/empty vendorName');
          socket.emit('error', {
            event: 'vendor_selected',
            message: 'Vendor name is required',
          });
          return;
        }

        // Guard: Validate conversationId is present
        if (!payload.conversationId || typeof payload.conversationId !== 'string') {
          console.warn('[ChatServer] vendor_selected called with missing conversationId');
          socket.emit('error', {
            event: 'vendor_selected',
            message: 'Conversation ID is required',
          });
          return;
        }

        // Look up pending clarification by conversationId (Map-based storage)
        const pendingMap = socket.data.pendingVendorClarifications as Map<string, {
          conversationId: string;
          userId: string;
          fileIds: string[];
          userQuery?: string;
          vendors: Array<{ name: string; fileCount: number; fileIds: string[] }>;
        }> | undefined;

        const pending = pendingMap?.get(payload.conversationId);

        if (!pending) {
          console.warn(`[ChatServer] vendor_selected called without pending clarification for conversation ${payload.conversationId}`);
          socket.emit('error', {
            event: 'vendor_selected',
            message: 'No pending vendor clarification for this conversation',
          });
          return;
        }

        // Find the selected vendor's files (normalize with trim() for comparison)
        const normalizedVendorName = payload.vendorName.trim().toLowerCase();
        const selectedVendor = pending.vendors.find(
          v => v.name.trim().toLowerCase() === normalizedVendorName
        );

        if (!selectedVendor) {
          console.warn(`[ChatServer] Unknown vendor selected: ${payload.vendorName}`);
          socket.emit('error', {
            event: 'vendor_selected',
            message: `Unknown vendor: ${payload.vendorName}`,
          });
          return;
        }

        console.log(
          `[ChatServer] User selected vendor "${selectedVendor.name}" with ${selectedVendor.fileIds.length} files`
        );

        // Clear pending clarification for this conversation
        pendingMap?.delete(payload.conversationId);

        // Emit confirmation message
        socket.emit('message', {
          role: 'assistant',
          content: `Starting scoring for ${selectedVendor.name}...`,
          conversationId: pending.conversationId,
        });

        // Resume scoring with only the selected vendor's files
        await this.triggerScoringOnSend(
          socket,
          pending.conversationId,
          pending.userId,
          selectedVendor.fileIds,
          pending.userQuery
        );
      });

      /**
       * Handle user clicking "Generate Questionnaire" button
       *
       * Epic 12.5: Delegates to handleGenerateQuestionnaire public method
       * which uses QuestionnaireGenerationService for hybrid JSON/markdown generation.
       */
      socket.on('generate_questionnaire', async (payload: GenerateQuestionnairePayload) => {
        const userId = socket.userId;
        if (!userId) {
          console.error('[ChatServer] generate_questionnaire called without authenticated user');
          socket.emit('error', { event: 'generate_questionnaire', message: 'Not authenticated' });
          return;
        }
        await this.handleGenerateQuestionnaire(socket, payload, userId);
      });

      // Handle get_export_status (Story 13.9.1)
      socket.on('get_export_status', async (data: { conversationId: string }) => {
        await this.handleGetExportStatus(socket, data);
      });

      // NOTE: start_scoring event removed in Sprint 5a - scoring now auto-triggers
      // after successful document parse in DocumentUploadController.runScoring()
      // This prevents double-scoring if both auto-trigger and manual trigger existed.

      // Handle disconnect
      socket.on('disconnect', (reason) => {
        console.log(`[ChatServer] Client disconnected: ${socket.id} (Reason: ${reason})`);
      });
    });

    console.log('[ChatServer] WebSocket /chat namespace configured');
  }

  /**
   * Handle tool_use blocks from Claude's response
   */
  private async handleToolUse(
    socket: AuthenticatedSocket,
    toolUseBlocks: ToolUseBlock[],
    context: {
      conversationId: string;
      userId: string;
      assessmentId: string | null;
      mode?: 'consult' | 'assessment' | 'scoring';
    }
  ): Promise<void> {
    for (const toolUse of toolUseBlocks) {
      console.log(`[ChatServer] Handling tool_use: ${toolUse.name}`);

      // Currently only handle questionnaire_ready
      if (toolUse.name === 'questionnaire_ready') {
        try {
          const result = await this.questionnaireReadyService.handle(
            {
              toolName: toolUse.name,
              toolUseId: toolUse.id,
              input: toolUse.input,
            },
            context
          );

          if (result.handled && result.emitEvent) {
            // Emit event to frontend
            socket.emit(result.emitEvent.event, result.emitEvent.payload);
            console.log(
              `[ChatServer] Emitted ${result.emitEvent.event} for conversation:`,
              context.conversationId
            );
          } else if (!result.handled) {
            console.warn(
              `[ChatServer] Tool handling failed:`,
              result.error
            );
          }
        } catch (error) {
          console.error('[ChatServer] Error handling tool_use:', error);
        }
      } else {
        console.warn(`[ChatServer] Unknown tool: ${toolUse.name}`);
      }
    }
  }

  /**
   * Emit a generation phase event to the client (Story 13.5.2)
   *
   * @param socket - The client socket to emit to
   * @param conversationId - The conversation being processed
   * @param phase - The phase index (0-3)
   * @param phaseId - The phase identifier ('context' | 'generating' | 'validating' | 'saving')
   */
  private emitGenerationPhase(
    socket: AuthenticatedSocket,
    conversationId: string,
    phase: number,
    phaseId: GenerationPhaseId
  ): void {
    const payload: GenerationPhasePayload = {
      conversationId,
      phase,
      phaseId,
      timestamp: Date.now(),
    };
    socket.emit('generation_phase', payload);
    console.log(`[ChatServer] Emitted generation_phase: phase=${phase}, phaseId=${phaseId}`);
  }

  /**
   * Handle user clicking "Generate Questionnaire" button
   *
   * Epic 12.5: Hybrid flow - delegates to QuestionnaireGenerationService
   * which makes a single Claude call and returns JSON + pre-rendered markdown.
   *
   * Extracted as public method for testability.
   */
  public async handleGenerateQuestionnaire(
    socket: AuthenticatedSocket,
    payload: GenerateQuestionnairePayload,
    userId: string
  ): Promise<void> {
    const {
      conversationId,
      assessmentType: rawAssessmentType = 'comprehensive',
      vendorName,
      solutionName,
      contextSummary,
      selectedCategories,
    } = payload;

    // Validate assessment type
    type ValidType = 'quick' | 'comprehensive' | 'category_focused';
    const validTypes: ValidType[] = ['quick', 'comprehensive', 'category_focused'];
    const assessmentType: ValidType = validTypes.includes(rawAssessmentType as ValidType)
      ? (rawAssessmentType as ValidType)
      : 'comprehensive';

    console.log(`[ChatServer] Received generate_questionnaire from user ${userId} for conversation ${conversationId}`);

    try {
      // Validate ownership
      await this.validateConversationOwnership(conversationId, userId);

      // Save user action as message
      await this.conversationService.sendMessage({
        conversationId,
        role: 'user',
        content: { text: '[System: User clicked Generate Questionnaire button]' },
      });

      // Emit stream start for UX consistency (even though we're not streaming from Claude)
      socket.emit('assistant_stream_start', { conversationId });

      // Phase 0: Context ready (validation passed, about to call Claude)
      this.emitGenerationPhase(socket, conversationId, 0, 'context');

      // Delegate to service (single Claude call, returns schema + markdown)
      // NOTE: Service creates assessment - handler does NOT create assessments
      const result = await this.questionnaireGenerationService.generate({
        conversationId,
        userId,
        assessmentType,
        vendorName,
        solutionName,
        contextSummary,
        selectedCategories,
      });

      // Phase 1: Claude call complete
      this.emitGenerationPhase(socket, conversationId, 1, 'generating');

      // Phase 2: Validation complete (validation happens inside generate())
      this.emitGenerationPhase(socket, conversationId, 2, 'validating');

      // Stream pre-rendered markdown to chat (simulated streaming for UX)
      await this.streamMarkdownToSocket(socket, result.markdown, conversationId);

      // Save assistant response
      await this.conversationService.sendMessage({
        conversationId,
        role: 'assistant',
        content: { text: result.markdown },
      });

      // Phase 3: Persistence complete
      this.emitGenerationPhase(socket, conversationId, 3, 'saving');

      // Emit export ready (no extraction needed - we have the assessmentId from service)
      // This signals phase 4 (complete) to the frontend
      socket.emit('export_ready', {
        conversationId,
        assessmentId: result.assessmentId,
        questionCount: result.schema.metadata.questionCount,
        formats: ['pdf', 'word', 'excel'],
      });

      // Epic 25.3: Update conversation title with vendor/solution name
      // Only if title hasn't been manually edited by user
      if (vendorName || solutionName) {
        const titlePrefix = 'Assessment: ';
        const titleName = vendorName || solutionName || '';
        const maxTitleLength = 50;
        let newTitle = `${titlePrefix}${titleName}`;
        if (newTitle.length > maxTitleLength) {
          newTitle = newTitle.slice(0, maxTitleLength - 3) + '...';
        }

        const titleUpdated = await this.conversationService.updateTitleIfNotManuallyEdited(
          conversationId,
          newTitle
        );

        if (titleUpdated) {
          // Emit WebSocket event for real-time sidebar update
          socket.emit('conversation_title_updated', {
            conversationId,
            title: newTitle,
          });
          console.log(`[ChatServer] Updated assessment title: "${newTitle}"`);
        }
      }

      console.log(`[ChatServer] Questionnaire generation complete:`, {
        conversationId,
        assessmentId: result.assessmentId,
        questionCount: result.schema.metadata.questionCount,
      });

    } catch (error) {
      console.error('[ChatServer] Error in generate_questionnaire:', error);
      socket.emit('error', {
        event: 'generate_questionnaire',
        message: error instanceof Error ? error.message : 'Failed to generate questionnaire',
      });
    }
  }

  /**
   * Handle export status query (Story 13.9.1)
   * Returns existing export if questionnaire was already generated for conversation.
   * Used to restore download buttons on session resume.
   */
  public async handleGetExportStatus(
    socket: AuthenticatedSocket,
    data: { conversationId: string }
  ): Promise<void> {
    const { conversationId } = data;
    const userId = socket.userId;

    // Early validation: conversationId must be a non-empty string
    if (!conversationId || typeof conversationId !== 'string' || conversationId.trim() === '') {
      console.log(`[ChatServer] get_export_status invalid input: conversationId=${conversationId}`);
      socket.emit('export_status_error', {
        conversationId: conversationId ?? '',
        error: 'Invalid conversation ID',
      });
      return;
    }

    // Early validation: userId must be present (auth middleware should set this)
    if (!userId) {
      console.log(`[ChatServer] get_export_status auth error: conversationId=${conversationId}, reason=Not authenticated`);
      socket.emit('export_status_error', {
        conversationId,
        error: 'Not authenticated',
      });
      return;
    }

    console.log(`[ChatServer] get_export_status request: conversationId=${conversationId}, userId=${userId}`);

    try {
      // 1. Get conversation and verify ownership
      const conversation = await this.conversationService.getConversation(conversationId);
      if (!conversation) {
        console.log(`[ChatServer] export_status auth error: conversationId=${conversationId}, reason=Conversation not found`);
        socket.emit('export_status_error', {
          conversationId,
          error: 'Conversation not found',
        });
        return;
      }

      if (conversation.userId !== userId) {
        console.log(`[ChatServer] export_status auth error: conversationId=${conversationId}, reason=Unauthorized`);
        socket.emit('export_status_error', {
          conversationId,
          error: 'Unauthorized',
        });
        return;
      }

      // 2. Check if conversation has a linked assessment
      if (!conversation.assessmentId) {
        console.log(`[ChatServer] export_status not found: conversationId=${conversationId}`);
        socket.emit('export_status_not_found', { conversationId });
        return;
      }

      // 3. Verify assessment exists
      const assessment = await this.assessmentService.getAssessment(conversation.assessmentId);
      if (!assessment) {
        console.log(`[ChatServer] export_status not found: conversationId=${conversationId}`);
        socket.emit('export_status_not_found', { conversationId });
        return;
      }

      // 4. Count questions for this assessment
      const questionCount = await this.questionService.getQuestionCount(assessment.id);

      if (questionCount === 0) {
        console.log(`[ChatServer] export_status not found: conversationId=${conversationId}`);
        socket.emit('export_status_not_found', { conversationId });
        return;
      }

      // 5. Emit export_ready payload (reuses existing frontend handler)
      socket.emit('export_ready', {
        conversationId,
        assessmentId: assessment.id,
        questionCount,
        formats: ['word', 'pdf', 'excel'],
      });

      console.log(`[ChatServer] export_status found: assessmentId=${assessment.id}, questions=${questionCount}`);

    } catch (error) {
      console.error(`[ChatServer] get_export_status error:`, error);
      socket.emit('export_status_error', {
        conversationId,
        error: 'Internal server error',
      });
    }
  }

  // NOTE: handleStartScoring removed in Sprint 5a - scoring now auto-triggers
  // in DocumentUploadController.runScoring() after successful document parse.
  // This prevents double-scoring if both auto-trigger and manual trigger existed.

  /**
   * Split markdown into chunks for simulated streaming
   *
   * Tries to break at word boundaries for natural reading.
   */
  private chunkMarkdown(markdown: string, chunkSize: number): string[] {
    const chunks: string[] = [];
    let remaining = markdown;

    while (remaining.length > 0) {
      // Try to break at word boundary
      let end = Math.min(chunkSize, remaining.length);
      if (end < remaining.length) {
        const lastSpace = remaining.lastIndexOf(' ', end);
        if (lastSpace > chunkSize * 0.5) {
          end = lastSpace + 1;
        }
      }
      chunks.push(remaining.slice(0, end));
      remaining = remaining.slice(end);
    }

    return chunks;
  }

  /**
   * Stream markdown to socket with simulated typing effect
   *
   * Chunks the markdown and emits with small delays for familiar UX.
   * This replaces Claude streaming with deterministic content.
   *
   * Supports abort handling for user cancellation.
   */
  private async streamMarkdownToSocket(
    socket: AuthenticatedSocket,
    markdown: string,
    conversationId: string
  ): Promise<void> {
    const chunks = this.chunkMarkdown(markdown, 80); // ~80 chars per chunk

    for (const chunk of chunks) {
      // Check abort flag between chunks
      if (this.abortedStreams.has(conversationId)) {
        this.abortedStreams.delete(conversationId);
        socket.emit('assistant_aborted', { conversationId });
        console.log(`[ChatServer] Stream aborted for conversation ${conversationId}`);
        return;
      }

      socket.emit('assistant_token', {
        conversationId,
        token: chunk,
      });

      // Small delay for natural streaming feel (20ms per chunk)
      await this.sleep(20);
    }

    socket.emit('assistant_done', {
      conversationId,
      fullText: markdown,
    });
  }

  /**
   * Simple sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Emit a message to a specific conversation
   * Used for streaming assistant responses
   */
  emitToConversation(conversationId: string, event: string, data: unknown): void {
    this.io.of('/chat').emit(event, { conversationId, ...(data as object) });
  }

  /**
   * Stream a message chunk to a conversation
   */
  streamMessage(conversationId: string, chunk: string): void {
    this.io.of('/chat').emit('message:stream', {
      conversationId,
      chunk,
    });
  }
}
