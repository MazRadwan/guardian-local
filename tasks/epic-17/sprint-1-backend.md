# Sprint 1 - Track A: Backend Multi-File Upload

**Track:** A (Backend)
**Stories:** 17.1.1 - 17.1.4
**Estimated Effort:** ~2 hours
**Parallel With:** Track B (FileChip), Track C (Hook)
**Dependencies:** None

---

## Context

Currently, the backend accepts single-file uploads via `multer.single('file')`. This track updates the upload endpoint to accept multiple files while maintaining:
- **202 immediate response** (no blocking on parsing)
- **Async parsing with WebSocket progress**
- **Backward compatibility** with single-file uploads

**Key Files:**
- `packages/backend/src/infrastructure/http/routes/document.routes.ts`
- `packages/backend/src/infrastructure/http/controllers/DocumentUploadController.ts`
- `packages/backend/__tests__/unit/DocumentUploadController.test.ts`

---

## Current Implementation (Actual)

### Route Configuration
```typescript
// document.routes.ts - CURRENT
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB per file
});

router.post(
  '/upload',
  authMiddleware,
  upload.single('file'),  // Single file, field name 'file'
  controller.upload
);
```

### Controller Flow (Epic 16)
```
1. Validate auth + fields
2. Validate conversation ownership
3. Validate file (magic bytes)
4. Return 202 immediately with uploadId
5. Process async: store → register in DB → parse → emit WS events
```

### WebSocket Event Contract (MUST PRESERVE)
```typescript
// upload_progress event
{
  conversationId: string;
  uploadId: string;        // Server-generated correlation ID
  progress: number;        // 0-100
  stage: 'storing' | 'parsing' | 'complete' | 'error';
  message: string;
  error?: string;
}

// intake_context_ready / scoring_parse_ready events include:
{
  conversationId: string;
  uploadId: string;
  success: boolean;
  fileMetadata: {          // For UI attachment display
    fileId: string;        // Database UUID
    filename: string;
    mimeType: string;
    size: number;
  };
  // ... mode-specific fields
}
```

---

## Design Decisions

### Correlation Strategy
For multi-file uploads, each file needs a unique `uploadId` for WS event correlation.

**Approach:** Server generates one `uploadId` per file, returns array in HTTP response.

```typescript
// HTTP 202 Response (multi-file)
{
  message: 'Upload accepted',
  files: [
    { index: 0, filename: 'doc1.pdf', uploadId: 'upload-abc123' },
    { index: 1, filename: 'doc2.pdf', uploadId: 'upload-def456' },
  ]
}
```

Client maps: `localIndex → uploadId → fileState`

### Why NOT client-generated tempId?
- Adds complexity: server must receive, validate, and echo tempId
- uploadId already works: client can correlate via array index + uploadId
- Simpler contract: server generates all IDs

### Limits (Authoritative)
```typescript
const MAX_FILES = 10;
const MAX_FILE_SIZE = 20 * 1024 * 1024;  // 20MB per file
const MAX_TOTAL_SIZE = 50 * 1024 * 1024; // 50MB total per request
```

---

## Story 17.1.1: Multer Array Configuration

### Objective
Update multer configuration to accept multiple files with total size enforcement.

### Target Code
```typescript
// document.routes.ts
const MAX_FILES = 10;
const MAX_FILE_SIZE = 20 * 1024 * 1024;  // 20MB per file
const MAX_TOTAL_SIZE = 50 * 1024 * 1024; // 50MB total

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: MAX_FILES,
  },
});

// Total size validation middleware
const validateTotalSize = (req: Request, res: Response, next: NextFunction) => {
  const files = req.files as Express.Multer.File[] | undefined;
  if (files && files.length > 0) {
    const totalSize = files.reduce((sum, f) => sum + f.size, 0);
    if (totalSize > MAX_TOTAL_SIZE) {
      return res.status(400).json({
        error: `Total upload size (${Math.round(totalSize / 1024 / 1024)}MB) exceeds limit (${MAX_TOTAL_SIZE / 1024 / 1024}MB)`,
      });
    }
  }
  next();
};

router.post(
  '/upload',
  authMiddleware,
  upload.array('files', MAX_FILES),  // Changed: 'file' → 'files', array
  validateTotalSize,
  controller.upload
);
```

### Backward Compatibility
Frontend must update FormData field from `'file'` to `'files'`. Single-file uploads still work (array of 1).

