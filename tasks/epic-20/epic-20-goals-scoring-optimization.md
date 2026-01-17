# Epic 20: Scoring Optimization Plan

This document consolidates the scoring workflow findings and corrections. It is written so a new agent can pick up the work without prior context.

## Scope
- Backend scoring workflow: upload, parsing, scoring, storage, and related repositories.
- Export workflow: PDF/Word generation with detailed narrative analysis.
- Key files:
  - `packages/backend/src/application/services/ScoringService.ts`
  - `packages/backend/src/application/services/ScoringExportService.ts`
  - `packages/backend/src/infrastructure/ai/DocumentParserService.ts`
  - `packages/backend/src/infrastructure/ai/prompts/scoringPrompt.ts`
  - `packages/backend/src/infrastructure/export/ScoringPDFExporter.ts`
  - `packages/backend/src/infrastructure/websocket/ChatServer.ts`
  - `packages/backend/src/infrastructure/database/repositories/DrizzleAssessmentRepository.ts`
  - `packages/backend/src/domain/scoring/tools/scoringComplete.ts`

## Current Scoring Workflow (verified)
1. Upload phase stores file and extracts a 10k text excerpt for context injection
   (`packages/backend/src/infrastructure/http/controllers/DocumentUploadController.ts`).
2. Scoring trigger uses `ChatServer.triggerScoringOnSend` and calls `ScoringService.score`
   after `tryStartParsing` idempotency checks
   (`packages/backend/src/infrastructure/websocket/ChatServer.ts`).
3. `ScoringService.score`:
   - Auth: `fileRepo.findByIdAndUser` (`ScoringService.ts`).
   - Retrieve file buffer from storage (`fileStorage.retrieve`).
   - Parse responses via `DocumentParserService.parseForResponses`, which:
     - Extracts full text for PDF/DOCX or uses Vision API for images.
     - Sends full text or images to Claude to extract Q/A responses.
   - Load assessment and validate ownership and status.
   - Rate-limit check via `assessmentResultRepo.countTodayForAssessment`.
   - Store extracted responses.
   - Load vendor for the prompt.
   - Determine solution type for weighting (currently mismatched; see Findings).
   - Score with Claude, validate payload, store results, update status.

## Verified Issues and Clarifications

### A. Redundancy and Performance
A1. Duplicate PDF/DOCX text extraction (real cost, but not safe to remove)
- Upload extraction is a truncated excerpt (10k chars) used only for context injection.
- Scoring extraction re-reads the full document and is required for accurate Q/A parsing.
- Reusing the excerpt would drop content and fails for images (excerpt is empty).
- Sources: `TextExtractionService.ts`, `DocumentParserService.ts`, `ScoringService.ts`.

A2. Storage re-download during scoring (necessary for correctness)
- Scoring must retrieve the file from storage to parse full content or vision input.
- Skipping this will break scoring unless a full-text or buffer cache exists.
- Source: `ScoringService.ts`.

A3. Duplicate assessment and vendor lookups (avoidable DB round trip)
- `assessmentRepo.findById` then `assessmentRepo.getVendor` in the same flow.
- Safe to combine into a single repository method with a join.
- Source: `ScoringService.ts`, `DrizzleAssessmentRepository.ts`.

A4. Duplicate file fetch (minor)
- `ChatServer` loads the file record before scoring; `ScoringService` re-fetches it.
- Can be optimized by passing the file record to `ScoringService` while preserving auth checks.
- Source: `ChatServer.ts`, `ScoringService.ts`.

### B. Correctness and Data Model
B1. Solution type weighting bug (correctness)
- `determineSolutionType` maps `assessment.assessmentType` to rubric weights.
- `assessmentType` values are `quick|comprehensive|category_focused`, which never match.
- Result: scoring always defaults to `clinical_ai` weights.
- Source: `ScoringService.ts`, `AssessmentType.ts`, `rubric.ts`.

