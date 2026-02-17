# Story 38.8.4: Manual QA Checklist Spec

## Description

Create a documented manual QA checklist for human reviewers to verify ISO messaging compliance across 5 exported reports. This is a specification document (not code), providing step-by-step review instructions. The checklist covers PDF, Word, and Excel outputs and checks for prohibited terms, correct labeling, and visual quality.

## Acceptance Criteria

- [ ] QA checklist document created at `tasks/epic-38/qa-checklist.md`
- [ ] Checklist covers 5 reports with different scoring profiles
- [ ] Each report review has specific items to check per format (PDF, Word, Excel)
- [ ] Prohibited terms section lists exact terms to search for
- [ ] Guardian-native dimensions section verifies correct labeling
- [ ] Visual quality section covers readability and formatting
- [ ] Pass/fail criteria clearly defined

## Technical Approach

### 1. Create qa-checklist.md

**File:** `/Users/mazradwan/Documents/PROJECTS/guardian-app/tasks/epic-38/qa-checklist.md` (CREATE)

```markdown
# Epic 38: ISO Export QA Checklist

## Purpose
Manual review of 5 exported reports to verify ISO messaging compliance,
visual quality, and data accuracy.

## Reports to Review

| # | Profile | Composite | Recommendation | ISO Clauses | Expected |
|---|---------|-----------|----------------|-------------|----------|
| 1 | High-scoring clinical | 85 | approve | 10+ aligned | All green |
| 2 | Medium-scoring admin | 55 | conditional | Mixed statuses | Amber/green mix |
| 3 | Low-scoring patient-facing | 30 | decline | Mostly not_evidenced | Red badges |
| 4 | Pre-Epic-37 assessment | 70 | conditional | None (no ISO data) | No ISO sections |
| 5 | Guardian-native heavy | 65 | conditional | Few clauses | Guardian labels prominent |

## Per-Report Checklist

### A. Prohibited Terms Search (ALL formats)

Open the report and search (Ctrl+F) for each term:

- [ ] "ISO compliant" - MUST NOT appear
- [ ] "ISO certified" - MUST NOT appear
- [ ] "meets ISO requirements" - MUST NOT appear
- [ ] "ISO conformant" - MUST NOT appear
- [ ] "complies with ISO" - MUST NOT appear
- [ ] "ISO compliance" (as a noun phrase implying certification) - MUST NOT appear

### B. Approved Terms Verification

Confirm these terms ARE used:

- [ ] "ISO-traceable" or "ISO-informed" appears at least once
- [ ] "aligned with" used for ISO references
- [ ] ISO disclaimer present in footer

### C. PDF Specific Checks

- [ ] Dimension table has Confidence and ISO Refs columns
- [ ] Confidence badges show correct colors (H=green, M=amber, L=red)
- [ ] ISO Standards Alignment section appears (if ISO data exists)
- [ ] Guardian-native dimensions show "Guardian Healthcare-Specific" label
- [ ] ISO disclaimer in footer
- [ ] Page breaks are clean (no orphaned headers)

### D. Word Specific Checks

- [ ] Same columns and sections as PDF
- [ ] Table formatting is clean (no overlapping cells)
- [ ] Footer has ISO disclaimer
- [ ] Inline formatting (bold, italic) renders correctly

### E. Excel Specific Checks

- [ ] "Scoring Summary" sheet has Confidence and ISO Refs columns
- [ ] "ISO Control Mapping" sheet exists (if ISO data exists)
- [ ] Conditional formatting works (colored cells)
- [ ] ISO disclaimer in footer row
- [ ] "Guardian-Specific" shown for Guardian-native dimensions

### F. ISO Alignment Section (if ISO data exists)

- [ ] Clauses grouped by framework (ISO 42001, ISO 23894)
- [ ] Each clause shows status badge (Aligned/Partial/Not Evidenced)
- [ ] Dimensions column lists all referencing dimensions
- [ ] No duplicate clause entries

### G. Visual Quality

- [ ] Report is professional and readable
- [ ] Colors are consistent across formats
- [ ] No broken layouts or overflowing text
- [ ] Score bars and badges render correctly

## Pass/Fail Criteria

- **PASS**: All 5 reports pass all checklist items
- **FAIL**: Any prohibited term found in any report
- **FAIL**: Any missing ISO section when ISO data exists
- **FAIL**: Any broken formatting that impacts readability

## Reviewer Notes

Record any issues found:

| Report # | Format | Issue | Severity |
|----------|--------|-------|----------|
| | | | |
```

### 2. Key Rules

- **This is a spec, not code**: No tests to write. The deliverable is the checklist document.
- **5 reports cover different profiles**: Ensures edge cases (no ISO data, all Guardian-native, etc.) are tested.
- **Prohibited terms are explicit**: Reviewer knows exactly what to search for.
- **Can be used by non-developers**: Written for QA reviewers, not engineers.

## Files Touched

- `tasks/epic-38/qa-checklist.md` - CREATE (~100 lines)

## Tests Affected

- None (documentation only)

## Agent Assignment

- [x] backend-agent

## Tests Required

- [ ] None (documentation deliverable)

## Definition of Done

- [ ] QA checklist document created
- [ ] Covers 5 report profiles
- [ ] Includes prohibited terms search
- [ ] Includes per-format checks (PDF, Word, Excel)
- [ ] Pass/fail criteria defined
