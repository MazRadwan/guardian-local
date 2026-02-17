# Sprint 6: Frontend Types & Components

**Epic:** 38 - ISO Export + UI Enrichment
**Focus:** Add ISO/confidence types to frontend, create ConfidenceBadge component, enrich DimensionScoreBar
**Stories:** 38.6.1 - 38.6.4 (4 stories)
**Dependencies:** Sprint 2 complete (backend types defined -- frontend mirrors them)
**Agents:** `frontend-agent`

---

## Context

The frontend currently displays dimension scores via `ScoringResultCard -> ScoreDashboard -> DimensionScoreBar`. The backend already returns ISO data in `dimensionScores[].findings` (from Epic 37). The frontend types need to be updated to include these fields, then components enriched to display them.

Data flows: `fetchScoringResult()` -> `ScoringCompletePayload['result']` -> `ScoringResultData` -> `ScoreDashboard` -> `DimensionScoreBar`.

---

## Stories

| Story | Name | Focus | Dependencies |
|-------|------|-------|--------------|
| **38.6.1** | Frontend scoring types enrichment | Add ISO/confidence fields to frontend DimensionScoreData | None |
| **38.6.2** | ConfidenceBadge component | Reusable H/M/L badge with tooltip | None |
| **38.6.3** | DimensionScoreBar ISO enrichment | Add confidence badge + ISO clause count to score bar | 38.6.1, 38.6.2 |
| **38.6.4** | Update ScoringResultData type | Add findings with ISO to ScoringResultData flow | 38.6.1 |

---

## Dependency Graph

```
    File Overlap Analysis:
    +----------+--------------------------------------------------------+--------------------+
    | Story    | Files Touched                                          | Conflicts          |
    +----------+--------------------------------------------------------+--------------------+
    | 38.6.1   | apps/web/src/types/scoring.ts (MODIFY)                 | None               |
    +----------+--------------------------------------------------------+--------------------+
    | 38.6.2   | apps/web/src/components/chat/ConfidenceBadge.tsx (NEW)  | None               |
    +----------+--------------------------------------------------------+--------------------+
    | 38.6.3   | apps/web/src/components/chat/DimensionScoreBar.tsx      | None               |
    |          | (MODIFY)                                               |                    |
    +----------+--------------------------------------------------------+--------------------+
    | 38.6.4   | apps/web/src/types/scoring.ts (MODIFY)                 | 38.6.1             |
    |          | apps/web/src/components/chat/ChatMessage.tsx (MODIFY)  |                    |
    |          | apps/web/src/components/chat/DownloadButton.tsx (MODIFY)|                    |
    |          | apps/web/src/components/chat/ScoringResultCard.tsx     |                    |
    |          | (MODIFY)                                               |                    |
    +----------+--------------------------------------------------------+--------------------+
```

---

## Execution Strategy

**Execution order:** `38.6.1 -> (38.6.2 parallel with 38.6.4) -> 38.6.3`

```
+-------------------------------------------------------------------------+
|  Step 1: 38.6.1 - Frontend Types Enrichment (SEQUENTIAL)               |
|  FILES: types/scoring.ts (MODIFY)                                       |
+------------------------------------+------------------------------------+
|  Step 2: RUN IN PARALLEL (no file overlap)                              |
+------------------------------------+------------------------------------+
|   38.6.2                           |   38.6.4                           |
|   ConfidenceBadge Component        |   ScoringResultData Type Update    |
|                                    |                                    |
|   FILES:                           |   FILES:                           |
|   ConfidenceBadge.tsx (NEW)        |   types/scoring.ts (MODIFY)        |
|                                    |   ChatMessage.tsx (MODIFY)         |
|                                    |   DownloadButton.tsx (MODIFY)      |
|                                    |   ScoringResultCard.tsx (MODIFY)   |
|                                    |                                    |
|   Needs: 38.6.1 (types)           |   Needs: 38.6.1 (types)            |
+------------------------------------+------------------------------------+
|  Step 3: 38.6.3 - DimensionScoreBar Enrichment (SEQUENTIAL)            |
|  FILES: DimensionScoreBar.tsx (MODIFY)                                  |
|  Needs: 38.6.1 (types) + 38.6.2 (ConfidenceBadge)                     |
+-------------------------------------------------------------------------+
```

**Why this order:** 38.6.3 and 38.6.4 both depend on 38.6.1. 38.6.4 adds ScoringResultData-level fields to `types/scoring.ts` (different from 38.6.1's DimensionScoreData-level fields), so 38.6.4 runs after 38.6.1 to avoid merge conflicts. 38.6.2 (new file) has no conflicts and can run in parallel with 38.6.4. 38.6.3 needs both types and ConfidenceBadge, so it runs last.

---

## Story Files

| Story | File | Agent |
|-------|------|-------|
| 38.6.1 | `sprint-6-story-1.md` | frontend-agent |
| 38.6.2 | `sprint-6-story-2.md` | frontend-agent |
| 38.6.3 | `sprint-6-story-3.md` | frontend-agent |
| 38.6.4 | `sprint-6-story-4.md` | frontend-agent |

---

## Exit Criteria

Sprint 6 is complete when:
- [ ] Frontend `DimensionScoreData` type includes findings with ISO/confidence
- [ ] `ScoringResultData` passes findings through to components
- [ ] `ConfidenceBadge` component renders H/M/L with tooltip rationale
- [ ] `DimensionScoreBar` shows confidence badge and ISO clause count
- [ ] All frontend tests pass
- [ ] No TypeScript errors
- [ ] Browser QA passed
