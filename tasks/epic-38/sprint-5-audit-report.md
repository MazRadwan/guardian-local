# Sprint 5 Pre-Implementation Audit Report

**Epic:** 38 - ISO Export + UI Enrichment
**Sprint:** 5 - Excel ISO Export
**Auditors:** 3 parallel Explore agents (cascade chain, file boundaries, spec assumptions)
**Date:** 2026-02-13

---

## Executive Summary

All 3 story specs are **technically sound**. ExcelJS v4.4.0 is already installed. The existing questionnaire ExcelExporter provides proven patterns. All 14 spec assumptions verified correct. **One critical LOC warning**: `container.ts` at 290 LOC will reach 293 after Sprint 5 — at the limit but not blocking.

**Verdict: READY FOR IMPLEMENTATION**

---

## Key Findings

### CRITICAL: container.ts Approaching 300 LOC Limit

| File | Current LOC | After Sprint 5 | Remaining Capacity |
|------|-------------|----------------|-------------------|
| container.ts | 290 | 293 | **7 LOC** |

Sprint 5 adds 3 lines (import + instantiation + constructor param). Future service additions will exceed the limit. Flag for post-Sprint 5 refactor into `container.core.ts` + `container.services.ts` + `container.export.ts`.

### Agent Assignment Correction

| Spec Says | Fix |
|-----------|-----|
| `export-agent` | Use `backend-agent` |

---

## All Spec Assumptions Verified

| # | Assumption | Status | Evidence |
|---|-----------|--------|----------|
| 1 | ExcelJS in package.json | CORRECT | package.json:36 — `"exceljs": "4.4.0"` |
| 2 | IScoringPDFExporter pattern (generatePDF signature) | CORRECT | IScoringPDFExporter.ts:31-33 |
| 3 | IScoringWordExporter pattern (generateWord signature) | CORRECT | IScoringWordExporter.ts:3-5 |
| 4 | ScoringExportData has all required fields | CORRECT | IScoringPDFExporter.ts:21-29 |
| 5 | Container uses direct instantiation pattern | CORRECT | container.ts:160-166 |
| 6 | Controller route pattern (auth + ownership + headers) | CORRECT | ScoringExportController.ts:23-126 |
| 7 | DIMENSION_CONFIG importable with .label | CORRECT | rubric.ts:95-109 |
| 8 | ISO clause structure per-dimension (not deduped) | CORRECT | IScoringPDFExporter.ts:8-19 |
| 9 | ExcelJS writeBuffer() available | CORRECT | ExcelExporter.ts:40-41 |
| 10 | ISO_DISCLAIMER exported | CORRECT | isoMessagingTerms.ts:84-87 |
| 11 | buildDimensionISOData helper exists | CORRECT | ScoringExportHelpers.ts:195-204 |
| 12 | GUARDIAN_NATIVE_DIMENSIONS defined | CORRECT | ScoringExportHelpers.ts:184-189 |
| 13 | Service constructor takes 7 params (8th = Excel) | CORRECT | ScoringExportService.ts:44-53 |
| 14 | Route registration via createScoringExportRoutes() | CORRECT | scoring.export.routes.ts:12-41 |

---

## File State & LOC Projections

| File | Type | Current LOC | Sprint 5 Change | Projected LOC | Status |
|------|------|------------|-----------------|---------------|--------|
| ScoringExcelExporter.ts | CREATE | — | +155 | 155 | SAFE |
| IScoringExcelExporter.ts | CREATE | — | +10 | 10 | SAFE |
| ScoringExportService.ts | MODIFY | 274 | +5 | 279 | SAFE |
| ScoringExportController.ts | MODIFY | 136 | +40 | 176 | SAFE |
| container.ts | MODIFY | 290 | +3 | **293** | AT LIMIT |
| scoring.export.routes.ts | MODIFY | ~40 | +5 | ~45 | SAFE |

---

## Existing Export Pipeline (Cascade Reference)

