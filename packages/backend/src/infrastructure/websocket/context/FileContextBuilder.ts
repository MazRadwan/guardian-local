/**
 * FileContextBuilder - Builds document context for Claude from uploaded files
 *
 * Epic 28 Story 28.2.2: Extracted from ChatServer.ts
 *
 * This builder handles file context injection into Claude prompts for consult/assessment modes.
 * Uses fallback hierarchy: intakeContext -> textExcerpt -> S3 re-read (with lazy backfill).
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
    private readonly textExtractionService?: ITextExtractionService
  ) {}

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
  async build(
    conversationId: string,
    scopeToFileIds?: string[]
  ): Promise<string> {
    // Use method that returns ALL files with excerpt data (not just those with intakeContext)
    let files =
      await this.fileRepository.findByConversationWithExcerpt(conversationId);

    // If scoped to specific files, filter to only those
    if (scopeToFileIds && scopeToFileIds.length > 0) {
      const scopeSet = new Set(scopeToFileIds);
      files = files.filter((f) => scopeSet.has(f.id));
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

    if (contextParts.length === 0) {
      return '';
    }

    // MUST match ChatServer output format exactly
    return `\n\n--- Attached Documents ---\n${contextParts.join('\n\n')}`;
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
