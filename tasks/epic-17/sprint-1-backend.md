# Sprint 1 - Track A: Backend Multi-File Upload

**Track:** A (Backend)
**Stories:** 17.1.1 - 17.1.4
**Estimated Effort:** ~2 hours
**Parallel With:** Track B (FileChip), Track C (Hook)
**Dependencies:** None

---

## Context

Currently, the backend accepts single-file uploads via `multer.single('file')`. This track updates the upload endpoint to accept multiple files while maintaining backward compatibility.

**Key Files:**
- `packages/backend/src/infrastructure/http/routes/document.routes.ts`
- `packages/backend/src/infrastructure/http/controllers/DocumentUploadController.ts`
- `packages/backend/__tests__/unit/DocumentUploadController.test.ts`

---

## Story 17.1.1: Multer Array Configuration

### Objective
Update multer configuration to accept multiple files.

### Current Code
```typescript
// document.routes.ts
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
});

router.post(
  '/upload',
  authMiddleware,
  upload.single('file'),  // <-- Single file
  controller.upload
);
```

### Target Code
```typescript
// document.routes.ts
const MAX_FILES = 10;
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB per file
const MAX_TOTAL_SIZE = 50 * 1024 * 1024; // 50MB total

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: MAX_FILES,
  },
});

router.post(
  '/upload',
  authMiddleware,
  upload.array('files', MAX_FILES),  // <-- Multiple files
  controller.upload
);
```

### Acceptance Criteria
- [ ] `upload.array('files', 10)` configured
- [ ] Per-file size limit: 20MB
- [ ] Max files per request: 10
- [ ] Existing single-file clients can still work (send as array of 1)

### Notes
- Field name changes from `'file'` to `'files'` (plural)
- Frontend will need to update FormData field name (handled in Track C)

---

## Story 17.1.2: Controller Batch Processing

### Objective
Update `DocumentUploadController.upload()` to process multiple files.

### Current Flow
```
1. Get req.file (single)
2. Validate file
3. Store file
4. Register in DB
5. Parse document
6. Emit events
7. Return response
```

### Target Flow
```
1. Get req.files (array)
2. For each file (parallel):
   a. Validate file
   b. Store file
   c. Register in DB
   d. Parse document
   e. Emit per-file progress
3. Return aggregated response
```

### Implementation

```typescript
// DocumentUploadController.ts

interface AuthenticatedRequest extends Request {
  user?: User;
  file?: Express.Multer.File;      // Keep for backward compat
  files?: Express.Multer.File[];   // Add array support
}

interface UploadResult {
  fileId: string;
  filename: string;
  status: 'success' | 'failed';
  error?: string;
}

upload = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  // Support both single and multi-file uploads
  const files = req.files || (req.file ? [req.file] : []);

  if (files.length === 0) {
    res.status(400).json({ error: 'No files provided' });
    return;
  }

  const { conversationId, mode } = req.body;
  const userId = req.user?.id;

  // Validate conversation ownership (once, not per-file)
  const conversation = await this.conversationService.getConversation(conversationId);
  if (!conversation || conversation.userId !== userId) {
    res.status(404).json({ error: 'Conversation not found' });
    return;
  }

  // Process files in parallel
  const results: UploadResult[] = await Promise.all(
    files.map(file => this.processFile(file, conversationId, userId, mode))
  );

  // Return results (202 if any succeeded)
  const anySuccess = results.some(r => r.status === 'success');
  res.status(anySuccess ? 202 : 400).json({
    results,
    totalFiles: files.length,
    successCount: results.filter(r => r.status === 'success').length,
    failedCount: results.filter(r => r.status === 'failed').length,
  });
};

private processFile = async (
  file: Express.Multer.File,
  conversationId: string,
  userId: string,
  mode: 'intake' | 'scoring'
): Promise<UploadResult> => {
  const tempId = crypto.randomUUID(); // For progress tracking

  try {
    // Emit start progress
    this.emitProgress(userId, {
      tempId,
      filename: file.originalname,
      stage: 'uploading',
      progress: 0,
    });

    // 1. Validate
    const validation = await this.fileValidator.validate(file.buffer, file.originalname);
    if (!validation.valid) {
      throw new Error(validation.errors?.join(', ') || 'Invalid file');
    }

    // 2. Store
    this.emitProgress(userId, { tempId, stage: 'uploading', progress: 50 });
    const storagePath = await this.fileStorage.store(file.buffer, file.originalname);

    // 3. Register in DB
    const fileRecord = await this.fileRepository.create({
      userId,
      conversationId,
      filename: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
      storagePath,
    });

    // 4. Parse
    this.emitProgress(userId, { tempId, stage: 'parsing', progress: 70 });
    await this.parseDocument(file, fileRecord.id, conversationId, userId, mode);

    // 5. Complete
    this.emitProgress(userId, {
      tempId,
      fileId: fileRecord.id,
      stage: 'complete',
      progress: 100,
    });

    return {
      fileId: fileRecord.id,
      filename: file.originalname,
      status: 'success',
    };
  } catch (error) {
    this.emitProgress(userId, {
      tempId,
      filename: file.originalname,
      stage: 'error',
      error: error instanceof Error ? error.message : 'Upload failed',
    });

    return {
      fileId: '',
      filename: file.originalname,
      status: 'failed',
      error: error instanceof Error ? error.message : 'Upload failed',
    };
  }
};
```