B2. `solutionType` semantics are split
- Intake parsing extracts `solutionType` into file intake context and uses it for
  progressive reveal and context injection.
- `assessment.solutionType` is stored in the DB and returned by APIs but is not
  used by scoring or questionnaire generation.
- Question generation endpoints require `solutionType` in the request body, not from
  the assessment record.
- Sources: `DocumentParserService.ts`, `ChatServer.ts`, `AssessmentController.ts`,
  `QuestionController.ts`, `QuestionnaireGenerationService.ts`.

### C. Parallelization and Transactionality
C1. Parallel validation checks are not safe as written
- Running `findById` and rate-limit count in parallel moves the rate-limit query
  ahead of ownership checks and can leak existence or add unnecessary load.
- If optimizing, do so after auth or via a single query.
- Source: `ScoringService.ts`.

C2. Parallel score storage risks partial writes
- `dimension_scores` and `assessment_results` inserts are not in a transaction.
- `Promise.all` can leave orphaned rows or missing results on failure.
- Source: `ScoringService.ts`, `DrizzleDimensionScoreRepository.ts`,
  `DrizzleAssessmentResultRepository.ts`.

### D. Export: Blank "Detailed Analysis" Section (CRITICAL)

D1. Root cause: `narrativeReport` is always empty
- The PDF template (`scoring-report.html`) has a "Detailed Analysis" section that
  renders `{{narrativeReport}}`.
- `narrativeReport` is populated from `assessment_results.narrative_report` column.
- During scoring, `ScoringService.scoreWithClaude()` attempts to capture narrative
  from Claude's streamed text output (lines 344-356).
- **Problem**: `tool_choice: { type: 'any' }` (line 353) forces Claude to use a tool,
  causing it to skip text output and call `scoring_complete` directly.
- Result: `narrativeReport` is always an empty string.
- Sources: `ScoringService.ts`, `ClaudeClient.ts`, `ScoringPDFExporter.ts`.

D2. Prompt vs behavior mismatch
- The prompt (`scoringPrompt.ts` lines 161-168) instructs Claude to:
  1. **First**: Stream narrative report in markdown
  2. **Then**: Call `scoring_complete` tool
- But `tool_choice: { type: 'any' }` overrides this — Claude optimizes by skipping
  text and going straight to the tool call.
- The `scoring_complete` tool schema does NOT include a `narrativeReport` field.

D3. Token cost concern
- Adding `narrativeReport` to the tool schema would add 2,000-4,000 output tokens
  per scoring (~doubling output cost).
- Most users may never export, so paying upfront is wasteful.

**Decision**: Generate narrative on-demand at export time (see R7 below).

## Recommendations (safe refactor path)
R0. MUST-FIX: Solution-type weighting source
- The rubric weights depend on `SolutionType` (`clinical_ai|administrative_ai|patient_facing`).
- Current scoring derives weights from `assessment.assessmentType` (quick/comprehensive), so
  weights always default to `clinical_ai`.
- Fix must ensure scoring uses a real solution-type signal (e.g., `assessment.solutionType`
  mapped to rubric types or a new explicit `scoringSolutionType` field).
- This is a correctness issue and should be addressed before performance refactors.

R1. Fix scoring weights source
- Decide whether weights should be based on:
  - `assessment.solutionType` (mapped to rubric `SolutionType`), or
  - a new explicit field for rubric weighting, or
  - assessment type (quick/comprehensive), with a different weighting strategy.
- Current behavior is incorrect; fix before performance refactors.

R2. Clarify and possibly remove `assessment.solutionType`
- If `solutionType` is only for context/progressive reveal, keep it in file intake
  context and remove it from the assessment table and assessment DTOs.
- If needed for reporting/filtering, document its purpose and input source.

R3. Combine assessment + vendor lookup
- Add repository method like `findByIdWithVendor` to eliminate the second query.

