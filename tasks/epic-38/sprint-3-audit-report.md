# Sprint 3 Pre-Implementation Audit Report

**Epic:** 38 - ISO Export + UI Enrichment
**Sprint:** 3 - PDF Template Enrichment
**Auditors:** 3 parallel Explore agents (cascade chain, file boundaries, spec assumptions)
**Date:** 2026-02-13

---

## Executive Summary

All 3 story specs are **technically sound** — data types, template structure, import paths, and CSS patterns all verified correct. **One critical issue**: agent assignment says `export-agent` but that agent is scoped to Epic 7 only. Use `backend-agent` instead.

**Verdict: READY FOR IMPLEMENTATION** (with agent assignment correction)

---

## Key Findings

### CRITICAL: Agent Assignment Mismatch

| Spec Says | Actual Agent Scope | Fix |
|-----------|-------------------|-----|
| `export-agent` | Epic 7 (questionnaire export) | Use `backend-agent` |

The `export-agent` (.claude/agents/export-agent.md) is scoped to "Epic 7 - PDF, Word, Excel generation" for questionnaires. It has no context for Epic 38 ISO enrichment. All 3 stories should use `backend-agent`.

### All Spec Assumptions Verified Correct

| Assumption | Status | Evidence |
|-----------|--------|----------|
| Dimension table has 4 columns | CORRECT | scoring-report.html:488-493 |
| renderTemplate uses regex block-replace | CORRECT | ScoringPDFExporter.ts:60-74 |
| dimensionISOData field exists on ScoringExportData | CORRECT | IScoringPDFExporter.ts:28 |
| DimensionExportISOData has confidence, isoClauseReferences, isGuardianNative | CORRECT | IScoringPDFExporter.ts:8-18 |
| ISOClauseReference has clauseRef, title, framework, status | CORRECT | compliance/types.ts:39-44 |
| ISO_DISCLAIMER exported from isoMessagingTerms.ts | CORRECT | isoMessagingTerms.ts:84-87 |
| findProhibitedTerms exported | CORRECT | isoMessagingTerms.ts:93 |
| Test fixtures already have dimensionISOData: [] | CORRECT | ScoringPDFExporter.test.ts:77,109,140,175,211 |
| CSS color scheme consistent | CORRECT | Template uses same palette |

---

## File State

| File | Current LOC | After Sprint 3 | Budget | Status |
|------|-------------|-----------------|--------|--------|
| ScoringPDFExporter.ts | 143 | ~228 | 300 | SAFE (72 LOC margin) |
| scoring-report.html | 523 | ~578 | No limit (template) | SAFE |

### ScoringPDFExporter.ts Method Map

| Lines | Method | LOC | Sprint 3 Impact |
|-------|--------|-----|-----------------|
| 1-7 | Imports | 7 | +1 (ISO_DISCLAIMER import) |
| 8-13 | constructor() | 6 | None |
| 15-19 | generatePDF() | 5 | None |
| 21-77 | renderTemplate() | 57 | +20 (ISO columns + Guardian labels + disclaimer) |
| 79-97 | htmlToPDF() | 19 | None |
| 99-104 | escapeHtml() | 6 | None |
| 106-110 | formatDate() | 5 | None |
| 112-143 | renderMarkdown() | 32 | None |
| NEW | buildISOAlignmentSection() | 0 | +50 (Story 38.3.2) |

### scoring-report.html Structure

| Lines | Section | Sprint 3 Changes |
|-------|---------|------------------|
| 1-437 | CSS Styles | +55 LOC: confidence badges, ISO alignment table, Guardian labels, disclaimer |
| 438 | </style> | None |
| 441-450 | Header | None |
| 454-465 | Score Banner | None |
| 468-471 | Executive Summary | None |
| 474-481 | Key Findings | None |
| 484-510 | Dimension Table | 38.3.1: Add Confidence + ISO Refs columns |
| NEW | ISO Alignment Section | 38.3.2: New {{{isoAlignmentSection}}} placeholder |
| 513-516 | Narrative Report | None |
| 519-521 | Footer | 38.3.3: Add ISO disclaimer |

