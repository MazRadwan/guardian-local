# Epic 15: Questionnaire Scoring & Analysis

## Status: Planning (Architecture Decisions Made)

**Last Updated:** 2025-12-22
**Depends On:** Epic 16/17 (Document Parser Infrastructure) - **COMPLETE**

---

## Context

Implementing the scoring/analysis phase where completed questionnaires are uploaded, parsed, and scored against the Guardian rubric. This is Phase 2 functionality referenced in `docs/design/data/database-schema.md`.

---

## Epic 16/17 Infrastructure (Available for Reuse)

**Epic 16/17 built the document parsing infrastructure. Here's what scoring can leverage:**

### Already Implemented

| Component | Location | Scoring Use |
|-----------|----------|-------------|
| `DocumentParserService.parseForResponses()` | `infrastructure/ai/DocumentParserService.ts` | Extracts Q&A from completed questionnaires |
| `IScoringDocumentParser` interface | `application/interfaces/IScoringDocumentParser.ts` | Clean abstraction for scoring parsing |
| `ScoringParseResult` | Same file | Structured result: assessmentId, responses[], confidence |
| `ExtractedResponse` | Same file | Per-question: sectionNumber, questionNumber, responseText |
| `scoringExtraction.ts` prompt | `infrastructure/ai/prompts/scoringExtraction.ts` | Claude prompt for Q&A extraction |
| `DocumentUploadController` | `infrastructure/http/controllers/` | HTTP upload with `mode: 'scoring'` |
| `FileValidationService` | `application/services/FileValidationService.ts` | Magic byte validation |
| `FileRepository` | `infrastructure/database/repositories/` | File metadata storage |
| WebSocket events | ChatServer | `upload_progress`, `scoring_parse_ready` |
| `ParsingMode` enum | `IDocumentParser.ts` | `'intake' | 'scoring'` differentiation |

### Error Handling Ready

| Error | When Thrown |
|-------|-------------|
| `AssessmentNotFoundError` | No assessmentId found in document header |
| `QuestionnaireMismatchError` | assessmentId doesn't match expected |

### What Scoring Still Needs

1. **AssessmentId in exports** - Exporters must embed ID in header for parsing
2. **Scoring rubric** - Type definitions + constants
3. **Responses table** - Store extracted Q&A (different from intake context)
4. **Scores tables** - Per-dimension scores + composite results
5. **ScoringService** - Orchestrate: parse → score → store → emit
6. **UI components** - Scoring progress card, results display

### Current Guardian Workflow (Claude.ai Projects)
- User uploads completed Word doc to Claude project
- Claude Vision reads document (including screenshots)
- Claude scores against rubric in system prompt
- Scoring decoupled from original questionnaire (no ID linking)
- History limited to project file storage

### Web App Goal
- Link uploaded responses to original questionnaire via `assessmentId`
- Store responses and scores in DB for history/re-scoring
- Support vendor evolution (same questionnaire, new responses over time)

---

## Decisions Made

| Decision | Resolution | Rationale |
|----------|------------|-----------|
| Entry point | Chat with mode dropdown | Preserves conversation context |
| Confirmation step | Skip | Low error risk, vendors use Word, acceptable |
| File storage | Yes (S3/blob + path in DB) | Compliance requirement, ~50/year |
| History/re-scoring | Yes, response batches | Vendors evolve, need to track over time |
| Questionnaire matching | Text ID in document header | Vision reads reliably, no decoder needed |
| Fallback if no ID | Reject, ask to re-export | Simple, forces correct workflow |
| Screenshots in responses | Vision handles natively (PDF/images) | For `.docx`, convert to PDF first; otherwise embedded images won't be interpreted via API |
| QR code | No | Adds complexity without benefit for MVP |

### Decisions Made (2025-12-22 Session)

| Decision | Resolution | Rationale |
|----------|------------|-----------|
| Token strategy | Single API call + cached rubric | Matches Claude.ai workflow; ~20K tokens within limits; no chunking complexity |
| Rubric caching | Reuse `PromptCacheManager` | Already implemented for questionnaire gen; `cache_control: ephemeral` |
| Scoring output | Narrative streaming + `scoring_complete` tool | Guardian prompt produces narrative report; tool extracts structured scores for DB |
| Rubric version | Guardian v1.0 (Part V template) | Avoid scope creep from v1.2 features (Trust Center, gap resolution) |
| DOCX handling | Accept with warning | Warn user screenshots won't be analyzed; recommend PDF for full analysis |
| Export architecture | Option A - Parallel interfaces | New `IScoringPDFExporter`, `IScoringWordExporter` + implementations; no changes to existing questionnaire export |
| Progress UX | Rotating status messages | For long-running processes (30-60+ sec), cycle messages: "Processing..." → "This may take a minute..." |
| Stepper | Not needed | Only 2 API calls (parse + score); simple progress indicator sufficient |
| Mode UX | New `'scoring'` mode in dropdown | Explicit mode selection, consistent with existing UX pattern |
| Mode welcome | LLM sends instructions on mode entry | Same pattern as consult/assessment modes |

