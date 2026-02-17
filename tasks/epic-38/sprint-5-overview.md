# Sprint 5: Excel Export Creation

**Epic:** 38 - ISO Export + UI Enrichment
**Focus:** Create new ScoringExcelExporter with ISO mapping sheet and confidence column
**Stories:** 38.5.1 - 38.5.3 (3 stories)
**Dependencies:** Sprint 1 complete (ScoringExportService split) + Sprint 2 complete (ScoringExportData has ISO fields)

> **Note:** Sprint 1 splits ScoringExportService.ts from 436 LOC. Sprint 5 Story 38.5.3 modifies this file. Without Sprint 1, this violates the 300 LOC limit.
**Agents:** `export-agent` | `backend-agent`

---

## Context

No `ScoringExcelExporter` exists. The existing `ExcelExporter` handles questionnaire exports only. This sprint creates a new scoring Excel exporter from scratch following the same interface pattern. The Excel workbook has 2 sheets:
1. **Scoring Summary** - Dimension scores with confidence and ISO clause count
2. **ISO Control Mapping** - Detailed ISO clause alignments per dimension

Can run in parallel with Sprints 3 and 4 (no file overlap).

---

## Stories

| Story | Name | Focus | Dependencies |
|-------|------|-------|--------------|
| **38.5.1** | IScoringExcelExporter interface + scoring sheet | Interface + first worksheet (dimension scores) | None |
| **38.5.2** | ISO Control Mapping sheet | Second worksheet with detailed clause alignments | 38.5.1 |
| **38.5.3** | Wire Excel into export service + controller | DI wiring, controller route, DownloadButton format | 38.5.1 |

---

## Dependency Graph

```
    File Overlap Analysis:
    +----------+--------------------------------------------------------+--------------------+
    | Story    | Files Touched                                          | Conflicts          |
    +----------+--------------------------------------------------------+--------------------+
    | 38.5.1   | IScoringExcelExporter.ts (NEW)                         | None               |
    |          | ScoringExcelExporter.ts (NEW)                          |                    |
    +----------+--------------------------------------------------------+--------------------+
    | 38.5.2   | ScoringExcelExporter.ts (MODIFY - add sheet)           | 38.5.1             |
    +----------+--------------------------------------------------------+--------------------+
    | 38.5.3   | ScoringExportService.ts (MODIFY - add exportToExcel)   | None               |
    |          | ScoringExportController.ts (MODIFY - add route)        |                    |
    |          | container.ts (MODIFY - wire new exporter)               |                    |
    +----------+--------------------------------------------------------+--------------------+
```

---

## Parallel Execution Strategy

### Phase 1: Interface + Scoring Sheet (1 story)

```
+-------------------------------------------------------------------------+
|                     PHASE 1 - SEQUENTIAL                                |
+-------------------------------------------------------------------------+
|   38.5.1                                                                |
|   IScoringExcelExporter Interface + Scoring Summary Sheet               |
|                                                                         |
|   FILES:                                                                |
|   - IScoringExcelExporter.ts (NEW)                                      |
|   - ScoringExcelExporter.ts (NEW)                                       |
|                                                                         |
|   export-agent                                                          |
+-------------------------------------------------------------------------+
```

### Phase 2: ISO Sheet + Wiring (2 stories in parallel)

```
+-------------------------------------------------------------------------+
|                     PHASE 2 - RUN IN PARALLEL                           |
|           (No file overlap between these stories)                       |
+------------------------------------+------------------------------------+
|   38.5.2                           |   38.5.3                           |
|   ISO Control Mapping Sheet        |   Wire Export Service + Route      |
|                                    |                                    |
|   FILES:                           |   FILES:                           |
|   ScoringExcelExporter.ts          |   ScoringExportService.ts          |
|   (MODIFY - add sheet)             |   ScoringExportController.ts       |
|                                    |   container.ts                     |
|                                    |                                    |
|   export-agent                     |   backend-agent                    |
+------------------------------------+------------------------------------+
```

**Note:** 38.5.2 and 38.5.3 both depend on 38.5.1 but do not overlap with each other. 38.5.3 only needs the interface (from 38.5.1), not the ISO sheet.

---

## Story Files

| Story | File | Agent |
|-------|------|-------|
| 38.5.1 | `sprint-5-story-1.md` | export-agent |
| 38.5.2 | `sprint-5-story-2.md` | export-agent |
| 38.5.3 | `sprint-5-story-3.md` | backend-agent |

---

## Exit Criteria

Sprint 5 is complete when:
- [ ] `IScoringExcelExporter` interface exists
- [ ] `ScoringExcelExporter` generates workbook with 2 sheets
- [ ] Scoring Summary sheet has dimension scores, confidence, ISO clause counts
- [ ] ISO Control Mapping sheet lists all clauses with status and dimensions
- [ ] `ScoringExportService.exportToExcel()` works
- [ ] `GET /api/export/scoring/:assessmentId/excel` route serves Excel file
- [ ] DI container wires the new exporter
- [ ] All tests pass
- [ ] No TypeScript errors
