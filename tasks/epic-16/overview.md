# Epic 16: Document Parser Infrastructure

## Overview

Build shared infrastructure for parsing documents using Claude Vision. This infrastructure supports two use cases:

1. **Intake Parsing** - Extract vendor context from PRDs/proposals during assessment intake
2. **Scoring Parsing** - Extract Q&A responses from completed questionnaires for scoring

**Prerequisites:** Epic 14 complete, Epic 15 scoring plan documented

---

## Architecture Principle: Clean Architecture Compliance

Both use cases share infrastructure while maintaining decoupled interfaces:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          APPLICATION LAYER                                   │
│                  (packages/backend/src/application)                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   Intake Module                          Scoring Module                      │
│   ┌────────────────────────┐            ┌────────────────────────┐          │
│   │ IIntakeDocumentParser  │            │ IScoringDocumentParser │          │
│   │ parseForContext(file)  │            │ parseForResponses(file)│          │
│   └────────────────────────┘            └────────────────────────┘          │
│              │                                     │                         │
│              │         Depends on abstraction      │                         │
│              └──────────────────┬──────────────────┘                         │
│                                 │                                            │
└─────────────────────────────────┼────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        INFRASTRUCTURE LAYER                                  │
│               (packages/backend/src/infrastructure)                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                    DocumentParserService                             │   │
│   │         implements IIntakeDocumentParser, IScoringDocumentParser     │   │
│   ├─────────────────────────────────────────────────────────────────────┤   │
│   │                                                                      │   │
│   │   parseForContext(file) ──────► intakeExtractionPrompt              │   │
│   │                                        │                             │   │
│   │   parseForResponses(file) ───► scoringExtractionPrompt              │   │
│   │                                        │                             │   │
│   │                                        ▼                             │   │
│   │                              ┌─────────────────┐                     │   │
│   │                              │  Claude Vision  │                     │   │
│   │                              │      API        │                     │   │
│   │                              └─────────────────┘                     │   │
│   │                                        │                             │   │
│   │                                        ▼                             │   │
│   │                              ┌─────────────────┐                     │   │
│   │                              │  FileStorage    │                     │   │
│   │                              │  (S3/Local)     │                     │   │
│   │                              └─────────────────┘                     │   │
│   │                                                                      │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

**Key Points:**
- Intake and Scoring modules depend only on their own interfaces
- Neither module knows they share an implementation
- Infrastructure can be pragmatic about reuse (DRY)
- If needs diverge → split implementation, interfaces unchanged

---

## Use Case Flows

### Intake Flow (PRD/Proposal Parsing)
```
User attaches document in composer (paperclip)
    ↓
Frontend uploads file → Backend
    ↓
DocumentParserService.parseForContext(file)
    ↓
Claude Vision extracts: vendor name, solution type, features, claims
    ↓
IntakeContext returned → Added to conversation
    ↓
Claude uses context + asks clarifying questions
    ↓
questionnaire_ready with enriched context
```

### Scoring Flow (Completed Questionnaire)
```
User selects "Score Questionnaire" mode, uploads document
    ↓
Frontend uploads file → Backend
    ↓
DocumentParserService.parseForResponses(file)
    ↓
Claude Vision extracts: assessmentId, Q&A responses
    ↓
ScoringResponses returned → Validated against DB
    ↓
ScoringService processes responses
```

---

## Components Summary

| Component | Action | Layer | Sprint |
|-----------|--------|-------|--------|
| `IDocumentParser.ts` | NEW | Application | 1 |
| `IIntakeDocumentParser.ts` | NEW | Application | 1 |
| `IScoringDocumentParser.ts` | NEW | Application | 1 |
| `DocumentParserDTOs.ts` | NEW | Application | 1 |
| `FileUploadHandler.ts` | NEW | Infrastructure | 2 |
| `FileStorageService.ts` | NEW | Infrastructure | 2 |
| `IFileStorage.ts` | NEW | Application | 2 |
| `VisionClient.ts` | NEW | Infrastructure | 3 |
| `intakeExtractionPrompt.ts` | NEW | Infrastructure | 3 |
| `scoringExtractionPrompt.ts` | NEW | Infrastructure | 3 |
| `DocumentParserService.ts` | NEW | Infrastructure | 3 |
| `ChatServer.ts` | MODIFY | Infrastructure | 4 |
| `Composer.tsx` | MODIFY | Presentation | 4 |
| `useFileUpload.ts` | NEW | Presentation | 4 |

