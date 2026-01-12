# Sprint 1A: Backend - Events & Storage Layer

**Track:** A (Backend)
**Stories:** 18.1A.1 - 18.1A.4
**Estimated Effort:** 3-4 hours
**Parallel With:** Sprint 1B (Frontend Types)
**Dependencies:** Sprint 0 decisions (storage strategy, SLO)
**Agent:** `backend-agent`

---

## Context

This sprint implements the backend infrastructure for fast file attachment:
1. New `file_attached` WebSocket event
2. Text excerpt storage (per Sprint 0 decision)
3. Two-phase `processUpload()` refactor
4. Excerpt extraction during upload

**Key constraint:** `upload_progress` emits only `storing` stage during upload. Parsing/scoring triggers on user Send (see Sprint 2).

---

## Prerequisites (From Sprint 0)

Before starting, confirm these decisions:

- [ ] **D1:** SLO for `file_attached` latency (expected: 3s P95)
- [ ] **D2:** Excerpt storage strategy (Option A/B/C)
- [ ] **D3:** Event ordering contract documented

---

## Story 18.1A.1: Add Text Excerpt Storage

**Goal:** Implement storage for text excerpts based on Sprint 0 decision.

### If Option A: Database Column

**Migration file:** `packages/backend/src/infrastructure/database/migrations/XXXX_add_text_excerpt.sql`

```sql
-- Migration: Add text_excerpt and parse_status columns to files table
ALTER TABLE files ADD COLUMN text_excerpt TEXT;
ALTER TABLE files ADD COLUMN parse_status VARCHAR(20) DEFAULT 'pending';

-- Index for backfill queries (find files needing excerpt by conversation)
-- NOTE: NOT on id (already PK), but on conversation_id for useful query pattern
--
-- Optimizes this specific query pattern (ChatServer.buildFileContext fallback):
--   SELECT * FROM files WHERE conversation_id = ? AND text_excerpt IS NULL
--
-- Used when: Legacy files without excerpts need lazy backfill during context injection
-- Without index: Full table scan filtered by conversation_id
-- With index: Direct lookup of files needing backfill in a conversation
CREATE INDEX idx_files_conversation_no_excerpt ON files (conversation_id) WHERE text_excerpt IS NULL;

-- Index for finding files by parse status (for retry/monitoring)
CREATE INDEX idx_files_parse_status ON files (parse_status) WHERE parse_status != 'completed';

-- Comments for documentation
COMMENT ON COLUMN files.text_excerpt IS 'First 10000 chars of extracted text for immediate context injection (Epic 18)';
COMMENT ON COLUMN files.parse_status IS 'Idempotency guard: pending|in_progress|completed|failed (Epic 18)';

-- Constraint to enforce valid parse_status values
ALTER TABLE files ADD CONSTRAINT chk_parse_status
  CHECK (parse_status IN ('pending', 'in_progress', 'completed', 'failed'));
```

**Schema update:** `packages/backend/src/infrastructure/database/schema/files.ts`

```typescript
// Add to files table definition
export const files = pgTable('files', {
  // ... existing columns ...

  // Epic 18: Text excerpt for fast context injection
  textExcerpt: text('text_excerpt'),

  // Epic 18: Idempotency guard for parse/scoring operations
  parseStatus: varchar('parse_status', { length: 20 }).default('pending'),
});

// Type for parse status
export type ParseStatus = 'pending' | 'in_progress' | 'completed' | 'failed';
```

**Interface update:** `packages/backend/src/application/interfaces/IFileRepository.ts`

