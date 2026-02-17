# Story 38.5.3: Wire Excel into Export Service + Controller

## Description

Wire `ScoringExcelExporter` into the DI container, add `exportToExcel()` to `ScoringExportService`, and add the `GET /api/export/scoring/:assessmentId/excel` route to `ScoringExportController`. The frontend `DownloadButton` already supports `format: 'excel'` -- it just needs the backend route to exist.

## Acceptance Criteria

- [ ] `ScoringExportService` has `exportToExcel(assessmentId, batchId?)` method
- [ ] `ScoringExportController` has `exportToExcel` route handler
- [ ] `GET /api/export/scoring/:assessmentId/excel` returns Excel file
- [ ] DI container (`container.ts`) wires `ScoringExcelExporter`
- [ ] Route registered in Express routing
- [ ] Content-Type is `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
- [ ] Content-Disposition has `.xlsx` extension
- [ ] Under 300 LOC per file

## Technical Approach

### 1. Update ScoringExportService

**File:** `packages/backend/src/application/services/ScoringExportService.ts` (MODIFY)

Add Excel exporter dependency and export method:

```typescript
import { IScoringExcelExporter } from '../interfaces/IScoringExcelExporter';

export class ScoringExportService {
  constructor(
    // ... existing params ...
    private readonly excelExporter: IScoringExcelExporter  // NEW
  ) {}

  async exportToExcel(assessmentId: string, batchId?: string): Promise<Buffer> {
    const data = await this.getScoringData(assessmentId, batchId);
    return this.excelExporter.generateExcel(data);
  }

  // ... existing methods unchanged ...
}
```

### 2. Update ScoringExportController

**File:** `packages/backend/src/infrastructure/http/controllers/ScoringExportController.ts` (MODIFY)

Add Excel export handler (follow same pattern as PDF/Word):

```typescript
/**
 * Exports scoring report to Excel
 * GET /api/export/scoring/:assessmentId/excel
 */
exportToExcel = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { assessmentId } = req.params;
    const { batchId } = req.query;
    const userId = req.user?.id;

    // Verify ownership (same pattern as PDF/Word)
    const assessment = await this.assessmentRepository.findById(assessmentId);
    if (!assessment) {
      res.status(404).json({ error: 'Assessment not found' });
      return;
    }
    if (assessment.createdBy !== userId) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const buffer = await this.exportService.exportToExcel(
      assessmentId,
      batchId as string | undefined
    );

    const filename = this.generateFilename(assessmentId, 'xlsx');
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', buildContentDisposition(filename));
    res.setHeader('Content-Length', buffer.length);
    res.send(buffer);
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.includes('not found') ||
        error.message.includes('results found') ||
        error.message.includes('scores found'))
    ) {
      res.status(404).json({ error: error.message });
      return;
    }
    next(error);
  }
};
```

### 3. Update container.ts

**File:** `packages/backend/src/container.ts` (MODIFY)

```typescript
import { ScoringExcelExporter } from './infrastructure/export/ScoringExcelExporter.js';

// After scoringWordExporter:
const scoringExcelExporter = new ScoringExcelExporter();

// Update ScoringExportService constructor to include excel exporter:
export const scoringExportService = new ScoringExportService(
  assessmentRepo,
  assessmentResultRepo,
  dimensionScoreRepo,
  responseRepo,
  scoringPDFExporter,
  scoringWordExporter,
  exportNarrativeGenerator,
  scoringExcelExporter,  // NEW
);
```

### 4. Register route

Find the export routes registration and add:

```typescript
// IMPORTANT: Use relative path, not absolute. This router is mounted at /api/export/scoring
// via createScoringExportRoutes() in scoring.export.routes.ts.
// See existing routes: '/:assessmentId/pdf', '/:assessmentId/word'
router.get('/:assessmentId/excel', authMiddleware, scoringExportController.exportToExcel);
```

### 5. Key Rules

- **Follow existing pattern exactly**: The PDF and Word controller methods have identical auth + ownership checks. Copy the pattern for Excel.
- **`ScoringExportService` constructor change**: Adding a new parameter. Existing tests that construct this service will need fixture updates (add a mock Excel exporter).
- **Frontend already supports `format: 'excel'`**: `DownloadButton` already has `'excel'` in its format type and URL building logic. It just needs the backend route to respond.
- **LOC check**: `ScoringExportController.ts` is 136 LOC. Adding ~40 LOC for the Excel handler brings it to ~176 LOC (under 300).

## Files Touched

- `packages/backend/src/application/services/ScoringExportService.ts` - MODIFY (add excelExporter param + exportToExcel method)
- `packages/backend/src/infrastructure/http/controllers/ScoringExportController.ts` - MODIFY (add exportToExcel handler)
- `packages/backend/src/container.ts` - MODIFY (wire ScoringExcelExporter)
- `packages/backend/src/infrastructure/http/routes/scoring.export.routes.ts` - MODIFY (add Excel route)

## Tests Affected

- `packages/backend/__tests__/unit/application/services/ScoringExportService.test.ts` - Constructor mock needs Excel exporter
- `packages/backend/__tests__/unit/infrastructure/http/controllers/ScoringExportController.test.ts` - If exists, need Excel tests

## Agent Assignment

- [x] backend-agent

## Tests Required

- [ ] `packages/backend/__tests__/unit/application/services/ScoringExportService.test.ts` (extend)
  - Test `exportToExcel` calls `getScoringData` then `excelExporter.generateExcel`
  - Test `exportToExcel` passes enriched data with `dimensionISOData`
- [ ] `packages/backend/__tests__/unit/infrastructure/http/controllers/ScoringExportController.test.ts` (extend or create)
  - Test Excel route returns 200 with correct content-type
  - Test Excel route returns 404 for missing assessment
  - Test Excel route returns 403 for unauthorized user
  - Test Content-Disposition header has `.xlsx` extension

## Definition of Done

- [ ] `exportToExcel()` method works in service
- [ ] Excel controller route handles auth + ownership
- [ ] DI container wires the new exporter
- [ ] Route registered and serving Excel files
- [ ] All tests pass
- [ ] Under 300 LOC per file
- [ ] No TypeScript errors