R4. Make score storage transactional
- Wrap `dimensionScoreRepo.createBatch` and `assessmentResultRepo.create` in a DB
  transaction to guarantee atomicity.

R5. Optional: short-lived file buffer cache
- Cache the upload buffer in-process for a short TTL keyed by `fileId`, to avoid an
  immediate S3 read when scoring happens right after upload.
- Keep S3 retrieval as fallback to preserve correctness.

R6. Optional: background full-text extraction
- For PDF/DOCX only, extract full text asynchronously after upload and store it in
  a separate blob or table to reuse during scoring.
- Do not use this for image-based docs (Vision input still required).

R7. MUST-FIX: On-demand narrative generation at export time
- **Approach**: Generate detailed analysis when user exports, not during scoring.
- **Trigger**: In `ScoringExportService`, check if `narrative_report` is empty;
  if so, call LLM to generate, then persist and proceed with export.
- **Input data** (all already in DB):
  - `assessment_results`: compositeScore, recommendation, executiveSummary, keyFindings
  - `dimension_scores`: per-dimension scores, ratings, findings
  - `responses`: original vendor Q&A (for evidence citations)
  - `assessment` + `vendor`: context (names, solution type)
- **Caching**: Persist generated narrative to `assessment_results.narrative_report`
  so subsequent exports are instant (no re-generation).
- **Keep scoring unchanged**: Leave `tool_choice: { type: 'any' }` since narrative
  will be generated at export time.

## R7 Architecture (On-Demand Narrative)

### Data Flow
```
Export Request
     │
     ▼
┌─────────────────────────────────┐
│   ScoringExportService          │
│   ┌───────────────────────────┐ │
│   │ if (!narrativeReport) {   │ │
│   │   generate via LLM        │ │
│   │   persist to DB           │ │
│   │ }                         │ │
│   └───────────────────────────┘ │
└─────────────────────────────────┘
     │
     ▼
┌─────────────────────────────────┐
│   LLM (via ILLMClient port)     │
│   Input: scores + responses     │
│   Output: markdown narrative    │
└─────────────────────────────────┘
     │
     ▼
┌─────────────────────────────────┐
│   PDF/Word Exporter             │
│   Template: {{narrativeReport}} │
└─────────────────────────────────┘
```

### Files to Modify/Create

| File | Change |
|------|--------|
| `packages/backend/src/application/services/ScoringExportService.ts` | Add narrative generation logic |
| `packages/backend/src/application/interfaces/IAssessmentResultRepository.ts` | Add `updateNarrativeReport()` method |
| `packages/backend/src/infrastructure/database/repositories/DrizzleAssessmentResultRepository.ts` | Implement update method |
| `packages/backend/src/infrastructure/ai/prompts/exportNarrativePrompt.ts` | **New**: Prompt for narrative generation |
| `packages/backend/src/infrastructure/ai/ExportNarrativePromptBuilder.ts` | **New**: Implements IPromptBuilder for export |
| `packages/backend/src/application/interfaces/IResponseRepository.ts` | Ensure `findByBatchId()` exists |
| `packages/backend/__tests__/unit/application/services/ScoringExportService.test.ts` | Add test coverage |

### Prompt Strategy (Rich Mode)
- Input: ~4,000-6,000 tokens (scores + top responses per dimension)
- Output: ~2,000-3,000 tokens (detailed markdown narrative)
- Use `IResponseRepository.findByBatchId()` to get original vendor responses
- Token budgeting: Select top-N responses per dimension based on findings references
- Sanitize vendor/solution/response text via `utils/sanitize.ts`

### Failure Behavior
- **Fallback** (preferred): If LLM fails, export succeeds with degraded content
  - Use `executiveSummary` + `keyFindings` as fallback narrative
  - Log error for debugging
  - Optionally surface warning in PDF ("Detailed analysis unavailable")
- **Do NOT hard fail**: Export reliability is more important than optional enhancement

