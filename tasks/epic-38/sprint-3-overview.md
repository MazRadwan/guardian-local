# Sprint 3: PDF Template Enrichment

**Epic:** 38 - ISO Export + UI Enrichment
**Focus:** Add ISO references, confidence badges, and Guardian-native labels to PDF report template
**Stories:** 38.3.1 - 38.3.3 (3 stories)
**Dependencies:** Sprint 2 complete (ScoringExportData has ISO fields)
**Agents:** `export-agent`

---

## Context

The PDF export uses an HTML template (`scoring-report.html`) rendered via Puppeteer. `ScoringPDFExporter.renderTemplate()` replaces template variables with data. With Sprint 2's enriched `ScoringExportData`, we can now render ISO data in the PDF. Changes are needed in both the HTML template (CSS + structure) and the exporter (template variable injection).

---

## Stories

| Story | Name | Focus | Dependencies |
|-------|------|-------|--------------|
| **38.3.1** | PDF dimension table ISO columns | Add confidence badge + ISO clause count columns to dimension table | None |
| **38.3.2** | PDF ISO alignment section | New section after dimension table listing clause alignments | None |
| **38.3.3** | PDF Guardian-native labels + ISO disclaimer | Guardian-native label treatment + ISO disclaimer footer | None |

---

## Dependency Graph

```
    File Overlap Analysis:
    +----------+--------------------------------------------------------+--------------------+
    | Story    | Files Touched                                          | Conflicts          |
    +----------+--------------------------------------------------------+--------------------+
    | 38.3.1   | scoring-report.html (MODIFY - dimension table)         | 38.3.2, 38.3.3     |
    |          | ScoringPDFExporter.ts (MODIFY - renderTemplate)        | 38.3.2, 38.3.3     |
    +----------+--------------------------------------------------------+--------------------+
    | 38.3.2   | scoring-report.html (MODIFY - new section)             | 38.3.1, 38.3.3     |
    |          | ScoringPDFExporter.ts (MODIFY - renderTemplate)        | 38.3.1, 38.3.3     |
    +----------+--------------------------------------------------------+--------------------+
    | 38.3.3   | scoring-report.html (MODIFY - labels + footer)         | 38.3.1, 38.3.2     |
    |          | ScoringPDFExporter.ts (MODIFY - renderTemplate)        | 38.3.1, 38.3.2     |
    +----------+--------------------------------------------------------+--------------------+
```

---

## Parallel Execution Strategy

### Phase 1-3: All Sequential (file overlap on all stories)

All 3 stories modify the same 2 files (`scoring-report.html` and `ScoringPDFExporter.ts`). They must run sequentially.

```
+-------------------------------------------------------------------------+
|                     PHASE 1 - SEQUENTIAL                                |
+-------------------------------------------------------------------------+
|   38.3.1                                                                |
|   PDF Dimension Table ISO Columns                                       |
|                                                                         |
|   FILES:                                                                |
|   - scoring-report.html (dimension table section)                       |
|   - ScoringPDFExporter.ts (renderTemplate - dimension ISO data)         |
|                                                                         |
|   export-agent                                                          |
+-------------------------------------------------------------------------+
      |
      v
+-------------------------------------------------------------------------+
|                     PHASE 2 - SEQUENTIAL                                |
+-------------------------------------------------------------------------+
|   38.3.2                                                                |
|   PDF ISO Alignment Section                                             |
|                                                                         |
|   FILES:                                                                |
|   - scoring-report.html (new section after dimension table)             |
|   - ScoringPDFExporter.ts (renderTemplate - ISO section data)           |
|                                                                         |
|   MUST wait for 38.3.1                                                  |
|   export-agent                                                          |
+-------------------------------------------------------------------------+
      |
      v
+-------------------------------------------------------------------------+
|                     PHASE 3 - SEQUENTIAL                                |
+-------------------------------------------------------------------------+
|   38.3.3                                                                |
|   PDF Guardian-Native Labels + ISO Disclaimer                           |
|                                                                         |
|   FILES:                                                                |
|   - scoring-report.html (label styling + footer)                        |
|   - ScoringPDFExporter.ts (renderTemplate - label + disclaimer)         |
|                                                                         |
|   MUST wait for 38.3.2                                                  |
|   export-agent                                                          |
+-------------------------------------------------------------------------+
```

**Stories:** 38.3.1 -> 38.3.2 -> 38.3.3
**Agents needed:** 1 export-agent (sequential)
**File overlap:** All stories touch the same 2 files
**Review:** After each story

---

## Story Files

| Story | File | Agent |
|-------|------|-------|
| 38.3.1 | `sprint-3-story-1.md` | export-agent |
| 38.3.2 | `sprint-3-story-2.md` | export-agent |
| 38.3.3 | `sprint-3-story-3.md` | export-agent |

---

## Exit Criteria

Sprint 3 is complete when:
- [ ] PDF dimension table shows confidence badge (H/M/L) and ISO clause count per dimension
- [ ] PDF has ISO Standards Alignment section listing clause statuses
- [ ] PDF has Guardian-native dimension label treatment
- [ ] PDF footer includes ISO disclaimer
- [ ] ScoringPDFExporter.ts under 300 LOC
- [ ] All tests pass
- [ ] No TypeScript errors