---

## PHI/Sensitive Data Handling

> **Status:** Acknowledged - deferred to broader security epic or cross-cutting concern.

### Data Classification

The following Epic 15 data may contain PHI or sensitive vendor information:

| Table/Field | Sensitivity | Contains |
|-------------|-------------|----------|
| `responses.response_text` | **High** | Vendor answers may include patient data handling details, security configs |
| `assessment_results.narrative_report` | **High** | Full risk assessment with vendor-specific findings |
| `assessment_results.executive_summary` | **Medium** | Summarized findings |
| `dimension_scores.findings` | **Medium** | Evidence quotes from vendor responses |

### Required Controls (Implementation TBD)

| Control | Description | Status |
|---------|-------------|--------|
| **Encryption at rest** | PostgreSQL TDE or application-level encryption for sensitive columns | Defer to infra |
| **Access control** | Row-level security - users only see their org's assessments | Existing auth model |
| **Retention policy** | Define retention period for scoring data (e.g., 7 years for compliance) | TBD |
| **Log redaction** | Ensure response_text and narrative_report aren't logged in full | Implementation |
| **Audit trail** | Track who accessed/exported scoring results | Existing audit model |

### Immediate Actions for Epic 15

1. **Do NOT log** full `response_text` or `narrative_report` content - use truncation or omit
2. **Inherit** existing auth model - scoring data scoped to assessment owner's org
3. **Document** that PHI handling is inherited from existing infrastructure
4. **Flag** for security review before production deployment

---

## Gaps to Fix (Implementation Required)

### 1. Add `assessmentId` to QuestionnaireSchema

**File:** `packages/backend/src/domain/types/QuestionnaireSchema.ts`

```typescript
export interface QuestionnaireMetadata {
  assessmentId: string;        // ADD THIS
  assessmentType: AssessmentType;
  vendorName: string | null;
  solutionName: string | null;
  generatedAt: string;
  questionCount: number;
  focusCategories?: string[];
}
```

**Also update:**
- `packages/backend/src/infrastructure/ai/prompts/questionGeneration.ts` - Include ID in output format
- Generation service to pass assessmentId through

### 2. Update Exporters to Print ID in Header

**Files:**
- `packages/backend/src/infrastructure/export/WordExporter.ts`
- `packages/backend/src/infrastructure/export/PDFExporter.ts`
- `packages/backend/src/infrastructure/export/ExcelExporter.ts`

**Format:**
```
GUARDIAN Assessment ID: a1b2c3d4-5678-...
Vendor: Acme Health AI
Generated: 2025-01-15
```

**Implementation Steps:**

1. **Update QuestionnaireData interface** (passed to exporters):
   ```typescript
   // IPDFExporter.ts, IWordExporter.ts, IExcelExporter.ts
   export interface QuestionnaireData {
     assessment: Assessment  // Already has .id
     vendor: Vendor
     questions: Question[]
   }
   ```
   No change needed - `assessment.id` is already available.

2. **Update PDF template** (`templates/questionnaire.html`):
   ```html
   <div class="header-metadata">
     <p><strong>GUARDIAN Assessment ID:</strong> {{assessmentId}}</p>
     <p><strong>Vendor:</strong> {{vendorName}}</p>
     <p><strong>Generated:</strong> {{createdAt}}</p>
   </div>
   ```

3. **Update PDFExporter.renderTemplate()**:
   ```typescript
   let html = template
     .replace(/{{assessmentId}}/g, assessment.id)  // ADD THIS
     .replace(/{{vendorName}}/g, this.escapeHtml(vendor.name))
     // ...
   ```

4. **Update WordExporter** - Add ID to header paragraph

5. **Update ExcelExporter** - Add ID to metadata sheet/row

**Why this matters:**
- DocumentParserService.parseForResponses() extracts this ID from uploaded docs
- Enables linking scored responses back to original assessment
- Without this, scoring workflow cannot function

### 3. Codify Scoring Rubric

**Source:** `.claude/documentation/GUARDIAN_Security_Privacy_Analyst_v1_0_COMPLETE.md` (Part IV)

**Create:**
- `packages/backend/src/domain/types/ScoringRubric.ts` - Type definitions
- `packages/backend/src/domain/constants/scoringRubric.ts` - Point values, weights, thresholds

**Rubric structure (10 dimensions):**
- Clinical Risk (0-100, lower = better)
- Privacy Risk (0-100, lower = better)
- Security Risk (0-100, lower = better)
- Technical Credibility (0-100, higher = better)
- Vendor Capability (0-100, higher = better)
- AI Transparency (0-100, higher = better)
- Ethical Considerations (0-100, higher = better)
- Regulatory Compliance (0-100, higher = better)
- Operational Excellence (0-100, higher = better)
- Sustainability (0-100, higher = better)

**Each dimension has:**
- Sub-scores with point allocations
- Disqualifying factors (binary fail)
- Risk rating thresholds (Low/Medium/High/Critical)

