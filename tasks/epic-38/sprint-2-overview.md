# Sprint 2: Export Data & Narrative Enrichment

**Epic:** 38 - ISO Export + UI Enrichment
**Focus:** Enrich ScoringExportData with ISO fields, inject ISO context into narrative prompt, create messaging term list
**Stories:** 38.2.1 - 38.2.4 (4 stories)
**Dependencies:** Sprint 1 complete (files split to under 300 LOC)
**Agents:** `backend-agent`

---

## Context

With the over-limit files split, this sprint enriches the export data pipeline. The key changes:
1. `ScoringExportData` type gets ISO/confidence fields per dimension
2. `ScoringExportService.getScoringData()` populates those fields from `findings` JSONB
3. The narrative prompt gets ISO context injection so generated narratives reference ISO controls
4. A shared prohibited terms list is created for messaging compliance

Epic 37 already stores `assessmentConfidence` and `isoClauseReferences` in `dimensionScores.findings` JSONB. This sprint reads that data and passes it to exporters.

---

## Stories

| Story | Name | Focus | Dependencies |
|-------|------|-------|--------------|
| **38.2.1** | Enrich ScoringExportData type | Add ISO/confidence fields to export data interface | None |
| **38.2.2** | ScoringExportService ISO data population | Populate ISO fields from findings JSONB in getScoringData | 38.2.1 |
| **38.2.3** | Narrative prompt ISO injection | Add ISO context to system+user prompts for narrative generation | None |
| **38.2.4** | ISO messaging prohibited terms | Create shared term list for messaging compliance | None |

---

## Dependency Graph

```
    File Overlap Analysis:
    +----------+-------------------------------------------------------+--------------------+
    | Story    | Files Touched                                         | Conflicts          |
    +----------+-------------------------------------------------------+--------------------+
    | 38.2.1   | IScoringPDFExporter.ts (MODIFY - type)                | 38.2.2             |
    +----------+-------------------------------------------------------+--------------------+
    | 38.2.2   | ScoringExportService.ts (MODIFY)                      | None               |
    |          | ScoringExportService.test.ts (MODIFY)                 |                    |
    |          | ScoringQueryService.ts (MODIFY)                       |                    |
    |          | ScoringHandler.ts (MODIFY)                            |                    |
    |          | DocumentUploadController.ts (MODIFY)                  |                    |
    +----------+-------------------------------------------------------+--------------------+
    | 38.2.3   | exportNarrativeSystemPrompt.ts (MODIFY)               | None               |
    |          | exportNarrativeUserPrompt.ts (MODIFY)                 |                    |
    +----------+-------------------------------------------------------+--------------------+
    | 38.2.4   | isoMessagingTerms.ts (NEW)                            | None               |
    +----------+-------------------------------------------------------+--------------------+
```

---

## Parallel Execution Strategy

### Phase 1: Independent Work (3 stories in parallel)

```
+-------------------------------------------------------------------------+
|                     PHASE 1 - RUN IN PARALLEL                           |
|           (No file overlap between these stories)                       |
+------------------------+------------------------+-----------------------+
|   38.2.1               |   38.2.3               |   38.2.4              |
|   Export Data Type      |   Narrative ISO        |   Messaging Terms     |
|                        |                        |                       |
|   FILES:               |   FILES:               |   FILES:              |
|   IScoringPDFExporter  |   exportNarrative-     |   isoMessaging-       |
|   .ts (type only)      |   SystemPrompt.ts      |   Terms.ts (NEW)      |
|                        |   exportNarrative-     |                       |
|                        |   UserPrompt.ts        |                       |
|                        |                        |                       |
|   backend-agent        |   backend-agent        |   backend-agent       |
+------------------------+------------------------+-----------------------+
```

**Stories:** 38.2.1, 38.2.3, 38.2.4
**Agents needed:** Up to 3
**File overlap:** None
**Review:** After all complete

### Phase 2: Service Integration (depends on Phase 1)

```
+-------------------------------------------------------------------------+
|                     PHASE 2 - SEQUENTIAL                                |
|              (Depends on 38.2.1 for enriched type)                     |
+-------------------------------------------------------------------------+
|   38.2.2                                                                |
|   ScoringExportService ISO Data Population                              |
|                                                                         |
|   FILES:                                                                |
|   - ScoringExportService.ts (MODIFY)                                    |
|   - ScoringExportService.test.ts (MODIFY)                               |
|   - ScoringQueryService.ts (MODIFY - include findings in response)      |
|   - ScoringHandler.ts (MODIFY - include findings in WS payload)         |
|   - DocumentUploadController.ts (MODIFY - include findings in legacy    |
|     scoring path)                                                       |
|                                                                         |
|   MUST wait for 38.2.1 (uses enriched ScoringExportData type)          |
|                                                                         |
|   backend-agent                                                         |
+-------------------------------------------------------------------------+
```

**Stories:** 38.2.2
**Dependencies:** 38.2.1
**Review:** After complete (Sprint done)

---

## Story Files

| Story | File | Agent |
|-------|------|-------|
| 38.2.1 | `sprint-2-story-1.md` | backend-agent |
| 38.2.2 | `sprint-2-story-2.md` | backend-agent |
| 38.2.3 | `sprint-2-story-3.md` | backend-agent |
| 38.2.4 | `sprint-2-story-4.md` | backend-agent |

---

## Exit Criteria

Sprint 2 is complete when:
- [ ] `ScoringExportData` includes per-dimension ISO clause references and confidence data
- [ ] `ScoringExportService.getScoringData()` populates ISO fields from findings JSONB
- [ ] Narrative system prompt includes ISO context instructions
- [ ] Narrative user prompt includes ISO clause data per dimension
- [ ] Prohibited terms list exists with compliant alternatives
- [ ] All unit tests pass
- [ ] No TypeScript errors
