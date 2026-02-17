# Epic 39: Scoring Pipeline Optimization

**Branch:** `feat/scoring-optimization`
**Status:** Planning — audit complete, Codex-reviewed, implementation plan finalized
**Previous Analysis:** `tasks/scoring-optimization-analysis.md`

---

## Problem Statement

Post-Epic 38 ISO enrichment, the scoring pipeline takes ~7 minutes (was ~3 min pre-ISO).
This is unacceptable UX. The pipeline has two Claude API calls (by design), but the first
one (document extraction) is entirely eliminable for Guardian-generated questionnaires.

| Step | Current Duration | Target |
|------|-----------------|--------|
| Document extraction (Claude) | ~5 min | ~100ms (regex) |
| Scoring (Claude) | ~2 min | ~1.5 min (cache optimizations) |
| Validation + DB storage | <1 sec | <1 sec |
| **Total** | **~7 min** | **~1.5-2 min** |

---

## Goals

### Goal 1: Regex-Based Answer Extraction (P0 — saves ~5 min)

**Insight:** Guardian generates the questionnaire AND exports it via `WordExporter.ts`.
The document format is deterministic. Questions are already in the `questions` DB table.

**Instead of:** Sending 100K chars to Claude to extract Q&A pairs (~5 min)
**Do this:** Extract raw text (mammoth/pdfparse), regex-split on `Question X.Y` markers,
grab answer text after `Response:` markers, match to DB questions by section_number + question_number.

**Constraints:**
- Keep Claude extraction as fallback for Guardian docs where regex confidence < 0.9
- Non-Guardian documents continue to be rejected (existing behavior, no change) — this is a **product decision**
- Must handle PDF-converted documents (same text structure after conversion)
- Image detection in Sprint 1 (flag only); Vision API orchestration is future scope
- Must not break the downstream scoring pipeline — same `ScoringParseResult` shape

### Goal 2: Scoring Call Optimization (P0 — saves ~30 sec)

**Issues identified:**
- ISO catalog injected into system prompt breaks prompt caching
- ISO catalog fetched from DB via 2 sequential queries on every call (no caching)
- Full catalog injected even when assessment has no ISO-mapped dimensions

**Fixes (treat as experiment — measure before/after):**
- Restructure prompts for caching: static system prompt + ISO as cacheable user block (spike needed)
- Cache ISO catalog in-memory on service init
- Make ISO injection conditional on assessment dimensions
- **Metrics plan:** cache hit rate, input tokens, latency p50/p95, cost per run, before/after sample size

### Goal 3: User Progress Feedback (P0 — UX)

**Current state:** Only 2 generic messages across entire 7-minute flow:
1. "Extracting responses from document..." (dead air for ~5 min)
2. "Analyzing scoring..." (dead air for ~2 min)

**Target state — granular progress events:**

| Stage | Message | When |
|-------|---------|------|
| Start | "Processing uploaded document..." | Immediately on upload |
| Text extraction | "Extracting text from document..." | mammoth/pdfparse start |
| Text extracted | "Document text extracted (N pages)" | mammoth/pdfparse done |
| Format detection | "Detected Guardian questionnaire format" OR "Processing third-party document format" | After format check |
| Regex parsing | "Matching responses to questionnaire... section X of Y" | Per section |
| Parse complete | "Found N responses across M sections" | After all sections matched |
| ISO fetch | "Loading ISO compliance controls..." | Before ISO DB query |
| Scoring start | "Analyzing vendor responses against risk rubric..." | Claude call begins |
| Scoring progress | "Evaluating dimension X of 10: {dimension name}..." | If detectable from stream |
| Scoring complete | "Risk assessment complete — score: X/100" | After validation |

### Goal 4: Code Quality (P2 — prerequisite for safe refactoring)

**Files exceeding 300 LOC limit on the active scoring path:**
- `DocumentParserService.ts` (784 LOC) — split into focused modules
- `ClaudeClient.ts` (844 LOC) — split into interface-specific modules
- `ScoringHandler.ts` (~567 LOC) — active WebSocket scoring orchestrator (Codex catch)

**Note:** `DocumentUploadController.ts` (920 LOC) scoring methods are **deprecated** — active
scoring path is WebSocket-driven via `ScoringHandler`. Split priority goes to active path files.

**These splits may be prerequisites** for Goals 1-3 to keep changes safe and testable.

---

## Risk Assessment — What Can Break

**This is a multi-stage pipeline with several Claude tool calls. Changes must be surgical.**

### Critical Data Flows to Audit

1. **Upload → Extraction → ScoringParseResult**
   - `DocumentUploadController` → `ScoringService.startScoring()` → `DocumentParserService.parseForResponses()` → returns `ScoringParseResult`
   - The regex extractor must produce an IDENTICAL `ScoringParseResult` shape

2. **ScoringParseResult → Claude Scoring → Tool Payload**
   - `ScoringService` → `ScoringLLMService.scoreWithClaude()` → Claude calls `scoring_complete` tool → returns JSON payload
   - The tool payload is validated by `ScoringPayloadValidator` before DB storage