---

## Template Rendering System

**Engine:** Custom regex-based string replacement (NOT Mustache/Handlebars library)

**Patterns:**
- `{{variable}}` → Simple replacement with HTML escaping
- `{{#block}}...{{/block}}` → Regex captures block, replaces with programmatic HTML
- `{{{rawHtml}}}` → Triple braces for unescaped HTML injection

**Key insight:** The `{{#dimensionScores}}...{{/dimensionScores}}` block is NOT iterated by a template engine. The exporter code builds dimension row HTML via `.map().join()` and replaces the entire block via regex. Sprint 3 stories must follow this same pattern.

---

## Data Flow (Verified)

```
ScoringExportService.getScoringData()
  → buildDimensionISOData(dimensionScoreData)  [ScoringExportHelpers.ts:195]
  → Returns ScoringExportData { dimensionISOData: DimensionExportISOData[] }
       ↓
ScoringPDFExporter.generatePDF(data)
  → renderTemplate(template, data)
       ↓
  Currently: data.dimensionISOData is AVAILABLE but NOT YET USED
  Sprint 3:  Wire dimensionISOData into dimension rows + ISO section + footer
```

**Dimension matching:** `data.dimensionISOData.find(iso => iso.dimension === d.dimension)` — both use same key system (RiskDimension string keys).

---

## Layer Boundaries: CORRECT

```
ScoringPDFExporter.ts (Infrastructure)
  ├─ imports from Application: IScoringPDFExporter, ScoringExportData  ✅
  ├─ imports from Domain: DIMENSION_CONFIG, ISO_DISCLAIMER             ✅
  ├─ imports External: puppeteer, marked, DOMPurify                    ✅
  └─ does NOT import from Presentation                                 ✅
```

---

## Section Isolation for Sequential Execution

All 3 stories touch the same 2 files but at **distinct sections**:

### scoring-report.html
- 38.3.1 → CSS at ~line 225 + dimension table HTML at lines 486-510
- 38.3.2 → CSS at ~line 250 + new section after line 515
- 38.3.3 → CSS at ~line 280 + footer at lines 519-521

### ScoringPDFExporter.ts
- 38.3.1 → Enhance dimensionScoresWithLabels map (lines 25-29) with confidence/ISO HTML
- 38.3.2 → New buildISOAlignmentSection() method (after line 143) + 1 line in renderTemplate
- 38.3.3 → Import ISO_DISCLAIMER (line 6) + modify label building + 1 line for disclaimer replace

**Conflict risk:** MEDIUM. 38.3.1 and 38.3.3 both modify dimension score array building, but at different properties (38.3.1: confidenceHtml/isoRefHtml, 38.3.3: label with Guardian HTML).

---

## Pre-Existing Issues (Not Sprint 3 Scope)

| Issue | File | LOC | Action |
|-------|------|-----|--------|
| LOC violation | WordExporter.ts | 389 | Track for future refactor |
| LOC violation | DocumentUploadController.ts | 919 | Track for future refactor |
| LOC violation | ScoringHandler.ts | 567 | Track for future refactor |

---

## Test Coverage

**Current:** ~7 tests in ScoringPDFExporter.test.ts
**After Sprint 3:** ~20+ tests needed

Test fixtures already have `dimensionISOData: []` — just need population with real DimensionExportISOData objects including confidence and isoClauseReferences.

---

## Implementation Recommendations

1. **Use backend-agent** (not export-agent) for all 3 stories
2. **Sequential execution required**: 38.3.1 → 38.3.2 → 38.3.3 (same files)
3. **Follow existing patterns**: Use the proven regex block-replace approach from renderTemplate()
4. **Label escaping change**: Story 38.3.3 changes `{{label}}` to `{{{label}}}` because labels will contain HTML spans for Guardian-native dimensions
5. **LOC monitoring**: After all 3 stories, ScoringPDFExporter.ts should be ~228 LOC. If it approaches 280+, extract buildISOAlignmentSection to a helper file.
