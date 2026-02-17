# Sprint 1: Regex Extraction Engine

**Epic:** 39 - Scoring Pipeline Optimization
**Focus:** Build regex-based answer extraction for Guardian-generated questionnaires (saves ~5 min per scoring run)
**Stories:** 39.1.1 - 39.1.5 (5 stories)
**Dependencies:** None (Sprint 1 is the entry point)
**Agents:** `backend-agent`

---

## Context

The scoring pipeline takes ~7 minutes. The biggest bottleneck is Stage 2: `DocumentParserService.parseForResponses()` sends ~100K chars to Claude for Q&A extraction (~5 min). For Guardian-generated documents, the format is deterministic (controlled by `WordExporter.ts`) and questions exist in the DB. Regex extraction replaces the Claude call with sub-second pattern matching.

**Strategy: Two-tier extraction behind feature flag `ENABLE_REGEX_EXTRACTION`:**
1. **Tier 1 -- Regex (fast path, <1 sec):** For Guardian docs with standard format
2. **Tier 2 -- Claude (fallback, ~5 min):** For Guardian docs where regex confidence fails
3. **Non-Guardian documents:** Rejected (existing behavior, unchanged)

**Output contract:** Both tiers produce identical `ScoringParseResult` shape.

---

## 300 LOC Rule: No Net Growth in Oversized Files

**HARD RULE (Codex governance finding):** `DocumentParserService.ts` is at 784 LOC (2.6x over the 300 LOC limit). Until Sprint 4 splits land, the following constraint applies:

- **No net LOC growth** in `DocumentParserService.ts`. If you add lines, you must remove at least as many.
- **New logic MUST go in new modules only.** Story 39.1.4 wires in `RegexResponseExtractor`, `ExtractionConfidenceCalculator`, and `DocxImageDetector` — all new files. The routing code in `DocumentParserService.ts` should be a thin dispatch (if/else + function calls), not inline logic.
- **Enforcement:** Code review MUST verify net LOC delta <= 0 for this file.

This is not a suggestion. Sprint 4 (Story 39.4.1/39.4.2) will properly split this file.

---

## Stories

| Story | Name | Focus | Dependencies |
|-------|------|-------|--------------|
| **39.1.1** | RegexResponseExtractor core | Regex extraction logic with text preprocessing | None |
| **39.1.2** | Composite confidence scoring | Confidence calculator with 4 checks | None |
| **39.1.3** | Image detection for docx | Dual mammoth extraction to flag visual content | None |
| **39.1.4** | Extraction routing in DocumentParserService | Wire regex into parseForResponses with feature flag | 39.1.1, 39.1.2 |
| **39.1.5** | Contract test and integration | Verify regex output matches ScoringParseResult contract | 39.1.4 |

---

## Dependency Graph

```
    File Overlap Analysis:
    +----------+---------------------------------------------------+--------------------+
    | Story    | Files Touched                                     | Conflicts          |
    +----------+---------------------------------------------------+--------------------+
    | 39.1.1   | RegexResponseExtractor.ts (NEW)                   | 39.1.4             |
    |          | TextPreprocessor.ts (NEW)                         |                    |
    +----------+---------------------------------------------------+--------------------+
    | 39.1.2   | ExtractionConfidenceCalculator.ts (NEW)            | 39.1.4             |
    +----------+---------------------------------------------------+--------------------+
    | 39.1.3   | DocxImageDetector.ts (NEW)                        | 39.1.4             |
    +----------+---------------------------------------------------+--------------------+
    | 39.1.4   | DocumentParserService.ts (MODIFY)                 | 39.1.1,39.1.2,     |
    |          | RegexResponseExtractor.ts (IMPORT)                | 39.1.3             |
    |          | ExtractionConfidenceCalculator.ts (IMPORT)         |                    |
    |          | DocxImageDetector.ts (IMPORT)                     |                    |
    +----------+---------------------------------------------------+--------------------+
    | 39.1.5   | contract test file (NEW)                          | 39.1.4             |
    |          | integration test file (NEW)                       |                    |
    +----------+---------------------------------------------------+--------------------+
```

---

## Parallel Execution Strategy

### Phase 1: Independent Module Creation (3 stories in parallel)