```typescript
/**
 * Epic 18: ADDITIVE changes to existing IFileRepository
 *
 * IMPORTANT: Keep ALL existing methods (updateIntakeContext, findByConversationWithContext, etc.)
 * Only show the ADDITIONS here - do not replace the full interface.
 *
 * NOTE: The schema (packages/backend/src/infrastructure/database/schema/files.ts)
 * does NOT have updatedAt - don't add it to FileRecord.
 */

// ADD to existing FileRecord type (keep all existing fields):
export interface FileRecord {
  // ... existing fields (id, userId, conversationId, filename, mimeType, size, storagePath, createdAt) ...

  textExcerpt: string | null;  // NEW: Epic 18 - add this field only
  parseStatus: ParseStatus;     // NEW: Epic 18 - idempotency guard
}

export type ParseStatus = 'pending' | 'in_progress' | 'completed' | 'failed';

// ADD to existing CreateFileData type:
export interface CreateFileData {
  // ... existing fields ...

  textExcerpt?: string;  // NEW: Epic 18 (optional on create)
}

// ADD to existing IFileRepository interface (keep ALL existing methods):
export interface IFileRepository {
  // ... existing methods (create, findById, findByConversation, updateIntakeContext, findByConversationWithContext, etc.) ...

  // NEW: Epic 18 - Excerpt storage
  updateTextExcerpt(fileId: string, excerpt: string): Promise<void>;

  // NEW: Epic 18 - Idempotency
  updateParseStatus(fileId: string, status: ParseStatus): Promise<void>;
  tryStartParsing(fileId: string): Promise<boolean>;  // Returns true if status changed from pending to in_progress
}
```

**IMPORTANT:** This is ADDITIVE. The actual implementation must:
- Keep `updateIntakeContext()` method
- Keep `findByConversationWithContext()` method
- Keep all other existing methods
- NOT add `updatedAt` (not in schema)

**Repository implementation:** `packages/backend/src/infrastructure/database/repositories/DrizzleFileRepository.ts`

```typescript
// Add method to update text excerpt (implements IFileRepository.updateTextExcerpt)
async updateTextExcerpt(fileId: string, excerpt: string): Promise<void> {
  await this.db
    .update(files)
    .set({ textExcerpt: excerpt })
    .where(eq(files.id, fileId));
}

// Add method to update parse status (implements IFileRepository.updateParseStatus)
async updateParseStatus(fileId: string, status: ParseStatus): Promise<void> {
  await this.db
    .update(files)
    .set({ parseStatus: status })
    .where(eq(files.id, fileId));
}

/**
 * Atomic operation: Try to start parsing if status is 'pending'
 *
 * IDEMPOTENCY: Returns true only if this call actually changed the status.
 * If another process already started parsing, returns false.
 *
 * Uses optimistic locking pattern:
 * - Only updates if current status is 'pending'
 * - Returns rowCount to detect if update happened
 */
async tryStartParsing(fileId: string): Promise<boolean> {
  const result = await this.db
    .update(files)
    .set({ parseStatus: 'in_progress' })
    .where(and(
      eq(files.id, fileId),
      eq(files.parseStatus, 'pending')
    ));

  // Returns true if row was actually updated (status was pending)
  return result.rowCount > 0;
}

// Update create() to accept optional excerpt (implements IFileRepository.create)
async create(data: CreateFileData): Promise<FileRecord> {
  const [file] = await this.db
    .insert(files)
    .values({
      id: randomUUID(),
      userId: data.userId,
      conversationId: data.conversationId,
      filename: data.filename,
      mimeType: data.mimeType,
      size: data.size,
      storagePath: data.storagePath,
      textExcerpt: data.textExcerpt ?? null,
      parseStatus: 'pending',  // NEW: Epic 18 - start in pending state
    })
    .returning();

  return file;
}
```

### If Option B: S3 Sidecar (Alternative)

