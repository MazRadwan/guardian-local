/**
 * FileContextBuilder - Builds document context for Claude from uploaded files
 *
 * Epic 28 Story 28.2.2: Extracted from ChatServer.ts
 * Epic 30 Sprint 3: Extended with Vision API support for image files
 * Epic 30 Sprint 4 Story 30.4.2: Enhanced error handling & security logging
 *
 * This builder handles file context injection into Claude prompts for consult/assessment modes.
 * Uses fallback hierarchy: intakeContext -> textExcerpt -> S3 re-read (with lazy backfill).
 *
 * For image files (PNG, JPEG, GIF, WebP), delegates to VisionContentBuilder to create
 * ImageContentBlock for Claude's Vision API instead of text extraction.
 *
 * ## Error Handling
 * - VisionContentBuilder failures: logged, image skipped, continues with other files
 * - S3 retrieval failures: logged, file skipped, continues with other files
 * - Text extraction failures: logged, file skipped, continues with other files
 *
 * ## Security (HIPAA Considerations)
 * - NEVER logs filename in error messages (may contain PHI)
 * - Only logs fileId (UUID) which is safe metadata
 * - All errors use fileId for traceability without PHI exposure
 *
 * NOTE: Legacy intake context injection is handled by ConversationContextBuilder (Story 28.2.1),
 * NOT this builder.
 */

import type {
  IFileRepository,
  FileWithExcerpt,
} from '../../../application/interfaces/IFileRepository.js';
import type { IFileStorage } from '../../../application/interfaces/IFileStorage.js';
import type {
  ITextExtractionService,
  ValidatedDocumentType,
} from '../../../application/interfaces/ITextExtractionService.js';
import type { IVisionContentBuilder } from '../../../application/interfaces/IVisionContentBuilder.js';
import type { ImageContentBlock } from '../../ai/types/vision.js';
import {
  sanitizeForPrompt,
  CHAT_CONTEXT_PROFILE,
} from '../../../utils/sanitize.js';

/**
 * Epic 18: MIME type to validated document type mapping
 * Used for context injection fallback when re-reading from S3.
 * Handles DOCX-as-ZIP edge case by mapping to correct type.
 */
const MIME_TYPE_MAP: Record<string, ValidatedDocumentType> = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    'docx',
  'image/png': 'image',
  'image/jpeg': 'image',
  'image/webp': 'image',
};

/**
 * Epic 30 Sprint 3: Result of building file context
 *
 * Returns both text context (for non-image files) and image blocks (for Vision API).
 * ImageBlocks are passed separately to ClaudeClient, not embedded in domain messages.
 */
export interface FileContextResult {
  /** Formatted text context for text-based files */
  textContext: string;
  /** Vision API image blocks for image files */
  imageBlocks: ImageContentBlock[];
}

/**
 * Epic 30 Sprint 4 Story 30.4.3: Mode-specific options for file context building
 *
 * Vision API support is mode-specific:
 * - Consult mode: Images analyzed via Vision API
 * - Assessment mode: Images analyzed via Vision API
 * - Scoring mode: Uses existing DocumentParser flow, not this builder
 */
export interface FileContextOptions {
  /** Conversation mode - determines if Vision API is used */
  mode?: 'consult' | 'assessment' | 'scoring';
}

/**
 * FileContextBuilder - Builds document context for Claude from uploaded files
 *
 * IMPORTANT: Sanitization profiles:
 *
 * 1. formatIntakeContextFile - Uses CHAT_CONTEXT_PROFILE (whitespace normalization)
 *    Matches ChatServer.ts:501-521 private sanitizeForPrompt behavior
 *
 * 2. formatTextExcerptFile - Uses prompt-escape profile (NO whitespace normalization)
 *    Matches ChatServer.ts:531 which uses imported sanitizeForPrompt with escapePromptInjection
 *    This preserves document formatting while escaping injection patterns
 */
export class FileContextBuilder {
  constructor(
    private readonly fileRepository: IFileRepository,
    private readonly fileStorage?: IFileStorage,
    private readonly textExtractionService?: ITextExtractionService,
    private readonly visionContentBuilder?: IVisionContentBuilder
  ) {}

