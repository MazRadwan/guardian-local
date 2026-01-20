# Story 28.2.2: Extract FileContextBuilder.ts

**Sprint:** 1 - Foundation
**Agent:** backend-agent
**Estimation:** Medium (2-3 files)

---

## Description

Extract `buildFileContext()` and related file formatting methods from ChatServer.ts into a dedicated `FileContextBuilder` class. This handles building document context for Claude from uploaded files.

---

## Acceptance Criteria

- [ ] `FileContextBuilder.ts` created at `infrastructure/websocket/context/FileContextBuilder.ts`
- [ ] Contains `build()`, `formatIntakeContextFile()`, `formatTextExcerptFile()` methods
- [ ] Handles S3 fallback extraction via optional dependency
- [ ] Unit tests cover all formatting scenarios
- [ ] ChatServer.ts continues to compile

---

## Technical Approach

```typescript
// infrastructure/websocket/context/FileContextBuilder.ts

import { IFileRepository, FileWithExcerpt } from '../../../application/interfaces/IFileRepository';
import { IFileStorage } from '../../../application/interfaces/IFileStorage';
import { ITextExtractionService } from '../../../application/interfaces/ITextExtractionService';
import { sanitizeForPrompt } from '../../../utils/sanitize';
import { MIME_TYPE_MAP } from '../../../domain/constants';

export class FileContextBuilder {
  constructor(
    private readonly fileRepository: IFileRepository,
    private readonly fileStorage?: IFileStorage,
    private readonly textExtractionService?: ITextExtractionService
  ) {}

  /**
   * Build file context for Claude prompt injection
   *
   * Uses priority order:
   * 1. Enriched intake context (if available)
   * 2. Text excerpt (fast fallback)
   * 3. S3 extraction (slow fallback)
   *
   * @param conversationId - Conversation to get files from
   * @param scopeToFileIds - Optional: limit to specific files
   */
  async build(conversationId: string, scopeToFileIds?: string[]): Promise<string> {
    const files = await this.fileRepository.findByConversation(conversationId);

    // Filter to scope if provided
    const targetFiles = scopeToFileIds
      ? files.filter(f => scopeToFileIds.includes(f.id))
      : files;

    if (targetFiles.length === 0) {
      return '';
    }

    const contextParts: string[] = [];

    for (const file of targetFiles) {
      const context = await this.buildSingleFileContext(file);
      if (context) {
        contextParts.push(context);
      }
    }

    if (contextParts.length === 0) {
      return '';
    }

    return `\n\n## Attached Documents\n\n${contextParts.join('\n\n---\n\n')}`;
  }

  private async buildSingleFileContext(file: FileWithExcerpt): Promise<string | null> {
    // Priority 1: Enriched intake context
    if (file.intakeContext) {
      return this.formatIntakeContextFile(file);
    }

    // Priority 2: Text excerpt
    if (file.textExcerpt) {
      return this.formatTextExcerptFile(file);
    }

    // Priority 3: S3 fallback extraction
    return this.extractExcerptFromStorage(file);
  }

  formatIntakeContextFile(file: FileWithExcerpt): string {
    const ctx = file.intakeContext!;
    const parts: string[] = [`[Document: ${sanitizeForPrompt(file.filename, { maxLength: 100 })}]`];

    if (ctx.vendorName) parts.push(`Vendor: ${sanitizeForPrompt(ctx.vendorName, { maxLength: 100 })}`);
    if (ctx.solutionName) parts.push(`Solution: ${sanitizeForPrompt(ctx.solutionName, { maxLength: 100 })}`);
    if (ctx.solutionType) parts.push(`Type: ${sanitizeForPrompt(ctx.solutionType, { maxLength: 100 })}`);
    if (ctx.features?.length) {
      const features = ctx.features.slice(0, 5).map(f => sanitizeForPrompt(f, { maxLength: 100 })).filter(Boolean);
      if (features.length) parts.push(`Features: ${features.join(', ')}`);
    }

    return parts.join('\n');
  }

  formatTextExcerptFile(file: FileWithExcerpt): string {
    const sanitizedExcerpt = sanitizeForPrompt(file.textExcerpt || '', {
      maxLength: 10000,
      stripControlChars: true,
      escapePromptInjection: true,
    });

    return `[Document: ${sanitizeForPrompt(file.filename, { maxLength: 100 })}]
(Raw text excerpt - enrichment pending)

${sanitizedExcerpt}`;
  }

  private async extractExcerptFromStorage(file: FileWithExcerpt): Promise<string | null> {
    if (!this.fileStorage || !this.textExtractionService) {
      return null;
    }

    try {
      const buffer = await this.fileStorage.retrieve(file.storagePath);
      const documentType = MIME_TYPE_MAP[file.mimeType];

      if (!documentType) {
        return null;
      }

      const result = await this.textExtractionService.extract(buffer, documentType);
      return result.success ? result.excerpt : null;
    } catch {
      return null;
    }
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
      findByConversation: jest.fn(),
    } as any;
    builder = new FileContextBuilder(mockFileRepository);
  });

  it('should return empty string for no files', async () => {
    mockFileRepository.findByConversation.mockResolvedValue([]);
    const result = await builder.build('conv-123');
    expect(result).toBe('');
  });

  it('should format intake context files', async () => {
    mockFileRepository.findByConversation.mockResolvedValue([{
      id: 'file-1',
      filename: 'vendor-doc.pdf',
      intakeContext: { vendorName: 'Acme Corp', solutionName: 'AI Suite' },
    }]);

    const result = await builder.build('conv-123');
    expect(result).toContain('Acme Corp');
    expect(result).toContain('AI Suite');
  });

  it('should format text excerpt files', async () => {
    mockFileRepository.findByConversation.mockResolvedValue([{
      id: 'file-1',
      filename: 'doc.pdf',
      textExcerpt: 'This is the document content...',
    }]);

    const result = await builder.build('conv-123');
    expect(result).toContain('document content');
  });

  it('should scope to specific file IDs', async () => {
    mockFileRepository.findByConversation.mockResolvedValue([
      { id: 'file-1', filename: 'a.pdf', textExcerpt: 'AAA' },
      { id: 'file-2', filename: 'b.pdf', textExcerpt: 'BBB' },
    ]);

    const result = await builder.build('conv-123', ['file-1']);
    expect(result).toContain('AAA');
    expect(result).not.toContain('BBB');
  });
});
```

---

## Definition of Done

- [ ] FileContextBuilder.ts created
- [ ] Unit tests written and passing
- [ ] TypeScript compiles without errors
- [ ] No changes to ChatServer behavior yet