```typescript
// In S3FileStorage.ts - add excerpt methods
async storeExcerpt(storagePath: string, excerpt: string): Promise<void> {
  const excerptPath = `${storagePath}.excerpt.txt`;
  await this.s3Client.send(
    new PutObjectCommand({
      Bucket: this.bucket,
      Key: this.extractKey(excerptPath),
      Body: excerpt,
      ContentType: 'text/plain',
    })
  );
}

async retrieveExcerpt(storagePath: string): Promise<string | null> {
  const excerptPath = `${storagePath}.excerpt.txt`;
  try {
    const response = await this.s3Client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: this.extractKey(excerptPath),
      })
    );
    return await response.Body?.transformToString() ?? null;
  } catch (err) {
    if ((err as { name: string }).name === 'NoSuchKey') {
      return null;
    }
    throw err;
  }
}
```

### Acceptance Criteria

- [ ] Storage mechanism implemented per Sprint 0 decision
- [ ] Migration created and tested (includes text_excerpt AND parse_status columns)
- [ ] **IFileRepository interface updated ADDITIVELY** (add textExcerpt, parseStatus fields and methods - keep ALL existing methods)
- [ ] DrizzleFileRepository implements new interface methods:
  - [ ] `updateTextExcerpt()`
  - [ ] `updateParseStatus()`
  - [ ] `tryStartParsing()` (atomic idempotency check)
- [ ] Existing methods (updateIntakeContext, findByConversationWithContext) unchanged
- [ ] Unit tests for new repository methods
- [ ] **Idempotency verified:** `tryStartParsing()` returns false on second call for same file

---

## Story 18.1A.2: Implement Text Extraction Service

**Goal:** Create service to extract text from PDF/DOCX during upload.

### Architecture (Clean Architecture Compliance)

**CRITICAL:** TextExtractionService uses external libraries (pdf-parse, mammoth), so it belongs in **infrastructure layer**, not application layer. This is consistent with DocumentParserService placement.

**Interface file:** `packages/backend/src/application/interfaces/ITextExtractionService.ts`

```typescript
/**
 * ITextExtractionService - Interface for text extraction
 *
 * Defined in application layer, implemented in infrastructure layer.
 */
export interface ExtractionResult {
  success: boolean;
  excerpt: string;
  fullLength: number;
  extractionMs: number;
  error?: string;
}

export interface ITextExtractionService {
  extract(buffer: Buffer, documentType: ValidatedDocumentType): Promise<ExtractionResult>;
}

/**
 * Use validated document type from DocumentUploadController,
 * NOT raw MIME type (handles DOCX-as-ZIP edge case)
 */
export type ValidatedDocumentType = 'pdf' | 'docx' | 'image';
```

**Implementation file:** `packages/backend/src/infrastructure/extraction/TextExtractionService.ts`