### Test Coverage Required
1. **"generate narrative when missing"**: Verify LLM called when `narrative_report` is null/empty
2. **"skip LLM when present"**: Verify no LLM call when narrative already exists
3. **"persist narrative update"**: Verify narrative saved to DB after generation
4. **"fallback on LLM failure"**: Verify export succeeds with degraded content

---

## Additional Optimizations (from deep-dive review)

R8. Cleanup policy for orphaned response batches
- **Problem**: Responses are stored before scoring; if scoring fails, orphaned batches remain.
- **Approach**: Hybrid strategy:
  - R4 handles transactional integrity for `dimension_scores` + `assessment_results`
  - Add scheduled cleanup job for orphaned `responses` (where `batch_id` has no matching `assessment_results`)
- **Retention**: 24h window (configurable via `ORPHAN_CLEANUP_RETENTION_HOURS` env var)
- **Auditability**: Log all deletions with batch_id and count
- **Performance**: Ensure `responses` table has index on `batch_id` and `created_at` for efficient purge queries
- **Query pattern**:
  ```sql
  DELETE FROM responses
  WHERE batch_id NOT IN (SELECT batch_id FROM assessment_results)
  AND created_at < NOW() - INTERVAL '24 hours'
  ```

R9. Prompt caching for scoring rubric
- **Problem**: Rubric system prompt is ~2,500 tokens and static, but not cached.
- **Approach**: Use existing `PromptCacheManager` for scoring system prompt.
- **Benefit**: 30-50% reduction in input token costs per scoring call.
- **Files**: `ScoringPromptBuilder.ts`, `ClaudeClient.ts`, `PromptCacheManager.ts`

R10. Configurable maxTokens for scoring
- **Problem**: `streamWithTool` hardcodes 8192 output tokens; tool payload only needs ~1,200.
- **Approach**: Make `maxTokens` configurable in `ILLMClient.streamWithTool()` options.
- **Default**: Reduce to 2,500 for scoring (tool payload + safety margin).
- **Benefit**: Reduces output budget, may improve latency.
- **Files**: `ILLMClient.ts`, `ClaudeClient.ts`, `ScoringService.ts`

R11. Abort support for parsing/extraction
- **Problem**: `ScoringService.abort()` stops scoring but parsing LLM call continues.
- **Approach**: Wire `AbortSignal` through `IScoringDocumentParser.parseForResponses()`.
- **Files**: `IScoringDocumentParser.ts`, `DocumentParserService.ts`, `ScoringService.ts`
- **Benefit**: Canceling scoring stops all LLM calls, saving tokens.

R12. Fast pre-check for Guardian document signature
- **Problem**: Invalid documents (non-Guardian questionnaires) trigger expensive LLM extraction.
- **Approach**: Before LLM call, regex search for Guardian markers (e.g., `Assessment ID:`, `GUARDIAN`).
- **Scope**: PDF/DOCX only (images require Vision API to read anything).
- **Behavior**: Best-effort optimization, not a hard gate (avoid false negatives).
- **Files**: `DocumentParserService.ts`

R13. Per-response truncation for token budgeting
- **Problem**: `DEFAULT_MAX_EXTRACTED_TEXT_CHARS` is 100k; large docs increase latency.
- **Approach**: Instead of blanket document cap, truncate individual responses (e.g., 2,000 chars each).
- **Benefit**: Bounds worst-case while preserving key evidence across all responses.
- **Files**: `DocumentParserService.ts`, `ScoringService.ts`

## Non-Recommended Changes (regression risk)
- Do not reuse `textExcerpt` for scoring.
- Do not skip storage retrieval without an alternative full-text or buffer source.
- Do not parallelize validation before authorization checks.
- Do not parallelize score storage without a transaction.

