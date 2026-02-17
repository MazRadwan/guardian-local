# Sprint 7: Frontend ISO Sections & Labels

**Epic:** 38 - ISO Export + UI Enrichment
**Focus:** ISO alignment section in ScoringResultCard, Guardian-native labels, Excel download button
**Stories:** 38.7.1 - 38.7.3 (3 stories)
**Dependencies:** Sprint 6 complete (frontend types and components ready)
**Agents:** `frontend-agent`

---

## Context

With Sprint 6's types and components in place, this sprint adds higher-level UI features:
1. An ISO Standards Alignment collapsible section in `ScoringResultCard` listing clause statuses
2. Guardian-native dimension labels in `ScoreDashboard`
3. An Excel download button next to the existing PDF/Word buttons

---

## Stories

| Story | Name | Focus | Dependencies |
|-------|------|-------|--------------|
| **38.7.1** | ISO Alignment Section in ScoringResultCard | Collapsible section listing ISO clauses with status | None |
| **38.7.2** | Guardian-native dimension labels in ScoreDashboard | Subtle label for Guardian-native dimensions | None |
| **38.7.3** | Excel download button in ScoringResultCard | Add Excel DownloadButton to export actions | None |

---

## Dependency Graph

```
    File Overlap Analysis:
    +----------+--------------------------------------------------------+--------------------+
    | Story    | Files Touched                                          | Conflicts          |
    +----------+--------------------------------------------------------+--------------------+
    | 38.7.1   | ScoringResultCard.tsx (MODIFY)                          | 38.7.3             |
    |          | ISOAlignmentSection.tsx (NEW)                           |                    |
    +----------+--------------------------------------------------------+--------------------+
    | 38.7.2   | ScoreDashboard.tsx (MODIFY)                             | None               |
    +----------+--------------------------------------------------------+--------------------+
    | 38.7.3   | ScoringResultCard.tsx (MODIFY - export actions)         | 38.7.1             |
    +----------+--------------------------------------------------------+--------------------+
```

---

## Parallel Execution Strategy

### Phase 1: Independent Work (1 story)

```
+-------------------------------------------------------------------------+
|                     PHASE 1 - RUN IN PARALLEL                           |
+------------------------------------+------------------------------------+
|   38.7.1                           |   38.7.2                           |
|   ISO Alignment Section            |   Guardian-Native Labels           |
|                                    |                                    |
|   FILES:                           |   FILES:                           |
|   ScoringResultCard.tsx            |   ScoreDashboard.tsx               |
|   ISOAlignmentSection.tsx (NEW)    |                                    |
|                                    |                                    |
|   frontend-agent                   |   frontend-agent                   |
+------------------------------------+------------------------------------+
```

### Phase 2: Depends on 38.7.1 (file overlap)

```
+-------------------------------------------------------------------------+
|                     PHASE 2 - SEQUENTIAL                                |
|              (Depends on 38.7.1 for ScoringResultCard.tsx)             |
+-------------------------------------------------------------------------+
|   38.7.3                                                                |
|   Excel Download Button                                                 |
|                                                                         |
|   FILES:                                                                |
|   ScoringResultCard.tsx (MODIFY - add Excel DownloadButton)             |
|                                                                         |
|   MUST wait for 38.7.1 (both modify ScoringResultCard.tsx)              |
|   frontend-agent                                                        |
+-------------------------------------------------------------------------+
```

---

## Story Files

| Story | File | Agent |
|-------|------|-------|
| 38.7.1 | `sprint-7-story-1.md` | frontend-agent |
| 38.7.2 | `sprint-7-story-2.md` | frontend-agent |
| 38.7.3 | `sprint-7-story-3.md` | frontend-agent |

---

## Exit Criteria

Sprint 7 is complete when:
- [ ] ISO Alignment section visible in ScoringResultCard (collapsible)
- [ ] Guardian-native dimensions have subtle label in ScoreDashboard
- [ ] Excel download button appears next to PDF/Word buttons
- [ ] All frontend tests pass
- [ ] No TypeScript errors
- [ ] Browser QA passed
