# Sprint 7 Pre-Implementation Audit Report

**Epic:** 38 - ISO Export + UI Enrichment
**Sprint:** 7 - Frontend ISO Sections & Labels
**Auditors:** 3 parallel Explore agents (cascade chain, file boundaries, spec assumptions)
**Date:** 2026-02-13

---

## Executive Summary

All 3 story specs are **technically sound**. ChevronDown/ChevronUp already imported in ScoringResultCard. DownloadButton already supports `format: 'excel'` with correct URL building. Existing collapsible pattern provides perfect template. **No blockers.** ScoringResultCard will reach ~267 LOC after all stories — safe under 300.

**Verdict: READY FOR IMPLEMENTATION**

---

## Key Findings

### CONFIRMED: ScoringResultCard Already Has Collapsible Pattern (Story 38.7.1)

| File | Lines | Pattern |
|------|-------|---------|
| ScoringResultCard.tsx | 4 | `import { ChevronDown, ChevronUp, BarChart3 } from 'lucide-react'` |
| ScoringResultCard.tsx | 110 | Executive Summary uses `isExpanded` state |
| ScoringResultCard.tsx | 145 | Dimension Scores uses separate `isExpanded` state |
| ScoringResultCard.tsx | 207-218 | Collapsible toggle button + conditional render pattern |

**NOTE:** Two `isExpanded` states already exist (in nested components). New ISO section must use `isISOExpanded` to avoid collision.

### CONFIRMED: DownloadButton Already Supports Excel (Story 38.7.3)

| File | Lines | Feature |
|------|-------|---------|
| DownloadButton.tsx | 11 | `format: 'pdf' \| 'word' \| 'excel'` type |
| DownloadButton.tsx | 69-71 | URL: `${apiUrl}/api/export/scoring/${assessmentId}/${format}` |
| DownloadButton.tsx | 119 | Extension: `format === 'excel' ? 'xlsx' : ...` |
| DownloadButton.tsx | 146 | Label: `excel: 'Excel'` |
| DownloadButton.tsx | 163 | TestID: `data-testid={`download-${format}`}` |

**Story 38.7.3 only adds 7 LOC** (one more DownloadButton instance in ScoringResultCard).

### NOTE: GUARDIAN_NATIVE_DIMENSIONS Duplication

Already in DimensionScoreBar.tsx (lines 7-12). Story 38.7.2 adds same constant to ScoreDashboard.tsx. Also in ISOAlignmentSection spec's DIMENSION_LABELS. Three locations total — acceptable for stable constant, flag for future shared constants file.

---

## All Spec Assumptions Verified

| Assumption | Status | Evidence |
|-----------|--------|----------|
| ISOClauseReference has clauseRef, title, framework, status | CORRECT | types/scoring.ts:42-47 |
| Status is union: 'aligned' \| 'partial' \| 'not_evidenced' \| 'not_applicable' | CORRECT | types/scoring.ts:46 |
| ScoringResultCard receives `result: ScoringResultData` | CORRECT | ScoringResultCard.tsx:11 interface |
| ScoringResultCard uses result.dimensionScores | CORRECT | ScoringResultCard.tsx:220 |
| ChevronDown/ChevronUp already imported | CORRECT | ScoringResultCard.tsx:4 |
| ScoringResultCard has collapsible pattern | CORRECT | Lines 110, 145, 207-218 |
| ScoringResultCard at 244 LOC | CORRECT | `wc -l` verified |
| ScoreDashboard at 89 LOC | CORRECT | `wc -l` verified |
| ScoreDashboard groups into riskDimensions/capabilityDimensions | CORRECT | Lines 35-40 |
| DIMENSION_CONFIG matches spec's DIMENSION_LABELS | CORRECT | Same 10 dimensions |
| DownloadButton supports format='excel' | CORRECT | Lines 11, 69-71, 119, 146 |
| DownloadButton has batchId prop | CORRECT | Lines 13, 74-76 |
| DownloadButton uses data-testid="download-{format}" | CORRECT | Line 163 |
| batchId already passed from ScoringResultCard | CORRECT | Lines 229, 236 |
| ScoringResultCard.test.tsx exists | CORRECT | 7 tests (from Codex fix) |
| ScoreDashboard.test.tsx does NOT exist | CORRECT | Must create |
| ISOAlignmentSection.tsx does NOT exist | CORRECT | Must create |

---

## File State & LOC Projections

| File | Type | Current LOC | Sprint 7 Change | Projected LOC | Status |
|------|------|------------|-----------------|---------------|--------|
| ISOAlignmentSection.tsx | CREATE | — | +147 | 147 | SAFE |
| ScoringResultCard.tsx | MODIFY | 244 | +23 (ISO section + Excel btn) | ~267 | SAFE |
| ScoreDashboard.tsx | MODIFY | 89 | +15 | ~104 | SAFE |
| DownloadButton.tsx | NO CHANGE | 188 | 0 | 188 | N/A |

---

## Cross-Story File Collision Check

| File | 38.7.1 | 38.7.2 | 38.7.3 | Conflict? |
|------|--------|--------|--------|-----------|
| ScoringResultCard.tsx | Add ISO section (lines ~188-205) | Not touched | Add Excel button (line ~241) | YES (same file, different sections) |
| ScoreDashboard.tsx | Not touched | Add labels | Not touched | NO |
| ISOAlignmentSection.tsx | Create | Not touched | Not touched | NO |

**38.7.1 and 38.7.3 conflict on ScoringResultCard.tsx** — must run sequentially (38.7.1 first).

---

## Execution Order

```
Story 38.7.1 (ISOAlignmentSection + ScoringResultCard)  ||  Story 38.7.2 (ScoreDashboard)
    |                                                         |
    +-- PARALLEL (no file overlap)                           +-- PARALLEL
    |
    v
Story 38.7.3 (ScoringResultCard - Excel button)
    |
    +-- MUST WAIT for 38.7.1 (file overlap)
```

---

## Test Coverage

### Existing Tests
| Component | Test File | Tests |
|-----------|----------|-------|
| ScoringResultCard | YES (7 tests) | batchId, scores, buttons |
| ScoreDashboard | NO | Must create |
| ISOAlignmentSection | NO | Must create (new component) |

### Sprint 7 Test Requirements
- **38.7.1**: ~6 tests (empty data, framework grouping, dedup, status badges, dimension labels, testid)
- **38.7.2**: ~4 tests (risk label, capability label, testid, text content)
- **38.7.3**: ~3 tests (Excel button presence, all 3 buttons, correct format)

---

## Implementation Recommendations

1. **Use frontend-agent** for all 3 stories
2. **Phase 1**: 38.7.1 + 38.7.2 in parallel (no file overlap)
3. **Phase 2**: 38.7.3 after 38.7.1 completes
4. **Use `isISOExpanded`** not `isExpanded` (already used twice in ScoringResultCard)
5. **Copy collapsible pattern** from Dimension Scores section (lines 207-218)
6. **Projected total LOC change**: ~185 LOC added across 3 frontend files