## Regression Risks and Test Checklist
- Scoring correctness on PDF, DOCX, and image-based questionnaires.
- Rate-limit behavior and unauthorized access paths.
- Duplicate scoring attempts and idempotency checks.
- Storage failure during scoring and partial write handling.
- Weighting logic changes (confirm weights match rubric expectations).

## Implementation Priority

| Priority | Item | Type | Effort |
|----------|------|------|--------|
| **P0** | R7: On-demand narrative generation | Feature (critical) | Medium |
| **P0** | R0/R1: Fix solution-type weighting | Bug fix | Small |
| **P1** | R4: Transactional score storage | Data integrity | Small |
| **P1** | R8: Orphaned response cleanup | Data integrity | Small |
| **P2** | R9: Prompt caching for rubric | Cost optimization | Small |
| **P2** | R10: Configurable maxTokens | Cost optimization | Small |
| **P2** | R11: Abort support for parsing | Cost optimization | Medium |
| **P2** | R3: Combine assessment+vendor lookup | Performance | Small |
| **P3** | R12: Pre-check Guardian signature | Performance | Small |
| **P3** | R13: Per-response truncation | Performance | Small |
| **P3** | R2: Clarify solutionType semantics | Tech debt | Small |
| **P4** | R5/R6: File buffer/text caching | Performance | Medium |

## Decisions Made

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Narrative generation timing | On-demand at export | Avoids 2-4k extra tokens per scoring; most users won't export |
| Keep `tool_choice: { type: 'any' }` | Yes | Narrative handled at export; tool forcing ensures structured output |
| Failure behavior | Fallback to executiveSummary | Export reliability > optional enhancement |
| Rich vs lean narrative input | Rich (scores + responses) | Healthcare reports need evidence citations |
| Narrative caching | Persist to DB | First export pays LLM cost; subsequent exports instant |
| Response storage strategy | Hybrid (R4 + R8) | Transaction for scores; cleanup job for orphaned responses |
| Orphan retention window | 24h (configurable) | Preserves debug data; env var for flexibility |
| Token budgeting | Per-response truncation | Better than doc-level cap; preserves evidence across responses |

## Open Questions

### Resolved
- ~~Should narrative be generated during scoring or export?~~ → **Export time (on-demand)**
- ~~How to handle LLM failure during export?~~ → **Fallback to executiveSummary + keyFindings**
- ~~How to handle orphaned response batches?~~ → **Hybrid: R4 transaction + R8 cleanup job**
- ~~Token budgeting strategy?~~ → **Per-response truncation (R13)**
- ~~Should rubric weights be driven by assessment.solutionType or intake context?~~ → **Use `assessment.solutionType` directly (Story 20.1.4)**
- ~~What about assessment-level solutionType removal?~~ → **Keep it; clarify semantics in Story 20.4.3**

---

## Reviewer Validation (2026-01-15)

The following findings from code review confirm the plan accurately describes the current state:

| Priority | Finding | Story | Status |
|----------|---------|-------|--------|
| **Critical** | `determineSolutionType` reads `assessmentType` instead of `solutionType` | 20.1.4 | Planned |
| **Critical** | On-demand narrative not implemented; export reads empty `narrativeReport` | 20.1.1, 20.1.2, 20.1.3 | Planned |
| **High** | `updateNarrativeReport` in interface but not in Drizzle repo | 20.1.3 | Planned |
| **High** | No schema columns/repo methods for claim-before-LLM pattern | 20.1.3 | Planned |
| **Medium** | Transactional score storage not implemented | 20.2.1 | Planned |
| **Medium** | Abort propagation into parsing missing | 20.3.3 | Planned |
| **Medium** | Cost controls absent (hardcoded `max_tokens`, no prompt caching) | 20.3.1, 20.3.2 | Planned |

**Design Approved**: Interface design for `IAssessmentResultRepository` with claim/finalize/fail methods (to be added in Story 20.1.3).

All findings are addressed by the approved sprint plan. Ready for `/implement`.

---

*Last updated: 2026-01-15*
