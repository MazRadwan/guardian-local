# Story 31.1.2: Implement BackgroundExtractor Service

**Sprint:** 1 - Decouple file_attached from Extraction
**Agent:** backend-agent
**Estimation:** Medium

---

## Description

Implement the BackgroundExtractor that queues text extraction as fire-and-forget background tasks. Uses existing TextExtractionService but runs async without blocking.

---

## Acceptance Criteria

- [ ] Implements IBackgroundExtractor interface
- [ ] Calls TextExtractionService.extract() in background
- [ ] Updates file.textExcerpt via FileRepository when extraction completes
- [ ] Logs extraction timing and success/failure
- [ ] Handles errors gracefully (logs, doesn't crash)

---

## Technical Approach

```typescript
// packages/backend/src/infrastructure/extraction/BackgroundExtractor.ts
import type { IBackgroundExtractor } from '../../application/interfaces/IBackgroundExtractor.js';
import type { ITextExtractionService, ValidatedDocumentType } from '../../application/interfaces/ITextExtractionService.js';
import type { IFileRepository } from '../../application/interfaces/IFileRepository.js';

export class BackgroundExtractor implements IBackgroundExtractor {
  constructor(
    private readonly textExtractionService: ITextExtractionService,
    private readonly fileRepository: IFileRepository
  ) {}

  queueExtraction(
    fileId: string,
    buffer: Buffer,
    documentType: ValidatedDocumentType
  ): void {
    // Fire-and-forget - don't await
    this.extractAndUpdate(fileId, buffer, documentType).catch((err) => {
      console.error(`[BackgroundExtractor] Failed for fileId=${fileId}:`, err);
    });
  }

  private async extractAndUpdate(
    fileId: string,
    buffer: Buffer,
    documentType: ValidatedDocumentType
  ): Promise<void> {
    const startTime = Date.now();
    console.log(`[TIMING] BackgroundExtractor START: ${startTime} (fileId: ${fileId})`);

    try {
      const result = await this.textExtractionService.extract(buffer, documentType);

      if (result.success && result.excerpt) {
        await this.fileRepository.updateTextExcerpt(fileId, result.excerpt);
        console.log(`[TIMING] BackgroundExtractor SUCCESS: ${Date.now()} (fileId: ${fileId}, duration: ${Date.now() - startTime}ms)`);
      } else {
        console.warn(`[BackgroundExtractor] Extraction failed for fileId=${fileId}: ${result.error}`);
      }
    } catch (err) {
      console.error(`[BackgroundExtractor] Error for fileId=${fileId}:`, err);
    }
  }
}
```

---

## Files Touched

- `packages/backend/src/infrastructure/extraction/BackgroundExtractor.ts` - CREATE new service
- `packages/backend/src/infrastructure/extraction/index.ts` - CREATE barrel export

---

## Agent Assignment

- [x] backend-agent

---

## Tests Required

**IMPORTANT:** Use deterministic `flushPromises()` helper instead of `setTimeout` to avoid flaky tests.

```typescript
// packages/backend/__tests__/unit/infrastructure/extraction/BackgroundExtractor.test.ts

// Helper for deterministic async testing
const flushPromises = () => new Promise(resolve => setImmediate(resolve));

describe('BackgroundExtractor', () => {
  let mockTextExtractionService: jest.Mocked<ITextExtractionService>;
  let mockFileRepository: jest.Mocked<IFileRepository>;
  let extractor: BackgroundExtractor;

  beforeEach(() => {
    mockTextExtractionService = {
      extract: jest.fn(),
    };
    mockFileRepository = {
      updateTextExcerpt: jest.fn(),
      // ... other methods
    };
    extractor = new BackgroundExtractor(mockTextExtractionService, mockFileRepository);
  });

  describe('queueExtraction', () => {
    it('should queue extraction and update file when complete', async () => {
      const mockExtract = jest.fn().mockResolvedValue({ success: true, excerpt: 'test excerpt' });
      const mockUpdateExcerpt = jest.fn().mockResolvedValue(undefined);

      const extractor = new BackgroundExtractor(
        { extract: mockExtract } as any,
        { updateTextExcerpt: mockUpdateExcerpt } as any
      );

      // Call fire-and-forget method
      extractor.queueExtraction('file-uuid-123', Buffer.from('test'), 'pdf');

      // Flush all pending promises
      await flushPromises();

      expect(mockExtract).toHaveBeenCalledWith(Buffer.from('test'), 'pdf');
      expect(mockUpdateExcerpt).toHaveBeenCalledWith('file-uuid-123', 'test excerpt');
    });

    it('should update fileRepository on successful extraction', async () => {
      mockTextExtractionService.extract.mockResolvedValue({
        success: true,
        excerpt: 'Extracted text content',
      });
      mockFileRepository.updateTextExcerpt.mockResolvedValue(undefined);

      extractor.queueExtraction('file-456', Buffer.from('content'), 'docx');

      await flushPromises();

      expect(mockFileRepository.updateTextExcerpt).toHaveBeenCalledWith(
        'file-456',
        'Extracted text content'
      );
    });

    it('should log error on extraction failure (not throw)', async () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      mockTextExtractionService.extract.mockResolvedValue({
        success: false,
        error: 'Extraction failed',
      });

      extractor.queueExtraction('file-789', Buffer.from('bad'), 'pdf');

      await flushPromises();

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Extraction failed for fileId=file-789')
      );
      expect(mockFileRepository.updateTextExcerpt).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it('should handle repository update failure gracefully', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      mockTextExtractionService.extract.mockResolvedValue({
        success: true,
        excerpt: 'Good text',
      });
      mockFileRepository.updateTextExcerpt.mockRejectedValue(new Error('DB error'));

      extractor.queueExtraction('file-000', Buffer.from('test'), 'pdf');

      await flushPromises();

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed for fileId=file-000'),
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });
  });
});
```

---

## Definition of Done

- [ ] Service implemented
- [ ] All tests pass
- [ ] No TypeScript errors
- [ ] Timing logs match existing format