3. **Tool Payload → Report Generation (multiple exports)**
   - PDF export: `ScoringExportService` → `PDFReportBuilder` → HTML template → Puppeteer
   - Word export: `ScoringExportService` → `WordReportBuilder` → docx
   - Excel export: `ScoringExportService` → `ExcelReportBuilder` → xlsx
   - ALL exports consume the same scored assessment data from DB

4. **WebSocket events for progress**
   - `SCORING_STARTED` → `SCORING_PROGRESS` → `SCORING_COMPLETE` | `SCORING_FAILED`
   - Events flow through `ScoringService` → `onMessage` callback → WebSocket handler

5. **ISO control injection path**
   - `ISOControlRetrievalService` → `ScoringLLMService` (proxy) → `IPromptBuilder` → system/user prompts
   - Cache must respect framework version changes

### Known Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Regex fails on vendor-modified questionnaire format | HIGH | Detect format deviation → fall back to Claude extraction |
| Regex produces different field count/shape than Claude | HIGH | Contract test: regex output must match `ScoringParseResult` interface exactly |
| Silent quality regression — regex passes with structurally bad parse | HIGH | Composite confidence: assessmentId + duplicate keys + expected-vs-parsed + DB key mapping (Codex catch) |
| Progress events break WebSocket protocol | MEDIUM | Test event sequence in existing integration tests |
| Frontend only renders `parsing|scoring` status — new stages invisible | MEDIUM | Update `MessageList.tsx` condition to render all progress statuses (Codex catch) |
| `% 500 === 0` scoring stream progress is near-random | MEDIUM | Replace with threshold-based delta reporting (Codex catch) |
| Prompt cache restructure may not improve cost/latency | MEDIUM | Treat Sprint 3 as experiment with metrics; measure before/after (Codex catch) |
| `ClaudeClient.streamWithTool` is string-based — multi-block user prompt not drop-in | MEDIUM | Spike: verify API supports `cache_control` on user content blocks (Codex catch) |
| ISO cache serves stale data after framework update | LOW | TTL or version-based cache invalidation |
| Splitting 784-LOC file introduces import regressions | MEDIUM | Run full test suite after each split |
| Non-Guardian reject policy may drift if not explicit | LOW | Document as product decision in goals doc + code comments (Codex catch) |

---

## Audit Checklist

**BEFORE implementing, audit these and record findings below:**

### A. Document Format Verification — DONE
- [x] Read actual `WordExporter.ts` output format — `Question X.Y` → text → `Response:` → bordered box
- [x] Read actual PDF conversion output — mammoth/pdfparse preserve text markers
- [x] Identify edge cases: empty responses, multi-paragraph, "Question" in vendor text, scanned PDFs
- [x] Questions table schema verified — unique index on `(assessmentId, sectionNumber, questionNumber)`

### B. Scoring Pipeline Data Flow — DONE
- [x] Trace full path: upload → extraction → scoring → validation → DB storage → export (7 stages)
- [x] Map every file involved with current LOC (4 files over 300 LOC limit)
- [x] Identify every `ScoringParseResult` consumer (ScoringService, ScoringStorageService, ScoringLLMService)
- [x] Only 4 fields per response sent to Claude: sectionNumber, questionNumber, questionText, responseText
- [x] 5 validation gates documented

### C. Claude Tool Call Analysis — DONE
- [x] 7 Claude API calls mapped (2 in extraction, 2 vision, 1 scoring, 1 export narrative, 1 question gen)
- [x] Call #2 (scoring extraction, sendMessage, 16384 tokens) is the elimination target
- [x] Call #5 (scoring analysis, streamWithTool, scoring_complete tool) is the optimization target
- [x] Prompt caching enabled but ISO in system prompt reduces effectiveness

### D. Export Pipeline Verification — DONE
- [x] All 3 exports read from DB exclusively — zero dependency on ScoringParseResult
- [x] Exports fully decoupled — changing extraction cannot break reports
- [x] WAIT_TIMEOUT_MS is properly designed polling, NOT a race condition

### E. Progress Event Infrastructure — DONE
- [x] 4 WebSocket events: scoring_started, scoring_progress, scoring_complete, scoring_error
- [x] `progress?: number` field exists but barely used — can add granular percentages
- [x] 500ms frontend throttle prevents UI thrashing
- [x] No new event types needed — just more onProgress() calls

---

## Audit Findings

> Consolidated from 5 parallel audit agents (2026-02-17). This is the persistent record.

### A. Document Format Verification — COMPLETED

**WordExporter output format** (`infrastructure/export/WordExporter.ts`, 390 LOC):
```
"AI Vendor Assessment Questionnaire"
[vendor name]
GUARDIAN Assessment ID: [uuid]
...
Section [N]: [sectionName]           ← HEADING_2, blue border
  Question [N].[M]                   ← BOLD, BLUE text
  [questionText]
  Response:                          ← plain text, 50pt spacing
  [bordered empty box with gray shading + 3 blank lines]
```

**Text extraction:**
- mammoth `extractRawText()` — preserves text markers, strips formatting (borders, colors, shading)
- pdf-parse v2 `getText()` — preserves text content, loses layout
- Vision API (`ClaudeClient.analyzeImages()`) — for scanned/image PDFs

