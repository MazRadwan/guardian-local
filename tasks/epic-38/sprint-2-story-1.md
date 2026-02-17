# Story 38.2.1: Enrich ScoringExportData Type with ISO/Confidence Fields

## Description

Add ISO clause references and assessment confidence fields to the `ScoringExportData` interface so exporters (PDF, Word, Excel) can render ISO enrichment. The data already exists in `DimensionScoreData.findings` JSONB (populated by Epic 37). This story adds a flattened, export-friendly representation alongside the existing report data.

## Acceptance Criteria

- [ ] `ScoringExportData` interface extended with `dimensionISOData` array
- [ ] New `DimensionExportISOData` interface defined with confidence + ISO clause refs + Guardian-native flag
- [ ] Types imported from `domain/compliance/types.ts` (reuse Epic 37 types)
- [ ] No behavioral changes (type-only change)
- [ ] No TypeScript errors
- [ ] All existing tests pass

## Technical Approach

### 1. Add types to IScoringPDFExporter.ts

**File:** `packages/backend/src/application/interfaces/IScoringPDFExporter.ts` (MODIFY)

This file defines `ScoringExportData` (used by PDF, Word, and future Excel exporters).

```typescript
import { ScoringReportData, DimensionScoreData } from '../../domain/scoring/types';
import type { AssessmentConfidence, ISOClauseReference } from '../../domain/compliance/types.js';

/**
 * Per-dimension ISO export data, flattened for template rendering.
 * Populated from DimensionScoreData.findings JSONB.
 */
export interface DimensionExportISOData {
  /** Dimension key (e.g., 'regulatory_compliance') */
  dimension: string;
  /** Dimension display label (e.g., 'Regulatory Compliance') */
  label: string;
  /** Assessment confidence for this dimension (H/M/L + rationale) */
  confidence: AssessmentConfidence | null;
  /** ISO clause references for this dimension */
  isoClauseReferences: ISOClauseReference[];
  /** True if this is a Guardian-native dimension (no ISO mapping) */
  isGuardianNative: boolean;
}

export interface ScoringExportData {
  report: ScoringReportData;
  vendorName: string;
  solutionName: string;
  assessmentType: string;
  generatedAt: Date;
  /** Per-dimension ISO enrichment data for export templates */
  dimensionISOData: DimensionExportISOData[];
}

export interface IScoringPDFExporter {
  generatePDF(data: ScoringExportData): Promise<Buffer>;
}
```

### 2. Key Rules

- **Re-use Epic 37 types**: `AssessmentConfidence` and `ISOClauseReference` are already defined in `domain/compliance/types.ts`. Import them, do not duplicate.
- **`isGuardianNative` flag**: Set to `true` for `clinical_risk`, `vendor_capability`, `ethical_considerations`, `sustainability`. These dimensions have no ISO mapping. Templates use this flag to show "Guardian healthcare-specific criteria" label.
- **`confidence` is nullable**: Dimensions may not have confidence data (e.g., if scored before Epic 37 enrichment).
- **`isoClauseReferences` defaults to empty array**: Dimensions with no ISO mapping get `[]`.
- **Backward compatible**: The new `dimensionISOData` field needs to be populated by the service (Story 38.2.2). Until then, existing code compiles because we also update the service.

## Files Touched

- `packages/backend/src/application/interfaces/IScoringPDFExporter.ts` - MODIFY (add DimensionExportISOData interface, extend ScoringExportData)

## Tests Affected

- `packages/backend/__tests__/unit/application/services/ScoringExportService.test.ts` - Will need update in Story 38.2.2 (type shape change)
- `packages/backend/__tests__/unit/infrastructure/export/ScoringPDFExporter.test.ts` - Test fixtures need `dimensionISOData` field (can default to `[]` for now)
- `packages/backend/__tests__/unit/infrastructure/export/ScoringWordExporter.test.ts` - Same fixture update needed

## Agent Assignment

- [x] backend-agent

## Tests Required

- [ ] No new test file needed (type-only change)
- [ ] Update existing test fixtures to include `dimensionISOData: []` to satisfy TypeScript (minimal change)

## Definition of Done

- [ ] `DimensionExportISOData` interface defined
- [ ] `ScoringExportData` extended with `dimensionISOData`
- [ ] Types imported from Epic 37 compliance types (no duplication)
- [ ] All existing tests pass (may need fixture updates for new required field)
- [ ] No TypeScript errors
