# Sprint 4: Word Template Enrichment

**Epic:** 38 - ISO Export + UI Enrichment
**Focus:** Mirror PDF ISO enrichment in Word format (confidence, ISO alignment, Guardian-native labels)
**Stories:** 38.4.1 - 38.4.3 (3 stories)
**Dependencies:** Sprint 2 complete (ScoringExportData has ISO fields)
**Agents:** `export-agent`

---

## Context

The Word export uses programmatic document building via the `docx` library. With Sprint 1's extraction, section builders are in `WordSectionBuilders.ts`. This sprint adds ISO columns to the dimension table, a new ISO alignment section, and Guardian-native labels + ISO disclaimer. Mirrors Sprint 3's PDF enrichment.

**Can run in parallel with Sprint 3** (no file overlap -- PDF touches HTML template + ScoringPDFExporter, Word touches WordSectionBuilders + ScoringWordExporter).

**LOC Management:** Sprint 1 creates `WordSectionBuilders.ts` at ~300 LOC. Sprint 4 adds ~160 LOC (ISO columns, ISO alignment section, Guardian labels). This will exceed 300 LOC. Story 38.4.2 MUST extract ISO-specific builders to `WordISOBuilders.ts` as part of its implementation, not as an afterthought.

---

## Stories

| Story | Name | Focus | Dependencies |
|-------|------|-------|--------------|
| **38.4.1** | Word dimension table ISO columns | Add confidence + ISO clause columns to Word dimension table | None |
| **38.4.2** | Word ISO alignment section | New section with ISO clause status table | None |
| **38.4.3** | Word Guardian-native labels + ISO disclaimer | Guardian-native treatment + footer disclaimer | None |

---

## Dependency Graph

```
    File Overlap Analysis:
    +----------+--------------------------------------------------------+--------------------+
    | Story    | Files Touched                                          | Conflicts          |
    +----------+--------------------------------------------------------+--------------------+
    | 38.4.1   | WordSectionBuilders.ts (MODIFY - createDimensionTable) | 38.4.2, 38.4.3     |
    +----------+--------------------------------------------------------+--------------------+
    | 38.4.2   | WordSectionBuilders.ts (MODIFY - new function)         | 38.4.1, 38.4.3     |
    |          | ScoringWordExporter.ts (MODIFY - add section call)     | 38.4.3             |
    +----------+--------------------------------------------------------+--------------------+
    | 38.4.3   | WordSectionBuilders.ts (MODIFY - createHeader)         | 38.4.1, 38.4.2     |
    |          | ScoringWordExporter.ts (MODIFY - footer)               | 38.4.2             |
    +----------+--------------------------------------------------------+--------------------+
```

---

## Parallel Execution Strategy

### Phase 1-3: All Sequential (file overlap on all stories)

All 3 stories modify `WordSectionBuilders.ts`. They must run sequentially.

```
+-------------------------------------------------------------------------+
|                     PHASE 1 - SEQUENTIAL                                |
+-------------------------------------------------------------------------+
|   38.4.1 -> 38.4.2 -> 38.4.3                                           |
|   All sequential (shared file: WordSectionBuilders.ts)                  |
|                                                                         |
|   export-agent                                                          |
+-------------------------------------------------------------------------+
```

**Stories:** 38.4.1 -> 38.4.2 -> 38.4.3
**Agents needed:** 1 export-agent (sequential)
**Review:** After each story

---

## Story Files

| Story | File | Agent |
|-------|------|-------|
| 38.4.1 | `sprint-4-story-1.md` | export-agent |
| 38.4.2 | `sprint-4-story-2.md` | export-agent |
| 38.4.3 | `sprint-4-story-3.md` | export-agent |

---

## Exit Criteria

Sprint 4 is complete when:
- [ ] Word dimension table shows confidence badge and ISO clause count columns
- [ ] Word has ISO Standards Alignment section with clause status table
- [ ] Word has Guardian-native dimension label treatment
- [ ] Word footer includes ISO disclaimer
- [ ] WordSectionBuilders.ts under 300 LOC (or split if needed)
- [ ] ScoringWordExporter.ts under 300 LOC
- [ ] All tests pass
- [ ] No TypeScript errors
