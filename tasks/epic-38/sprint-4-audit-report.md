# Sprint 4 Pre-Implementation Audit Report

**Epic:** 38 - ISO Export + UI Enrichment
**Sprint:** 4 - Word Document ISO Enrichment
**Auditors:** 3 parallel Explore agents (cascade chain, file boundaries, spec assumptions)
**Date:** 2026-02-13

---

## Executive Summary

All 3 story specs are **technically sound**. Data types, import paths, docx library patterns, and layer boundaries verified correct. **One confirmed bug** (date determinism) is already scoped as a Sprint 4 fix. WordSectionBuilders.ts will hit exactly 300 LOC after all 3 stories — manageable but at the limit.

**Verdict: READY FOR IMPLEMENTATION**

---

## Key Findings

### CONFIRMED: Date Determinism Bug (Story 38.4.1 scope)

| File | Line | Current Code | Fix |
|------|------|-------------|-----|
| `WordSectionBuilders.ts` | 58 | `new Date().toLocaleDateString(...)` | `data.generatedAt.toLocaleDateString(...)` |

Uses current date on every export call, breaking snapshot tests and producing inconsistent exports. Story 38.4.1 spec already includes this fix.

### CONFIRMED: Agent Assignment Mismatch

| Spec Says | Actual Agent Scope | Fix |
|-----------|-------------------|-----|
| `export-agent` | Epic 7 (questionnaire export) | Use `backend-agent` |

Same as Sprint 3. All stories should use `backend-agent`.

---

## All Spec Assumptions Verified

| Assumption | Status | Evidence |
|-----------|--------|----------|
| `createDimensionTable()` exists with correct signature | CORRECT | WordSectionBuilders.ts:158-226 |
| Function iterates dimensionScores via `.map()` | CORRECT | WordSectionBuilders.ts:175-211 |
| Uses docx Table, TableRow, TableCell | CORRECT | WordSectionBuilders.ts:9-12, 161-222 |
| Current table has 3 columns (Dimension, Score, Rating) | CORRECT | WordSectionBuilders.ts:163, 180-210 |
| ScoringWordExporter calls WordSectionBuilders methods | CORRECT | ScoringWordExporter.ts:9-15, 93-104 |
| Document assembly order: header, banner, summary, findings, dim table, narrative | CORRECT | ScoringWordExporter.ts:93-104 |
| Footer section exists with rubric version | CORRECT | ScoringWordExporter.ts:57-92 |
| ScoringExportData.dimensionISOData accessible | CORRECT | IScoringPDFExporter.ts:21-29 |
| DIMENSION_CONFIG importable with .label property | CORRECT | rubric.ts:95-109, WordSectionBuilders.ts:14 |
| ISO_DISCLAIMER exported from isoMessagingTerms.ts | CORRECT | isoMessagingTerms.ts:84-87 |
| Test fixtures have `dimensionISOData: []` ready for population | CORRECT | ScoringWordExporter.test.ts:64, WordSectionBuilders.test.ts:49 |
| docx Table styling: TextRun, ShadingType, AlignmentType | CORRECT | WordSectionBuilders.ts:164-171, 180-210 |
| WordNarrativeParser.ts exists (Sprint 1 split) | CORRECT | 182 LOC, re-exported from WordSectionBuilders.ts:229 |
| `new Date()` bug in createHeader | CORRECT | WordSectionBuilders.ts:58 |
| `data.generatedAt` available in scope | CORRECT | ScoringExportData interface, WordSectionBuilders.ts:33 |

---

## File State & LOC Projections

| File | Current LOC | After 38.4.1 | After 38.4.2 | After 38.4.3 | Status |
|------|-------------|-------------|-------------|-------------|--------|
| WordSectionBuilders.ts | 229 | ~285 | 285 | **300** | **AT LIMIT** |
| ScoringWordExporter.ts | 110 | 111 | 113 | 128 | SAFE |
| WordISOBuilders.ts | N/A | N/A | ~100 | 100 | NEW, SAFE |
| WordNarrativeParser.ts | 182 | 182 | 182 | 182 | UNCHANGED |

### WordSectionBuilders.ts Method Map

| Lines | Method | LOC | Sprint 4 Impact |
|-------|--------|-----|-----------------|
| 33-70 | createHeader() | 37 | Fix date bug (1 line) |
| 72-119 | createScoreBanner() | 49 | None |
| 121-135 | createExecutiveSummary() | 15 | None |
| 137-156 | createKeyFindings() | 19 | None |
| 158-226 | createDimensionTable() | 69 | +55 (ISO columns + Guardian labels) |
| 229 | Re-exports | 1 | None |
| NEW | buildConfidenceCell() | ~30 | Story 38.4.1 |
| NEW | buildISORefCell() | ~25 | Story 38.4.1 |

---

## Section Isolation for Sequential Execution

All 3 stories touch the same 2 files but at **distinct sections**:

### WordSectionBuilders.ts
- 38.4.1: Add helper functions + modify createDimensionTable header/data rows (columns)
- 38.4.2: No changes (ISO section in new WordISOBuilders.ts)
- 38.4.3: Modify dimension name cell in createDimensionTable (sublabel)

### ScoringWordExporter.ts
- 38.4.1: Fix date bug in createHeader call (1 line)
- 38.4.2: Add import + 1 line for ISO alignment section
- 38.4.3: Add import + ~15 lines for ISO disclaimer in footer

**Collision Risk:** MEDIUM. Stories 38.4.1 and 38.4.3 both modify createDimensionTable() but at different properties (38.4.1: new columns, 38.4.3: dimension cell sublabel).

---

## PDF Parallel Patterns (Sprint 3 reference)

Sprint 4 Word should mirror Sprint 3 PDF patterns:

| Pattern | PDF (ScoringPDFExporter.ts) | Word (Sprint 4) |
|---------|---------------------------|-----------------|
| Confidence badge | Lines 40-44: HTML span with level class | TextRun with colored shading |
| ISO clause count | Lines 47-51: count with "clause(s)" | TextRun with count or "--" |
| Status precedence | STATUS_PRECEDENCE map (lines 9-15) | Same map in WordISOBuilders.ts |
| Guardian-native label | Lines 54-56: HTML span sublabel | Paragraph with italic purple text |
| ISO disclaimer | Lines 117-118: escaped text in footer | TextRun in footer paragraph |

---

## Layer Boundaries: CORRECT

```
WordSectionBuilders.ts (Infrastructure)
  +-- imports from Domain: DIMENSION_CONFIG, ISO_DISCLAIMER    OK
  +-- imports from Application: ScoringExportData              OK
  +-- imports External: docx library                           OK
  +-- does NOT import from Presentation                        OK

WordISOBuilders.ts (Infrastructure - NEW)
  +-- imports from Domain: compliance/types                    OK
  +-- imports from Application: ScoringExportData              OK
  +-- imports External: docx library                           OK
```

---

## Implementation Recommendations

1. **Use backend-agent** for all 3 stories
2. **Sequential execution required**: 38.4.1 -> 38.4.2 -> 38.4.3
3. **Mirror Sprint 3 PDF patterns** for consistency
4. **LOC monitoring**: WordSectionBuilders.ts hits 300 LOC exactly. No further additions without extraction.
5. **Projected test count**: ~21 new tests across WordSectionBuilders.test.ts and ScoringWordExporter.test.ts