### Acceptance Criteria
- [ ] `upload.array('files', 10)` configured
- [ ] Per-file size limit: 20MB
- [ ] Max files per request: 10
- [ ] Total size limit: 50MB (custom middleware)
- [ ] Existing single-file flow works (as array of 1)

---

## Story 17.1.2: Controller Non-Blocking Batch Processing

### Objective
Update controller to handle multiple files while preserving **202 immediate + async parsing**.

### CRITICAL: Preserve Epic 16 Architecture
```
❌ WRONG: await Promise.all(files.map(processFile)) → return results
   This blocks HTTP response until all parsing completes (minutes for large PDFs)

✅ CORRECT: validate → store → return 202 → parse async with WS progress
   HTTP response returns in <1 second, parsing runs in background
```

### Implementation

```typescript
// DocumentUploadController.ts

interface AuthenticatedRequest extends Request {
  user?: User;
  file?: Express.Multer.File;      // Backward compat
  files?: Express.Multer.File[];   // Multi-file
}

interface FileUploadResult {
  index: number;
  filename: string;
  uploadId: string;
  status: 'accepted' | 'rejected';
  error?: string;
}

upload = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const userId = req.user?.id;
  const { conversationId, mode } = req.body;

  // Support both single and multi-file
  const files = req.files || (req.file ? [req.file] : []);

  // 1. Validate auth
  if (!userId) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }

  // 2. Validate required fields
  if (!conversationId || !mode || files.length === 0) {
    res.status(400).json({
      error: 'Missing required fields: conversationId, mode, files',
    });
    return;
  }

  if (!['intake', 'scoring'].includes(mode)) {
    res.status(400).json({ error: 'Invalid mode' });
    return;
  }

  // 3. Validate conversation ownership (once, not per-file)
  const conversation = await this.conversationService.getConversation(conversationId);
  if (!conversation || conversation.userId !== userId) {
    res.status(conversation ? 403 : 404).json({
      error: conversation ? 'Access denied' : 'Conversation not found',
    });
    return;
  }

  // 4. Validate all files synchronously (fast - no parsing)
  const results: FileUploadResult[] = [];
  const validFiles: { file: Express.Multer.File; uploadId: string; index: number }[] = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const uploadId = `upload-${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${i}`;

    const validation = await this.fileValidator.validate(
      file.buffer,
      file.mimetype,
      file.originalname
    );

    if (validation.valid) {
      validFiles.push({ file, uploadId, index: i });
      results.push({
        index: i,
        filename: file.originalname,
        uploadId,
        status: 'accepted',
      });
    } else {
      results.push({
        index: i,
        filename: file.originalname,
        uploadId,
        status: 'rejected',
        error: validation.error,
      });
    }
  }

  // 5. Return 202 immediately (even if some rejected)
  const acceptedCount = results.filter(r => r.status === 'accepted').length;

  if (acceptedCount === 0) {
    res.status(400).json({
      error: 'All files rejected',
      files: results,
    });
    return;
  }

  res.status(202).json({
    message: 'Upload accepted',
    totalFiles: files.length,
    acceptedCount,
    rejectedCount: files.length - acceptedCount,
    files: results,
  });

  // 6. Process valid files async (fire-and-forget)
  for (const { file, uploadId, index } of validFiles) {
    this.processUploadAsync(uploadId, userId, conversationId, mode, file)
      .catch(err => {
        console.error(`[Upload] Async processing failed for ${file.originalname}:`, err);
        // Error already emitted via WS in processUploadAsync
      });
  }
};

/**
 * Process single file asynchronously (same as Epic 16, unchanged)
 */
private async processUploadAsync(
  uploadId: string,
  userId: string,
  conversationId: string,
  mode: 'intake' | 'scoring',
  file: Express.Multer.File
): Promise<void> {
  // Existing processUpload logic - store → register → parse → emit events
  // No changes needed to this method
}
```

### Response Format

**Success (all accepted):**
```json
{
  "message": "Upload accepted",
  "totalFiles": 3,
  "acceptedCount": 3,
  "rejectedCount": 0,
  "files": [
    { "index": 0, "filename": "doc1.pdf", "uploadId": "upload-abc123-0", "status": "accepted" },
    { "index": 1, "filename": "doc2.pdf", "uploadId": "upload-abc123-1", "status": "accepted" },
    { "index": 2, "filename": "doc3.pdf", "uploadId": "upload-abc123-2", "status": "accepted" }
  ]
}
```

**Partial success:**
```json
{
  "message": "Upload accepted",
  "totalFiles": 3,
  "acceptedCount": 2,
  "rejectedCount": 1,
  "files": [
    { "index": 0, "filename": "valid.pdf", "uploadId": "upload-abc123-0", "status": "accepted" },
    { "index": 1, "filename": "bad.exe", "uploadId": "upload-abc123-1", "status": "rejected", "error": "Invalid file type" },
    { "index": 2, "filename": "other.pdf", "uploadId": "upload-abc123-2", "status": "accepted" }
  ]
}
```

### Acceptance Criteria
- [ ] Controller accepts `req.files` array
- [ ] Backward compatible with `req.file` (single)
- [ ] Returns 202 immediately (validation only, no parsing)
- [ ] Each file gets unique uploadId
- [ ] Rejected files included in response with error
- [ ] Async processing fires for each valid file
- [ ] No change to existing WS event format

---

## Story 17.1.3: Per-File Progress Events

### Objective
Ensure each file's progress events use its unique `uploadId`.

### Current Implementation (No Changes Needed)
The existing `processUpload` → `emitProgress` flow already uses uploadId per file.
Since we call `processUploadAsync` once per file with its unique uploadId,
WS events will naturally correlate to the correct file.

```typescript
// Existing emitProgress - works as-is
private emitProgress(
  socketRoom: string,
  conversationId: string,
  uploadId: string,  // Each file has unique uploadId
  progress: number,
  stage: 'storing' | 'parsing' | 'complete' | 'error',
  message: string,
  error?: string
): void {
  this.chatNamespace.to(socketRoom).emit('upload_progress', {
    conversationId,
    uploadId,
    progress,
    stage,
    message,
    error,
  });
}
```

### Client Correlation

Client receives uploadId array in HTTP 202 response:
```typescript
// Frontend
const response = await fetch('/api/documents/upload', ...);
const { files } = await response.json();

// Build uploadId → localIndex map
const uploadIdMap = new Map(
  files.map((f, idx) => [f.uploadId, idx])
);

// WS event handler
socket.on('upload_progress', (data) => {
  const localIndex = uploadIdMap.get(data.uploadId);
  if (localIndex !== undefined) {
    updateFileState(localIndex, data);
  }
});
```

### Acceptance Criteria
- [ ] Each file's WS events use its unique uploadId
- [ ] Events routed to correct user room
- [ ] No changes to event payload structure
- [ ] Existing single-file correlation still works

---

## Story 17.1.4: Backend Unit Tests

### Objective
Add tests for multi-file upload scenarios.

### Test Cases

```typescript
// DocumentUploadController.test.ts

describe('Multi-file upload', () => {
  const createMockFile = (name: string, type: string, size = 1024) => ({
    originalname: name,
    mimetype: type,
    buffer: Buffer.alloc(size),
    size,
  });

  it('should accept multiple valid files', async () => {
    const files = [
      createMockFile('doc1.pdf', 'application/pdf'),
      createMockFile('doc2.pdf', 'application/pdf'),
    ];

    mockFileValidator.validate.mockResolvedValue({ valid: true, documentType: 'pdf' });
    mockReq.files = files;
    mockReq.body = { conversationId: 'conv-123', mode: 'intake' };

    await controller.upload(mockReq as any, mockRes as any);

    expect(mockRes.status).toHaveBeenCalledWith(202);
    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({
        totalFiles: 2,
        acceptedCount: 2,
        rejectedCount: 0,
        files: expect.arrayContaining([
          expect.objectContaining({ status: 'accepted', filename: 'doc1.pdf' }),
          expect.objectContaining({ status: 'accepted', filename: 'doc2.pdf' }),
        ]),
      })
    );
  });

  it('should handle partial failures (some files rejected)', async () => {
    const files = [
      createMockFile('valid.pdf', 'application/pdf'),
      createMockFile('invalid.exe', 'application/x-msdownload'),
    ];

    mockFileValidator.validate
      .mockResolvedValueOnce({ valid: true, documentType: 'pdf' })
      .mockResolvedValueOnce({ valid: false, error: 'Invalid type' });

    mockReq.files = files;
    mockReq.body = { conversationId: 'conv-123', mode: 'intake' };

    await controller.upload(mockReq as any, mockRes as any);

    expect(mockRes.status).toHaveBeenCalledWith(202); // Partial success = 202
    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({
        acceptedCount: 1,
        rejectedCount: 1,
        files: expect.arrayContaining([
          expect.objectContaining({ status: 'accepted' }),
          expect.objectContaining({ status: 'rejected', error: 'Invalid type' }),
        ]),
      })
    );
  });

  it('should return 400 if all files rejected', async () => {
    const files = [
      createMockFile('bad1.exe', 'application/x-msdownload'),
      createMockFile('bad2.exe', 'application/x-msdownload'),
    ];

    mockFileValidator.validate.mockResolvedValue({ valid: false, error: 'Invalid type' });
    mockReq.files = files;
    mockReq.body = { conversationId: 'conv-123', mode: 'intake' };

    await controller.upload(mockReq as any, mockRes as any);

    expect(mockRes.status).toHaveBeenCalledWith(400);
    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'All files rejected',
      })
    );
  });

  it('should generate unique uploadId per file', async () => {
    const files = [
      createMockFile('doc1.pdf', 'application/pdf'),
      createMockFile('doc2.pdf', 'application/pdf'),
    ];

    mockFileValidator.validate.mockResolvedValue({ valid: true, documentType: 'pdf' });
    mockReq.files = files;
    mockReq.body = { conversationId: 'conv-123', mode: 'intake' };

    await controller.upload(mockReq as any, mockRes as any);

    const response = mockRes.json.mock.calls[0][0];
    const uploadIds = response.files.map((f: any) => f.uploadId);

    // All uploadIds should be unique
    expect(new Set(uploadIds).size).toBe(uploadIds.length);
  });

  it('should maintain backward compatibility with single file', async () => {
    mockFileValidator.validate.mockResolvedValue({ valid: true, documentType: 'pdf' });
    mockReq.file = createMockFile('single.pdf', 'application/pdf');
    mockReq.files = undefined;
    mockReq.body = { conversationId: 'conv-123', mode: 'intake' };

    await controller.upload(mockReq as any, mockRes as any);

    expect(mockRes.status).toHaveBeenCalledWith(202);
    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({
        totalFiles: 1,
        acceptedCount: 1,
      })
    );
  });

  it('should return 202 immediately without waiting for parsing', async () => {
    // Mock a slow parser
    let parseStarted = false;
    let parseCompleted = false;

    const slowParse = async () => {
      parseStarted = true;
      await new Promise(resolve => setTimeout(resolve, 100));
      parseCompleted = true;
    };

    mockFileValidator.validate.mockResolvedValue({ valid: true, documentType: 'pdf' });
    mockReq.files = [createMockFile('slow.pdf', 'application/pdf')];
    mockReq.body = { conversationId: 'conv-123', mode: 'intake' };

    // Note: This test verifies the controller returns before parsing completes
    // Actual implementation would need to mock processUploadAsync

    await controller.upload(mockReq as any, mockRes as any);

    // Response sent immediately
    expect(mockRes.status).toHaveBeenCalledWith(202);
    // Parsing happens async after response (tested via integration tests)
  });

  it('should validate conversation ownership once, not per-file', async () => {
    const files = [
      createMockFile('doc1.pdf', 'application/pdf'),
      createMockFile('doc2.pdf', 'application/pdf'),
      createMockFile('doc3.pdf', 'application/pdf'),
    ];

    mockFileValidator.validate.mockResolvedValue({ valid: true, documentType: 'pdf' });
    mockReq.files = files;
    mockReq.body = { conversationId: 'conv-123', mode: 'intake' };

    await controller.upload(mockReq as any, mockRes as any);

    // Conversation lookup should happen exactly once
    expect(mockConversationService.getConversation).toHaveBeenCalledTimes(1);
  });
});

describe('Total size validation', () => {
  it('should reject if total size exceeds limit', async () => {
    // This is tested via integration tests with the middleware
  });
});
```

### Acceptance Criteria
- [ ] Test: Multiple files accepted
- [ ] Test: Partial failures handled correctly
- [ ] Test: All failures return 400
- [ ] Test: Unique uploadId per file
- [ ] Test: Single file backward compatibility
- [ ] Test: 202 returns before parsing completes
- [ ] Test: Conversation validated once
- [ ] All existing tests still pass

---

## Completion Checklist

Before requesting code review:

- [ ] All 4 stories implemented
- [ ] `pnpm --filter @guardian/backend test` passes
- [ ] No TypeScript errors
- [ ] HTTP returns 202 immediately (no blocking on parse)
- [ ] Each file gets unique uploadId
- [ ] Total size limit enforced (50MB)
- [ ] Backward compatible with single-file uploads
- [ ] Response format documented

---

## Handoff Notes

After this track completes:
- Frontend (Track C) will update FormData to use `'files'` field name
- Frontend will use `files[].uploadId` to correlate WS progress events
- Integration tests (Sprint 2) will test full flow