```
+------------------------------------------------------------------------+
|                     PHASE 1 - RUN IN PARALLEL                          |
|             (No file overlap between these stories)                    |
+------------------------+------------------------+----------------------+
|   39.1.1               |   39.1.2               |   39.1.3             |
|   Regex Extractor      |   Confidence Calc      |   Image Detector     |
|   (NEW modules)        |   (NEW module)         |   (NEW module)       |
|                        |                        |                      |
|   FILES:               |   FILES:               |   FILES:             |
|   RegexResponse-       |   ExtractionConfidence-|   DocxImage-         |
|   Extractor.ts (NEW)   |   Calculator.ts (NEW)  |   Detector.ts (NEW)  |
|   TextPreprocessor.ts  |                        |                      |
|   (NEW)                |                        |                      |
|                        |                        |                      |
|   backend-agent        |   backend-agent        |   backend-agent      |
+------------------------+------------------------+----------------------+
```

**Stories:** 39.1.1, 39.1.2, 39.1.3
**Agents needed:** Up to 3 (all backend-agent)
**File overlap:** None -- each story creates unique new files
**Review:** After all complete

---

### Phase 2: Wiring and Integration (sequential -- depends on Phase 1)

```
+------------------------------------------------------------------------+
|                     PHASE 2 - SEQUENTIAL                               |
|              (Depends on modules created in Phase 1)                   |
+------------------------------------------------------------------------+
|   39.1.4                                                               |
|   Extraction Routing                                                   |
|                                                                        |
|   FILES:                                                               |
|   - DocumentParserService.ts (MODIFY -- add routing logic)             |
|   - Imports RegexResponseExtractor.ts (from 39.1.1)                    |
|   - Imports ExtractionConfidenceCalculator.ts (from 39.1.2)            |
|   - Imports DocxImageDetector.ts (from 39.1.3)                         |
|                                                                        |
|   MUST wait for 39.1.1, 39.1.2, 39.1.3 to complete                    |
|                                                                        |
|   backend-agent                                                        |
+------------------------------------------------------------------------+
```

**Stories:** 39.1.4
**Agents needed:** 1
**Dependencies:** Requires Phase 1 complete (imports new modules)
**Review:** After complete

---

### Phase 3: Verification (sequential -- depends on Phase 2)

```
+------------------------------------------------------------------------+
|                     PHASE 3 - SEQUENTIAL                               |
|              (Depends on full routing from Phase 2)                    |
+------------------------------------------------------------------------+
|   39.1.5                                                               |
|   Contract Test + Integration                                          |
|                                                                        |
|   FILES:                                                               |
|   - RegexExtractor.contract.test.ts (NEW)                              |
|   - RegexExtractor.integration.test.ts (NEW)                           |
|                                                                        |
|   MUST wait for 39.1.4 (needs complete routing to test)                |
|                                                                        |
|   backend-agent                                                        |
+------------------------------------------------------------------------+
```

**Stories:** 39.1.5
**Agents needed:** 1
**Dependencies:** Requires Phase 2 complete (tests full pipeline path)
**Review:** After complete (Sprint done)

---

## Story Files

| Story | File | Agent |
|-------|------|-------|
| 39.1.1 | `sprint-1-story-1.md` | backend-agent |
| 39.1.2 | `sprint-1-story-2.md` | backend-agent |
| 39.1.3 | `sprint-1-story-3.md` | backend-agent |
| 39.1.4 | `sprint-1-story-4.md` | backend-agent |
| 39.1.5 | `sprint-1-story-5.md` | backend-agent |

---

## Exit Criteria

Sprint 1 is complete when:
- [ ] RegexResponseExtractor extracts Q&A from Guardian docx/pdf in <1 sec
- [ ] Composite confidence scoring validates extraction quality (4 checks)
- [ ] Image detection flags visual content in docx responses
- [ ] DocumentParserService routes: Guardian+confident -> regex, Guardian+low-confidence -> Claude fallback, non-Guardian -> reject
- [ ] Feature flag `ENABLE_REGEX_EXTRACTION` enables instant rollback
- [ ] Contract test verifies regex output matches `ScoringParseResult` interface
- [ ] All tests passing
- [ ] No TypeScript errors
- [ ] **Post-implementation review swarm passed** (3-reviewer mesh: line-by-line, data flow trace, architecture compliance)
- [ ] Review swarm findings addressed before Codex gate
