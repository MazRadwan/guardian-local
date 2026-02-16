# Sprint 6 Pre-Implementation Audit Report

**Epic:** 38 - ISO Export + UI Enrichment
**Sprint:** 6 - Frontend ISO Display
**Auditors:** 3 parallel Explore agents (cascade chain, file boundaries, spec assumptions)
**Date:** 2026-02-13

---

## Executive Summary

All 4 story specs are **technically sound** with correct component hierarchy, prop threading, and Tailwind v4 patterns. **Critical data flow bug confirmed**: `EmbeddedScoringResult` in ChatMessage.tsx strips `findings` from persisted scoring data (line 534-539). WebSocket payload types are stale. **Pre-existing LOC violation**: ChatMessage.tsx at 551 LOC.

**Verdict: READY FOR IMPLEMENTATION** (all issues are in-scope fixes for Sprint 6)

---

## Key Findings

### CRITICAL: EmbeddedScoringResult Strips Findings (Story 38.6.4 scope)

| File | Lines | Issue |
|------|-------|-------|
| ChatMessage.tsx | 534-539 | `dimensionScores.map()` only passes dimension, score, riskRating — discards findings |

**Current code strips ISO data when persisting scoring results.** Story 38.6.4 must add `findings: d.findings` to the map return object. Without this fix, all downstream ISO display (confidence badges, clause counts) will show nothing.

### CRITICAL: WebSocket Type Mismatch (Story 38.6.4 scope)

| File | Lines | Issue |
|------|-------|-------|
| websocket.ts | 240-244 | `ScoringCompletePayload.dimensionScores` has only 3 fields (dimension, score, riskRating) |

Frontend WebSocket type does not include `findings`. Backend sends full `DimensionScoreData` with findings. Story 38.6.4 must update the WebSocket type to use enriched `DimensionScoreData` from types/scoring.ts.

### CRITICAL: Frontend Types Stale (Story 38.6.1 scope)

| File | Current State | Required State |
|------|--------------|----------------|
| types/scoring.ts | DimensionScoreData has 3 fields | Must add optional `findings` with ISO enrichment |

Backend `DimensionScoreData` (domain/scoring/types.ts:23-45) already has `findings` with `assessmentConfidence` and `isoClauseReferences`. Frontend type must mirror this.

### PRE-EXISTING: ChatMessage.tsx LOC Violation

| File | Current LOC | After Sprint 6 | Limit |
|------|-------------|----------------|-------|
| ChatMessage.tsx | 551 | 552 | 300 |

Sprint 6 adds only 1 line. This is a pre-existing violation, not caused by Sprint 6. Flag for future refactor (extract embedded renderers to separate files).

---

## All Spec Assumptions Verified

| Assumption | Status | Evidence |
|-----------|--------|----------|
| DimensionScoreData exists in types/scoring.ts | CORRECT | types/scoring.ts:34-38 |
| ScoringResultData exists with expected structure | CORRECT | types/scoring.ts:40-49 |
| DimensionScoreData currently lacks findings field | CORRECT | Only has dimension, score, riskRating |
| DimensionScoreBar.tsx has label, score, riskRating, type props | CORRECT | DimensionScoreBar.tsx:6-11 |
| ScoringResultCard renders ScoreDashboard with dimensionScores | CORRECT | ScoringResultCard.tsx:220 |
| DownloadButton has assessmentId, format, exportType props | CORRECT | DownloadButton.tsx:9-15 |
| DownloadButton lacks batchId prop | CORRECT | Not in interface |
| ChatMessage uses EmbeddedScoringResult handler | CORRECT | ChatMessage.tsx:135-149, 515-549 |
| EmbeddedScoringResult strips findings | CORRECT | ChatMessage.tsx:534-539 |
| ScoreDashboard passes data to DimensionScoreBar | CORRECT | ScoreDashboard.tsx:52-59 |
| Existing tests use Jest + React Testing Library | CORRECT | ChatMessage.test.tsx, DownloadButton.test.tsx |
| Tailwind v4 patterns used (no config file) | CORRECT | All components use v4 class syntax |
| No ConfidenceBadge component exists yet | CORRECT | Must create from scratch |
| Backend DimensionScoreData has findings with ISO fields | CORRECT | domain/scoring/types.ts:23-45 |

---

## File State & LOC Projections

| File | Type | Current LOC | Sprint 6 Change | Projected LOC | Status |
|------|------|------------|-----------------|---------------|--------|
| types/scoring.ts | MODIFY | 50 | +30 | 80 | SAFE (type file exempt) |
| ConfidenceBadge.tsx | CREATE | — | +70 | 70 | SAFE |
| DimensionScoreBar.tsx | MODIFY | 52 | +38 | 90 | SAFE |
| ScoreDashboard.tsx | MODIFY | 86 | +8 | 94 | SAFE |
| ChatMessage.tsx | MODIFY | 551 | +1 | 552 | PRE-EXISTING VIOLATION |
| ScoringResultCard.tsx | MODIFY | 242 | +2 | 244 | SAFE |
| DownloadButton.tsx | MODIFY | 182 | +4 | 186 | SAFE |
| websocket.ts | MODIFY | ~1000 | +1 | ~1000 | TYPE CHANGE ONLY |

