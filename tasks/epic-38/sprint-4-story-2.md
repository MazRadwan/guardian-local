# Story 38.4.2: Word ISO Alignment Section

## Description

Add a new "ISO Standards Alignment" section to the Word document after the dimension scores table. This mirrors the PDF ISO alignment section (Story 38.3.2) but uses programmatic Word building via the `docx` library. Lists ISO clauses grouped by framework with status badges and dimension mappings.

## Acceptance Criteria

- [ ] New `createISOAlignmentSection()` function in `WordISOBuilders.ts`
- [ ] Section renders as a Table with columns: Clause | Title | Status | Dimensions
- [ ] Status shown with colored text (Aligned=green, Partial=amber, Not Evidenced=red)
- [ ] Clauses grouped by framework (ISO 42001, ISO 23894)
- [ ] Same clause referenced by multiple dimensions listed once with all dimensions
- [ ] Section only renders if at least 1 ISO clause reference exists
- [ ] Page break before section for clean layout
- [ ] `ScoringWordExporter.generateWord()` calls new function
- [ ] Under 300 LOC per file (split if needed)

## Technical Approach

### 1. Add createISOAlignmentSection to WordSectionBuilders.ts

**File:** `packages/backend/src/infrastructure/export/WordSectionBuilders.ts` (MODIFY)

```typescript
/**
 * Create ISO Standards Alignment section for Word export.
 * Lists all ISO clauses referenced across dimensions with status.
 * Returns empty array if no ISO clauses exist.
 */
export function createISOAlignmentSection(data: ScoringExportData): (Paragraph | Table)[] {
  // Collect unique clauses across all dimensions.
  // IMPORTANT: Key by framework+clauseRef, not just clauseRef alone.
  // Different frameworks (e.g., ISO 42001 vs ISO 27001) can share the same
  // clause number with different meanings (e.g., "A.4.2" in both frameworks).
  const clauseMap = new Map<string, {
    clauseRef: string;
    title: string;
    framework: string;
    status: string;
    dimensions: string[];
  }>();

  for (const dim of data.dimensionISOData) {
    for (const ref of dim.isoClauseReferences) {
      const dedupKey = `${ref.framework}::${ref.clauseRef}`;
      const existing = clauseMap.get(dedupKey);
      if (existing) {
        if (!existing.dimensions.includes(dim.label)) {
          existing.dimensions.push(dim.label);
        }
      } else {
        clauseMap.set(dedupKey, {
          clauseRef: ref.clauseRef,
          title: ref.title,
          framework: ref.framework,
          status: ref.status,
          dimensions: [dim.label],
        });
      }
    }
  }

  if (clauseMap.size === 0) return [];

  const elements: (Paragraph | Table)[] = [
    new Paragraph({ children: [new PageBreak()] }),
    new Paragraph({
      text: 'ISO Standards Alignment',
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 200, after: 150 },
      border: { bottom: { color: '374151', size: 6, style: BorderStyle.SINGLE } },
    }),
  ];

  // Group by framework and build table
  // ... similar logic to PDF version but using docx Table/TableRow/TableCell ...

  return elements;
}
```

### 2. Update ScoringWordExporter.ts

**File:** `packages/backend/src/infrastructure/export/ScoringWordExporter.ts` (MODIFY)

Add import and call:

```typescript
import {
  // ... existing imports ...
  createISOAlignmentSection,
} from './WordSectionBuilders.js';

// In generateWord, after dimension table and before narrative:
children: [
  ...createHeader(data),
  ...createScoreBanner(data),
  ...createExecutiveSummary(data),
  ...createKeyFindings(data),
  new Paragraph({ children: [new PageBreak()] }),
  ...createDimensionTable(data),
  ...createISOAlignmentSection(data),  // NEW
  new Paragraph({ children: [new PageBreak()] }),
  ...createNarrativeReport(data),
],
```

### 3. REQUIRED: Extract to WordISOBuilders.ts

**REQUIRED: Extract to WordISOBuilders.ts** — The `createISOAlignmentSection` function and its helpers (`buildStatusBadge`, `buildFrameworkGroup`) MUST be placed in a new file `infrastructure/export/WordISOBuilders.ts` rather than added to `WordSectionBuilders.ts`, which is already at ~300 LOC after Sprint 1.

### 4. Key Rules

- **Status color mapping**: Same colors as PDF (aligned=green, partial=amber, not_evidenced=red, not_applicable=gray). Define a `STATUS_COLORS` constant or inline.
- **Deduplication**: Same clause appearing in multiple dimensions should be listed once with all dimension names. The dedup key MUST be `${framework}::${clauseRef}` (not just `clauseRef`), because different frameworks (e.g., ISO 42001 vs ISO 27001) can share the same clause number with different meanings.
- **Empty check**: Return `[]` if no ISO clauses exist. This automatically skips the section.
- **LOC management**: `WordSectionBuilders.ts` is already at ~300 LOC after Sprint 1. ISO-specific builders MUST go in `WordISOBuilders.ts` (see step 3 above).

## Files Touched

- `packages/backend/src/infrastructure/export/WordISOBuilders.ts` - CREATE (~100 LOC, createISOAlignmentSection + helpers)
- `packages/backend/src/infrastructure/export/ScoringWordExporter.ts` - MODIFY (add import + 1 line in children array)

## Tests Affected

- `packages/backend/__tests__/unit/infrastructure/export/ScoringWordExporter.test.ts` - May need assertions on document structure
- `packages/backend/__tests__/unit/infrastructure/export/WordSectionBuilders.test.ts` - New function tests

## Agent Assignment

- [x] export-agent

## Tests Required

- [ ] `packages/backend/__tests__/unit/infrastructure/export/WordSectionBuilders.test.ts` (extend)
  - Test `createISOAlignmentSection` returns empty array when no ISO clauses exist
  - Test `createISOAlignmentSection` returns heading + table when clauses exist
  - Test deduplication: same clause from multiple dimensions listed once
  - Test clauses sorted by clauseRef
  - Test dimensions column lists all referencing dimensions

## Definition of Done

- [ ] Word has ISO Standards Alignment section
- [ ] Clauses listed with status and dimension mappings
- [ ] Section only appears when ISO data exists
- [ ] All tests pass
- [ ] Under 300 LOC per file (or split done)
- [ ] No TypeScript errors