```typescript
/**
 * TextExtractionService - Fast text extraction for upload phase
 *
 * Epic 18: Extracts text during upload (before Claude enrichment)
 * to enable immediate context injection.
 *
 * Design constraints:
 * - Must complete within SLO (3s P95)
 * - Returns truncated excerpt (10k chars max)
 * - Graceful failure: returns empty string, logs warning
 * - Uses validated documentType (not raw MIME) for reliability
 */

import { PDFParse } from 'pdf-parse';
import mammoth from 'mammoth';
import { ITextExtractionService, ExtractionResult, ValidatedDocumentType } from '../../application/interfaces/ITextExtractionService';

const MAX_EXCERPT_LENGTH = 10000;
const EXTRACTION_TIMEOUT_MS = 3000; // SLO from Sprint 0

export class TextExtractionService implements ITextExtractionService {
  /**
   * Extract text excerpt from document buffer
   *
   * @param buffer - File buffer
   * @param documentType - Validated document type from DocumentUploadController
   *                       (NOT raw MIME - handles DOCX-as-ZIP edge case)
   * @returns Extraction result with excerpt (max 10k chars)
   */
  async extract(buffer: Buffer, documentType: ValidatedDocumentType): Promise<ExtractionResult> {
    const start = Date.now();

    try {
      // Wrap extraction in timeout
      const textPromise = this.extractText(buffer, documentType);
      const timeoutPromise = new Promise<string>((_, reject) =>
        setTimeout(() => reject(new Error('Extraction timeout')), EXTRACTION_TIMEOUT_MS)
      );

      const fullText = await Promise.race([textPromise, timeoutPromise]);
      const elapsed = Date.now() - start;

      return {
        success: true,
        excerpt: fullText.slice(0, MAX_EXCERPT_LENGTH),
        fullLength: fullText.length,
        extractionMs: elapsed,
      };
    } catch (error) {
      const elapsed = Date.now() - start;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      console.warn(`[TextExtractionService] Extraction failed after ${elapsed}ms: ${errorMessage}`);

      return {
        success: false,
        excerpt: '',
        fullLength: 0,
        extractionMs: elapsed,
        error: errorMessage,
      };
    }
  }

  /**
   * Extract text based on validated document type
   *
   * Uses documentType from DocumentUploadController.detectDocumentType()
   * which correctly handles edge cases like DOCX-as-ZIP.
   */
  private async extractText(buffer: Buffer, documentType: ValidatedDocumentType): Promise<string> {
    switch (documentType) {
      case 'pdf':
        return this.extractPdfText(buffer);

      case 'docx':
        return this.extractDocxText(buffer);

      case 'image':
        // Images: no text extraction (Vision API handles these)
        return '';

      default:
        throw new Error(`Unsupported document type: ${documentType}`);
    }
  }

  private async extractPdfText(buffer: Buffer): Promise<string> {
    const parser = new PDFParse({ data: buffer });
    try {
      const result = await parser.getText();
      return result.text;
    } finally {
      await parser.destroy();
    }
  }

  private async extractDocxText(buffer: Buffer): Promise<string> {
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }
}
```

### Unit Tests (Synthetic Fixtures)

**File:** `packages/backend/__tests__/unit/infrastructure/TextExtractionService.test.ts`

```typescript
import { TextExtractionService } from '../../../src/infrastructure/extraction/TextExtractionService';
import { ValidatedDocumentType } from '../../../src/application/interfaces/ITextExtractionService';
import { createMinimalPdf, createMinimalDocx, createLargeText } from '../../fixtures/synthetic-documents';

describe('TextExtractionService', () => {
  let service: TextExtractionService;

  beforeEach(() => {
    service = new TextExtractionService();
  });

  describe('extract', () => {
    it('should extract text from PDF', async () => {
      // Use synthetic in-memory PDF (no binary test assets)
      const buffer = createMinimalPdf('Hello World Test Content');

      const result = await service.extract(buffer, 'pdf');

      expect(result.success).toBe(true);
      expect(result.excerpt).toContain('Hello World');
      expect(result.excerpt.length).toBeLessThanOrEqual(10000);
    });

    it('should extract text from DOCX', async () => {
      // Use synthetic in-memory DOCX
      const buffer = await createMinimalDocx('Test DOCX Content');

      const result = await service.extract(buffer, 'docx');

      expect(result.success).toBe(true);
      expect(result.excerpt).toContain('Test DOCX Content');
    });

    it('should return empty string for images', async () => {
      const buffer = Buffer.from('fake image data');

      const result = await service.extract(buffer, 'image');

      expect(result.success).toBe(true);
      expect(result.excerpt).toBe('');
    });

    it('should truncate to 10k chars', async () => {
      // Use synthetic large content
      const largeText = createLargeText(15000);
      const buffer = createMinimalPdf(largeText);

      const result = await service.extract(buffer, 'pdf');

      expect(result.success).toBe(true);
      expect(result.excerpt.length).toBe(10000);
      expect(result.fullLength).toBeGreaterThan(10000);
    });

    it('should handle timeout gracefully', async () => {
      // Mock the extraction to simulate slow operation
      // Avoid actual slow tests - use jest.spyOn with delayed Promise
      const mockExtract = jest.spyOn(service as any, 'extractPdfText');
      mockExtract.mockImplementation(() =>
        new Promise(resolve => setTimeout(() => resolve('text'), 5000))
      );

      const buffer = createMinimalPdf('test');
      const result = await service.extract(buffer, 'pdf');

      expect(result.success).toBe(false);
      expect(result.error).toContain('timeout');

      mockExtract.mockRestore();
    });

    it('should return error result for invalid PDF', async () => {
      const buffer = Buffer.from('not a valid pdf');

      const result = await service.extract(buffer, 'pdf');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
});
```

