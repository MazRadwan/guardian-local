# Sprint 0: Discovery Spike

**Type:** Research & Decision Sprint
**Stories:** 18.0.1 - 18.0.4
**Estimated Effort:** 1-2 hours
**Parallel With:** None (blocking)
**Dependencies:** None
**Outputs:** Decision document that unblocks Sprint 1A/1B

---

## Purpose

Answer four key questions to unblock implementation:

1. **Can we extract text from PDF/DOCX reliably?** → Yes/No
2. **What's the rough latency range?** → ~500ms / ~2s / too slow
3. **Where should we store the excerpt?** → DB column / S3 sidecar
4. **What happens when extraction fails?** → Fallback behavior defined

This is a **discovery spike**, not production-grade benchmarking. We need enough confidence to proceed, not P50/P95 metrics.

---

## Story 18.0.1: Text Extraction Feasibility

**Goal:** Verify pdf-parse and mammoth work reliably with rough latency assessment.

### Test Approach

Use **3-5 synthetic test files** (no real customer data):

| File | Type | Size | Purpose |
|------|------|------|---------|
| `small-text.pdf` | PDF | ~100KB | Basic text extraction |
| `medium-text.pdf` | PDF | ~1MB | Moderate size |
| `large-text.pdf` | PDF | ~5MB | Upper bound timing |
| `sample.docx` | DOCX | ~500KB | DOCX extraction |
| `scanned.pdf` | PDF (image) | Any | Verify returns empty (expected) |

### Quick Test Script

```typescript
// packages/backend/scripts/test-extraction.ts
import { PDFParse } from 'pdf-parse';
import mammoth from 'mammoth';
import { readFileSync } from 'fs';

async function testPdf(path: string): Promise<void> {
  const buffer = readFileSync(path);
  const start = Date.now();

  try {
    const parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    await parser.destroy();

    console.log(`✅ ${path}: ${Date.now() - start}ms, ${result.text.length} chars`);
  } catch (err) {
    console.log(`❌ ${path}: FAILED - ${err}`);
  }
}

async function testDocx(path: string): Promise<void> {
  const buffer = readFileSync(path);
  const start = Date.now();

  try {
    const result = await mammoth.extractRawText({ buffer });
    console.log(`✅ ${path}: ${Date.now() - start}ms, ${result.value.length} chars`);
  } catch (err) {
    console.log(`❌ ${path}: FAILED - ${err}`);
  }
}

// Run: npx tsx packages/backend/scripts/test-extraction.ts
```

### Expected Results

| Scenario | Expected Outcome |
|----------|------------------|
| Text-based PDF | Extracts text, ~100-500ms |
| Large PDF (5MB) | Extracts text, ~1-3s |
| Scanned PDF | Returns empty string (no OCR) |
| DOCX | Extracts text, ~100-300ms |
| Corrupt file | Throws error, caught gracefully |

### Acceptance Criteria

- [ ] pdf-parse extracts text from text-based PDFs
- [ ] mammoth extracts text from DOCX files
- [ ] Scanned PDFs return empty (documented as expected)
- [ ] Rough latency is acceptable (<3s for typical files)
- [ ] Errors are caught and don't crash

---

## Story 18.0.2: Storage Decision

**Goal:** Choose where to store text excerpts.

### Options

| Option | Pros | Cons | Recommendation |
|--------|------|------|----------------|
| **DB column** | Simple, single query | Slight bloat | ✅ MVP choice |
| **S3 sidecar** | Clean separation | Extra request | Defer |
| **Redis cache** | Fast reads | Requires Redis | Overkill |

### Decision: Database Column

```sql
ALTER TABLE files ADD COLUMN text_excerpt TEXT;
```

**Rationale:**
- Simplest implementation
- 10KB × 1000 files = 10MB (acceptable)
- PostgreSQL handles TEXT columns fine
- Can migrate to S3 later if needed

### Acceptance Criteria

- [ ] Decision documented: DB column
- [ ] Confirm PostgreSQL TEXT column is suitable
- [ ] No privacy/retention concerns for MVP (defer formal policy)

---

## Story 18.0.3: Extraction Failure Behavior

**Goal:** Define what happens when text extraction fails.

### Failure Scenarios

| Scenario | Cause | Behavior |
|----------|-------|----------|
| Corrupt PDF | Malformed file | Emit `file_attached` with `hasExcerpt: false` |
| Scanned PDF | No text layer | Emit `file_attached` with `hasExcerpt: false` |
| Extraction timeout | File too large | Emit `file_attached` with `hasExcerpt: false` |
| Library crash | Bug in pdf-parse | Catch error, emit `file_attached` with `hasExcerpt: false` |

### Key Decision: Always Emit `file_attached`

Even if extraction fails, we still emit `file_attached` because:
1. File is stored successfully in S3
2. User should see "Attached" state
3. Context injection degrades gracefully (no excerpt available)

### `file_attached` Event Contract

```typescript
interface FileAttachedEvent {
  conversationId: string;
  uploadId: string;
  fileId: string;
  filename: string;
  mimeType: string;
  size: number;
  hasExcerpt: boolean;  // false if extraction failed
}
```

### UI Behavior on Failure

