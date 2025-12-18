# Epic 17 Sprint 1 Track A - Code Reference

Quick reference for key implementation patterns.

---

## Route Configuration

**File:** `packages/backend/src/infrastructure/http/routes/document.routes.ts`

```typescript
// Authoritative limits
const MAX_FILES = 10;
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB per file
const MAX_TOTAL_SIZE = 50 * 1024 * 1024; // 50MB total per request

// Multer configuration
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: MAX_FILES,
  },
});

// Total size validation middleware
const validateTotalSize = (req: Request, res: Response, next: NextFunction): void => {
  const files = req.files as Express.Multer.File[] | undefined;
  if (files && files.length > 0) {
    const totalSize = files.reduce((sum, f) => sum + f.size, 0);
    if (totalSize > MAX_TOTAL_SIZE) {
      res.status(400).json({
        error: `Total upload size exceeds limit (${MAX_TOTAL_SIZE / 1024 / 1024}MB)`,
      });
      return;
    }
  }
  next();
};

// Route: Changed from upload.single('file') to upload.array('files', 10)
router.post(
  '/upload',
  authMiddleware(authService),
  upload.array('files', MAX_FILES),
  validateTotalSize,
  controller.upload
);
```

---

## Controller: Non-Blocking Multi-File Processing

**File:** `packages/backend/src/infrastructure/http/controllers/DocumentUploadController.ts`

```typescript
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
  let filesArray: Express.Multer.File[];
  if (req.files) {
    if (Array.isArray(req.files)) {
      filesArray = req.files;
    } else {
      filesArray = Object.values(req.files).flat();
    }
  } else if (req.file) {
    filesArray = [req.file];
  } else {
    filesArray = [];
  }
  const files = filesArray;

  // ... auth and validation checks ...

  // Validate conversation ownership ONCE (not per-file)
  const conversation = await this.conversationService.getConversation(conversationId);
  if (!conversation || conversation.userId !== userId) {
    // ... error handling ...
  }

  // Validate all files synchronously (fast - magic bytes only)
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

  // Return 202 immediately (even if some rejected)
  const acceptedCount = results.filter((r) => r.status === 'accepted').length;

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

  // CRITICAL: Process valid files async (fire-and-forget, NOT blocking)
  // This happens AFTER response is sent
  for (const { file, uploadId, index } of validFiles) {
    const validation = await this.fileValidator.validate(
      file.buffer,
      file.mimetype,
      file.originalname
    );

    this.processUpload(uploadId, userId, conversationId, mode, file, validation.documentType!)
      .catch((err) => {
        console.error(`[Upload] Async processing failed for ${file.originalname}:`, err);
        // Error already emitted via WS in processUpload
      });
  }
};
```

---

## Test Helper

**File:** `packages/backend/__tests__/unit/DocumentUploadController.test.ts`

```typescript
const createMockFile = (name: string, type: string, size = 1024): Express.Multer.File => ({
  originalname: name,
  mimetype: type,
  buffer: Buffer.alloc(size),
  size,
  fieldname: 'files',
  encoding: '7bit',
  stream: null as any,
  destination: '',
  filename: '',
  path: '',
});
```

---

## Test Example: Multi-File Upload

```typescript
it('should accept multiple valid files', async () => {
  const files = [
    createMockFile('doc1.pdf', 'application/pdf'),
    createMockFile('doc2.pdf', 'application/pdf'),
  ];

  mockFileValidator.validate.mockResolvedValue({ valid: true, documentType: 'pdf' });
  mockReq.files = files;
  mockReq.file = undefined;
  mockReq.body = { conversationId: 'conv-123', mode: 'intake' };

  await controller.upload(mockReq as any, mockRes as any);

  expect(mockRes.status).toHaveBeenCalledWith(202);
  expect(mockRes.json).toHaveBeenCalledWith(
    expect.objectContaining({
      message: 'Upload accepted',
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
```

---

## Test Example: Partial Failures

```typescript
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
```

---

## HTTP Response Examples