**Note:** Avoid binary test assets and slow timeout tests per code review.

### Acceptance Criteria

- [ ] Interface `ITextExtractionService` defined in application layer
- [ ] Implementation in `infrastructure/extraction/TextExtractionService.ts`
- [ ] Uses validated `documentType` (not raw MIME)
- [ ] Timeout protection (3s default)
- [ ] Truncation to 10k chars
- [ ] Graceful error handling
- [ ] Unit tests passing

---

## Story 18.1A.3: Add `file_attached` WebSocket Event

**Goal:** Emit `file_attached` event after S3 storage + text extraction.

**File:** `packages/backend/src/infrastructure/http/controllers/DocumentUploadController.ts`

### Event Definition

```typescript
/**
 * file_attached event - Epic 18
 *
 * Emitted when file is stored and ready for UI display.
 * Does NOT wait for Claude enrichment to complete.
 */
interface FileAttachedEvent {
  conversationId: string;
  uploadId: string;
  fileId: string;
  filename: string;
  mimeType: string;
  size: number;
  hasExcerpt: boolean; // True if text excerpt was extracted
}

/**
 * SECURITY NOTE (from code review):
 *
 * - file_attached event contains ONLY metadata (hasExcerpt: boolean)
 * - textExcerpt content is NEVER emitted to clients
 * - textExcerpt is NEVER logged (may contain sensitive document content)
 * - textExcerpt is used internally only for context injection
 * - Data retention policy: deferred to post-MVP (Sprint 0 D2)
 */
```

### Implementation

Add new method to emit the event:

```typescript
/**
 * Emit file_attached event (Epic 18)
 *
 * Called after S3 storage + text extraction, before Claude enrichment.
 * Allows frontend to show "Attached" state immediately.
 */
private emitFileAttached(
  socketRoom: string,
  conversationId: string,
  uploadId: string,
  fileId: string,
  filename: string,
  mimeType: string,
  size: number,
  hasExcerpt: boolean
): void {
  this.chatNamespace.to(socketRoom).emit('file_attached', {
    conversationId,
    uploadId,
    fileId,
    filename,
    mimeType,
    size,
    hasExcerpt,
  });
}
```

### Acceptance Criteria

- [ ] `file_attached` event defined and documented
- [ ] Event emitted after storage (marks end of upload phase)
- [ ] Event includes all required metadata
- [ ] `upload_progress` only emits `storing` stage (no `parsing`/`complete`)

---

## Story 18.1A.4: Refactor `processUpload()` Two-Phase

**Goal:** Split upload processing into fast phase (storage + excerpt) and slow phase (enrichment).

**File:** `packages/backend/src/infrastructure/http/controllers/DocumentUploadController.ts`

### ~~Old Flow (Auto-Trigger)~~ — NOT IMPLEMENTED

```typescript
// ❌ This pattern is NOT implemented. Shown for historical context only.
// private async processUpload(...) {
//   Store + Parse + Complete all in upload handler
//   User blocked for ~4 minutes - bad UX
// }
```

### New Flow (Trigger-on-Send) — IMPLEMENTED

**IMPORTANT:** Upload handler ends at `file_attached`. No parsing in upload phase. Parsing/scoring triggers on user Send (see Sprint 2 message handler).