| `hasExcerpt` | UI Display | Context Injection |
|--------------|------------|-------------------|
| `true` | "Attached ✓" | Uses stored excerpt |
| `false` | "Attached ✓" (same) | Falls back to S3 re-read or empty |

**User doesn't see extraction failure** - file is still attached and usable.

### Acceptance Criteria

- [ ] `file_attached` always emits after storage (even if extraction fails)
- [ ] `hasExcerpt: false` indicates no excerpt available
- [ ] UI treats both cases as "Attached" (no error shown)
- [ ] Context injection has fallback for missing excerpt

---

## Story 18.0.4: Processing Trigger Decision

**Goal:** Determine when parsing/scoring should start - on upload (auto) or on send (explicit).

### Current Behavior (Problems)

```
Upload → Auto-parse (~2min) → Auto-score (~2min) → Chip clears
         ↑ stuck in composer the whole time
         ↑ user cannot add message with upload
         ↑ ~4 min total silent wait
```

### Options

| Option | UX | Risk |
|--------|-----|------|
| **A: Keep auto-trigger** | Fewer clicks | Wasted compute, no message with file, ~4min composer block |
| **B: Trigger on send** | GPT-style UX | Requires guardrails (see below) |
| **C: Confirmation dialog** | Extra click | Friction on happy path |

### Decision: Trigger on Send (Option B) ✅

**New Flow:**

```
Upload → Store + excerpt (~3s) → file_attached → "Attached" (chip ready)
User types optional message → clicks Send → composer clears
Processing starts → progress in CHAT → results delivered in chat
```

**Rationale:**
- GPT/Claude.ai style UX (attach, optionally message, send)
- User can add context ("Focus on security dimensions")
- Upload feels instant (~3s vs ~4min)
- Progress moves to chat, not stuck in composer
- User has control over when compute happens

### Required Guardrails

| Guardrail | Why Required | Sprint |
|-----------|--------------|--------|
| **file_attached event** | Delivers fileId to client; without it, send fails | 1A |
| **attached stage** | Clears "in-flight" state; without it, UI hangs | 1B |
| **Excerpt persistence** | Enables immediate context on send | 1A |
| **Idempotency (parseStatus)** | Prevents duplicate processing on retry/resend | 1A |
| **Event contract** | Must still emit upload_progress/*_ready from send handler | 2 |
| **Feature flag** | Back-compat for existing clients expecting auto-parse | 3 |
| **Progress in chat** | User sees activity during processing, not silent wait | 2 |

### Mode-Specific Behavior

| Mode | On Send | Response Timing |
|------|---------|-----------------|
| **Assessment** | Inject excerpt → respond immediately; enqueue enrichment in background | Fast |
| **Consult** | Inject excerpt → respond immediately (Q&A about document) | Fast |
| **Scoring** | Trigger parse+score → show progress in chat → deliver score | ~2min but visible progress |

### Acceptance Criteria

- [ ] Decision: Trigger on send (not auto-trigger)
- [ ] Guardrails documented and assigned to sprints
- [ ] Mode-specific behavior defined
- [ ] Feature flag strategy defined for back-compat

---

## Sprint 0 Outputs

### Decision Summary

```markdown
## Sprint 0 Decisions

### D1: Text Extraction
- **Works:** Yes, pdf-parse and mammoth functional
- **Latency:** ~100-500ms typical, <3s for large files
- **Scanned PDFs:** Return empty (expected, no OCR)

### D2: Storage Strategy
- **Decision:** Database column (`text_excerpt TEXT`)
- **Rationale:** Simplest, sufficient for MVP
- **Migration path:** S3 sidecar if bloat becomes issue

### D3: Extraction Failure
- **Decision:** Always emit `file_attached`, set `hasExcerpt: false`
- **UI:** Shows "Attached" regardless (no error)
- **Context:** Falls back to S3 re-read or empty string

### D4: Processing Trigger
- **Decision:** Trigger on send (not auto-trigger)
- **Rationale:** GPT-style UX, user can add message, fast attach (~3s)
- **Guardrails:** file_attached, attached stage, excerpt, idempotency, event contract, feature flag
- **Mode behavior:**
  - Assessment/Consult: excerpt-first immediate response
  - Scoring: progress in chat during processing
```

---

## Deferred to Implementation Sprints

The following are **not in scope** for Sprint 0:

| Item | Reason | When |
|------|--------|------|
| P50/P95 benchmarks | Overkill for spike | Sprint 1A if needed |
| Formal event contracts | Implementation detail | Sprint 1A/1B |
| Privacy/retention policy | Organizational concern | Post-MVP |
| Environment capture | Not blocking | Sprint 1A |
| Legacy file backfill | Implementation detail | Sprint 2 |

---

## Exit Criteria

Sprint 0 is complete when:

- [ ] Text extraction verified working (pdf-parse, mammoth)
- [ ] Storage decision made (DB column)
- [ ] Failure behavior defined (`hasExcerpt: false`)
- [ ] Processing trigger decided (trigger on send)
- [ ] Guardrails identified and assigned to sprints
- [ ] Mode-specific behavior defined
- [ ] Decisions documented in this file
- [ ] Sprint 1A, 1B, 2, and 3 are unblocked