```
USER REQUEST
    |
[Route] GET /api/export/scoring/:assessmentId/excel  (NEW)
    |
[Middleware] authMiddleware(authService)
    |
[Controller] ScoringExportController.exportToExcel  (NEW)
    +-- Verify ownership (assessmentRepository.findById)
    +-- Delegate to service
    +-- Response headers: Content-Type, Content-Disposition, Content-Length
    |
[Service] ScoringExportService.exportToExcel  (NEW)
    +-- getScoringData(assessmentId, batchId)  (EXISTING - reuse)
    +-- Return excelExporter.generateExcel(data)
    |
[Exporter] ScoringExcelExporter.generateExcel  (NEW)
    +-- Create ExcelJS Workbook
    +-- Add "Scoring Summary" sheet (38.5.1)
    +-- Add "ISO Control Mapping" sheet (38.5.2, conditional)
    +-- writeBuffer() -> Buffer
```

---

## Key Patterns from Existing Exporters

### Response Headers
| Format | Content-Type | Extension |
|--------|-------------|-----------|
| PDF | `application/pdf` | `.pdf` |
| Word | `application/vnd.openxmlformats-officedocument.wordprocessingml.document` | `.docx` |
| **Excel** | `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` | `.xlsx` |

### ExcelJS Color Format (ARGB)
- All colors require `FF` opacity prefix
- Brand purple: `FF7C3AED`
- Dark gray (ISO headers): `FF374151`
- Status colors: Same as PDF (green/amber/orange/gray)

### DI Container Registration Pattern
```typescript
// After line 166 (scoringWordExporter):
const scoringExcelExporter = new ScoringExcelExporter();

// Update ScoringExportService constructor (lines 199-207):
// Add scoringExcelExporter as 8th parameter
```

---

## Cross-Sprint File Collision Check

| File | Sprint 4 | Sprint 5 | Sprint 6 | Conflict? |
|------|----------|---------|---------|-----------|
| ScoringExportService.ts | Not touched | MODIFY | Not touched | NO |
| ScoringExportController.ts | Not touched | MODIFY | Not touched | NO |
| container.ts | Not touched | MODIFY | Not touched | NO |
| scoring.export.routes.ts | Not touched | MODIFY | Not touched | NO |

**Zero file conflicts** with Sprint 4 or Sprint 6. Safe for parallel execution.

---

## Parallelization Strategy

```
Story 38.5.1 (Interface + Scoring Summary sheet)
    |
    +-- MUST COMPLETE FIRST
    |
    v
Story 38.5.2 (ISO Control Mapping sheet)  ||  Story 38.5.3 (Wire service/controller/routes)
    |                                          |
    +-- Modifies: ScoringExcelExporter.ts      +-- Modifies: Service, Controller, container, routes
    |                                          |
    +-- NO FILE OVERLAP                        +-- NO FILE OVERLAP
```

Stories 38.5.2 and 38.5.3 can run in parallel after 38.5.1 completes.

---

## Key Design Decisions

### ISO Control Mapping Sheet: NOT Deduped
- PDF deduplicates clauses across dimensions (worst-case status)
- Excel keeps **one row per clause-dimension pair** (full detail)
- Reason: Excel is for detailed analysis, PDF is for executive summary
- Guardian-native dimensions excluded from ISO sheet

### Single File vs Split
- ScoringExcelExporter.ts at ~155 LOC (both sheets) — SAFE under 300
- No split needed. If future sheets added, extract to ExcelISOSheetBuilder.ts

---

## Implementation Recommendations

1. **Use backend-agent** for all 3 stories
2. **Phase execution**: 38.5.1 first, then 38.5.2 + 38.5.3 in parallel
3. **Follow existing ExcelExporter patterns** (questionnaire exporter at ExcelExporter.ts)
4. **Flag container.ts** for post-Sprint 5 LOC refactor (293/300)
5. **Projected test count**: ~15-18 tests for ScoringExcelExporter.test.ts
