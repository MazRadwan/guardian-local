# Sprint 2: Image Processing Service

## Goal

Create VisionContentBuilder service to convert image files from S3 into Vision API content blocks.

## Dependencies

- Sprint 1 complete (Vision types, ContentBlock support)

## Parallelization

```
┌─────────────────────────────────────┐
│ backend-agent (sequential)          │
│ 30.2.1 → 30.2.2 → 30.2.3            │
└─────────────────────────────────────┘
            ║ runs in PARALLEL
┌─────────────────────────────────────┐
│ frontend-agent                      │
│ 30.2.4 (no file overlap)            │
└─────────────────────────────────────┘
```

**Why parallel?** Story 30.2.4 touches only frontend hooks + one backend constant. No overlap with VisionContentBuilder work.

## Stories

### 30.2.1: VisionContentBuilder Service

**Description:** Create a service that retrieves image files from S3 and converts them to base64-encoded Vision content blocks.

**Acceptance Criteria:**
- [ ] Service retrieves file buffer from S3 storage
- [ ] Converts buffer to base64 string
- [ ] Returns properly formatted `ImageContentBlock`
- [ ] Handles PNG, JPG, JPEG, GIF, WebP formats
- [ ] Returns null for non-image files (graceful fallback)

**Technical Approach:**
```typescript
export class VisionContentBuilder {
  constructor(private readonly fileStorage: IFileStorage) {}

  async buildImageContent(file: FileDTO): Promise<ImageContentBlock | null> {
    if (!this.isImageFile(file.mimeType)) {
      return null;
    }

    const buffer = await this.fileStorage.retrieve(file.storagePath);
    const base64 = buffer.toString('base64');

    return {
      type: 'image',
      source: {
        type: 'base64',
        media_type: this.normalizeMediaType(file.mimeType),
        data: base64,
      },
    };
  }

  private isImageFile(mimeType: string): boolean {
    return ['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(mimeType);
  }
}
```

**Files Touched:**
- `packages/backend/src/infrastructure/ai/VisionContentBuilder.ts` - NEW: Service implementation
- `packages/backend/src/application/interfaces/IVisionContentBuilder.ts` - NEW: Interface

**Agent:** backend-agent

**Tests Required:**
- `VisionContentBuilder.test.ts` - PNG file → ImageContentBlock
- `VisionContentBuilder.test.ts` - JPG file → ImageContentBlock
- `VisionContentBuilder.test.ts` - Non-image file → null
- `VisionContentBuilder.test.ts` - S3 retrieval failure → error handling

---

### 30.2.2: Image Size Validation & MIME Normalization

**Description:** Add size validation and MIME type normalization per Epic 30 security requirements.

**Acceptance Criteria:**
- [ ] Reject images > 5MB with error (Anthropic API limit)
- [ ] Log warning for images 4-5MB (near limit, still process)
- [ ] Normalize `image/jpg` → `image/jpeg`
- [ ] Reject unsupported MIME types
- [ ] **SECURITY: Never log base64 or buffer content** - only `fileId`, `mimeType`, `size`

**Technical Approach:**
```typescript
const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB - Anthropic API hard limit
const WARN_IMAGE_SIZE = 4 * 1024 * 1024; // 4MB - warn (near limit)

const SUPPORTED_MIME_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];

private normalizeMimeType(mimeType: string): string {
  if (mimeType === 'image/jpg') return 'image/jpeg';
  return mimeType;
}

async buildImageContent(file: FileDTO): Promise<ImageContentBlock | null> {
  const normalizedMime = this.normalizeMimeType(file.mimeType);

  if (!SUPPORTED_MIME_TYPES.includes(normalizedMime)) {
    console.warn(`[VisionContentBuilder] Unsupported type: fileId=${file.id}, mimeType=${file.mimeType}`);
    return null;
  }

  if (file.size > MAX_IMAGE_SIZE) {
    console.error(`[VisionContentBuilder] Image too large: fileId=${file.id}, size=${file.size}`);
    return null; // Hard reject
  }

  if (file.size > WARN_IMAGE_SIZE) {
    console.warn(`[VisionContentBuilder] Large image: fileId=${file.id}, size=${file.size}`);
  }
  // ... rest of implementation - NEVER log buffer/base64 content
}
```

**Files Touched:**
- `packages/backend/src/infrastructure/ai/VisionContentBuilder.ts` - Add size validation + MIME normalization