---

## Sprint Overview

| Sprint | Focus | Stories |
|--------|-------|---------|
| **Sprint 1** | Application Layer Interfaces | 1.1, 1.2, 1.3, 1.4 |
| **Sprint 2** | File Handling Infrastructure | 2.1, 2.2, 2.3, 2.4 |
| **Sprint 3** | Vision Integration | 3.1, 3.2, 3.3, 3.4 |
| **Sprint 4** | Frontend Upload Wiring | 4.1, 4.2, 4.3 |
| **Sprint 5** | Testing & Integration | 5.1, 5.2, 5.3 |

---

## Data Types

### IntakeContext (Output of intake parsing)
```typescript
interface IntakeContext {
  vendorName: string | null;
  solutionName: string | null;
  solutionType: string | null;
  industry: string | null;
  features: string[];
  claims: string[];
  integrations: string[];
  complianceMentions: string[];
  rawText: string;
  confidence: number;
  sourceFilePath: string;
}
```

### ScoringResponses (Output of scoring parsing)
```typescript
interface ScoringResponses {
  assessmentId: string;
  responses: Array<{
    sectionNumber: number;
    questionNumber: number;
    questionText: string;
    responseText: string;
    confidence: number;
    hasVisualContent: boolean;          // Locked field name
    visualContentDescription: string | null;  // Locked field name
  }>;
  totalQuestions: number;
  parsedQuestions: number;
  sourceFilePath: string;
}
```

### Locked Extraction Schema

**Important:** The following field names are locked across prompt/DTO/tests to prevent drift:

| Field | Type | Used In |
|-------|------|---------|
| `assessmentId` | string | Header extraction, DB matching |
| `sectionNumber` | number | Q&A structure |
| `questionNumber` | number | Q&A structure |
| `questionText` | string | Original question |
| `responseText` | string | Vendor's answer |
| `confidence` | number (0-1) | Extraction confidence |
| `hasVisualContent` | boolean | Image/screenshot detection |
| `visualContentDescription` | string \| null | Description of visuals |

---

## File Storage Strategy

| Environment | Storage | Path Pattern |
|-------------|---------|--------------|
| Development | Local filesystem | `./uploads/{userId}/{timestamp}-{filename}` |
| Production | S3 | `s3://guardian-uploads/{userId}/{timestamp}-{filename}` |

**Retention:**
- Intake documents: 30 days (context extraction only)
- Scoring documents: Permanent (compliance requirement)

---

## Supported File Types

| Type | Extension | Max Size | Use Case |
|------|-----------|----------|----------|
| PDF | `.pdf` | 20MB | PRDs, Proposals, Questionnaires |
| Images | `.png`, `.jpg`, `.jpeg` | 10MB | Screenshots, Scanned docs |
| Word | `.docx` | 20MB | PRDs, Proposals, Questionnaires |

**Important (DOCX):**
- For **MVP**, `.docx` support is **text-only** via `mammoth` (no diagrams/images extracted).
- If a vendor includes diagrams (e.g., cloud architecture screenshots) and they matter, ask for **PDF export** or separate image upload.
- Future enhancement: `.docx` → PDF conversion (preserve layout) or extract embedded images and send text + images to Vision.

---

## Upload Architecture

**HTTP for file upload, WebSocket for progress events.**