**Composite scoring:**
- Weighted average based on solution type (clinical AI, administrative, patient-facing)
- Recommendation logic (APPROVE/CONDITIONAL/DECLINE/MORE_INFO)

---

## Open Items (Updated 2025-12-19)

### Resolved by Epic 16/17

| Item | Resolution |
|------|------------|
| File upload infrastructure | `DocumentUploadController` with `mode: 'intake' \| 'scoring'` |
| Document parsing | `DocumentParserService.parseForResponses()` - extracts Q&A |
| Progress events | `upload_progress`, `scoring_parse_ready` WebSocket events |
| ID extraction | Claude Vision extracts assessmentId from header |
| Error handling | `AssessmentNotFoundError`, `QuestionnaireMismatchError` |

### Still Open: Key Architecture Decisions

#### Decision 1: Intake Context vs Responses Storage

**Question:** How do we store extracted responses vs intake context?

**Context:**
- Epic 17 stores `intake_context` on the `files` table (per-file, JSONB)
- Scoring responses need to link to `assessmentId`, not just conversation

**Options:**

| Option | Pros | Cons |
|--------|------|------|
| **A: Add `scoring_responses` to `files` table** | Simple, consistent with intake | Responses tied to file not assessment, re-scoring harder |
| **B: Separate `responses` table linked to assessment** | Clean separation, re-scoring easy, audit trail | More tables, more complexity |
| **C: Store in `files` but copy to `responses` on score** | Best of both | Duplication, sync complexity |

**Recommendation:** Option B - separate `responses` table. Scoring is assessment-centric, not file-centric.

---

#### Decision 2: Response-to-Question Linking

**Question:** Do we link responses to `questions.id` or just store section/question numbers?

**Options:**

| Option | Pros | Cons |
|--------|------|------|
| **A: FK to `questions.id`** | Strong integrity, can track which questions answered | Requires matching by position, questions may be regenerated |
| **B: Store section/question numbers only** | Flexible, works if questions regenerated | Looser integrity, manual matching |
| **C: Hybrid - store numbers + optional FK** | Flexible now, can strengthen later | Complexity |

**Recommendation:** Option B for MVP. Questions may evolve; section/question numbers from export header are reliable.

---

#### Decision 3: Batch ID Design

**Question:** How do we group responses from a single upload?

**Options:**

| Option | Pros | Cons |
|--------|------|------|
| **A: `batchId` UUID on responses table** | Simple, each upload is a batch | Need to generate batch ID |
| **B: Link to `files.id` as batch** | Reuse existing, no new ID | Couples responses to file storage |
| **C: Separate `response_batches` table** | Full audit trail, can add batch metadata | More tables |

**Recommendation:** Option A - `batchId` UUID. Simple, decoupled from file storage. Generate UUID at upload time.

---

#### Decision 4: Scoring Trigger

**Question:** When does scoring happen after upload/parsing?

**Options:**

| Option | Pros | Cons |
|--------|------|------|
| **A: Automatic after parse** | Seamless UX, no extra click | No review step, can't fix parse errors |
| **B: Explicit user action** | User reviews parsed responses first | Extra step, friction |
| **C: Automatic with cancel option** | Best of both, show progress with abort | Complex UI state |

**Recommendation:** Option A for MVP. Parsing already validated assessmentId. Show progress, allow abort via existing `abort_stream`.

---

#### Decision 5: Rubric Caching

**Question:** How do we cache the scoring rubric prompt?

**Options:**

| Option | Pros | Cons |
|--------|------|------|
| **A: Inline in scoring prompt** | Simple, no caching needed | Large prompt, tokens every call |
| **B: System prompt caching (like questionnaire gen)** | Efficient, reuse PromptCacheManager | Need to design cacheable structure |
| **C: Anthropic prompt caching feature** | Best token efficiency | API complexity |

**Recommendation:** Option B - reuse `PromptCacheManager` pattern. Rubric is static, cache as system prompt.

---

#### Decision 6: Conversation Mode for Scoring

**Question:** How does scoring fit into conversation flow?

**Current modes:** `'consult' | 'assessment'`

**Options:**

| Option | Pros | Cons |
|--------|------|------|
| **A: New mode `'scoring'`** | Clean separation | Third mode to maintain |
| **B: Stay in `'assessment'` mode, scoring is a workflow state** | Fewer modes, natural flow after questionnaire | Mode name less intuitive |
| **C: Mode-independent, scoring triggered by upload type** | Flexible, works in any mode | Less discoverable |

**Decision:** Option A - New `'scoring'` mode in ModeSelector dropdown. Provides explicit UX, consistent with existing mode pattern, and clear separation of concerns. User selects scoring mode → sees welcome message → uploads completed questionnaire.

---

### Proposed Database Schema (Based on Decisions)

#### Table Relationships

