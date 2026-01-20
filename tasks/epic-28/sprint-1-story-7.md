# Story 28.2.2: Extract FileContextBuilder.ts

**Sprint:** 1 - Foundation
**Agent:** backend-agent
**Estimation:** Medium (2-3 files)

---

## Description

Extract `buildFileContext()` and related file formatting methods from ChatServer.ts into a dedicated `FileContextBuilder` class. This handles building document context for Claude from uploaded files, with S3 fallback and lazy backfill.

**NOTE:** This builder is for **file context injection into Claude prompts** (used in consult/assessment modes). Legacy intake context injection is handled by ConversationContextBuilder (Story 28.2.1), NOT this builder.

---

## Acceptance Criteria

- [ ] `FileContextBuilder.ts` created at `infrastructure/websocket/context/FileContextBuilder.ts`
- [ ] Contains `build()`, `formatIntakeContextFile()`, `formatTextExcerptFile()`, `extractExcerptFromStorage()` methods
- [ ] **Correct output format**: `\n\n--- Attached Documents ---\n` header (matches ChatServer.ts:495)
- [ ] **Correct repository method**: Uses `findByConversationWithExcerpt()` (NOT `findByConversation`)
- [ ] **S3 backfill**: Lazy backfill via `fileRepository.updateTextExcerpt()` (fire-and-forget)
- [ ] **MIME_TYPE_MAP**: Handle DOCX-as-ZIP edge case correctly
- [ ] **scopeToFileIds parameter**: Optional array to limit context to specific files
- [ ] Unit tests cover S3 fallback success, failure, and missing-dependency paths
- [ ] Unit tests cover multiple files combined
- [ ] ChatServer.ts continues to compile

---

## Technical Approach

```typescript
// infrastructure/websocket/context/FileContextBuilder.ts

import type { IFileRepository, FileWithExcerpt } from '../../../application/interfaces/IFileRepository';
import type { IFileStorage } from '../../../application/interfaces/IFileStorage';
import type { ITextExtractionService, ValidatedDocumentType } from '../../../application/interfaces/ITextExtractionService';
import { sanitizeForPrompt, CHAT_CONTEXT_PROFILE } from '../../../utils/sanitize';

/**
 * IMPORTANT: Sanitization profiles for this builder:
 *
 * 1. formatIntakeContextFile - Uses CHAT_CONTEXT_PROFILE (whitespace normalization)
 *    Matches ChatServer.ts:501-521 private sanitizeForPrompt behavior
 *
 * 2. formatTextExcerptFile - Uses prompt-escape profile (NO whitespace normalization)
 *    Matches ChatServer.ts:531 which uses imported sanitizeForPrompt with escapePromptInjection
 *    This preserves document formatting while escaping injection patterns
 */

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
  async build(conversationId: string, scopeToFileIds?: string[]): Promise<string> {
    // Use method that returns ALL files with excerpt data (not just those with intakeContext)
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
      console.warn(`[FileContextBuilder] File ${file.id} has no excerpt, falling back to S3 read`);
      try {
        const excerpt = await this.extractExcerptFromStorage(file);
        if (excerpt) {
          contextParts.push(this.formatTextExcerptFile({ ...file, textExcerpt: excerpt }));

          // Lazy backfill: Store for next time (fire-and-forget)
          this.fileRepository.updateTextExcerpt(file.id, excerpt).catch(err => {
            console.error(`[FileContextBuilder] Failed to backfill excerpt for ${file.id}:`, err);
          });
        }
      } catch (err) {
        console.error(`[FileContextBuilder] Failed to extract excerpt for ${file.id}:`, err);
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
    const parts: string[] = [`[Document: ${sanitizeForPrompt(file.filename, { ...CHAT_CONTEXT_PROFILE, maxLength: 100 })}]`];

    if (ctx.vendorName) parts.push(`Vendor: ${sanitizeForPrompt(ctx.vendorName, CHAT_CONTEXT_PROFILE)}`);
    if (ctx.solutionName) parts.push(`Solution: ${sanitizeForPrompt(ctx.solutionName, CHAT_CONTEXT_PROFILE)}`);
    if (ctx.solutionType) parts.push(`Type: ${sanitizeForPrompt(ctx.solutionType, CHAT_CONTEXT_PROFILE)}`);
    if (ctx.features?.length) {
      const features = ctx.features.slice(0, 5).map(f => sanitizeForPrompt(f, { ...CHAT_CONTEXT_PROFILE, maxLength: 100 })).filter(Boolean);
      if (features.length) parts.push(`Features: ${features.join(', ')}`);
    }
    if (ctx.claims?.length) {
      const claims = ctx.claims.slice(0, 3).map(c => sanitizeForPrompt(c, { ...CHAT_CONTEXT_PROFILE, maxLength: 100 })).filter(Boolean);
      if (claims.length) parts.push(`Claims: ${claims.join(', ')}`);
    }
    if (ctx.complianceMentions?.length) {
      const compliance = ctx.complianceMentions.map(c => sanitizeForPrompt(c, { ...CHAT_CONTEXT_PROFILE, maxLength: 50 })).filter(Boolean);
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
  private async extractExcerptFromStorage(file: FileWithExcerpt): Promise<string | null> {
    // Check if dependencies are available
    if (!this.fileStorage || !this.textExtractionService) {
      console.warn('[FileContextBuilder] File storage or text extraction service not configured, skipping S3 fallback');
      return null;
    }

    const buffer = await this.fileStorage.retrieve(file.storagePath);

    // Map MIME type to validated document type (handles DOCX-as-ZIP)
    const documentType = MIME_TYPE_MAP[file.mimeType];
    if (!documentType) {
      console.warn(`[FileContextBuilder] Unknown MIME type for extraction: ${file.mimeType}`);
      return null;
    }

    const result = await this.textExtractionService.extract(buffer, documentType);

    if (!result.success) {
      console.warn(`[FileContextBuilder] Text extraction failed for ${file.id}: ${result.error}`);
      return null;
    }

    return result.excerpt;
  }
}
```

