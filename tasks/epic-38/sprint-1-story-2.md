# Story 38.1.2: Split ScoringWordExporter Sections

## Description

Extract the section builder methods and inline formatting parser from `ScoringWordExporter.ts` (483 LOC) into a new `WordSectionBuilders.ts` file. The exporter currently has 7 private methods (lines 122-482) that build individual Word document sections. Moving these reduces the exporter to ~120 LOC (just the `generateWord` method and section composition). Zero behavioral change.

## Acceptance Criteria

- [ ] `WordSectionBuilders.ts` created with 7 extracted functions + constants
- [ ] `createHeader()` exact logic from ScoringWordExporter lines 122-158
- [ ] `createScoreBanner()` exact logic from lines 161-208
- [ ] `createExecutiveSummary()` exact logic from lines 210-224
- [ ] `createKeyFindings()` exact logic from lines 226-244
- [ ] `createDimensionTable()` exact logic from lines 247-315
- [ ] `createNarrativeReport()` exact logic from lines 317-423
- [ ] `parseInlineFormatting()` exact logic from lines 429-482
- [ ] Color constants (`RISK_COLORS`, `RECOMMENDATION_COLORS`, `BRAND_COLOR`) moved to new file
- [ ] `ScoringWordExporter.ts` imports and delegates to the new builders
- [ ] `ScoringWordExporter.ts` under 300 LOC after extraction
- [ ] All existing `ScoringWordExporter.test.ts` tests pass unchanged
- [ ] No TypeScript errors

## Technical Approach

### 1. Create WordSectionBuilders.ts

**File:** `packages/backend/src/infrastructure/export/WordSectionBuilders.ts` (CREATE)

Convert instance methods to exported functions. All methods only use their `data: ScoringExportData` parameter (no `this` dependencies except `parseInlineFormatting` which calls itself).

```typescript
import {
  Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell,
  WidthType, BorderStyle, AlignmentType, ShadingType,
  PageBreak, PageNumber, convertInchesToTwip,
} from 'docx';
import { ScoringExportData } from '../../application/interfaces/IScoringPDFExporter';
import { DIMENSION_CONFIG } from '../../domain/scoring/rubric';

// Color constants
export const RISK_COLORS = {
  low: { background: 'DCFCE7', text: '166534' },
  medium: { background: 'FEF3C7', text: '92400E' },
  high: { background: 'FFEDD5', text: 'C2410C' },
  critical: { background: 'FEE2E2', text: '991B1B' },
};

export const RECOMMENDATION_COLORS = {
  approve: { background: 'DCFCE7', text: '166534' },
  conditional: { background: 'FEF3C7', text: '92400E' },
  decline: { background: 'FEE2E2', text: '991B1B' },
  more_info: { background: 'DBEAFE', text: '1E40AF' },
};

export const BRAND_COLOR = '7C3AED';

export function createHeader(data: ScoringExportData): Paragraph[] { ... }
export function createScoreBanner(data: ScoringExportData): Paragraph[] { ... }
export function createExecutiveSummary(data: ScoringExportData): Paragraph[] { ... }
export function createKeyFindings(data: ScoringExportData): Paragraph[] { ... }
export function createDimensionTable(data: ScoringExportData): (Paragraph | Table)[] { ... }
export function createNarrativeReport(data: ScoringExportData): Paragraph[] { ... }
export function parseInlineFormatting(text: string): TextRun[] { ... }
```

### 2. Update ScoringWordExporter.ts

**File:** `packages/backend/src/infrastructure/export/ScoringWordExporter.ts` (MODIFY)

```typescript
import { Document, Paragraph, Footer, PageBreak, PageNumber, TextRun, Packer, convertInchesToTwip } from 'docx';
import { IScoringWordExporter } from '../../application/interfaces/IScoringWordExporter';
import { ScoringExportData } from '../../application/interfaces/IScoringPDFExporter';
import {
  BRAND_COLOR,
  createHeader,
  createScoreBanner,
  createExecutiveSummary,
  createKeyFindings,
  createDimensionTable,
  createNarrativeReport,
} from './WordSectionBuilders.js';

export class ScoringWordExporter implements IScoringWordExporter {
  async generateWord(data: ScoringExportData): Promise<Buffer> {
    const doc = new Document({
      styles: { /* same style definitions */ },
      sections: [{
        properties: { /* same page properties */ },
        footers: { /* same footer */ },
        children: [
          ...createHeader(data),
          ...createScoreBanner(data),
          ...createExecutiveSummary(data),
          ...createKeyFindings(data),
          new Paragraph({ children: [new PageBreak()] }),
          ...createDimensionTable(data),
          new Paragraph({ children: [new PageBreak()] }),
          ...createNarrativeReport(data),
        ],
      }],
    });
    return await Packer.toBuffer(doc);
  }
}
```

### 3. Key Rules

- **Direct function copy**: All 7 methods copied verbatim, `this.` references replaced with direct calls.
- **`createNarrativeReport` calls `parseInlineFormatting`**: Change `this.parseInlineFormatting(...)` to `parseInlineFormatting(...)` within the function body.
- **Style definitions stay** in ScoringWordExporter.ts -- they are part of the Document config, not section-level.
- **Footer stays** in ScoringWordExporter.ts -- it references `data.report.rubricVersion` and is part of Document config.

## Files Touched

- `packages/backend/src/infrastructure/export/WordSectionBuilders.ts` - CREATE (~300 LOC, follows data file pattern)
- `packages/backend/src/infrastructure/export/ScoringWordExporter.ts` - MODIFY (keep ~120 LOC: styles, footer, section composition)

## Tests Affected

- `packages/backend/__tests__/unit/infrastructure/export/ScoringWordExporter.test.ts` - Should pass without changes (public API unchanged)

## Agent Assignment

- [x] export-agent

## Tests Required

- [ ] `packages/backend/__tests__/unit/infrastructure/export/WordSectionBuilders.test.ts`
  - Test `createHeader` returns 3 paragraphs with vendor/solution/assessmentId
  - Test `createScoreBanner` returns paragraphs with score and recommendation
  - Test `createExecutiveSummary` returns heading + content paragraph
  - Test `createKeyFindings` returns heading + bullet list
  - Test `createDimensionTable` returns heading + table with correct row count
  - Test `createDimensionTable` uses DIMENSION_CONFIG labels
  - Test `createNarrativeReport` handles headings (## and ###)
  - Test `createNarrativeReport` handles bullet points
  - Test `createNarrativeReport` handles horizontal rules
  - Test `parseInlineFormatting` handles **bold** text
  - Test `parseInlineFormatting` handles *italic* text
  - Test `parseInlineFormatting` handles `code` text
  - Test `parseInlineFormatting` handles plain text (no formatting)

## Definition of Done

- [ ] `WordSectionBuilders.ts` created with all 7 functions + constants
- [ ] `ScoringWordExporter.ts` under 300 LOC
- [ ] All existing ScoringWordExporter tests pass (zero regressions)
- [ ] New builder tests written and passing
- [ ] No TypeScript errors
- [ ] No behavioral changes
