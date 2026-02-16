# Sprint 8 Pre-Implementation Audit Report

**Epic:** 38 - ISO Export + UI Enrichment
**Sprint:** 8 - Testing & Compliance Audit
**Auditors:** 3 parallel Explore agents (cascade chain, file boundaries, spec assumptions)
**Date:** 2026-02-13

---

## Executive Summary

All 43 spec assumptions verified **CORRECT**. All 10 files for messaging audit exist. All test directories exist. One LOC concern: ScoringExportService.ts at 289 LOC — define `validateNarrativeMessaging()` in isoMessagingTerms.ts (96 LOC) and import/call it, keeping both files under 300. **No blockers.**

**Verdict: READY FOR IMPLEMENTATION**

---

## Key Findings

### CONFIRMED: renderTemplate() is PRIVATE (Story 38.8.1)

| File | Lines | Detail |
|------|-------|--------|
| ScoringPDFExporter.ts | 30 | `private renderTemplate(template: string, data: ScoringExportData): string` |
| ScoringPDFExporter.ts | 18 | Constructor: `constructor(private templatePath: string)` |

**Spec uses `(exporter as any).renderTemplate()` cast — acceptable for test file.**

### CONFIRMED: All Export Signatures Match (Story 38.8.1)

| Exporter | Method | Signature |
|----------|--------|-----------|
| ScoringPDFExporter | generatePDF | `async generatePDF(data: ScoringExportData): Promise<Buffer>` |
| ScoringWordExporter | generateWord | `async generateWord(data: ScoringExportData): Promise<Buffer>` |
| ScoringExcelExporter | generateExcel | `async generateExcel(data: ScoringExportData): Promise<Buffer>` |

### CONFIRMED: findProhibitedTerms() Shape (Story 38.8.3)

| Export | Type | Fields |
|--------|------|--------|
| findProhibitedTerms | `(text: string) => ProhibitedTerm[]` | Returns array |
| ProhibitedTerm | interface | `{ term, pattern: RegExp, alternative, reason }` |
| PROHIBITED_TERMS | `ProhibitedTerm[]` | 7 patterns |
| APPROVED_TERMS | `readonly string[]` | 8 terms |
| ISO_DISCLAIMER | `string` | 3-sentence disclaimer |

### NOTE: ScoringExportService.ts LOC Management

- Current: 289 LOC
- `validateNarrativeMessaging()` MUST be defined in `isoMessagingTerms.ts` (96 LOC → ~115 LOC)
- ScoringExportService only adds import + 2-line call → ~292 LOC (SAFE)
- ExportNarrativeGenerator: 111 LOC → ~116 LOC (SAFE)

### CONFIRMED: Narrative Cached Path (Story 38.8.3)

ScoringExportService.ts line 196: Returns cached narrative when `narrativeStatus === 'complete'` OR `null` OR `undefined`. This bypasses the generator entirely — **runtime validation at export time is essential**.

---

## All Spec Assumptions Verified

| # | Assumption | Status | Evidence |
|---|-----------|--------|----------|
| 1 | PDF constructor takes templatePath | CORRECT | ScoringPDFExporter.ts:18 |
| 2 | renderTemplate() exists (private) | CORRECT | ScoringPDFExporter.ts:30 |
| 3 | generateWord() signature | CORRECT | ScoringWordExporter.ts:20 |
| 4 | generateExcel() signature | CORRECT | ScoringExcelExporter.ts:34 |
| 5 | ScoringExportData fields | CORRECT | IScoringPDFExporter.ts:21-29 |
| 6 | DimensionExportISOData fields | CORRECT | IScoringPDFExporter.ts:8-19 |
| 7 | HTML template location | CORRECT | templates/scoring-report.html exists |
| 8 | ExcelJS available | CORRECT | ScoringExcelExporter.ts:11 imports it |
| 9 | findProhibitedTerms exported | CORRECT | isoMessagingTerms.ts:93 |
| 10 | PROHIBITED_TERMS exported | CORRECT | isoMessagingTerms.ts:21 |
| 11 | ISO_DISCLAIMER exported | CORRECT | isoMessagingTerms.ts:84-87 |
| 12 | APPROVED_TERMS exported | CORRECT | isoMessagingTerms.ts:70-79 |
| 13 | Violation has pattern: RegExp | CORRECT | isoMessagingTerms.ts:10-19 |
| 14 | generateNarrative() exists | CORRECT | ExportNarrativeGenerator.ts:41 |
| 15 | extractMarkdown() exists (private) | CORRECT | ExportNarrativeGenerator.ts:101 |
| 16 | getScoringData() exists (private) | CORRECT | ScoringExportService.ts:95 |
| 17 | ensureNarrative() exists (private) | CORRECT | ScoringExportService.ts:185 |
| 18 | Cached narrative path | CORRECT | ScoringExportService.ts:196 |
| 19 | All 10 FILES_TO_SCAN exist | CORRECT | All verified |
| 20 | tasks/epic-38/ directory exists | CORRECT | 45 files present |

---

## File State & LOC Projections

| File | Type | Current LOC | Sprint 8 Change | Projected LOC | Status |
|------|------|------------|-----------------|---------------|--------|
| isoMessagingTerms.ts | MODIFY | 96 | +~20 (validateNarrativeMessaging fn) | ~116 | SAFE |
| ExportNarrativeGenerator.ts | MODIFY | 111 | +~5 (import + validation call) | ~116 | SAFE |
| ScoringExportService.ts | MODIFY | 289 | +~3 (import + validation call) | ~292 | SAFE |
| export-iso.test.ts | CREATE | — | ~200 | 200 | N/A (test) |
| export-snapshots.test.ts | CREATE | — | ~150 | 150 | N/A (test) |
| iso-messaging-audit.test.ts | CREATE | — | ~180 | 180 | N/A (test) |
| qa-checklist.md | CREATE | — | ~120 | 120 | N/A (docs) |

---

## Test Directories (All Exist)

| Directory | Status | Existing Files |
|-----------|--------|----------------|
| `__tests__/integration/` | EXISTS | 18 test files |
| `__tests__/unit/infrastructure/export/` | EXISTS | 5 test files |
| `__tests__/unit/domain/compliance/` | EXISTS | 6 test files |

---

## Execution Order

```
ALL 4 STORIES IN PARALLEL (no file overlap between stories)
+------------------+------------------+------------------+------------------+
| 38.8.1           | 38.8.2           | 38.8.3           | 38.8.4           |
| E2E Export       | Snapshot Tests   | Messaging Audit  | QA Checklist     |
| Integration      |                  | + Runtime Valid   | (docs only)      |
|                  |                  |                  |                  |
| NEW: test file   | NEW: test file   | NEW: test file   | NEW: md file     |
|                  |                  | MOD: 3 source    |                  |
| backend-agent    | backend-agent    | backend-agent    | backend-agent    |
+------------------+------------------+------------------+------------------+
```

**Note:** Story 38.8.3 modifies source files but none overlap with other stories.

---

## Implementation Recommendations

1. **Define `validateNarrativeMessaging()` in `isoMessagingTerms.ts`** — keeps ScoringExportService under 300 LOC
2. **Use `(exporter as any).renderTemplate()`** for PDF HTML testing (method is private)
3. **All 4 stories can run in parallel** — no file overlap
4. **38.8.3 needs `stripNegativeExamples()` helper** — prompt files contain intentional "NEVER use" examples
5. **38.8.1 must NOT call `generatePDF()`** — Puppeteer is environment-dependent, test HTML rendering only