**GUARDIAN_MARKERS** (`DocumentParserService.ts:60-72`): 5 regex patterns, requires >= 2 matches:
```typescript
/Assessment\s+ID:\s*[a-f0-9-]{36}/i
/GUARDIAN.*Assessment/i
/Section\s+\d+:/i
/Question\s+\d+\.\d+/i
/\d+\.\d+\s+[-–—]\s+/i
```

**DB questions schema** (`schema/questions.ts`): Unique index on `(assessmentId, sectionNumber, questionNumber)` — reliable matching anchor.

**Audit A agent's verdict: Regex NOT viable** — citing edge cases:
1. No consistent end-of-response delimiter (relies on next Question marker)
2. Vendor could write "Question" in their response text → false positive
3. Scanned PDFs need Vision API (can't regex)
4. mammoth loses structural info (borders, spacing)
5. Multi-paragraph responses have ambiguous boundaries

**Counter-analysis (orchestrator):**
The agent evaluated GENERIC regex parsing. The actual approach is ANCHORED extraction:
- We have ALL question texts in the DB (exact match anchors, not pattern matching)
- We control the document format (WordExporter generates it)
- The pattern `Question \d+\.\d+` is highly specific (unlikely in vendor response text)
- Scanned PDFs → already planned as Claude fallback, not a blocker
- We can use question text proximity matching as secondary validation

**VERDICT: Regex extraction is VIABLE for the happy path** (Guardian-generated docx/pdf with standard format). Claude remains fallback for Guardian docs only: scanned Guardian PDFs, Guardian docs with vendor-modified formatting, Guardian docs with low regex confidence. Non-Guardian documents are always rejected (product decision).

---

### B. Scoring Pipeline Data Flow — COMPLETED

**Full pipeline (7 stages, all files mapped):**

```
Stage 1: Upload
  DocumentUploadController.upload() → S3 store → file record (parseStatus: 'pending')
  Returns HTTP 202 immediately, async processing follows

Stage 2: Document Parse (THE 5-MIN BOTTLENECK)
  DocumentParserService.parseForResponses()
  → mammoth/pdfparse text extraction (milliseconds)
  → GUARDIAN_MARKERS pre-check (regex, milliseconds)
  → Claude sendMessage with 100K chars (4-5 MINUTES)
  → Returns ScoringParseResult

Stage 3: Response Storage
  ScoringStorageService.storeResponses()
  → responses table (sectionNumber, questionNumber, questionText, responseText, confidence)

Stage 4: Claude Scoring (THE 2-MIN STEP)
  ScoringLLMService.scoreWithClaude()
  → Only 4 fields per response sent to Claude: sectionNumber, questionNumber, questionText, responseText
  → Claude calls scoring_complete tool → 54,626 char JSON payload
  → Returns narrativeReport + toolPayload

Stage 5: Validation
  ScoringPayloadValidator.validate()
  → Required: compositeScore (0-100), recommendation, overallRiskRating, executiveSummary, dimensionScores (exactly 10)
  → Optional: keyFindings[], disqualifyingFactors[]
  → Per-dimension: score, riskRating, findings (subScores, keyRisks, mitigations, evidenceRefs, assessmentConfidence, isoClauseReferences)
  → Soft warnings: sub-scores, confidence, ISO refs

Stage 6: Score Storage (atomic transaction)
  ScoringStorageService.storeScores()
  → dimension_scores table (10 rows, one per dimension, findings in JSONB)
  → assessment_results table (composite score, narrative, raw payload)
  → Both in single transaction (rollback if either fails)

Stage 7: Status Update
  assessmentRepository.updateStatus(assessmentId, 'scored')
  Status: 'exported' → 'scored'
```

**Validation gates in ScoringService.score():**
1. User authorization (file ownership) — line 62
2. Parse confidence >= 0.7 — line 130
3. Assessment exists + user owns it — line 140
4. Assessment status is 'exported' or 'scored' — line 153
5. Rate limit: max 5/day — line 164
6. Payload schema validation — line 219

**Files exceeding 300 LOC in pipeline:**
- `DocumentUploadController.ts` — 920 LOC
- `DocumentParserService.ts` — 784 LOC
- `ClaudeClient.ts` — 844 LOC
- `DrizzleAssessmentResultRepository.ts` — 337 LOC

---

### C. Claude Tool Call Analysis — COMPLETED

**All Claude API calls in scoring pipeline:**

| # | Location | Method | Tools | maxTokens | Cache | Temp | Purpose |
|---|----------|--------|-------|-----------|-------|------|---------|
| 1 | DocumentParserService:263 | sendMessage | None | 4,096 | YES | default | Intake extraction (vendor metadata) |
| 2 | DocumentParserService:395 | sendMessage | None | 16,384 | YES | default | **Scoring extraction (Q&A parse) — THE BOTTLENECK** |
| 3 | DocumentParserService:254 | analyzeImages | None | 4,096 | No | default | Vision intake (image docs) |
| 4 | DocumentParserService:384 | analyzeImages | None | 16,384 | No | default | Vision scoring (image docs) |
| 5 | ScoringLLMService:101 | streamWithTool | scoring_complete | 16,384 | YES | 0 | **Scoring analysis (narrative + scores)** |
| 6 | ExportNarrativeGenerator:73 | sendMessage | None | 16,000 | No | default | Export narrative (separate from scoring) |
| 7 | QuestionnaireGenService:150 | streamWithTool | output_questionnaire | 32,768 | No | default | Question generation |

**Call #2 is the elimination target** — the 5-minute scoring extraction that regex replaces.
**Call #5 is the optimization target** — prompt caching improvements.

**Prompt caching analysis (Call #5 — scoring):**
- System prompt: ~2,650-5,650 tokens (static rubric + optional ISO catalog)
- User prompt: ~1,500-3,200 tokens (always dynamic — vendor info + responses)
- ISO catalog currently IN system prompt → changes system prompt per assessment if ISO controls differ
- **Fix:** Move ISO catalog to user prompt appendix → system prompt becomes fully static → better cache hits

**ClaudeClient.streamWithTool() event sequence:**
```
content_block_start (tool_use) → content_block_delta (input_json_delta, accumulated) →
content_block_stop (parse JSON, call onToolUse) → message_stop (log stop_reason + usage)
```

---

### D. Export Pipeline Verification — COMPLETED

**VERDICT: Exports are FULLY DECOUPLED from extraction.**

- All 3 exporters (PDF, Word, Excel) consume `ScoringExportData` interface
- ALL data comes from DB repositories — zero dependency on `ScoringParseResult`
- `ScoringExportService.getScoringData()` reads from `assessmentResults` + `dimensionScores` tables
- ISO data stored in `dimension_scores.findings` JSONB (not separate table)
- `assessment_compliance_results` table exists but is NOT used by exports

**WAIT_TIMEOUT_MS (line 39):** Actually a properly designed polling mechanism for narrative generation concurrency — NOT a race condition. Safe fallback to default narrative if timeout expires.

**Implication:** Changing extraction method produces same `ScoringParseResult` → Claude scoring produces same tool payload → same DB storage → exports work identically.

**All export files under 300 LOC:**
- ScoringPDFExporter.ts: 248, ScoringWordExporter.ts: 104, ScoringExcelExporter.ts: 203
- WordSectionBuilders.ts: 293, WordISOBuilders.ts: 162, ScoringExportService.ts: 292

---

### E. Progress Event Infrastructure — COMPLETED

**Current WebSocket events for scoring:**

| Event | Payload Type | Emitted From |
|-------|-------------|--------------|
| `scoring_started` | `{ assessmentId, fileId, conversationId }` | ScoringHandler:203 |
| `scoring_progress` | `{ conversationId, status, message, progress?, fileId? }` | ScoringHandler:220 (via onProgress callback) |
| `scoring_complete` | `{ conversationId, result: {...}, narrativeReport }` | ScoringHandler:252 |
| `scoring_error` | `{ conversationId, error, code?, assessmentId?, fileId? }` | ScoringHandler:317,333 |

**Progress status values:** `'parsing' | 'scoring' | 'validating' | 'complete' | 'error'`

**Current progress messages emitted by ScoringService.score():**
1. `'Retrieving uploaded document...'` (line 62)
2. `'Extracting responses from document...'` (line 77) ← 5 min dead air
3. `'Storing extracted responses...'` (line 185)
4. `'Analyzing scoring...'` (line 194) ← 2 min dead air
5. `'Validating scoring results...'` (line 220)
6. `'Storing assessment results...'` (line 237)
7. `'Scoring complete!'` (line 260)

**Frontend handling:**
- `useWebSocketEvents.ts` — 4 handlers (lines 594-748)
- 500ms minimum display throttle (`MIN_DISPLAY_MS`)
- Error code → user message mapping (lines 710-724)
- Zustand store: `scoringProgress: { status, message, progress?, error? }`

**Adding granular progress — FEASIBLE:**
- `ScoringProgressPayload.progress?: number` already exists but barely used
- Can add `stage?` field for sub-workflow identification
- No new event types needed — just more `onProgress()` calls with better messages
- No retry UX exists (user must manually re-upload)

---

## Feasibility Test: Regex Extraction Proof-of-Concept

> **Script:** `scripts/test-regex-extraction.ts`
> **Run:** `cd packages/backend && npx tsx ../../scripts/test-regex-extraction.ts`
> **Output:** `/tmp/regex-extraction-test/` (cleanup: `rm -rf /tmp/regex-extraction-test/`)
> **Date:** 2026-02-17

### Test Results Summary

| Test | Input | Questions | Result | Parse Time |
|------|-------|-----------|--------|-----------|
| Real questionnaire (SuperHealthyCan.ai) | docx via mammoth | 45/45 | PASS | 0.44ms |
| Vendor writes "Question" in response | synthetic raw text | 2/2 | PASS | 0.19ms |
| Empty responses (vendor skipped Qs) | synthetic raw text | 3/3 | PASS | 0.05ms |
| Multi-paragraph with bullet points | synthetic raw text | 2/2 | PASS | 0.01ms |
| Unicode/French characters (é, ç, etc.) | synthetic raw text | 2/2 | PASS | 0.01ms |
| "Response:" embedded in answer text | synthetic raw text | 2/2 | PASS | 0.01ms |
| Non-sequential question numbers (gaps) | synthetic raw text | 3/3 | PASS | 0.01ms |
| Docx with embedded images | real docx (pdfkit) | 4/4 | PASS | 0.02ms |
| PDF questionnaire (Word → PDF) | real PDF (pdfkit + pdf-parse) | 3/3 | PASS | 0.05ms |

### How the Regex Extractor Works

**Core pattern:** `^Question\s+(\d+)\.(\d+)\s*$` (multiline)

This matches ONLY `Question X.Y` on its own line — the exact format WordExporter produces.
It does NOT match "Question" appearing mid-sentence in vendor response text.

**Algorithm:**
1. Find all `Question X.Y` markers with their character positions in the text
2. For each marker, extract the text block between it and the next marker (or end of document)
3. Within each block, split on `^Response:\s*$` (also requires its own line)
4. Everything before `Response:` = question text; everything after = answer text
5. Clean up: strip section headers, Guardian footer, pdf-parse page markers, excess whitespace

**Assessment ID extraction:** `/Assessment\s+ID:\s*\n?\s*([a-f0-9-]{36})/i`
**Vendor name extraction:** First non-empty line after "AI Vendor Assessment Questionnaire" title

### Issues Found and Fixes Applied

#### Issue 1: Section headers bleed into response text

**Problem:** When a section boundary falls between two questions, the section header
(e.g., `Section 3: AI Model Risk`) gets captured as part of the preceding answer's text.

**Root cause:** The regex splits on `Question X.Y` markers. Section headers appear between
questions but are not question markers, so they fall into the preceding response block.

**Fix applied:**
```typescript
responseText = responseText.replace(/\n*Section\s+\d+:\s+[^\n]+\s*$/, '').trim();
```
Strips trailing section headers from response text.

**Production note:** Also strip leading section headers from question text (already handled):
```typescript
questionText = questionText.replace(/^Section\s+\d+:\s+[^\n]+\n+/, '').trim();
```

#### Issue 2: Guardian footer bleeds into last response

**Problem:** The last question's response captures the Guardian footer text:
"Generated by Guardian AI Vendor Assessment System" and "© 2025 - Confidential Assessment Document"

**Root cause:** No next `Question X.Y` marker exists after the last question. The regex
grabs everything to end-of-document, including footer text.

**Fix applied:**
```typescript
responseText = responseText.replace(/\n*Generated by Guardian AI Vendor Assessment System[\s\S]*$/, '').trim();
```

**Production note:** Could also strip from the raw text BEFORE regex extraction (pre-processing step).

#### Issue 3: pdf-parse page markers in extracted text

**Problem:** pdf-parse appends `-- 1 of 1 --` (or `-- 1 of 3 --`, etc.) page markers at the
end of extracted text. These get captured in the last response.

**Root cause:** pdf-parse v2 adds page boundary markers to the raw text output.

**Fix applied:**
```typescript
responseText = responseText.replace(/\n*--\s*\d+\s*of\s*\d+\s*--\s*$/, '').trim();
```

**Production note:** Multi-page PDFs will have markers between pages too, not just at the end.
Consider stripping ALL page markers from raw text before extraction:
```typescript
rawText = rawText.replace(/--\s*\d+\s*of\s*\d+\s*--/g, '');
```

#### Issue 4: Images completely stripped by mammoth extractRawText()

**Problem:** When a vendor embeds an image (e.g., infrastructure diagram) as their answer,
mammoth `extractRawText()` strips it completely. The response appears empty.

**Root cause:** `extractRawText()` only returns text nodes from the docx XML. Images are
`<a:blip>` elements which are discarded.

**Detection strategy (proven in test):**
- Run BOTH `mammoth.extractRawText()` AND `mammoth.convertToHtml()` on the same buffer
- The HTML output preserves `<img>` tags with base64 data
- Compare: for each `Question X.Y` block, check if the HTML version contains `<img` tags
- If yes → set `hasVisualContent: true` on that response

**Results from test:**
- Q1.2 (image-only): `responseText = ""`, `hasVisualContent = true`, `confidence = 0.3`
- Q1.3 (image + caption): `responseText = "Our data flow..."`, `hasVisualContent = true`, `confidence = 1.0`

**Production note:** Image-only responses (confidence 0.3) should trigger Vision API fallback
for just that question, not the entire document. This is a per-response decision, not per-document.

#### Issue 5: "Response:" appearing in vendor answer text (NON-ISSUE)

**Tested scenario:** Vendor writes code snippets containing "Response:" in their answer.

**Why it's not an issue:** The regex uses `^Response:\s*$` which requires "Response:" to be
on its own line with nothing else. In the Word format, vendors type inside a bordered box that
appears AFTER the `Response:` line. If they type "Response:" as part of their text, it won't
be on its own line — it will be inline with surrounding text.

**Test confirmed:** Edge case "response-marker-in-answer" passes. The vendor's inline
`Response:` was correctly treated as part of the answer, not a delimiter.

#### Issue 6: "Question X.Y" appearing in vendor answer text (NON-ISSUE)

**Tested scenario:** Vendor writes about "Question Management" and "Question and Answer documents"
in their response.

**Why it's not an issue:** The regex uses `^Question\s+\d+\.\d+\s*$` which requires the EXACT
format "Question" + space + digit.digit on its own line. Vendor text like "Our Question Management
system" or "common question from customers" does NOT match because:
- "Question Management" has text after the word "Question" that isn't a number
- "common question" doesn't start with capital "Question" at start of line
- Even "Question 1.1" in prose would have surrounding text on the same line

**Test confirmed:** Edge case "vendor-writes-question-in-response" passes. Zero false positives.

### What This Means for Production

**The regex approach is proven viable for Guardian-generated documents.** Key constraints:

1. **Pattern anchoring is critical.** `^Question\s+\d+\.\d+\s*$` and `^Response:\s*$` must
   require start-of-line (`^`) and end-of-line (`$`). Without these anchors, false positives
   from vendor text would break extraction.

2. **Pre-processing the raw text** before regex extraction improves robustness:
   - Strip Guardian footer
   - Strip pdf-parse page markers
   - Normalize excessive whitespace (`\n{3,}` → `\n\n`)

3. **Post-processing per response** catches edge bleed:
   - Strip trailing section headers
   - Strip trailing footer text

4. **Image detection requires dual extraction** (mammoth raw text + HTML). The HTML extraction
   adds ~10ms overhead but enables per-response image flagging. This is essential because:
   - PDF documents cannot be checked via mammoth HTML (only docx)
   - PDF image detection would require a separate strategy (pdf-parse doesn't expose images)

5. **Confidence scoring for fallback decisions:**
   - All text extracted → confidence 1.0
   - Empty response with image detected → confidence 0.3 (Vision API candidate)
   - Empty response without image → confidence 0.5 (vendor may have skipped)
   - Overall: `found_questions / expected_questions` (from DB)
   - Threshold for regex acceptance: >= 0.9 (fall back to Claude if lower)

6. **PDF-specific handling:**
   - pdf-parse line wrapping does NOT affect regex (markers are on their own lines)
   - Page markers need stripping
   - No image detection available via pdf-parse (unlike mammoth HTML)
   - For PDF with images → must fall back to Claude Vision API

---

## Codex Review Summary (2026-02-17)

> Two-round review with rebuttals. All actionable findings incorporated into plan.

**Findings accepted (7):**
1. `DocumentUploadController` scoring methods are deprecated — active path is WebSocket `ScoringHandler`
2. `% 500 === 0` progress trigger is near-random — needs threshold-based delta
3. Frontend only renders `parsing|scoring` — new progress stages would be invisible
4. Confidence needs composite checks beyond count ratio (assessmentId, duplicates, DB key mapping)
5. Feature flag for regex rollout (instant rollback without deploy)
6. Image detection vs orchestration scope split (detect in Sprint 1, Vision API = future)
7. Sprint 3 prompt caching needs measurement, not assumption

**Findings partially accepted (3):**
1. Pre-check gate: valid routing refactor needed, but NOT critical severity (fallback operates within Guardian branch)
2. Structural confidence: assessmentId + duplicates + DB keys = yes; delimiter integrity = over-engineering for v1
3. Multi-block user caching: good idea but needs spike to verify API support (string-based interface today)

**Findings rejected (1):**
1. Shadow mode (parallel regex + Claude): negates time savings. Feature flag + logging is sufficient.

---

## Implementation Plan

> Audit complete. Codex-reviewed. Plan finalized with all accepted findings incorporated.

### Sprint 1: Regex Extraction Engine (P0 — saves ~5 min)

**Approach:** Anchored extraction using DB questions as reference points.

**Why it works (despite Audit A concerns):**
- We have all question texts in the DB → search for exact text, not generic patterns
- We control the document format → `Question X.Y` is our marker, not arbitrary
- `Question \d+\.\d+` pattern is highly specific (false positive rate near zero)
- Scanned PDFs → Claude fallback (already planned)
- Confidence scoring: compare found-count vs DB expected-count

**Strategy: Two-tier extraction (behind feature flag)**
1. **Tier 1 — Regex (fast path, <1 sec):** For Guardian-generated docs with standard format
   - Extract raw text (mammoth/pdfparse)
   - Verify GUARDIAN_MARKERS (existing check — convert from reject gate to routing signal)
   - Split on `Question \d+\.\d+` anchors
   - Match to DB questions by sectionNumber + questionNumber
   - Grab text between `Response:` marker and next question anchor
   - **Composite confidence scoring** (not just count ratio):
     - assessmentId extracted and valid (matches DB)
     - No duplicate question markers detected
     - Expected-vs-parsed question ratio >= 0.9
     - Deterministic mapping: all extracted question keys exist in DB
   - If composite confidence passes → use regex result
   - If any check fails → fall through to Tier 2

2. **Tier 2 — Claude (fallback, ~5 min):** For Guardian docs where regex confidence is low
   - Existing DocumentParserService.parseForResponses() Claude path — unchanged
   - Triggered when: Guardian doc regex confidence fails, Guardian scanned PDFs, Guardian Vision-required docs

3. **Non-Guardian documents:** Rejected (existing behavior, unchanged — product decision)

**Feature flag:** `ENABLE_REGEX_EXTRACTION` (env var, default: true). Allows instant rollback
to Claude-only extraction without code deploy. Log extraction method + confidence on every call.

**Output contract:** Both tiers produce identical `ScoringParseResult` shape (verified by Audit D — exports fully decoupled, only care about DB data).

**Required test gate (3 paths):**
1. Regex pass: Guardian doc → regex confidence passes → fast result
2. Regex fail → Claude fallback: Guardian doc → regex confidence fails → Claude extraction
3. Non-Guardian reject: no GUARDIAN_MARKERS → reject (unchanged behavior)

**Image handling scope:** Sprint 1 detects and flags images (`hasVisualContent: true`).
Per-question Vision API orchestration (extracting image bytes, calling Vision, merging results)
is **future scope** — not Sprint 1.

**Files to create/modify:**
- NEW: `infrastructure/extraction/RegexResponseExtractor.ts` — regex extraction logic
- MODIFY: `DocumentParserService.parseForResponses()` — add tier routing (pre-check → routing signal, not reject gate)
- NEW: tests for regex extractor (unit + integration with real docx)
- NEW: contract test comparing regex vs Claude output on same document

### Sprint 2: Progress Feedback Enhancement (P0 — UX)

**Approach:** Add granular `onProgress()` calls at each pipeline stage.

**New progress messages (using existing infrastructure):**

| Stage | Message | progress% |
|-------|---------|-----------|
| Start | "Processing uploaded document..." | 5 |
| Text extraction | "Extracting text from document..." | 10 |
| Format detection | "Detected Guardian questionnaire format" / "Processing document with AI..." | 15 |
| Regex parsing | "Matching responses to questionnaire... section X of Y" | 15-50 (interpolated) |
| Parse complete | "Found N of M responses" | 50 |
| ISO fetch | "Loading compliance controls..." | 55 |
| Scoring start | "Analyzing vendor responses against risk rubric..." | 60 |
| Scoring stream | "Generating risk assessment..." (existing, every 500 chars) | 60-85 |
| Validation | "Validating scoring results..." | 90 |
| Storage | "Storing assessment results..." | 95 |
| Complete | "Risk assessment complete — score: X/100" | 100 |

**Known bugs to fix in this sprint (Codex catches):**
1. `ScoringLLMService:112` — `narrativeReport.length % 500 === 0` is near-random with variable
   chunk sizes. Replace with threshold-based: `narrativeReport.length - lastReportedLength > 500`
2. `MessageList.tsx:324` — only renders progress for `parsing|scoring` status. Expand condition
   to render all progress statuses (`validating`, `storage`, etc.) or remove status filter entirely

**Files to modify:**
- `ScoringService.score()` — add progress calls at each stage
- `ScoringLLMService.scoreWithClaude()` — fix `% 500` bug, pass through granular callbacks
- `DocumentParserService.parseForResponses()` — add extraction progress
- `MessageList.tsx` — expand progress rendering beyond `parsing|scoring`
- `useWebSocketEvents.ts` — consume richer progress payloads

### Sprint 3: Scoring Call Optimization (P0 — saves ~30 sec)

**Approach:** Fix prompt caching + ISO catalog efficiency. **Treat as experiment with metrics.**

**Prerequisite spike:** `ClaudeClient.streamWithTool()` accepts `userPrompt` as string. Multi-block
content arrays with per-block `cache_control` require interface change. Verify Anthropic API supports
`cache_control` on user content blocks before committing to the multi-block approach.

**Prompt restructure options (evaluate with metrics):**

| Option | System prompt | User prompt | Expected benefit |
|--------|--------------|-------------|------------------|
| A (current) | Rubric + ISO catalog | Vendor responses | Cache busted when ISO differs |
| B (proposed) | Rubric only (static) | ISO catalog + vendor responses | System always cached, ISO uncached |
| C (ideal) | Rubric only (static, cached) | ISO catalog (cached block) + vendor responses (uncached block) | Both rubric and ISO cached |

Option C requires API spike. Ship whichever wins on measured metrics.

**Metrics plan (before/after on real assessments):**
- Cache hit rate (from `cache_read_input_tokens` in API response)
- Total input tokens per call
- Latency p50/p95
- Cost per scoring run
- Sample size: minimum 10 scoring runs per option

**Tasks:**
1. **Spike: multi-block user prompt caching**
   - Test `cache_control` on user content blocks with `streamWithTool`
   - Verify cache hit behavior across calls with same ISO, different vendor data
   - File: `ClaudeClient.ts` (interface change if multi-block supported)

2. **Cache ISO catalog in-memory**
   - `ISOControlRetrievalService.getFullCatalog()` → cache with TTL or version-key
   - Eliminates 2 sequential DB queries per scoring call
   - File: `ISOControlRetrievalService.ts`

3. **Combine ISO DB queries into single JOIN**
   - Current: 2 sequential queries in `getFullCatalog()`
   - Target: 1 JOIN query
   - Files: `DrizzleDimensionControlMappingRepository.ts`, `DrizzleInterpretiveCriteriaRepository.ts`

### Sprint 4: Code Quality (P2 — prerequisite hygiene)

**Split oversized files on the ACTIVE scoring path (300 LOC limit violations):**

| File | Current LOC | Active Path? | Split Plan |
|------|-------------|-------------|------------|
| DocumentParserService.ts | 784 | YES | IntakeParser + ScoringParser + shared text extraction |
| ClaudeClient.ts | 844 | YES | ClaudeTextClient + ClaudeStreamClient + ClaudeVisionClient |
| ScoringHandler.ts | ~567 | YES (WebSocket) | Scoring orchestration + progress emission + error handling |

**Deprioritized:** `DocumentUploadController.ts` (920 LOC) — scoring methods are `@deprecated`.
Active scoring path is WebSocket-driven via `ScoringHandler` → `ChatServer.handleScoringModeMessage()`.
Split only if time permits; active path files take priority. (Codex catch)

**Note:** These splits are deferred to Sprint 4 because they're safe refactors with no behavior change, and Sprints 1-3 can work with the existing file structure.

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-02-16 | Two-call design (extraction + scoring) is intentional | Separation of concerns; extraction can be swapped without touching scoring |
| 2026-02-16 | maxTokens increased to 16384 | Tool JSON payload is 54,626 chars; 10K was insufficient |
| 2026-02-16 | Regex extraction viable for Guardian docs | Format is deterministic (WordExporter), questions in DB |
| 2026-02-16 | ~~Keep Claude as fallback for non-Guardian docs~~ **SUPERSEDED** | ~~Third-party uploads won't follow our format~~ → Corrected 2026-02-17: non-Guardian docs are REJECTED (product decision). Claude fallback is Guardian-only. See entry below. |
| 2026-02-17 | Full codebase audit before implementation | Pipeline is complex with multiple tool calls; need verified data flow map |
| 2026-02-17 | Audit A agent said regex NOT viable — OVERRULED | Agent evaluated generic regex, not anchored extraction with DB questions as reference. The approach is fundamentally different: we know all questions, we control the format, pattern `Question \d+\.\d+` is highly specific. Claude fallback covers all edge cases. |
| 2026-02-17 | Two-tier extraction (regex fast path + Claude fallback) | Regex handles 90%+ of cases (Guardian docs). Claude handles: scanned PDFs, vendor-modified formats, low regex confidence (<0.9). Same ScoringParseResult output. |
| 2026-02-17 | Exports fully decoupled — verified by Audit D | All 3 exporters read exclusively from DB. Zero dependency on extraction artifacts. Changing extraction method cannot break reports. |
| 2026-02-17 | WAIT_TIMEOUT_MS is NOT a race condition | Audit D clarified: properly designed polling mechanism with safe fallback to default narrative. |
| 2026-02-17 | Move ISO catalog from system prompt to user prompt | Enables prompt caching on static system prompt (~2,650 tokens saved per cache hit). ISO data is dynamic per framework version anyway. |
| 2026-02-17 | Add granular progress via existing infrastructure | ScoringProgressPayload already has `progress?: number` field. No new event types needed. Just add more `onProgress()` calls in ScoringService. |
| 2026-02-17 | Defer file splits to Sprint 4 | 3 files over 300 LOC (784, 844, 920) are refactors with no behavior change. Sprints 1-3 can work with existing structure. |
| 2026-02-17 | Codex review: non-Guardian docs = reject (product decision) | Plan text was ambiguous ("Claude fallback for non-Guardian docs"). Clarified: non-Guardian docs continue to be rejected. Claude fallback is Guardian-only when regex fails. Prevents future contributors from reintroducing ambiguity. |
| 2026-02-17 | Codex review: composite confidence, not just count ratio | 0.9 threshold on question count alone is insufficient. Add: assessmentId validity, duplicate marker detection, DB key mapping. Cheap checks, high safety value. |
| 2026-02-17 | Codex review: image detection ≠ image orchestration | Sprint 1 detects and flags images. Per-question Vision API orchestration (extract bytes, call Vision, merge results) is future scope. Don't hide complexity in Sprint 1. |
| 2026-02-17 | Codex review: prompt caching = experiment with metrics | "Strictly better" was overconfident. Current `ClaudeClient.streamWithTool` is string-based for userPrompt — multi-block caching needs API spike. Measure cache hit rate, latency, cost before/after. |
| 2026-02-17 | Codex review: Sprint 4 targets active path, not legacy | `DocumentUploadController.triggerScoring()` is @deprecated. Active path is `ScoringHandler` (~567 LOC via WebSocket). Replace split target. |
| 2026-02-17 | Codex review: fix `% 500` progress bug + frontend status filter | `narrativeReport.length % 500 === 0` is near-random. Frontend only renders `parsing|scoring` progress. Both must be fixed in Sprint 2. |
| 2026-02-17 | Codex review: feature flag for regex rollout | `ENABLE_REGEX_EXTRACTION` env var allows instant rollback without deploy. Log extraction method + confidence on every call. |
| 2026-02-17 | Codex review: pre-check is routing refactor, not just spec wording | GUARDIAN_MARKERS pre-check needs to become a routing signal (Guardian → regex, Guardian+low-confidence → Claude, non-Guardian → reject). Implementation task in Sprint 1, not just doc cleanup. |