```
┌─────────────┐       ┌──────────────┐       ┌─────────────────┐
│   vendors   │──────▶│  assessments │◀──────│    questions    │
│             │  1:N  │              │  1:N  │                 │
│  • id       │       │  • id        │       │  • id           │
│  • name     │       │  • vendor_id │       │  • assessment_id│
│             │       │  • status    │       │  • section_num  │
└─────────────┘       └──────┬───────┘       │  • question_num │
                             │               └─────────────────┘
                             │
           ┌─────────────────┼─────────────────┐
           │                 │                 │
           ▼                 ▼                 ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────────┐
│   responses     │ │ dimension_scores│ │  assessment_results │
│   (NEW)         │ │   (NEW)         │ │      (NEW)          │
│                 │ │                 │ │                     │
│ • assessment_id │ │ • assessment_id │ │ • assessment_id     │
│ • batch_id      │ │ • batch_id      │ │ • batch_id          │
│ • section_num   │ │ • dimension     │ │ • composite_score   │
│ • question_num  │ │ • score         │ │ • recommendation    │
│ • response_text │ │ • risk_rating   │ │ • narrative_report  │
└─────────────────┘ │ • findings      │ └─────────────────────┘
                    └─────────────────┘

All 3 new tables:
• FK to assessments.id (CASCADE delete)
• Grouped by batch_id (UUID per upload)
• assessments links to vendors
```

#### Schema Definition

```typescript
// New tables for Epic 15

export const responses = pgTable('responses', {
  id: uuid('id').primaryKey().defaultRandom(),
  assessmentId: uuid('assessment_id').notNull().references(() => assessments.id, { onDelete: 'cascade' }),
  batchId: uuid('batch_id').notNull(), // Groups responses from single upload
  fileId: uuid('file_id').references(() => files.id), // Optional link to source file

  // Question identification (by position, not FK)
  sectionNumber: integer('section_number').notNull(),
  questionNumber: integer('question_number').notNull(),

  // Extracted content
  questionText: text('question_text').notNull(), // As parsed from doc
  responseText: text('response_text').notNull(),
  confidence: real('confidence'), // Extraction confidence (0-1)
  hasVisualContent: boolean('has_visual_content').default(false),
  visualContentDescription: text('visual_content_description'),

  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  assessmentBatchIdx: index('responses_assessment_batch_idx').on(table.assessmentId, table.batchId),
  positionIdx: index('responses_position_idx').on(table.assessmentId, table.sectionNumber, table.questionNumber),
}));

export const dimensionScores = pgTable('dimension_scores', {
  id: uuid('id').primaryKey().defaultRandom(),
  assessmentId: uuid('assessment_id').notNull().references(() => assessments.id, { onDelete: 'cascade' }),
  batchId: uuid('batch_id').notNull(), // Same batch as responses

  dimension: text('dimension').notNull(), // 'clinical_risk', 'privacy_risk', etc.
  score: integer('score').notNull(), // 0-100
  riskRating: text('risk_rating').notNull().$type<'low' | 'medium' | 'high' | 'critical'>(),

  // Detailed findings
  findings: jsonb('findings').$type<{
    subScores: Array<{ name: string; score: number; maxScore: number; notes: string }>;
    keyRisks: string[];
    mitigations: string[];
    evidenceRefs: Array<{ sectionNumber: number; questionNumber: number; quote: string }>;
  }>(),

  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  assessmentDimensionIdx: index('dimension_scores_assessment_idx').on(table.assessmentId, table.dimension),
  // Idempotency: prevent duplicate scores for same dimension in same batch
  uniqueBatchDimension: unique('dimension_scores_batch_dimension_unique').on(table.assessmentId, table.batchId, table.dimension),
}));

export const assessmentResults = pgTable('assessment_results', {
  id: uuid('id').primaryKey().defaultRandom(),
  assessmentId: uuid('assessment_id').notNull().references(() => assessments.id, { onDelete: 'cascade' }),
  batchId: uuid('batch_id').notNull(),

  // Composite scoring
  compositeScore: integer('composite_score').notNull(), // Weighted average 0-100
  recommendation: text('recommendation').notNull().$type<'approve' | 'conditional' | 'decline' | 'more_info'>(),
  overallRiskRating: text('overall_risk_rating').notNull().$type<'low' | 'medium' | 'high' | 'critical'>(),

  // Generated content
  narrativeReport: text('narrative_report'), // Full markdown report from Claude (for export)
  executiveSummary: text('executive_summary'), // Claude-generated (extracted via tool)
  keyFindings: jsonb('key_findings').$type<string[]>(),
  disqualifyingFactors: jsonb('disqualifying_factors').$type<string[]>(),

  // Scoring provenance (for auditability and reproducibility)
  rubricVersion: text('rubric_version').notNull(), // e.g., 'guardian-v1.0'
  modelId: text('model_id').notNull(), // e.g., 'claude-sonnet-4-5-20250929'
  rawToolPayload: jsonb('raw_tool_payload'), // Original scoring_complete payload from Claude

  // Audit
  scoredAt: timestamp('scored_at').defaultNow().notNull(),
  scoringDurationMs: integer('scoring_duration_ms'),
}, (table) => ({
  assessmentIdx: index('assessment_results_assessment_idx').on(table.assessmentId),
  // Idempotency: one result per batch
  uniqueBatch: unique('assessment_results_batch_unique').on(table.assessmentId, table.batchId),
}));
```