  /**
   * Epic 18: Build context for Claude from attached files using fallback hierarchy
   * Epic 30 Sprint 3: Now returns FileContextResult with both text and image blocks
   * Epic 30 Sprint 4 Story 30.4.3: Mode-specific Vision API behavior
   *
   * Fallback hierarchy for text files:
   * 1. intakeContext (structured, from Claude enrichment) - best
   * 2. textExcerpt (raw text, from upload extraction) - good
   * 3. Re-read from S3 (slow fallback for missing excerpt)
   *
   * For image files (PNG, JPEG, GIF, WebP):
   * - In Consult mode: Delegates to VisionContentBuilder to create ImageContentBlock
   * - In Assessment mode: Delegates to VisionContentBuilder to create ImageContentBlock
   * - In Scoring mode: Uses DocumentParser flow, not this method
   *
   * @param conversationId - Conversation to get files for
   * @param scopeToFileIds - Optional array of file IDs to limit context to (for auto-summarize)
   * @param options - Optional mode-specific options
   * @returns FileContextResult with textContext string and imageBlocks array
   */
  async buildWithImages(
    conversationId: string,
    scopeToFileIds?: string[],
    options?: FileContextOptions
  ): Promise<FileContextResult> {
    const buildStartTime = Date.now();
    console.log(`[TIMING] FileContextBuilder buildWithImages START: ${buildStartTime} (conversationId: ${conversationId}, scopeToFileIds: ${scopeToFileIds?.join(',') || 'all'})`);

    // Story 30.4.3: Check if Vision API is enabled for this mode
    // Vision is enabled in Consult and Assessment modes (NOT in Scoring mode)
    const mode = options?.mode || 'consult';
    const visionEnabled = mode !== 'scoring';
    // Use method that returns ALL files with excerpt data (not just those with intakeContext)
    let files =
      await this.fileRepository.findByConversationWithExcerpt(conversationId);

    // If scoped to specific files, filter to only those
    if (scopeToFileIds && scopeToFileIds.length > 0) {
      const scopeSet = new Set(scopeToFileIds);
      files = files.filter((f) => scopeSet.has(f.id));
    }

    if (files.length === 0) {
      console.log(`[TIMING] FileContextBuilder NO_FILES_FOUND: ${Date.now()} (duration: ${Date.now() - buildStartTime}ms)`);
      return { textContext: '', imageBlocks: [] };
    }

    console.log(`[TIMING] FileContextBuilder FILES_FOUND: ${Date.now()} (count: ${files.length}, files: ${files.map(f => `${f.id}:${f.filename}:hasExcerpt=${!!f.textExcerpt}:hasIntake=${!!f.intakeContext}`).join(', ')})`);

    const contextParts: string[] = [];
    const imageBlocks: ImageContentBlock[] = [];

    for (const file of files) {
      // Epic 30: Check if file is an image - delegate to VisionContentBuilder
      if (this.isImageFile(file.mimeType)) {
        // Story 30.4.3: Only process images for Vision API in Consult mode
        if (!visionEnabled) {
          console.log(`[FileContextBuilder] Vision API disabled for mode=${mode}, skipping image file ${file.id}`);
          continue; // Skip images in non-consult modes
        }

        if (this.visionContentBuilder) {
          try {
            // Story 30.3.5: Pass conversationId for caching
            const block = await this.visionContentBuilder.buildImageContent(
              {
                id: file.id,
                mimeType: file.mimeType,
                size: this.getFileSize(file),
                storagePath: file.storagePath,
              },
              conversationId
            );
            if (block) {
              imageBlocks.push(block);
              console.log(`[FileContextBuilder] Image file ${file.id} converted to ImageContentBlock`);
            } else {
              console.warn(`[FileContextBuilder] Failed to build image content for ${file.id}`);
            }
          } catch (err) {
            // Story 30.4.2: SECURITY - only log fileId, not filename (may contain PHI)
            console.error(`[FileContextBuilder] Error building image content for fileId=${file.id}:`, err);
            // Graceful fallback: continue without this image
          }
        } else {
          console.warn(`[FileContextBuilder] VisionContentBuilder not configured, skipping image file ${file.id}`);
        }
        continue; // Don't process images as text
      }

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
      console.warn(
        `[FileContextBuilder] File ${file.id} has no excerpt, falling back to S3 read`
      );
      try {
        const excerpt = await this.extractExcerptFromStorage(file);
        if (excerpt) {
          contextParts.push(
            this.formatTextExcerptFile({ ...file, textExcerpt: excerpt })
          );

          // Lazy backfill: Store for next time (fire-and-forget)
          this.fileRepository.updateTextExcerpt(file.id, excerpt).catch((err) => {
            console.error(
              `[FileContextBuilder] Failed to backfill excerpt for ${file.id}:`,
              err
            );
          });
        }
      } catch (err) {
        console.error(
          `[FileContextBuilder] Failed to extract excerpt for ${file.id}:`,
          err
        );
        // Continue without this file's context
      }
    }

    // Build text context (MUST match ChatServer output format exactly)
    let textContext = '';
    if (contextParts.length > 0) {
      textContext = `\n\n--- Attached Documents ---\n${contextParts.join('\n\n')}`;
    }

    const buildEndTime = Date.now();
    console.log(`[TIMING] FileContextBuilder buildWithImages END: ${buildEndTime} (duration: ${buildEndTime - buildStartTime}ms, textContextLength: ${textContext.length}, imageBlocksCount: ${imageBlocks.length})`);

    return { textContext, imageBlocks };
  }