---

## Component Data Flow Cascade

```
Backend DimensionScoreData with findings (ISO + confidence)
    |
WebSocket scoring_complete event
    |  ScoringCompletePayload.result.dimensionScores[]
    v
ChatMessage.tsx - EmbeddedScoringResult (line 515)
    |  BUG: Line 535-539 discards findings -> FIX in 38.6.4
    v
ScoringResultCard.tsx (line ~545)
    |  Passes batchId to DownloadButton (38.6.4)
    |  Passes dimensionScores to ScoreDashboard
    v
ScoreDashboard.tsx
    |  Passes dimension + findings to DimensionScoreBar (38.6.3)
    v
DimensionScoreBar.tsx
    |  Renders ConfidenceBadge + ISO clause count (38.6.3)
    v
ConfidenceBadge.tsx (NEW - 38.6.2)
    |  Color-coded badge (H/M/L) + tooltip with rationale
```

---

## Backend/Frontend Type Alignment

| Type | Backend (domain/) | Frontend (types/scoring.ts) | Status |
|------|------------------|---------------------------|--------|
| AssessmentConfidenceLevel | `'high' \| 'medium' \| 'low'` | Must add | MISSING |
| AssessmentConfidence | `{ level, rationale }` | Must add | MISSING |
| ISOClauseReference | `{ clauseRef, title, framework, status }` | Must add | MISSING |
| DimensionScoreData.findings | Full structure with ISO fields | Must extend | MISSING |

All will be exact mirrors of backend types. Story 38.6.1 addresses all of these.

---

## Cross-Sprint File Collision Check

### Sprint 6 vs Sprint 4/5
| Sprint 6 File | Sprint 4 | Sprint 5 | Conflict? |
|--------------|----------|---------|-----------|
| types/scoring.ts | Not touched | Not touched | NO |
| ChatMessage.tsx | Not touched | Not touched | NO |
| DimensionScoreBar.tsx | Not touched | Not touched | NO |
| DownloadButton.tsx | Not touched | Not touched | NO |

**Zero conflicts** with Sprint 4 or 5. Safe for parallel execution.

### Sprint 6 vs Sprint 7 (FUTURE)
| File | Sprint 6 | Sprint 7 | Conflict? |
|------|----------|---------|-----------|
| ScoringResultCard.tsx | 38.6.4 modifies export section | 38.7.1, 38.7.3 modify same area | **YES** |
| ScoreDashboard.tsx | 38.6.3 adds props | 38.7.2 modifies JSX | **YES** |

**Sprint 7 MUST wait for Sprint 6 to complete.**

---

## Execution Order & Parallelization

```
Story 38.6.1 (types/scoring.ts)
    |
    +-- MUST COMPLETE FIRST (all other stories depend on types)
    |
    v
Story 38.6.2 (ConfidenceBadge.tsx)  ||  Story 38.6.4 (ChatMessage + DownloadButton + ScoringResultCard)
    |                                     |
    +-- CREATE new component              +-- Fix findings pass-through + batchId
    |                                     |
    +-- NO FILE OVERLAP                   +-- NO FILE OVERLAP
    |
    v
Story 38.6.3 (DimensionScoreBar + ScoreDashboard)
    |
    +-- DEPENDS ON 38.6.1 (types) + 38.6.2 (ConfidenceBadge exists)
```

---

## Test Coverage Analysis

### Existing Tests
| Component | Test File Exists? | Current Tests |
|-----------|------------------|---------------|
| ChatMessage | YES | 100+ lines |
| DownloadButton | YES | 100+ lines |
| ScoringResultCard | NO | Need to create |
| DimensionScoreBar | NO | Need to create |
| ScoreDashboard | NO | Need to create |
| ConfidenceBadge | NO | Need to create (new component) |

### Sprint 6 Test Requirements
- **38.6.1**: TypeScript compilation check only
- **38.6.2**: ~9 tests (H/M/L rendering, null handling, tooltip hover)
- **38.6.3**: ~7 tests (confidence badge render, ISO count, Guardian-native skip)
- **38.6.4**: Extend existing tests (findings pass-through, batchId URL param)

---

## Backward Compatibility

All changes are backward compatible:
- `DimensionScoreData.findings` is optional (`?`)
- `DimensionScoreBar` dimension/findings props are optional
- `ConfidenceBadge` returns null for missing confidence
- `DownloadButton` batchId is optional
- Pre-Epic-37 assessments display correctly without ISO data

---

## Implementation Recommendations

1. **Use frontend-agent** for all 4 stories (these are frontend files)
2. **Sequential core**: 38.6.1 first, then (38.6.2 || 38.6.4), then 38.6.3
3. **ChatMessage.tsx LOC violation**: Pre-existing, not Sprint 6 scope. Flag for post-epic refactor.
4. **Test priority**: ConfidenceBadge and DimensionScoreBar need new test files
5. **Projected total LOC change**: ~142 LOC added across 6 frontend files