### Acceptance Criteria
- [ ] Controller accepts `req.files` array
- [ ] Backward compatible with `req.file` (single)
- [ ] Files processed in parallel via `Promise.all`
- [ ] Each file gets independent success/failure status
- [ ] Response includes per-file results
- [ ] Partial failures don't block successful files

---

## Story 17.1.3: Per-File Progress Events

### Objective
Emit WebSocket progress events with `tempId` to track individual files.

### Current Event Structure
```typescript
// Single file progress
socket.emit('upload_progress', {
  stage: 'parsing',
  progress: 50,
});
```

### Target Event Structure
```typescript
// Multi-file progress (per file)
socket.emit('upload_progress', {
  tempId: 'temp-123',      // Client-generated ID for tracking
  fileId?: 'file-456',     // Set on completion
  filename: 'doc.pdf',
  stage: 'uploading' | 'parsing' | 'complete' | 'error',
  progress: 50,
  error?: 'Validation failed',
});
```

### Implementation

```typescript
private emitProgress(userId: string, data: {
  tempId: string;
  fileId?: string;
  filename?: string;
  stage: 'uploading' | 'parsing' | 'complete' | 'error';
  progress?: number;
  error?: string;
}): void {
  this.chatNamespace?.to(`user:${userId}`).emit('upload_progress', data);
}
```

### Acceptance Criteria
- [ ] `tempId` included in all progress events
- [ ] `fileId` included on successful completion
- [ ] `filename` included for UI display
- [ ] `error` message included on failure
- [ ] Events routed to correct user room

---

## Story 17.1.4: Backend Unit Tests

### Objective
Add tests for multi-file upload scenarios.

### Test Cases

```typescript
// DocumentUploadController.test.ts

describe('Multi-file upload', () => {
  it('should accept multiple files', async () => {
    const files = [
      createMockFile('doc1.pdf', 'application/pdf'),
      createMockFile('doc2.pdf', 'application/pdf'),
    ];

    mockReq.files = files;
    mockReq.body = { conversationId: 'conv-123', mode: 'intake' };

    await controller.upload(mockReq as any, mockRes as any);

    expect(mockRes.status).toHaveBeenCalledWith(202);
    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({
        totalFiles: 2,
        successCount: 2,
        failedCount: 0,
      })
    );
  });

  it('should handle partial failures', async () => {
    const files = [
      createMockFile('valid.pdf', 'application/pdf'),
      createMockFile('invalid.exe', 'application/x-msdownload'),
    ];

    mockFileValidator.validate
      .mockResolvedValueOnce({ valid: true })
      .mockResolvedValueOnce({ valid: false, errors: ['Invalid type'] });

    mockReq.files = files;

    await controller.upload(mockReq as any, mockRes as any);

    expect(mockRes.status).toHaveBeenCalledWith(202); // Partial success
    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({
        successCount: 1,
        failedCount: 1,
      })
    );
  });

  it('should reject if all files fail', async () => {
    const files = [
      createMockFile('bad1.exe', 'application/x-msdownload'),
      createMockFile('bad2.exe', 'application/x-msdownload'),
    ];

    mockFileValidator.validate.mockResolvedValue({
      valid: false,
      errors: ['Invalid type']
    });

    mockReq.files = files;

    await controller.upload(mockReq as any, mockRes as any);

    expect(mockRes.status).toHaveBeenCalledWith(400);
  });

  it('should emit progress events per file', async () => {
    const files = [
      createMockFile('doc1.pdf', 'application/pdf'),
      createMockFile('doc2.pdf', 'application/pdf'),
    ];

    mockReq.files = files;

    await controller.upload(mockReq as any, mockRes as any);

    // Each file should emit: start, parsing, complete (3 events x 2 files)
    expect(mockChatNamespace.to).toHaveBeenCalled();
    const emitCalls = mockChatNamespace.emit.mock.calls
      .filter(call => call[0] === 'upload_progress');

    expect(emitCalls.length).toBeGreaterThanOrEqual(4); // At least 2 per file
  });

  it('should maintain backward compatibility with single file', async () => {
    mockReq.file = createMockFile('single.pdf', 'application/pdf');
    mockReq.files = undefined;

    await controller.upload(mockReq as any, mockRes as any);

    expect(mockRes.status).toHaveBeenCalledWith(202);
    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({
        totalFiles: 1,
        successCount: 1,
      })
    );
  });

  it('should enforce max files limit', async () => {
    const files = Array(15).fill(null).map((_, i) =>
      createMockFile(`doc${i}.pdf`, 'application/pdf')
    );

    mockReq.files = files;

    // Multer should have already rejected, but controller should also check
    await controller.upload(mockReq as any, mockRes as any);

    // Either multer rejects or controller limits
    expect(mockRes.status).toHaveBeenCalledWith(expect.any(Number));
  });
});
```

### Acceptance Criteria
- [ ] Test: Multiple files accepted
- [ ] Test: Partial failures handled
- [ ] Test: All failures return 400
- [ ] Test: Per-file progress events emitted
- [ ] Test: Single file backward compatibility
- [ ] Test: Max files limit enforced
- [ ] All existing tests still pass

---

## Completion Checklist

Before requesting code review:

- [ ] All 4 stories implemented
- [ ] `pnpm --filter @guardian/backend test` passes
- [ ] No TypeScript errors
- [ ] Progress events include `tempId` for tracking
- [ ] Response format documented in code comments
- [ ] Backward compatible with single-file uploads

---

## Handoff Notes

After this track completes:
- Frontend (Track C) will update FormData to use `'files'` field name
- Frontend will use `tempId` to correlate progress events with UI state
- Integration tests (Sprint 2) will test full flow
