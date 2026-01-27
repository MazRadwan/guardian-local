# Story 31.1.1: Define IBackgroundExtractor Interface

**Sprint:** 1 - Decouple file_attached from Extraction
**Agent:** backend-agent
**Estimation:** Small

---

## Description

Create the interface for background text extraction. This decouples the extraction concern from the upload controller and enables dependency injection for testing.

**Note:** Interface is optional but recommended for testability. Can be skipped if preferring simpler direct injection of the concrete BackgroundExtractor service.

---

## Acceptance Criteria

- [ ] Interface defines `queueExtraction(fileId: string, buffer: Buffer, documentType: ValidatedDocumentType): void`
- [ ] Method is fire-and-forget (returns void, not Promise)
- [ ] Interface exported from `application/interfaces/index.ts`

---

## Technical Approach

```typescript
// packages/backend/src/application/interfaces/IBackgroundExtractor.ts
import type { ValidatedDocumentType } from './ITextExtractionService.js';

export interface IBackgroundExtractor {
  /**
   * Queue a file for background text extraction.
   * Fire-and-forget - extraction happens async, updates DB when complete.
   *
   * @param fileId - Database file ID to update when extraction completes
   * @param buffer - File buffer to extract text from
   * @param documentType - Validated document type (pdf, docx, image)
   */
  queueExtraction(
    fileId: string,
    buffer: Buffer,
    documentType: ValidatedDocumentType
  ): void;
}
```

---

## Files Touched

- `packages/backend/src/application/interfaces/IBackgroundExtractor.ts` - CREATE new interface
- `packages/backend/src/application/interfaces/index.ts` - ADD export

---

## Agent Assignment

- [x] backend-agent

---

## Tests Required

- None (interface only, tested via implementation in 31.1.2)

---

## Definition of Done

- [ ] Interface file created
- [ ] Exported from index.ts
- [ ] No TypeScript errors
- [ ] Code follows existing interface patterns