### Updated Assessment Status Flow

```
assessments.status:
  'draft'               → Initial creation
  'questions_generated' → Questionnaire ready for export
  'exported'            → User downloaded questionnaire
  'responses_uploaded'  → Completed questionnaire uploaded (NEW)
  'scored'              → Scoring complete (NEW)
  'cancelled'           → User abandoned
```

---

## Architecture Flow (Proposed)

```
┌─────────────────────────────────────────────────────────────────────┐
│  User: Selects "Scoring" mode, uploads completed questionnaire      │
│  - PDF (recommended) or DOCX accepted                               │
│  - Warning shown if DOCX (screenshots won't be analyzed)            │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│  DocumentParserService (Text Extraction)                            │
│  - PDF: pdf-parse library (text extraction, NOT Vision)             │
│  - DOCX: mammoth library (text extraction, NOT Vision)              │
│  - Extracts assessmentId from header text                           │
│  - Extracts Q&A pairs from text content                             │
│  - Returns structured responses + confidence scores                 │
│                                                                     │
│  ⚠️  LIMITATIONS (current implementation):                          │
│  - Scanned PDFs (image-only) will fail - no text to extract         │
│  - Screenshots embedded in PDF/DOCX are NOT analyzed                │
│  - Only standalone image files use Vision API                       │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Validation                                                         │
│  - Match assessmentId to DB                                         │
│  - If not found: reject with clear error message                    │
│  - If legacy export (no ID): reject, ask user to re-export          │
│  - Store responses to DB (new batch)                                │
│  - Store original file to S3                                        │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│  ScoringService (Claude API)                                        │
│  - Load rubric (cached via PromptCacheManager)                      │
│  - Send: responses + rubric                                         │
│  - Stream narrative report to chat                                  │
│  - Claude calls scoring_complete tool with structured scores        │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Payload Validation & Storage                                       │
│  - Validate scoring_complete payload (scores 0-100, required fields)│
│  - Reject/flag malformed payloads before persistence                │
│  - Store dimension_scores (10 rows) + assessment_results (1 row)    │
│  - Include provenance: rubric_version, model_id, raw payload        │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Results                                                            │
│  - Display ScoringResultCard in chat                                │
│  - Composite score + recommendation badge                           │
│  - Risk dashboard (10 dimensions, color-coded)                      │
│  - Offer export options (PDF, Word)                                 │
└─────────────────────────────────────────────────────────────────────┘
```

### Parsing Limitations & UX Warnings

| Scenario | Current Behavior | UX Message |
|----------|------------------|------------|
| DOCX uploaded | Text extraction only | "Note: Screenshots in Word documents won't be analyzed. For best results, upload as PDF." |
| Scanned PDF (image-only) | Extraction fails/empty | "This appears to be a scanned document. Please upload a text-based PDF or the original Word file." |
| PDF with embedded screenshots | Text extracted, images ignored | "Note: Embedded images in this PDF weren't analyzed. Text content was processed successfully." |
| No Assessment ID found | Rejected | "I couldn't find a Guardian Assessment ID in this document. Please upload a questionnaire exported from Guardian." |
| Legacy export (pre-ID) | Rejected | "This questionnaire was exported before Assessment ID tracking. Please generate a new questionnaire or re-export from the assessment." |

---

## Scoring Tool & Payload Validation

### scoring_complete Tool Definition

Claude calls this tool after streaming the narrative report to provide structured scores for persistence:

```typescript
const scoringCompleteTool = {
  name: 'scoring_complete',
  description: 'Submit structured scoring results after narrative analysis',
  input_schema: {
    type: 'object',
    required: ['compositeScore', 'recommendation', 'overallRiskRating', 'dimensionScores', 'executiveSummary'],
    properties: {
      compositeScore: {
        type: 'integer',
        minimum: 0,
        maximum: 100,
        description: 'Weighted average score across all dimensions'
      },
      recommendation: {
        type: 'string',
        enum: ['approve', 'conditional', 'decline', 'more_info'],
        description: 'Overall recommendation based on scoring'
      },
      overallRiskRating: {
        type: 'string',
        enum: ['low', 'medium', 'high', 'critical'],
        description: 'Aggregate risk level'
      },
      executiveSummary: {
        type: 'string',
        description: 'Brief summary for leadership (2-3 sentences)'
      },
      keyFindings: {
        type: 'array',
        items: { type: 'string' },
        description: 'Top 3-5 key findings'
      },
      disqualifyingFactors: {
        type: 'array',
        items: { type: 'string' },
        description: 'Any factors that automatically fail the assessment'
      },
      dimensionScores: {
        type: 'array',
        items: {
          type: 'object',
          required: ['dimension', 'score', 'riskRating'],
          properties: {
            dimension: { type: 'string' },
            score: { type: 'integer', minimum: 0, maximum: 100 },
            riskRating: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
            findings: { type: 'object' }
          }
        },
        minItems: 10,
        maxItems: 10,
        description: 'Scores for all 10 risk dimensions'
      }
    }
  }
};
```

