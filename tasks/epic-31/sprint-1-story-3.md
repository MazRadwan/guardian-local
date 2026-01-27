# Story 31.1.3: Refactor processUpload to Emit Early

**Sprint:** 1 - Decouple file_attached from Extraction
**Agent:** backend-agent
**Estimation:** Medium

---

## Description

Modify DocumentUploadController.processUpload() to emit `file_attached` immediately after S3 storage and DB record creation, BEFORE text extraction. Extraction moves to BackgroundExtractor.

---

## Acceptance Criteria

- [ ] file_attached emits after S3 + DB, before extraction
- [ ] BackgroundExtractor.queueExtraction() called for text extraction
- [ ] Existing timing logs preserved and updated
- [ ] No change to HTTP response timing (still 202 immediately)
- [ ] hasExcerpt in file_attached payload is initially false

---

## Technical Approach

Current flow (approximate):
```
1. S3 store (await)
2. Text extraction (await) <-- BLOCKING
3. Create file record (await)
4. Emit file_attached
```

New flow:
```
1. S3 store (await)
2. Create file record with textExcerpt=null (await) -> returns fileId (UUID)
3. Emit file_attached (hasExcerpt: false, uploadId for correlation, fileId for persistence)
4. Queue background extraction using fileId (fire-and-forget)
```

**Key distinction:**
- `uploadId` - WebSocket correlation ID for this upload session (used by frontend to track upload progress)
- `fileId` - Database UUID returned from `fileRepository.create()` (used for all persistent operations)

**hasExcerpt behavior:** Stays `false` until next `FileContextBuilder.build()` call. S3 fallback handles missing excerpts - no new WebSocket event needed.

```typescript
// In processUpload(), after S3 store:

// Create file record BEFORE extraction (returns fileId UUID)
const fileRecord = await this.fileRepository.create({
  conversationId,
  filename: file.originalname,
  mimeType: file.mimetype,
  storagePath,
  textExcerpt: null, // Will be backfilled by BackgroundExtractor
  // ... other fields
});

const fileId = fileRecord.id; // Database UUID - use this for all persistent operations

// Emit file_attached immediately (uploadId for correlation, fileId for persistence)
this.emitFileAttached(socket, {
  uploadId,           // Correlation ID for this upload session
  fileId,             // Permanent database UUID
  filename: file.originalname,
  hasExcerpt: false,  // Stays false until next context build (S3 fallback handles it)
  // ... other fields
});

// Queue extraction in background using fileId (NOT uploadId)
this.backgroundExtractor.queueExtraction(fileId, file.buffer, documentType);
```

---

## Files Touched

- `packages/backend/src/infrastructure/http/controllers/DocumentUploadController.ts` - MODIFY processUpload method
- `packages/backend/src/index.ts` - MODIFY to inject BackgroundExtractor dependency

---

## Agent Assignment

- [x] backend-agent

---

## Tests Required

**IMPORTANT:** Use deterministic `flushPromises()` helper instead of `setTimeout` to avoid flaky tests.

```typescript
// packages/backend/__tests__/unit/DocumentUploadController.test.ts (updates)

// Helper for deterministic async testing
const flushPromises = () => new Promise(resolve => setImmediate(resolve));

describe('processUpload', () => {
  it('should emit file_attached before extraction completes', async () => {
    // Setup: extraction resolves async
    mockTextExtractionService.extract.mockResolvedValue({ success: true, excerpt: 'text' });

    const emitSpy = jest.fn();
    const socket = { emit: emitSpy } as unknown as Socket;

    await controller.processUpload(socket, file, conversationId);

    // file_attached should emit immediately (extraction runs in background)
    expect(emitSpy).toHaveBeenCalledWith('file_attached', expect.objectContaining({
      hasExcerpt: false,
    }));

    // Flush background extraction
    await flushPromises();
  });

  it('should call BackgroundExtractor.queueExtraction with correct params', async () => {
    await controller.processUpload(socket, file, conversationId);

    expect(mockBackgroundExtractor.queueExtraction).toHaveBeenCalledWith(
      expect.any(String), // fileId
      file.buffer,
      'pdf' // documentType
    );
  });

  it('should create file record with textExcerpt=null initially', async () => {
    await controller.processUpload(socket, file, conversationId);

    expect(mockFileRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        textExcerpt: null,
      })
    );
  });
});
```

---

## Definition of Done

- [ ] processUpload refactored
- [ ] All existing tests still pass
- [ ] New tests added and pass
- [ ] No TypeScript errors
- [ ] Timing logs show early file_attached emission