```typescript
private async processUpload(
  uploadId: string,
  userId: string,
  conversationId: string,
  mode: 'intake' | 'scoring',
  file: Express.Multer.File,
  documentType: string
): Promise<void> {
  const socketRoom = `user:${userId}`;

  try {
    // =========================================
    // UPLOAD PHASE: Fast Attach (target: <3s)
    // =========================================
    // This is ALL the upload handler does. Parsing triggers on Send.

    // 1. Store file to S3
    this.emitProgress(socketRoom, conversationId, uploadId, 30, 'storing', 'Storing file...');
    const storagePath = await this.fileStorage.store(file.buffer, {
      filename: file.originalname,
      mimeType: file.mimetype,
      userId,
      conversationId,
    });

    // 2. Extract text excerpt (with timeout, for context injection)
    this.emitProgress(socketRoom, conversationId, uploadId, 60, 'storing', 'Extracting text...');
    const extraction = await this.textExtractionService.extract(file.buffer, documentType);

    // 3. Create file record with excerpt (parseStatus: 'pending')
    const fileRecord = await this.fileRepository.create({
      userId,
      conversationId,
      filename: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
      storagePath,
      textExcerpt: extraction.excerpt || null,
      // parseStatus defaults to 'pending' in schema
    });

    const fileId = fileRecord.id;

    // 4. Emit file_attached - UPLOAD COMPLETE
    // Frontend shows "Attached ✓", Send button enabled
    // NO parsing/scoring here - that happens on Send
    this.emitFileAttached(
      socketRoom,
      conversationId,
      uploadId,
      fileId,
      file.originalname,
      file.mimetype,
      file.size,
      extraction.success && extraction.excerpt.length > 0
    );

    // =========================================
    // END OF UPLOAD HANDLER
    // =========================================
    // Parsing/scoring triggers in ChatServer.handleMessage()
    // when user clicks Send (see Sprint 2)

  } catch (error) {
    console.error('[DocumentUpload] Processing error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    this.emitProgress(socketRoom, conversationId, uploadId, 0, 'error', 'Upload failed', errorMessage);
  }
}
```

### Constructor Update

```typescript
import { ITextExtractionService } from '../../application/interfaces/ITextExtractionService';

constructor(
  private readonly fileStorage: IFileStorage,
  private readonly fileValidator: FileValidationService,
  private readonly intakeParser: IIntakeDocumentParser,
  private readonly scoringParser: IScoringDocumentParser,
  private readonly conversationService: ConversationService,
  private readonly chatNamespace: Namespace,
  private readonly fileRepository: IFileRepository,
  private readonly scoringService: IScoringService,
  // NEW: Text extraction service (Epic 18) - REQUIRED, not optional
  // Remove `?` to avoid null checks throughout the code
  private readonly textExtractionService: ITextExtractionService
) {}
```

### Composition Root Update

**File:** `packages/backend/src/index.ts`

```typescript
import { TextExtractionService } from './infrastructure/extraction/TextExtractionService';

// ... existing setup ...

// Epic 18: Instantiate text extraction service
const textExtractionService = new TextExtractionService();

// Update DocumentUploadController instantiation
const documentUploadController = new DocumentUploadController(
  fileStorage,
  fileValidator,
  intakeParser,
  scoringParser,
  conversationService,
  chatNamespace,
  fileRepository,
  scoringService,
  textExtractionService  // NEW: Epic 18 - pass extraction service
);
```

### documentType Source (Clarification)

**IMPORTANT:** The `documentType` parameter comes from `FileValidationService.validate()`, NOT a non-existent `detectDocumentType()` method.

```typescript
// In the upload handler (already captured in validFiles):
const validationResult = await this.fileValidator.validate(file);
// validationResult.documentType is 'pdf' | 'docx' | 'image'

// Pass to processUpload:
await this.processUpload(
  uploadId,
  userId,
  conversationId,
  mode,
  file,
  validationResult.documentType  // Already validated by FileValidationService
);
```

### Acceptance Criteria