### Payload Validation (Critical)

Before persisting scoring results, validate the `scoring_complete` payload:

```typescript
interface ScoringPayloadValidator {
  validate(payload: unknown): ValidationResult;
}

interface ValidationResult {
  valid: boolean;
  errors: string[];
  sanitized?: ScoringCompletePayload;
}

// Validation rules:
const validationRules = {
  compositeScore: (v: number) => v >= 0 && v <= 100,
  recommendation: (v: string) => ['approve', 'conditional', 'decline', 'more_info'].includes(v),
  overallRiskRating: (v: string) => ['low', 'medium', 'high', 'critical'].includes(v),
  dimensionScores: (v: unknown[]) => v.length === 10,
  eachDimensionScore: (d: { score: number }) => d.score >= 0 && d.score <= 100,
};
```

### Validation Failure Handling

| Scenario | Action |
|----------|--------|
| Missing required field | Reject, log error, notify user scoring failed |
| Score out of range (< 0 or > 100) | Reject, do not persist |
| Invalid enum value | Reject, do not persist |
| Wrong dimension count (!= 10) | Reject, do not persist |
| Malformed JSON from Claude | Reject, log raw response, notify user |

**On validation failure:**
1. Log the raw payload for debugging (redact sensitive content)
2. Do NOT persist to database
3. Emit `scoring_error` WebSocket event
4. Display user-friendly error: "Scoring analysis encountered an issue. Please try again."

---

## Related Files (Existing)

| File | Relevance |
|------|-----------|
| `packages/backend/src/domain/types/QuestionnaireSchema.ts` | 10 risk dimensions defined |
| `packages/backend/src/infrastructure/ai/prompts/questionGeneration.ts` | Question generation prompt pattern |
| `.claude/documentation/GUARDIAN_Security_Privacy_Analyst_v1_0_COMPLETE.md` | Original rubric (Part IV) |
| `docs/design/data/database-schema.md` | Phase 2 schema sketches |
| `docs/design/architecture/implementation-guide.md` | ScoringEngine references |
| `packages/backend/src/infrastructure/export/` | Export patterns to reuse |

---

## Export Architecture (Option A - Parallel Interfaces)

### Current Structure (Questionnaire Export - Clean Architecture ✅)

```
application/interfaces/
├── IExportService.ts        ← Service port (questionnaire)
├── IPDFExporter.ts          ← QuestionnaireData → PDF
├── IWordExporter.ts         ← QuestionnaireData → Word
└── IExcelExporter.ts        ← QuestionnaireData → Excel

application/services/
└── ExportService.ts         ← Orchestrator (depends on interfaces)

infrastructure/export/
├── PDFExporter.ts           ← Implements IPDFExporter
├── WordExporter.ts          ← Implements IWordExporter
└── ExcelExporter.ts         ← Implements IExcelExporter
```

### New Structure (Scoring Export - Parallel)

```
application/interfaces/
├── IScoringExportService.ts      ← NEW: Service port (scoring)
├── IScoringPDFExporter.ts        ← NEW: ScoringReportData → PDF
└── IScoringWordExporter.ts       ← NEW: ScoringReportData → Word

application/services/
└── ScoringExportService.ts       ← NEW: Orchestrator

infrastructure/export/
├── ScoringPDFExporter.ts         ← NEW: Implements IScoringPDFExporter
└── ScoringWordExporter.ts        ← NEW: Implements IScoringWordExporter
```

### New Types Required

```typescript
// application/interfaces/IScoringPDFExporter.ts

import { Assessment } from '../../domain/entities/Assessment'
import { Vendor } from '../../domain/entities/Vendor'

export interface ScoringReportData {
  assessment: Assessment
  vendor: Vendor
  result: {
    compositeScore: number
    recommendation: 'approve' | 'conditional' | 'decline' | 'more_info'
    overallRiskRating: 'low' | 'medium' | 'high' | 'critical'
    executiveSummary: string
    keyFindings: string[]
    disqualifyingFactors: string[]
  }
  dimensionScores: Array<{
    dimension: string
    score: number
    riskRating: string
    findings: object
  }>
  narrativeReport: string  // Full markdown report from Claude
}

export interface IScoringPDFExporter {
  generateScoringReport(data: ScoringReportData): Promise<Buffer>
}
```

### Rationale

- **No changes to existing code** - Questionnaire export untouched
- **Clean separation** - Different data shapes, different templates
- **Can refactor later** - If more export types needed, generalize to `IDocumentExporter<T>`

---

## UX Components

### Rotating Status Messages

For long-running processes (parsing ~30-60s, scoring ~30-60s):