### All Accepted
```json
{
  "message": "Upload accepted",
  "totalFiles": 3,
  "acceptedCount": 3,
  "rejectedCount": 0,
  "files": [
    {
      "index": 0,
      "filename": "doc1.pdf",
      "uploadId": "upload-1234567890-abc123-0",
      "status": "accepted"
    },
    {
      "index": 1,
      "filename": "doc2.pdf",
      "uploadId": "upload-1234567890-abc123-1",
      "status": "accepted"
    },
    {
      "index": 2,
      "filename": "doc3.pdf",
      "uploadId": "upload-1234567890-abc123-2",
      "status": "accepted"
    }
  ]
}
```

### Partial Success
```json
{
  "message": "Upload accepted",
  "totalFiles": 2,
  "acceptedCount": 1,
  "rejectedCount": 1,
  "files": [
    {
      "index": 0,
      "filename": "valid.pdf",
      "uploadId": "upload-1234567890-abc123-0",
      "status": "accepted"
    },
    {
      "index": 1,
      "filename": "bad.exe",
      "uploadId": "upload-1234567890-abc123-1",
      "status": "rejected",
      "error": "Invalid file type"
    }
  ]
}
```

### All Rejected (400)
```json
{
  "error": "All files rejected",
  "files": [
    {
      "index": 0,
      "filename": "bad1.exe",
      "uploadId": "upload-1234567890-abc123-0",
      "status": "rejected",
      "error": "Invalid file type"
    }
  ]
}
```

---

## WebSocket Event Format (Unchanged)

```typescript
// upload_progress - emitted per file
{
  conversationId: "conv-123",
  uploadId: "upload-1234567890-abc123-0",  // Correlates to HTTP response
  progress: 50,
  stage: "parsing",
  message: "Analyzing document..."
}

// intake_context_ready - emitted per file on completion
{
  conversationId: "conv-123",
  uploadId: "upload-1234567890-abc123-0",
  success: true,
  context: { vendorName: "...", ... },
  suggestedQuestions: [...],
  fileMetadata: {
    fileId: "file-uuid-123",  // Database UUID
    filename: "doc1.pdf",
    mimeType: "application/pdf",
    size: 1024
  }
}
```

---

## Frontend FormData Update

```typescript
// OLD (Epic 16 - single file)
const formData = new FormData();
formData.append('file', file);  // ❌ Old field name
formData.append('conversationId', conversationId);
formData.append('mode', mode);

// NEW (Epic 17 - multi-file)
const formData = new FormData();
files.forEach(file => {
  formData.append('files', file);  // ✅ New field name (note plural)
});
formData.append('conversationId', conversationId);
formData.append('mode', mode);

// Single file still works (as array of 1)
formData.append('files', singleFile);  // ✅ Works
```

---

## Client Correlation Strategy

```typescript
// HTTP response handling
const response = await fetch('/api/documents/upload', {
  method: 'POST',
  body: formData,
});

const { files, acceptedCount } = await response.json();

// Build uploadId → localIndex map
const uploadIdMap = new Map(
  files.map((file, index) => [file.uploadId, index])
);

// Store initial state
files.forEach((file, index) => {
  fileStates[index] = {
    filename: file.filename,
    uploadId: file.uploadId,
    status: file.status,  // 'accepted' | 'rejected'
    error: file.error,
    progress: 0,
  };
});

// WebSocket event handler
socket.on('upload_progress', (data) => {
  const localIndex = uploadIdMap.get(data.uploadId);
  if (localIndex !== undefined) {
    updateFileState(localIndex, {
      progress: data.progress,
      stage: data.stage,
      message: data.message,
    });
  }
});
```

---

## Design Decisions

### Why NOT client-generated tempId?

**Rejected approach:**
```typescript
// ❌ Client sends tempId, server echoes it back
formData.append('tempId', crypto.randomUUID());
// Server: { uploadId: serverGenerated, tempId: clientSent }
```

**Why rejected:**
- Adds complexity: server must validate, store, echo tempId
- Security concern: client-controlled IDs could cause conflicts
- Not needed: uploadId + array index already sufficient for correlation

**Chosen approach:**
```typescript
// ✅ Server generates all IDs, client correlates via array index
files.map((file, index) => [file.uploadId, index])
```

**Benefits:**
- Simpler contract: server owns all ID generation
- Client maps via stable array index from HTTP response
- No validation needed for client-sent IDs

---

**Created:** 2025-12-18
**Purpose:** Quick reference for Epic 17 Sprint 1 Track A implementation