- [ ] Upload completes in <3s (SLO)
- [ ] `file_attached` emitted after storage + excerpt extraction
- [ ] **No parsing in upload handler** (parsing triggers on Send - see Sprint 2)
- [ ] `upload_progress` only emits `storing` stage
- [ ] Error handling for storage/extraction failures
- [ ] **Composition root updated** (`index.ts` instantiates TextExtractionService)
- [ ] **documentType from FileValidationService** (not detectDocumentType)
- [ ] Integration test verifies timing

---

## Testing Strategy

### Unit Tests

| Test | File | Coverage |
|------|------|----------|
| TextExtractionService | `TextExtractionService.test.ts` | Extract, timeout, errors |
| Repository methods | `DrizzleFileRepository.test.ts` | Create with excerpt, update excerpt |

### Integration Tests

| Test | File | Coverage |
|------|------|----------|
| Upload timing | `DocumentUpload.integration.test.ts` | `file_attached` within 3s SLO |
| Event sequence | `DocumentUpload.integration.test.ts` | `upload_progress:storing` → `file_attached` (no `complete`) |

### Test Fixtures (Synthetic - No Binary Assets)

**IMPORTANT:** Use synthetic/in-memory fixtures to avoid binary test assets (per Sprint 0 privacy guidance).

**DEPENDENCY NOTE:** The DOCX generator below uses `jszip`. Either:
- Add `jszip` as a devDependency: `pnpm add -D jszip --filter @guardian/backend`
- OR use the existing `docx` package (already in package.json) to generate test files

**PDF NOTE:** The minimal PDF structure below may not be valid for `pdf-parse`. Before implementation:
- Verify the generator works with pdf-parse, OR
- Use `pdfkit` to generate valid PDFs: `pnpm add -D pdfkit --filter @guardian/backend`

**Test fallback strategy (keep tests deterministic):**
1. **Preferred:** Use `pdfkit` to generate valid PDFs (guaranteed parseable)
2. **Alternative:** If synthetic PDF fails pdf-parse, use DOCX-only tests for extraction logic
3. **Last resort:** Mock `extractPdfText()` directly and test DOCX path end-to-end

```typescript
// Example: Skip PDF test if synthetic PDF is rejected
it('should extract text from PDF', async () => {
  const buffer = createMinimalPdf('Hello World');
  const result = await service.extract(buffer, 'pdf');

  // If synthetic PDF isn't valid, skip rather than fail flakily
  if (!result.success && result.error?.includes('Invalid PDF')) {
    console.warn('Skipping: synthetic PDF not valid for pdf-parse, use pdfkit');
    return; // or use jest's it.skip pattern
  }

  expect(result.success).toBe(true);
  expect(result.excerpt).toContain('Hello World');
});
```

```typescript
// packages/backend/__tests__/fixtures/synthetic-documents.ts

/**
 * Generate minimal valid PDF in memory
 *
 * WARNING: This hand-crafted PDF may not parse correctly with pdf-parse.
 * If tests are flaky, use pdfkit instead:
 *
 * import PDFDocument from 'pdfkit';
 * export async function createMinimalPdf(text: string): Promise<Buffer> {
 *   return new Promise((resolve) => {
 *     const doc = new PDFDocument();
 *     const chunks: Buffer[] = [];
 *     doc.on('data', chunks.push.bind(chunks));
 *     doc.on('end', () => resolve(Buffer.concat(chunks)));
 *     doc.text(text);
 *     doc.end();
 *   });
 * }
 */
export function createMinimalPdf(text: string = 'Test content'): Buffer {
  // Minimal PDF structure - verify with pdf-parse before relying on this
  const pdfContent = `%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >> endobj
