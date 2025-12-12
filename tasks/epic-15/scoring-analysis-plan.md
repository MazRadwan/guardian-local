# Epic: Questionnaire Scoring & Analysis

## Status: Brainstorming (In Progress)

**Last Updated:** 2025-12-11
**Depends On:** Intake file input architecture (affects UI flow decisions)

---

## Context

Implementing the scoring/analysis phase where completed questionnaires are uploaded, parsed, and scored against the Guardian rubric. This is Phase 2 functionality referenced in `docs/design/data/database-schema.md`.

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
| Screenshots in responses | Vision handles natively (PDF/images) | For `.docx`, convert to PDF first; otherwise embedded images won’t be interpreted via API |
| QR code | No | Adds complexity without benefit for MVP |

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

## Open Items (Need Discussion)

### 1. Response Storage Schema

**Proposed:**
```typescript
export const responses = pgTable('responses', {
  id: uuid('id').primaryKey().defaultRandom(),
  assessmentId: uuid('assessment_id').notNull().references(() => assessments.id),
  batchId: uuid('batch_id').notNull(), // Groups responses from single upload
  questionNumber: integer('question_number').notNull(),
  sectionNumber: integer('section_number').notNull(),
  responseText: text('response_text').notNull(),
  confidence: real('confidence'), // Vision extraction confidence (nullable)
  uploadedFilePath: text('uploaded_file_path'), // S3 path to original doc
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
```

**Open questions:**
- Do we link to `questions.id` or just store section/question numbers?
- How to handle responses that don't match expected questions?

### 2. Scores Storage Schema

**Proposed:**
```typescript
export const assessmentScores = pgTable('assessment_scores', {
  id: uuid('id').primaryKey().defaultRandom(),
  assessmentId: uuid('assessment_id').notNull().references(() => assessments.id),
  responseBatchId: uuid('response_batch_id').notNull(), // Links to upload batch
  dimension: text('dimension').notNull(), // 'clinical_risk', 'privacy_risk', etc.
  score: integer('score').notNull(), // 0-100
  maxScore: integer('max_score').notNull(), // Usually 100
  riskRating: text('risk_rating').notNull(), // 'low', 'medium', 'high', 'critical'
  findings: jsonb('findings'), // Sub-scores, notes, evidence references
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const assessmentResults = pgTable('assessment_results', {
  id: uuid('id').primaryKey().defaultRandom(),
  assessmentId: uuid('assessment_id').notNull().references(() => assessments.id),
  responseBatchId: uuid('response_batch_id').notNull(),
  compositeScore: integer('composite_score').notNull(), // Weighted average
  recommendation: text('recommendation').notNull(), // 'approve', 'conditional', 'decline', 'more_info'
  executiveSummary: text('executive_summary'), // Claude-generated
  fullReport: jsonb('full_report'), // Complete analysis
  scoredAt: timestamp('scored_at').defaultNow().notNull(),
});
```

### 3. Scoring Prompt Architecture

**Options:**
- Single LLM call with full rubric + all responses
- Per-dimension calls (10 calls, can parallelize)

**Decision made:** Single call with streaming response (parse incrementally for UI updates)

**Open:**
- How to cache the rubric prompt? (Similar to questionnaire generation prompt caching)
- Token budget estimation needed

### 4. UI Flow Components

**Pending intake file input architecture decision**

Rough flow:
```
Composer dropdown: "Score Questionnaire"
  → Upload modal/drag-drop
  → Processing indicator: "Parsing document..."
  → Vision extracts ID + responses (~5-10 sec)
  → If no ID: Error "Can't identify. Please re-export."
  → If ID found: Match to DB
  → Scoring progress card (streaming, per-dimension updates)
  → Results card (composite score, recommendation, export options)
```

### 5. Post-Scoring Actions

**Options:**
- Display results in chat only
- Store to DB + display
- Auto-generate report
- Export options (PDF/Word)

**Likely:** All of the above - store always, display in chat, offer export

### 6. Mode Dropdown Location

Where does "Score Questionnaire" fit?

Current modes (assumed):
- Chat (default)
- Generate Questionnaire

Adding:
- Score Questionnaire

**Depends on:** Intake file input architecture

---

## Architecture Flow (Proposed)

```
┌─────────────────────────────────────────────────────────────────────┐
│  User: Selects "Score Questionnaire" mode, uploads Word doc         │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│  DocumentParserService (Claude Vision)                              │
│  - Reads document as images                                         │
│  - Extracts assessmentId from header                                │
│  - Extracts Q&A pairs (including screenshot interpretations)        │
│  - Returns structured responses + confidence scores                 │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Validation                                                         │
│  - Match assessmentId to DB                                         │
│  - If not found: reject with error                                  │
│  - Store responses to DB (new batch)                                │
│  - Store original file to S3                                        │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│  ScoringService (Claude API)                                        │
│  - Load rubric (cached prompt)                                      │
│  - Send: responses + rubric + questionnaire context                 │
│  - Stream response: per-dimension scores as they complete           │
│  - Store scores to DB                                               │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Results                                                            │
│  - Composite score + recommendation                                 │
│  - Store assessment_results to DB                                   │
│  - Display in chat (inline card)                                    │
│  - Offer export options                                             │
└─────────────────────────────────────────────────────────────────────┘
```

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

## Next Steps

1. **Resolve intake file input architecture** (separate discussion)
2. Finalize UI flow based on intake decision
3. Implement gaps (assessmentId, exporters, rubric codification)
4. Design DB migrations for responses + scores tables
5. Build services (DocumentParser, Scoring)
6. Build UI components

---

## Session Handoff Notes

**Where we left off:**
- Brainstorming complete for core architecture
- Decisions locked except UI flow (depends on intake)
- Three implementation gaps identified
- Six open items need resolution

**To resume:**
- Read this file
- Check if intake file input decision made
- Continue with open items or start implementation
