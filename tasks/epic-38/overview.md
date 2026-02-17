# Epic 38: ISO Export + UI Enrichment

**Goal:** Wire ISO compliance data (built in Epic 37) into exports and frontend. After this epic, assessors see ISO traceability, confidence badges, and explainability narratives in PDF/Word/Excel reports and in the UI.

**Dependency:** Epic 37 complete (DB foundation, scoring enrichment, ISO data in `findings` JSONB)

**Agent Mix:** `backend-agent` | `export-agent` | `frontend-agent`

---

## Sprint Summary

| Sprint | Name | Stories | Focus | Depends On |
|--------|------|---------|-------|------------|
| 1 | Refactoring Splits | 38.1.1 - 38.1.3 (3) | Split 3 over-limit files before adding ISO features | None |
| 2 | Export Data & Narrative Enrichment | 38.2.1 - 38.2.4 (4) | Enrich ScoringExportData with ISO, inject ISO into narrative prompt | Sprint 1 |
| 3 | PDF Template Enrichment | 38.3.1 - 38.3.3 (3) | ISO refs, confidence badges, Guardian-native labels in PDF | Sprint 2 |
| 4 | Word Template Enrichment | 38.4.1 - 38.4.3 (3) | Mirror PDF enrichment in Word format | Sprint 2 |
| 5 | Excel Export Creation | 38.5.1 - 38.5.3 (3) | New ScoringExcelExporter with ISO mapping sheet | Sprint 1, Sprint 2 |
| 6 | Frontend Types & Components | 38.6.1 - 38.6.4 (4) | Frontend scoring types, ConfidenceBadge, DimensionScoreBar enrichment | Sprint 2 (types only) |
| 7 | Frontend ISO Sections & Labels | 38.7.1 - 38.7.3 (3) | ISO alignment section, Guardian-native labels, Excel download button | Sprint 6 |
| 8 | Testing & Compliance Audit | 38.8.1 - 38.8.4 (4) | E2E integration, snapshot tests, ISO messaging audit | Sprint 3-7 |

**Total: 27 stories across 8 sprints**

---

## Cross-Sprint Dependency Graph

```
Sprint 1: Refactoring Splits (BLOCKER)
  |-- ScoringExportService.ts (436 LOC -> orchestrator + helpers)
  |-- ScoringWordExporter.ts (483 LOC -> sections + formatting)
  |-- exportNarrativePrompt.ts (393 LOC -> system + user prompt files)
      |
      v
Sprint 2: Export Data & Narrative Enrichment
  |-- ScoringExportData type enrichment (ISO + confidence fields)
  |-- ScoringExportService ISO data fetching
  |-- exportNarrativePrompt ISO injection (system + user)
  |-- ISO messaging term list
      |
      +---------+---------+---------+
      |         |         |         |
      v         v         v         v
Sprint 3    Sprint 4    Sprint 5    Sprint 6
PDF Tmpl    Word Tmpl   Excel New   FE Types
  |         |         |             |
  |         |         |             v
  |         |         |         Sprint 7
  |         |         |         FE Sections
  |         |         |             |
  +---------+---------+-------------+
      |
      v
Sprint 8: Testing & Compliance Audit
  |-- E2E: score -> export -> verify ISO
  |-- Snapshot tests for template stability
  |-- ISO messaging audit across all templates
  |-- Manual QA checklist spec
```

---

## Quality Gates

| Gate | After Sprint | Criterion |
|------|-------------|-----------|
| G1 | Sprint 1 | All 3 split files under 300 LOC, all existing tests pass |
| G2 | Sprint 2 | `ScoringExportData` includes ISO fields, narrative prompt mentions ISO |
| G3 | Sprint 3 | PDF report renders ISO references and confidence badges per dimension |
| G4 | Sprint 4 | Word report renders same ISO enrichment as PDF |
| G5 | Sprint 5 | Excel export generates with ISO mapping sheet and confidence column |
| G6 | Sprint 6 | Frontend types include ISO/confidence, ConfidenceBadge renders |
| G7 | Sprint 7 | ISO alignment section visible in ScoringResultCard |
| G8 | Sprint 8 | All integration tests pass, no prohibited ISO terms in templates |

---

## Key Files Modified (Across All Sprints)

| File | Sprint | Change |
|------|--------|--------|
| `application/services/ScoringExportService.ts` | 1, 2 | Split helpers; add ISO data fetching |
| `infrastructure/export/ScoringWordExporter.ts` | 1, 4 | Split sections; add ISO columns |
| `infrastructure/ai/prompts/exportNarrativePrompt.ts` | 1, 2 | Split files; inject ISO context |
| `infrastructure/export/ScoringPDFExporter.ts` | 3 | Add ISO/confidence template vars |
| `infrastructure/export/templates/scoring-report.html` | 3 | Add ISO refs, badges, labels HTML/CSS |
| `infrastructure/export/ScoringExcelExporter.ts` | 5 | NEW - scoring Excel with ISO sheet |
| `application/interfaces/IScoringPDFExporter.ts` | 2 | Enrich ScoringExportData type |
| `application/interfaces/IScoringExcelExporter.ts` | 5 | NEW - scoring Excel interface |
| `apps/web/src/types/scoring.ts` | 6 | Add ISO/confidence fields |
| `apps/web/src/components/chat/DimensionScoreBar.tsx` | 6 | Add confidence badge |
| `apps/web/src/components/chat/ScoreDashboard.tsx` | 7 | Add ISO alignment section |
| `apps/web/src/components/chat/ScoringResultCard.tsx` | 7 | Wire ISO section + Excel button |
| `container.ts` | 5 | Wire ScoringExcelExporter |

All backend paths relative to `packages/backend/src/`.

---

## Scope Exclusions

- Tier 2/3 ISO standards (only Tier 1: 42001 + 23894 from Epic 37 seed data)
- Scoring pipeline changes (Epic 37 handles scoring enrichment)
- Database schema changes (Epic 37 handles all schema)
- Question generation pipeline (unchanged)
- Chat prompt modifications (unchanged)
- Guardian-prompt.md modifications (unchanged)