4 0 obj << /Length ${text.length + 20} >> stream
BT /F1 12 Tf 100 700 Td (${text}) Tj ET
endstream endobj
xref
0 5
trailer << /Size 5 /Root 1 0 R >>
startxref
%%EOF`;
  return Buffer.from(pdfContent);
}

/**
 * Generate minimal valid DOCX in memory
 *
 * DEPENDENCY: Requires jszip (add as devDependency)
 * Alternative: Use existing 'docx' package from package.json
 */
export async function createMinimalDocx(text: string = 'Test content'): Promise<Buffer> {
  // Option 1: Using jszip (must add as devDependency)
  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();

  // Minimal DOCX structure
  zip.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  zip.file('_rels/.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  zip.file('word/document.xml', `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body></w:document>`);

  return await zip.generateAsync({ type: 'nodebuffer' });
}

/**
 * Generate large text content for truncation tests
 */
export function createLargeText(targetLength: number = 15000): string {
  const paragraph = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. ';
  return paragraph.repeat(Math.ceil(targetLength / paragraph.length)).slice(0, targetLength);
}
```

**Usage in tests:**

```typescript
import { createMinimalPdf, createMinimalDocx, createLargeText } from '../fixtures/synthetic-documents';

describe('TextExtractionService', () => {
  it('should extract text from PDF', async () => {
    const buffer = createMinimalPdf('Hello World');
    const result = await service.extract(buffer, 'pdf');
    expect(result.excerpt).toContain('Hello World');
  });

  it('should truncate to 10k chars', async () => {
    const largeText = createLargeText(15000);
    const buffer = createMinimalPdf(largeText);
    const result = await service.extract(buffer, 'pdf');
    expect(result.excerpt.length).toBe(10000);
  });
});
```

**Avoid:**
- ❌ Binary test assets (sample.pdf, sample.docx files)
- ❌ Slow timeout tests (mock instead)
- ❌ Real document content (privacy)

---

## parseStatus Lifecycle

**IMPORTANT:** The `parseStatus` column must be updated at explicit points to avoid records stuck in intermediate states.

### Trigger-on-Send Flow (Epic 18 New Behavior)

```
Upload starts
    ↓
files.create() → parseStatus: 'pending'
    ↓
file_attached emitted (parseStatus still 'pending')
    ↓
User sends message
    ↓
tryStartParsing() → parseStatus: 'in_progress' (atomic, returns true)
    ↓
Parsing/scoring runs
    ↓
On success: updateParseStatus('completed')
On error:   updateParseStatus('failed')
```

### Update Points (MUST implement)

| Point | Status | Required |
|-------|--------|----------|
| `create()` | `pending` | ✅ Auto (schema default) |
| `tryStartParsing()` success | `in_progress` | ✅ Atomic method |
| Parse/score success | `completed` | ⚠️ Must call `updateParseStatus()` |
| Parse/score failure | `failed` | ⚠️ Must call `updateParseStatus()` |
| Timeout | `failed` | ⚠️ Must call `updateParseStatus()` |

### Stuck Record Prevention

If a file is stuck in `in_progress` (crash during parsing):

```typescript
// Cleanup job or retry logic (optional - defer to post-MVP)
const stuckFiles = await db
  .select()
  .from(files)
  .where(and(
    eq(files.parseStatus, 'in_progress'),
    lt(files.createdAt, subHours(new Date(), 1))  // Older than 1 hour
  ));

for (const file of stuckFiles) {
  await db.update(files)
    .set({ parseStatus: 'failed' })
    .where(eq(files.id, file.id));
}
```

### Acceptance Criteria

- [ ] `parseStatus` transitions documented and implemented
- [ ] Message handler updates status on parse success/failure
- [ ] No records left in `in_progress` after processing completes
- [ ] Tests verify status transitions

---

## Rollback Plan

If issues discovered after merge:

1. **Migration rollback:** `ALTER TABLE files DROP COLUMN text_excerpt, DROP COLUMN parse_status;`
2. **Code revert:** Revert upload handler changes via git

---

## Exit Criteria

Sprint 1A is complete when:

- [ ] All 4 stories implemented
- [ ] Unit tests passing
- [ ] Integration tests passing
- [ ] `file_attached` emits within 3s of upload start
- [ ] Upload handler ends at `file_attached` (no parsing)
- [ ] Code reviewed and approved