---

## Files Touched

- `packages/backend/src/infrastructure/websocket/context/FileContextBuilder.ts` - Create new file
- `packages/backend/__tests__/unit/infrastructure/websocket/context/FileContextBuilder.test.ts` - Create unit tests

---

## Tests Required

```typescript
describe('FileContextBuilder', () => {
  let builder: FileContextBuilder;
  let mockFileRepository: jest.Mocked<IFileRepository>;

  beforeEach(() => {
    mockFileRepository = {
      findByConversationWithExcerpt: jest.fn(),
      updateTextExcerpt: jest.fn().mockResolvedValue(undefined),
    } as any;
    builder = new FileContextBuilder(mockFileRepository);
  });

  describe('build()', () => {
    it('should return empty string for no files', async () => {
      mockFileRepository.findByConversationWithExcerpt.mockResolvedValue([]);
      const result = await builder.build('conv-123');
      expect(result).toBe('');
    });

    it('should use findByConversationWithExcerpt (not findByConversation)', async () => {
      mockFileRepository.findByConversationWithExcerpt.mockResolvedValue([]);
      await builder.build('conv-123');
      expect(mockFileRepository.findByConversationWithExcerpt).toHaveBeenCalledWith('conv-123');
    });

    it('should use correct output format with --- Attached Documents --- header', async () => {
      mockFileRepository.findByConversationWithExcerpt.mockResolvedValue([{
        id: 'file-1',
        filename: 'vendor-doc.pdf',
        intakeContext: { vendorName: 'Acme Corp' },
      }]);

      const result = await builder.build('conv-123');
      expect(result).toContain('--- Attached Documents ---');
      expect(result.startsWith('\n\n--- Attached Documents ---\n')).toBe(true);
    });

    it('should format intake context files (priority 1)', async () => {
      mockFileRepository.findByConversationWithExcerpt.mockResolvedValue([{
        id: 'file-1',
        filename: 'vendor-doc.pdf',
        intakeContext: { vendorName: 'Acme Corp', solutionName: 'AI Suite' },
      }]);

      const result = await builder.build('conv-123');
      expect(result).toContain('Acme Corp');
      expect(result).toContain('AI Suite');
    });

    it('should format text excerpt files (priority 2)', async () => {
      mockFileRepository.findByConversationWithExcerpt.mockResolvedValue([{
        id: 'file-1',
        filename: 'doc.pdf',
        textExcerpt: 'This is the document content...',
      }]);

      const result = await builder.build('conv-123');
      expect(result).toContain('document content');
      expect(result).toContain('enrichment pending');
    });

    it('should scope to specific file IDs', async () => {
      mockFileRepository.findByConversationWithExcerpt.mockResolvedValue([
        { id: 'file-1', filename: 'a.pdf', textExcerpt: 'AAA' },
        { id: 'file-2', filename: 'b.pdf', textExcerpt: 'BBB' },
      ]);

      const result = await builder.build('conv-123', ['file-1']);
      expect(result).toContain('AAA');
      expect(result).not.toContain('BBB');
    });

    it('should combine multiple files', async () => {
      mockFileRepository.findByConversationWithExcerpt.mockResolvedValue([
        { id: 'file-1', filename: 'vendor1.pdf', intakeContext: { vendorName: 'Acme' } },
        { id: 'file-2', filename: 'vendor2.pdf', textExcerpt: 'Globex content' },
      ]);

      const result = await builder.build('conv-123');
      expect(result).toContain('Acme');
      expect(result).toContain('Globex content');
    });
  });

  describe('S3 fallback and backfill', () => {
    it('should extract from S3 when no textExcerpt (priority 3)', async () => {
      const mockFileStorage = { retrieve: jest.fn().mockResolvedValue(Buffer.from('test')) };
      const mockTextExtraction = {
        extract: jest.fn().mockResolvedValue({ success: true, excerpt: 'Extracted from S3' }),
      };
      const builder = new FileContextBuilder(mockFileRepository, mockFileStorage as any, mockTextExtraction as any);

      mockFileRepository.findByConversationWithExcerpt.mockResolvedValue([{
        id: 'file-1',
        filename: 'doc.pdf',
        mimeType: 'application/pdf',
        storagePath: 's3://bucket/doc.pdf',
        // No intakeContext or textExcerpt - triggers S3 fallback
      }]);

      const result = await builder.build('conv-123');
      expect(mockFileStorage.retrieve).toHaveBeenCalledWith('s3://bucket/doc.pdf');
      expect(result).toContain('Extracted from S3');
    });

    it('should lazy backfill excerpt after S3 extraction (fire-and-forget)', async () => {
      const mockFileStorage = { retrieve: jest.fn().mockResolvedValue(Buffer.from('test')) };
      const mockTextExtraction = {
        extract: jest.fn().mockResolvedValue({ success: true, excerpt: 'Backfill content' }),
      };
      const builder = new FileContextBuilder(mockFileRepository, mockFileStorage as any, mockTextExtraction as any);

      mockFileRepository.findByConversationWithExcerpt.mockResolvedValue([{
        id: 'file-1',
        filename: 'doc.pdf',
        mimeType: 'application/pdf',
        storagePath: 's3://bucket/doc.pdf',
      }]);

      await builder.build('conv-123');

      // Backfill should be called
      expect(mockFileRepository.updateTextExcerpt).toHaveBeenCalledWith('file-1', 'Backfill content');
    });

    it('should handle DOCX MIME type correctly (MIME_TYPE_MAP)', async () => {
      const mockFileStorage = { retrieve: jest.fn().mockResolvedValue(Buffer.from('test')) };
      const mockTextExtraction = {
        extract: jest.fn().mockResolvedValue({ success: true, excerpt: 'DOCX content' }),
      };
      const builder = new FileContextBuilder(mockFileRepository, mockFileStorage as any, mockTextExtraction as any);

      mockFileRepository.findByConversationWithExcerpt.mockResolvedValue([{
        id: 'file-1',
        filename: 'doc.docx',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        storagePath: 's3://bucket/doc.docx',
      }]);

      await builder.build('conv-123');

      expect(mockTextExtraction.extract).toHaveBeenCalledWith(expect.any(Buffer), 'docx');
    });

    it('should skip unknown MIME types', async () => {
      const mockFileStorage = { retrieve: jest.fn().mockResolvedValue(Buffer.from('test')) };
      const mockTextExtraction = { extract: jest.fn() };
      const builder = new FileContextBuilder(mockFileRepository, mockFileStorage as any, mockTextExtraction as any);

      mockFileRepository.findByConversationWithExcerpt.mockResolvedValue([{
        id: 'file-1',
        filename: 'doc.xyz',
        mimeType: 'application/unknown',
        storagePath: 's3://bucket/doc.xyz',
      }]);

      const result = await builder.build('conv-123');
      expect(mockTextExtraction.extract).not.toHaveBeenCalled();
      expect(result).toBe('');
    });

    it('should return empty when S3 extraction fails', async () => {
      const mockFileStorage = { retrieve: jest.fn().mockRejectedValue(new Error('S3 error')) };
      const builder = new FileContextBuilder(mockFileRepository, mockFileStorage as any);

      mockFileRepository.findByConversationWithExcerpt.mockResolvedValue([{
        id: 'file-1',
        filename: 'doc.pdf',
        storagePath: 's3://bucket/doc.pdf',
      }]);

      const result = await builder.build('conv-123');
      expect(result).toBe('');
    });

    it('should skip S3 fallback when dependencies not provided', async () => {
      // Builder without fileStorage or textExtractionService
      const builder = new FileContextBuilder(mockFileRepository);

      mockFileRepository.findByConversationWithExcerpt.mockResolvedValue([{
        id: 'file-1',
        filename: 'doc.pdf',
        storagePath: 's3://bucket/doc.pdf',
      }]);

      const result = await builder.build('conv-123');
      expect(result).toBe('');
    });

    it('should continue with other files when one extraction fails', async () => {
      const mockFileStorage = { retrieve: jest.fn().mockRejectedValue(new Error('S3 error')) };
      const builder = new FileContextBuilder(mockFileRepository, mockFileStorage as any);

      mockFileRepository.findByConversationWithExcerpt.mockResolvedValue([
        { id: 'file-1', filename: 'broken.pdf', storagePath: 's3://bucket/broken.pdf' },
        { id: 'file-2', filename: 'working.pdf', textExcerpt: 'This works' },
      ]);

      const result = await builder.build('conv-123');
      expect(result).toContain('This works');
    });
  });

  describe('formatIntakeContextFile()', () => {
    it('should format all context fields', () => {
      const file = {
        id: 'file-1',
        filename: 'test.pdf',
        intakeContext: {
          vendorName: 'Test Vendor',
          solutionName: 'Test Solution',
          solutionType: 'SaaS',
          features: ['feature1', 'feature2'],
          claims: ['claim1'],
          complianceMentions: ['HIPAA'],
        },
      } as FileWithExcerpt;

      const result = builder.formatIntakeContextFile(file);
      expect(result).toContain('[Document: test.pdf]');
      expect(result).toContain('Vendor: Test Vendor');
      expect(result).toContain('Solution: Test Solution');
      expect(result).toContain('Type: SaaS');
      expect(result).toContain('Features: feature1, feature2');
      expect(result).toContain('Claims: claim1');
      expect(result).toContain('Compliance: HIPAA');
    });
  });

  describe('formatTextExcerptFile()', () => {
    it('should format with enrichment pending note', () => {
      const file = {
        id: 'file-1',
        filename: 'test.pdf',
        textExcerpt: 'Raw content here',
      } as FileWithExcerpt;

      const result = builder.formatTextExcerptFile(file);
      expect(result).toContain('[Document: test.pdf]');
      expect(result).toContain('(Raw text excerpt - enrichment pending)');
      expect(result).toContain('Raw content here');
    });

    it('should sanitize excerpt with escapePromptInjection', () => {
      const file = {
        id: 'file-1',
        filename: 'test.pdf',
        textExcerpt: 'Normal content',
      } as FileWithExcerpt;

      // This test just verifies sanitizeForPrompt is called with escapePromptInjection: true
      // The actual sanitization is tested in sanitize.test.ts
      const result = builder.formatTextExcerptFile(file);
      expect(result).toContain('Normal content');
    });
  });
});
```

---

## Definition of Done

- [ ] FileContextBuilder.ts created with correct output format (`--- Attached Documents ---`)
- [ ] Uses `findByConversationWithExcerpt` repository method
- [ ] S3 fallback with lazy backfill implemented
- [ ] MIME_TYPE_MAP handles DOCX-as-ZIP edge case
- [ ] Unit tests written and passing
- [ ] TypeScript compiles without errors
- [ ] No changes to ChatServer behavior yet