```typescript
const statusMessages = [
  'Processing...',
  'This may take a minute...',
  'Still working...',
  'Analyzing document...',
]

// Cycle every 5 seconds
const [messageIndex, setMessageIndex] = useState(0)
useEffect(() => {
  const interval = setInterval(() => {
    setMessageIndex(i => (i + 1) % statusMessages.length)
  }, 5000)
  return () => clearInterval(interval)
}, [])
```

### DOCX Warning

When `FileValidationService` detects DOCX:

```typescript
if (mimeType.includes('wordprocessingml')) {
  emit('upload_warning', {
    type: 'docx_screenshot_limitation',
    message: 'Screenshots in this document won\'t be analyzed. For full analysis, upload as PDF.'
  })
}
```

### ScoringResultCard (New Component)

Displays after scoring completes:
- Overall score + recommendation badge
- Risk dashboard (10 dimensions with color-coded ratings)
- Key findings summary
- Export buttons (PDF, Word)

### Mode Welcome Message

When user selects `'scoring'` mode, Claude sends welcome/instructions:

```
You're now in Scoring Mode.

To score a completed questionnaire:
1. Upload the completed questionnaire (PDF recommended, Word accepted)
2. Ensure it has the Guardian Assessment ID in the header
3. I'll analyze vendor responses against the 10 risk dimensions
4. You'll receive a detailed risk assessment report

Ready when you are - just upload the document.
```

### Error Messages

| Scenario | Message |
|----------|---------|
| DOCX uploaded | "Note: Screenshots in Word documents can't be analyzed. For full analysis including images, please upload as PDF." |
| No Assessment ID | "I couldn't find a Guardian Assessment ID in this document. Please upload a questionnaire that was exported from Guardian." |
| ID not in DB | "Assessment ID [xxx] not found. This questionnaire may have been generated in a different system or deleted." |
| Parse failure | "I had trouble reading this document. Please ensure it's a valid PDF or Word file and try again."

---

## Brainstorming Session: 2025-12-19

### Context Established

**Epic 16/17 is complete** - provides document upload and parsing infrastructure including:
- `DocumentParserService.parseForResponses()` for extracting Q&A from completed questionnaires
- `IScoringDocumentParser` interface with `ScoringParseResult`, `ExtractedResponse` types
- WebSocket events: `upload_progress`, `scoring_parse_ready`
- Error handling: `AssessmentNotFoundError`, `QuestionnaireMismatchError`
- File storage, validation, and repository infrastructure

**Current Claude.ai workflow:**
- Scoring is isolated from intake (no context linking)
- Relies on large Guardian prompt with embedded rubric
- No data persistence for dashboards/comparisons

**Web app goal:**
- Link scoring to original intake via assessmentId
- Persist data for dashboards, comparisons, re-scoring
- Separate "scoring" mode where completed questionnaire is uploaded → scored document provided

### Rubric Analysis

**Location:** `.claude/documentation/GUARDIAN_Security_Privacy_Analyst_v1_0_COMPLETE.md` (Part IV, lines 442-782)

**Structure:**
- 10 dimensions with 5-6 sub-scores each
- Risk-based dimensions (0-100, lower=better): Clinical, Privacy, Security
- Capability-based (0-100, higher=better): Technical Credibility, Vendor Capability, AI Transparency, Ethical, Regulatory, Operational, Sustainability
- Each dimension has disqualifying factors (binary fail)
- Composite scoring with weights by solution type (clinical AI, administrative, patient-facing)
- Recommendation algorithm: APPROVE / CONDITIONAL / DECLINE / MORE_INFO

**Token concern (KEY ISSUE):**
- Rubric: ~3-4K tokens
- 100+ Q&A responses: ~10-20K tokens
- Combined: ~15-25K tokens per scoring call
- Claude Projects handles this via project context; API calls must send each time

### Open Questions for Next Session

**1. Token Strategy - How to handle large rubric + responses?**
Options discussed:
- A: Chunk by dimension (10 API calls, ~5K tokens each, parallelizable)
- B: Summarize/compress rubric for API (loses nuance)
- C: Anthropic prompt caching (cache rubric as system prompt)
- D: Hybrid (cache rubric, send responses in chunks)

**2. Mode Decision - Confirmed separate "scoring" mode?**
- User indicated separate scoring mode (not assessment mode workflow state)
- Need to finalize mode switching UX

**3. Scoring Output - What form?**
- In-chat display?
- Generated PDF/Word report?
- Both?
- What does output look like? Per-dimension scores, narrative findings, recommendation?

**4. Intake Context Linkage - Should scoring reference original intake?**
- Could compare "vendor claimed X" vs "response says Y"
- Or just link for data persistence, not active comparison?

**5. Database Schema - Decisions from earlier (need user confirmation):**
- Separate `responses` table (not on `files` table) - links to assessmentId
- Store section/question numbers (not FK to questions.id)
- batchId UUID to group responses from single upload
- `dimension_scores` and `assessment_results` tables for scoring output