**Agent:** backend-agent

**Tests Required:**
- `VisionContentBuilder.test.ts` - Image under 4MB → success, no warning
- `VisionContentBuilder.test.ts` - Image 4-5MB → success with warning log
- `VisionContentBuilder.test.ts` - Image over 5MB → null, error logged (API limit)
- `VisionContentBuilder.test.ts` - `image/jpg` → normalized to `image/jpeg`
- `VisionContentBuilder.test.ts` - Unsupported MIME → null returned
- `VisionContentBuilder.test.ts` - Verify logs contain only fileId/mimeType/size (no buffer)

---

### 30.2.3: Wire VisionContentBuilder to DI

**Description:** Register VisionContentBuilder in the dependency injection setup.

**Acceptance Criteria:**
- [ ] Service instantiated in index.ts
- [ ] Injected with IFileStorage dependency
- [ ] Available to downstream services

**Technical Approach:**
```typescript
// In index.ts
const visionContentBuilder = new VisionContentBuilder(fileStorage);
```

**Files Touched:**
- `packages/backend/src/index.ts` - Instantiate and wire VisionContentBuilder

**Agent:** backend-agent

**Tests Required:**
- Integration test verifying service is accessible

---

### 30.2.4: Align Existing Upload Limits with Anthropic API

**Description:** Update existing image upload limits (currently 10MB) to match Anthropic's 5MB API limit. Ensures consistent UX - users get immediate feedback at upload time, not confusing "accepted then rejected" errors.

**Current State (broken):**
- `useFileUpload.ts`: 10MB for PNG/JPEG
- `useMultiFileUpload.ts`: 20MB generic (no image-specific check)
- `IDocumentParser.ts`: 10MB for images
- **Result:** Images 5-10MB upload successfully but fail at Anthropic API

**Impact on DocumentParserService:** This change also affects document intake (DocumentParserService uses Vision API). The current 10MB limit is already broken - images 5-10MB would fail at Anthropic's API. Aligning to 5MB fixes this latent bug.

**Acceptance Criteria:**
- [ ] Frontend `useFileUpload.ts`: 5MB limit for all image types
- [ ] Frontend `useMultiFileUpload.ts`: 5MB limit for image MIME types specifically
- [ ] Backend `IDocumentParser.ts`: 5MB limit for images
- [ ] User sees clear error message: "Image too large (max 5MB)"
- [ ] Warning toast at 4MB: "Large image - may be slow to process"

**Technical Approach:**
```typescript
// useFileUpload.ts
const MAX_FILE_SIZES: Record<string, number> = {
  'application/pdf': 20 * 1024 * 1024,
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 20 * 1024 * 1024,
  'image/png': 5 * 1024 * 1024,   // Changed: 10MB → 5MB (Anthropic limit)
  'image/jpeg': 5 * 1024 * 1024,  // Changed: 10MB → 5MB
  'image/gif': 5 * 1024 * 1024,   // Added
  'image/webp': 5 * 1024 * 1024,  // Added
};

// useMultiFileUpload.ts - add image-specific validation
const IMAGE_MIME_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

if (IMAGE_MIME_TYPES.includes(file.type) && file.size > MAX_IMAGE_SIZE) {
  onErrorRef.current?.(`${file.name}: Image too large (max 5MB)`);
  continue;
}
```

**Files Touched:**
- `apps/web/src/hooks/useFileUpload.ts` - Update MAX_FILE_SIZES for images
- `apps/web/src/hooks/useMultiFileUpload.ts` - Add image-specific size check
- `packages/backend/src/application/interfaces/IDocumentParser.ts` - Update MAX_FILE_SIZES

**Agent:** frontend-agent (for hooks), backend-agent (for interface)

**Tests Required:**
- `useFileUpload.test.ts` - 6MB image → rejected with clear error
- `useFileUpload.test.ts` - 4.5MB image → warning shown, upload proceeds
- `useMultiFileUpload.test.ts` - 6MB image → rejected immediately
- `useMultiFileUpload.test.ts` - 6MB PDF → allowed (different limit)

---

## Definition of Done

- [ ] VisionContentBuilder correctly converts images to Vision blocks
- [ ] Size limits enforced (5MB max per Anthropic API)
- [ ] Existing upload hooks aligned with API limits
- [ ] Service registered in DI
- [ ] All unit tests pass
- [ ] No memory issues with test images