  /**
   * Epic 18: Build context for Claude (backwards compatible, text-only)
   *
   * @deprecated Use buildWithImages() for Vision API support
   * @param conversationId - Conversation to get files for
   * @param scopeToFileIds - Optional array of file IDs to limit context to (for auto-summarize)
   * @returns Formatted context string for Claude (empty if no files)
   */
  async build(
    conversationId: string,
    scopeToFileIds?: string[]
  ): Promise<string> {
    const result = await this.buildWithImages(conversationId, scopeToFileIds);
    // Backwards compatible: return only text context, ignore image blocks
    return result.textContext;
  }

  /**
   * Check if a MIME type is a supported image format for Vision API
   */
  private isImageFile(mimeType: string): boolean {
    return (
      mimeType === 'image/png' ||
      mimeType === 'image/jpeg' ||
      mimeType === 'image/jpg' ||
      mimeType === 'image/gif' ||
      mimeType === 'image/webp'
    );
  }

  /**
   * Get file size from FileWithExcerpt (may not always have size field)
   */
  private getFileSize(file: FileWithExcerpt): number {
    // FileWithExcerpt may include size from the files table
    return (file as FileWithExcerpt & { size?: number }).size || 0;
  }

  /**
   * Epic 18: Format structured intake context for a single file
   *
   * NOTE: Uses CHAT_CONTEXT_PROFILE for whitespace normalization (matches ChatServer.ts:501-521)
   */
  formatIntakeContextFile(file: FileWithExcerpt): string {
    const ctx = file.intakeContext!;
    const parts: string[] = [
      `[Document: ${sanitizeForPrompt(file.filename, { ...CHAT_CONTEXT_PROFILE, maxLength: 100 })}]`,
    ];

    if (ctx.vendorName)
      parts.push(`Vendor: ${sanitizeForPrompt(ctx.vendorName, CHAT_CONTEXT_PROFILE)}`);
    if (ctx.solutionName)
      parts.push(`Solution: ${sanitizeForPrompt(ctx.solutionName, CHAT_CONTEXT_PROFILE)}`);
    if (ctx.solutionType)
      parts.push(`Type: ${sanitizeForPrompt(ctx.solutionType, CHAT_CONTEXT_PROFILE)}`);
    if (ctx.features?.length) {
      const features = ctx.features
        .slice(0, 5)
        .map((f) =>
          sanitizeForPrompt(f, { ...CHAT_CONTEXT_PROFILE, maxLength: 100 })
        )
        .filter(Boolean);
      if (features.length) parts.push(`Features: ${features.join(', ')}`);
    }
    if (ctx.claims?.length) {
      const claims = ctx.claims
        .slice(0, 3)
        .map((c) =>
          sanitizeForPrompt(c, { ...CHAT_CONTEXT_PROFILE, maxLength: 100 })
        )
        .filter(Boolean);
      if (claims.length) parts.push(`Claims: ${claims.join(', ')}`);
    }
    if (ctx.complianceMentions?.length) {
      const compliance = ctx.complianceMentions
        .map((c) =>
          sanitizeForPrompt(c, { ...CHAT_CONTEXT_PROFILE, maxLength: 50 })
        )
        .filter(Boolean);
      if (compliance.length) parts.push(`Compliance: ${compliance.join(', ')}`);
    }

    return parts.join('\n');
  }

  /**
   * Epic 18: Format raw text excerpt for a single file
   *
   * SECURITY: Uses sanitizeForPrompt to avoid injecting raw/malicious text
   *
   * NOTE: Excerpt uses prompt-escape profile (NO whitespace normalization) to preserve
   * document formatting while escaping injection patterns. This matches ChatServer.ts:531.
   * Filename still uses CHAT_CONTEXT_PROFILE for consistency.
   */
  formatTextExcerptFile(file: FileWithExcerpt): string {
    // Sanitize excerpt before injecting into Claude prompt
    // Uses escapePromptInjection but NOT whitespace normalization (preserves document formatting)
    const sanitizedExcerpt = sanitizeForPrompt(file.textExcerpt || '', {
      maxLength: 10000,
      stripControlChars: true,
      escapePromptInjection: true,
    });

    return `[Document: ${sanitizeForPrompt(file.filename, { ...CHAT_CONTEXT_PROFILE, maxLength: 100 })}]
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
  private async extractExcerptFromStorage(
    file: FileWithExcerpt
  ): Promise<string | null> {
    // Check if dependencies are available
    if (!this.fileStorage || !this.textExtractionService) {
      console.warn(
        '[FileContextBuilder] File storage or text extraction service not configured, skipping S3 fallback'
      );
      return null;
    }

    const buffer = await this.fileStorage.retrieve(file.storagePath);

    // Map MIME type to validated document type (handles DOCX-as-ZIP)
    const documentType = MIME_TYPE_MAP[file.mimeType];
    if (!documentType) {
      console.warn(
        `[FileContextBuilder] Unknown MIME type for extraction: ${file.mimeType}`
      );
      return null;
    }

    const result = await this.textExtractionService.extract(buffer, documentType);

    if (!result.success) {
      console.warn(
        `[FileContextBuilder] Text extraction failed for ${file.id}: ${result.error}`
      );
      return null;
    }

    return result.excerpt;
  }
}