**6. AssessmentId in Exports - Still needs implementation:**
- Update `QuestionnaireMetadata` to include assessmentId
- Update PDF/Word/Excel exporters to print ID in header

---

## Next Steps

### Completed ✅
1. ~~Token strategy~~ → Single call + cached rubric
2. ~~Scoring output format~~ → Narrative streaming + `scoring_complete` tool
3. ~~Export architecture~~ → Option A (parallel interfaces)
4. ~~Progress UX~~ → Rotating status messages

### Implementation Tasks (Ready)

1. **Add assessmentId to exports** - Update PDF/Word/Excel exporters (prerequisite)
2. **Create database schema/migrations** - 3 new tables with provenance + idempotency
3. **Build ScoringService** - Orchestrate parse → validate → score → store → emit
4. **Build scoring_complete tool + validation** - Strict payload validation before persistence
5. **Build scoring prompt** - Adapt Part V template for Claude API
6. **Build UI components** - ScoringResultCard, rotating status, DOCX/scanned PDF warnings
7. **Build scoring exporters** - IScoringPDFExporter, IScoringWordExporter

---

## Session Handoff Notes

**Session: 2025-12-22 (Planning + Code Review)**

### All Planning Decisions Made ✅

| Decision | Resolution |
|----------|------------|
| Token strategy | Single API call + cached rubric via `PromptCacheManager` |
| Output format | Narrative streaming + `scoring_complete` tool extracts structured scores |
| Scope | Guardian v1.0 Part V template only (no v1.2 Trust Center features) |
| DOCX handling | Accept with warning ("screenshots won't be analyzed") |
| Export architecture | Option A - Parallel interfaces (`IScoringPDFExporter`, `IScoringWordExporter`) |
| Progress UX | Rotating status messages every 5 sec for long-running processes |
| Stepper | Not needed (only 2 API calls: parse + score) |
| Mode UX | New `'scoring'` mode in ModeSelector dropdown |
| Mode welcome | LLM sends instructions when entering scoring mode |
| Database | 3 new tables: `responses`, `dimension_scores`, `assessment_results` |
| Table relationships | All FK to `assessments.id`, grouped by `batch_id` |
| AssessmentId in exports | Add ID to PDF/Word/Excel headers (prerequisite for scoring) |

### Code Review Additions (2025-12-22)

| Addition | Description |
|----------|-------------|
| Payload validation | Strict schema validation for `scoring_complete` before persistence |
| Scoring provenance | `rubric_version`, `model_id`, `raw_tool_payload` in assessment_results |
| Idempotency | Unique constraints on (assessment_id, batch_id, dimension) |
| PHI handling | Acknowledged sensitive data, deferred to security epic |
| Parsing accuracy | Clarified text-only extraction for PDF/DOCX (not Vision) |
| Scanned PDF warning | Added UX message for image-only PDFs |
| Legacy export handling | Clear error + re-export guidance for pre-ID questionnaires |
| CLAUDE.md update | Changed "Claude interprets → TS calculates" to "Claude scores → TS validates" |

### Key Technical Details

**AI vs Code (Updated):** Claude applies rubric and outputs scores. TypeScript validates payloads and persists. No domain-layer scoring logic.

**Prompt caching:** Already implemented in `PromptCacheManager.ts` - reuse for scoring rubric (~3-4K tokens cached)

**Parsing reality:** DocumentParserService uses text extraction (pdf-parse, mammoth), NOT Vision. Scanned PDFs and embedded screenshots are NOT analyzed.

**Data flow:**
1. User selects scoring mode → sees welcome message
2. User uploads completed questionnaire (PDF preferred, DOCX with warning)
3. `DocumentParserService.parseForResponses()` extracts Q&A + assessmentId (text-only)
4. Validate assessmentId exists in DB; reject legacy exports gracefully
5. Store responses to `responses` table with `batch_id`
6. Send responses + cached rubric to Claude
7. Claude streams narrative report
8. Claude calls `scoring_complete` tool with structured scores
9. **Validate payload** (scores 0-100, required fields, 10 dimensions)
10. Store to `dimension_scores` (10 rows) + `assessment_results` (1 row) with provenance
11. Display `ScoringResultCard` in chat
12. User can export to PDF/Word

**New components needed:**
- Backend: `ScoringService`, `ScoringPayloadValidator`, `ResponseRepository`, `DimensionScoreRepository`, `AssessmentResultRepository`, `IScoringPDFExporter`, `ScoringPDFExporter`, scoring system prompt
- Frontend: `ScoringResultCard`, rotating status component, DOCX warning toast, scanned PDF warning
- Schema: 3 new tables with migrations (includes provenance + unique constraints)

### Branch

`feature/epic-15-scoring-analysis`

### To Resume

1. Read this file (`tasks/epic-15/scoring-analysis-plan.md`)
2. All planning complete - ready for implementation sprints
3. First implementation task: Add assessmentId to questionnaire exports (prerequisite)
4. Then: Create database schema/migrations (with provenance + idempotency)
5. Then: Build ScoringService + payload validation
6. Then: Build UI components