```
Frontend                         Backend
   |                               |
   |-- POST /api/documents/upload ->|  (multer multipart)
   |<-- 202 { uploadId } ----------|
   |                               |
   |<-- WS upload_progress --------|  (storing)
   |<-- WS upload_progress --------|  (parsing)
   |<-- WS intake_context_ready ---|  (result)
   |                               |
```

**Why HTTP not WebSocket for upload?**
- Socket.IO default `maxHttpBufferSize` is 1MB (our files can be 20MB)
- HTTP multipart allows real upload progress tracking
- Industry standard for file uploads

---

## WebSocket Events (Locked)

**IMPORTANT:** These event names and payloads are locked. Do not rename or restructure.

| Event | Direction | Payload |
|-------|-----------|---------|
| `upload_progress` | Server → Client | `{ conversationId, uploadId, progress: 0-100, stage: 'storing' \| 'parsing' \| 'complete' \| 'error', message, error? }` |
| `intake_context_ready` | Server → Client | `{ conversationId, uploadId, success, context?, suggestedQuestions, coveredCategories, gapCategories, confidence, error? }` |
| `scoring_parse_ready` | Server → Client | `{ conversationId, uploadId, success, assessmentId?, vendorName?, responseCount, expectedCount, isComplete, confidence, error? }` |

**Note:** `parsing_error` is NOT a separate event. Errors are communicated via `upload_progress` with `stage: 'error'`.

---

## Story File Structure

```
tasks/epic-16/
├── overview.md                           # This file
├── 1.1-idocumentparser-base.md
├── 1.2-iintake-document-parser.md
├── 1.3-iscoring-document-parser.md
├── 1.4-document-parser-dtos.md
├── 2.1-file-upload-handler.md
├── 2.2-file-storage-service.md
├── 2.3-file-validation.md
├── 2.4-storage-tests.md
├── 3.1-vision-client.md
├── 3.2-intake-extraction-prompt.md
├── 3.3-scoring-extraction-prompt.md
├── 3.4-document-parser-service.md
├── 4.1-composer-upload-wiring.md
├── 4.2-upload-progress-ui.md
├── 4.3-chat-intake-integration.md
├── 5.1-parser-unit-tests.md
├── 5.2-integration-tests.md
└── 5.3-e2e-intake-flow.md
```

---

## Dependencies

### External
- `@anthropic-ai/sdk` - Claude Vision API (already installed)
- `multer` - File upload middleware (to install)
- `@aws-sdk/client-s3` - S3 storage for production (to install)

### Internal
- `ClaudeClient.ts` - Existing Claude integration
- `ChatServer.ts` - WebSocket event handling
- `Composer.tsx` - File attachment UI (placeholder exists)

---

## Dependencies & Integration Points

| Story | Dependency | Impact | Status |
|-------|------------|--------|--------|
| 3.3 | Epic 15 rubric decisions | Minor prompt tuning possible post-Epic 15 | **Weak** - proceed now |
| 5.1 | Epic 15 for full scoring workflow tests | Unit tests cover extraction only; full scoring tested in Epic 15 | **Weak** |

**Architectural Note:** Epic 16 **extracts** data. Epic 15 **scores** it. Clean separation.

**Header Format Coupling:** The scoring extraction prompt (3.3) targets the canonical `assessmentId` header format from Guardian exports. The prompt should be tolerant to minor format drift (e.g., "Assessment ID:", "AssessmentID:", "ID:").

---

## Agent Instructions

The implementation agent should:
1. Read this overview for context
2. Find the next incomplete story file (check `status: pending`)
3. Execute the story with full implementation
4. Mark story `status: complete` in the story file
5. Proceed to next story

**Build Intake First:** Complete Sprint 1-4 focusing on intake use case. Scoring extraction (3.3) can be implemented in full - it's extraction logic, not scoring logic.

**Schema Compliance:** When implementing, use the **Locked Extraction Schema** field names exactly. Do not introduce variants (e.g., `hasScreenshot` vs `hasVisualContent`).
