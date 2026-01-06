# Story 5b: Scoring Export Delivery

## Reviewer Feedback Addressed (v4)

| Finding | Action | Rationale |
|---------|--------|-----------|
| API contract divergence (`:format` vs `/pdf\|/word`) | **Fixed** | Clarified separate endpoints in contract |
| window.open without auth headers | **Fixed** | Reuse `DownloadButton` component (already has fetch+blob) |
| batchId IDOR risk | **No change** | Already scoped to assessmentId which has ownership check |
| error.message.includes brittle | **No change** | Pragmatic for this scope; follow existing patterns |
| Ownership check in controller | **No change** | Follows existing `ExportController` pattern for consistency |
| Test plan vs implementation mismatch | **Fixed** | Removed "invalid format 400" test (N/A with separate endpoints) |
| Brittle test selectors (button text) | **Fixed** | Changed to `getByRole` queries |
| **UI Consistency (v4)** | **Fixed** | Reuse `DownloadButton` instead of custom buttons |

---

## Overview

Wire the scoring export functionality to allow users to download PDF and Word reports from the ScoringResultCard. The export generation layer exists (Story 4.3); this story adds the HTTP endpoint and frontend button handlers.

**Phase:** 5 (Integration) | **Parallel:** Yes | **Agent:** `chat-backend-agent` + `frontend-agent`

---

## Dependency Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           STORY 5b DEPENDENCIES                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  [Story 4.3] ─────────────┐                                                 │
│  ScoringExportService     │                                                 │
│  ScoringPDFExporter       ├──────► [Story 5b] ──────► [Story 6.1]          │
│  ScoringWordExporter      │         Export            E2E Tests             │
│  (✅ COMPLETE)            │         Delivery                                │
│                           │                                                 │
│  [Story 4.2] ─────────────┘                                                 │
│  ScoringResultCard                                                          │
│  (✅ COMPLETE)                                                              │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Sprint Structure (Phased & Parallel)

```
┌────────────────────────────────────────────────────────────────────────────┐
│                          PHASE 0: Research (Sequential)                     │
│                              ~5 min | Research Agent                        │
├────────────────────────────────────────────────────────────────────────────┤
│  5b.0  Research existing patterns                                           │
│        - Route registration in index.ts                                     │
│        - Controller pattern (ExportController)                              │
│        - ScoringExportService API                                           │
│        - ScoringResultCard props (onExportPDF, onExportWord)               │
└───────────────────────────────┬────────────────────────────────────────────┘
                                │
                                ▼
┌───────────────────────────────────────────────────────────────────────────────┐
│                     PHASE 1: Implementation (PARALLEL)                         │
│                           ~15 min total                                         │
├────────────────────────────────┬──────────────────────────────────────────────┤
│   BACKEND (chat-backend-agent) │   FRONTEND (frontend-agent)                  │
│   ─────────────────────────────│───────────────────────────────────────────── │
│                                │                                               │
│   5b.1  Create Controller      │   5b.4  Extend DownloadButton                │
│         ScoringExportController│         - Add exportType prop                 │
│         - exportToPDF()        │         - Build URL based on exportType      │
│         - exportToWord()       │         - Default: 'questionnaire'           │
│                                │                                               │
│         ▼                      │         ▼                                     │
│   5b.2  Create Routes          │   5b.5  Update ScoringResultCard             │
│         scoring.export.routes  │         - Use DownloadButton components      │
│         - GET /:id/pdf         │         - Remove custom inline buttons       │
│         - GET /:id/word        │         - Remove onExport* props             │
│                                │                                               │
│         ▼                      │   (Uses same DownloadButton UI)              │
│   5b.3  Register Routes        │                                               │
│         in index.ts            │                                               │
│         /api/export/scoring    │                                               │
├────────────────────────────────┴──────────────────────────────────────────────┤
│   Run in parallel: Task(chat-backend-agent) || Task(frontend-agent)           │
└───────────────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                     PHASE 2: Unit Tests (PARALLEL)                          │
│                           ~10 min total                                      │
├────────────────────────────────┬───────────────────────────────────────────┤
│   BACKEND (chat-backend-agent) │   FRONTEND (frontend-agent)               │
│   ─────────────────────────────│────────────────────────────────────────── │
│                                │                                            │
│   5b.5  Controller Unit Tests  │   5b.6  DownloadButton Tests              │
│         - Not found 404        │         - Default uses questionnaire URL  │
│         - Forbidden 403        │         - exportType=scoring uses new URL │
│         - Success PDF 200      │         - Existing tests still pass       │
│         - Success Word 200     │                                            │
│                                │                                            │
├────────────────────────────────┴───────────────────────────────────────────┤
│   Run in parallel: Task(chat-backend-agent) || Task(frontend-agent)         │
└────────────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                    PHASE 3: Verification (Sequential)                        │
│                           ~5 min | Any Agent                                 │
├────────────────────────────────────────────────────────────────────────────┤
│  5b.7  Build Verification                                                    │
│        pnpm build (must pass)                                                │
│                                                                              │
│  5b.8  Test Verification                                                     │
│        pnpm test:unit (must pass)                                            │
└────────────────────────────────────────────────────────────────────────────┘
```

---

## Dependencies

- **Depends on:** Story 4.3 (Scoring Exporters - complete), Story 4.2 (ScoringResultCard)
- **Blocks:** Story 6.1 (E2E tests assume this endpoint exists)

---

## Files to Create/Modify

| File | Action | Phase | Agent |
|------|--------|-------|-------|
| `packages/backend/src/infrastructure/http/controllers/ScoringExportController.ts` | CREATE | 1 | chat-backend-agent |
| `packages/backend/src/infrastructure/http/routes/scoring.export.routes.ts` | CREATE | 1 | chat-backend-agent |
| `packages/backend/src/index.ts` | MODIFY | 1 | chat-backend-agent |
| `apps/web/src/components/chat/DownloadButton.tsx` | MODIFY | 1 | frontend-agent |
| `apps/web/src/components/chat/ScoringResultCard.tsx` | MODIFY | 1 | frontend-agent |
| `packages/backend/__tests__/unit/infrastructure/http/ScoringExportController.test.ts` | CREATE | 2 | chat-backend-agent |
| `apps/web/src/components/chat/__tests__/DownloadButton.test.tsx` | MODIFY | 2 | frontend-agent |

---

## API Contract (Shared Knowledge)

Both agents need this contract before working in parallel:

### Endpoints (Separate routes, NOT dynamic format)

| Endpoint | Content-Type |
|----------|--------------|
| `GET /api/export/scoring/:assessmentId/pdf` | `application/pdf` |
| `GET /api/export/scoring/:assessmentId/word` | `application/vnd.openxmlformats-officedocument.wordprocessingml.document` |

**Parameters:**
- `assessmentId` (path) - Assessment ID to export

**Query Parameters (optional):**
- `batchId` - Specific scoring batch to export (defaults to latest, scoped to assessmentId)

**Response:**
- `200 OK` - File download with appropriate Content-Type and Content-Disposition
- `404 Not Found` - Assessment or scoring results not found
- `403 Forbidden` - User doesn't own this assessment (checked via `assessment.createdBy`)

**Auth:** Bearer token (Authorization header required - NOT cookie-based)

---

## Phase 0: Research (5b.0)

### Existing Patterns Found

**Route Registration Pattern** (`src/index.ts`):
```typescript
import { createScoringExportRoutes } from './infrastructure/http/routes/scoring.export.routes.js';
// ...
server.registerRoutes('/api/export/scoring', createScoringExportRoutes(scoringExportController, authService));
```

**Controller Pattern** (see `ExportController.ts`):
```typescript
export class ScoringExportController {
  constructor(private readonly exportService: ScoringExportService) {}

  exportToPDF = async (req: Request, res: Response, next: NextFunction) => { ... }
  exportToWord = async (req: Request, res: Response, next: NextFunction) => { ... }
}
```

**ScoringExportService API**:
```typescript
exportToPDF(assessmentId: string, batchId?: string): Promise<Buffer>
exportToWord(assessmentId: string, batchId?: string): Promise<Buffer>
```

**ScoringResultCard Props** (already wired):
```typescript
interface ScoringResultCardProps {
  result: ScoringResultData;
  onExportPDF: () => void;
  onExportWord: () => void;
  isExporting?: boolean;
}
```

---

## Phase 1: Backend Implementation

### 5b.1 - Create ScoringExportController

**File:** `packages/backend/src/infrastructure/http/controllers/ScoringExportController.ts`

```typescript
import { Request, Response, NextFunction } from 'express';
import { ScoringExportService } from '../../../application/services/ScoringExportService';
import { IAssessmentRepository } from '../../../application/interfaces/IAssessmentRepository';

export class ScoringExportController {
  constructor(
    private readonly exportService: ScoringExportService,
    private readonly assessmentRepository: IAssessmentRepository
  ) {}

  exportToPDF = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { assessmentId } = req.params;
      const { batchId } = req.query;
      const userId = req.user?.id;

      // Verify ownership
      const assessment = await this.assessmentRepository.findById(assessmentId);
      if (!assessment) {
        res.status(404).json({ error: 'Assessment not found' });
        return;
      }
      if (assessment.createdBy !== userId) {
        res.status(403).json({ error: 'Access denied' });
        return;
      }

      const buffer = await this.exportService.exportToPDF(
        assessmentId,
        batchId as string | undefined
      );

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="scoring-report-${assessmentId.slice(0, 8)}.pdf"`
      );
      res.setHeader('Content-Length', buffer.length);
      res.send(buffer);
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        res.status(404).json({ error: error.message });
        return;
      }
      next(error);
    }
  };

  exportToWord = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { assessmentId } = req.params;
      const { batchId } = req.query;
      const userId = req.user?.id;

      // Verify ownership
      const assessment = await this.assessmentRepository.findById(assessmentId);
      if (!assessment) {
        res.status(404).json({ error: 'Assessment not found' });
        return;
      }
      if (assessment.createdBy !== userId) {
        res.status(403).json({ error: 'Access denied' });
        return;
      }

      const buffer = await this.exportService.exportToWord(
        assessmentId,
        batchId as string | undefined
      );

      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      );
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="scoring-report-${assessmentId.slice(0, 8)}.docx"`
      );
      res.setHeader('Content-Length', buffer.length);
      res.send(buffer);
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        res.status(404).json({ error: error.message });
        return;
      }
      next(error);
    }
  };
}
```

### 5b.2 - Create Routes

**File:** `packages/backend/src/infrastructure/http/routes/scoring.export.routes.ts`

```typescript
import { Router } from 'express';
import { ScoringExportController } from '../controllers/ScoringExportController';
import { AuthService } from '../../../application/services/AuthService';
import { authMiddleware } from '../middleware/auth.middleware';

export function createScoringExportRoutes(
  controller: ScoringExportController,
  authService: AuthService
): Router {
  const router = Router();

  /**
   * @route   GET /api/export/scoring/:assessmentId/pdf
   * @desc    Export scoring report to PDF
   * @access  Protected
   */
  router.get(
    '/:assessmentId/pdf',
    authMiddleware(authService),
    controller.exportToPDF
  );

  /**
   * @route   GET /api/export/scoring/:assessmentId/word
   * @desc    Export scoring report to Word (.docx)
   * @access  Protected
   */
  router.get(
    '/:assessmentId/word',
    authMiddleware(authService),
    controller.exportToWord
  );

  return router;
}
```

### 5b.3 - Register Routes

**File:** `packages/backend/src/index.ts` (add to imports and registration)

```typescript
// Add import
import { createScoringExportRoutes } from './infrastructure/http/routes/scoring.export.routes.js';
import { ScoringExportController } from './infrastructure/http/controllers/ScoringExportController.js';

// Add controller instantiation (after exportService and assessmentRepo are created)
const scoringExportController = new ScoringExportController(
  scoringExportService,
  assessmentRepository
);

// Add route registration
server.registerRoutes('/api/export/scoring', createScoringExportRoutes(scoringExportController, authService));
```

---

## Phase 1: Frontend Implementation

### 5b.4 - Extend DownloadButton

**File:** `apps/web/src/components/chat/DownloadButton.tsx`

Add `exportType` prop to support both questionnaire and scoring exports:

```typescript
export interface DownloadButtonProps {
  assessmentId: string;
  format: 'pdf' | 'word' | 'excel';
  exportType?: 'questionnaire' | 'scoring';  // NEW - defaults to 'questionnaire'
  label?: string;
  onDownload?: () => void;
}

export function DownloadButton({
  assessmentId,
  format,
  exportType = 'questionnaire',  // Backward compatible default
  label,
  onDownload,
}: DownloadButtonProps) {
  // ... existing state ...

  const handleDownload = async () => {
    // ... existing auth check ...

    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

    // NEW: Build URL based on exportType
    const url = exportType === 'scoring'
      ? `${apiUrl}/api/export/scoring/${assessmentId}/${format}`
      : `${apiUrl}/api/assessments/${assessmentId}/export/${format}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });

    // ... rest unchanged (401 handling, blob download, etc.) ...
  };

  // ... rest unchanged ...
}
```

### 5b.5 - Update ScoringResultCard

**File:** `apps/web/src/components/chat/ScoringResultCard.tsx`

Replace custom inline buttons with `DownloadButton` components:

```typescript
import { DownloadButton } from './DownloadButton';

interface ScoringResultCardProps {
  result: ScoringResultData;
  // REMOVE: onExportPDF, onExportWord, isExporting props (no longer needed)
}

export function ScoringResultCard({ result }: ScoringResultCardProps) {
  // ... existing code ...

  return (
    <div className="...">
      {/* ... existing result display ... */}

      {/* Export Actions - Now using DownloadButton for consistency */}
      <div className="px-6 py-4 bg-gray-50 flex gap-3">
        <DownloadButton
          assessmentId={result.assessmentId}
          format="pdf"
          exportType="scoring"
          label="Export PDF"
        />
        <DownloadButton
          assessmentId={result.assessmentId}
          format="word"
          exportType="scoring"
          label="Export Word"
        />
      </div>
    </div>
  );
}
```

**Benefits:**
- Consistent UI (spinner, error handling, auth flow)
- No duplicate code
- Single component to maintain
- Same visual design across app

---

## Phase 2: Unit Tests

### 5b.5 - Backend Controller Tests

**File:** `packages/backend/__tests__/unit/infrastructure/http/ScoringExportController.test.ts`

```typescript
import { Request, Response, NextFunction } from 'express';
import { ScoringExportController } from '../../../../src/infrastructure/http/controllers/ScoringExportController';

describe('ScoringExportController', () => {
  let controller: ScoringExportController;
  let mockExportService: any;
  let mockAssessmentRepo: any;
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    mockExportService = {
      exportToPDF: jest.fn(),
      exportToWord: jest.fn(),
    };
    mockAssessmentRepo = {
      findById: jest.fn(),
    };
    controller = new ScoringExportController(mockExportService, mockAssessmentRepo);

    mockReq = {
      params: { assessmentId: 'assess-123' },
      query: {},
      user: { id: 'user-123' },
    };
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      setHeader: jest.fn(),
      send: jest.fn(),
    };
    mockNext = jest.fn();
  });

  describe('exportToPDF', () => {
    it('returns 404 when assessment not found', async () => {
      mockAssessmentRepo.findById.mockResolvedValue(null);

      await controller.exportToPDF(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(404);
    });

    it('returns 403 when user does not own assessment', async () => {
      mockAssessmentRepo.findById.mockResolvedValue({
        id: 'assess-123',
        createdBy: 'other-user',
      });

      await controller.exportToPDF(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(403);
    });

    it('returns PDF with correct headers', async () => {
      mockAssessmentRepo.findById.mockResolvedValue({
        id: 'assess-123',
        createdBy: 'user-123',
      });
      mockExportService.exportToPDF.mockResolvedValue(Buffer.from('%PDF-1.4'));

      await controller.exportToPDF(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Type', 'application/pdf');
      expect(mockRes.send).toHaveBeenCalled();
    });
  });

  describe('exportToWord', () => {
    it('returns Word document with correct headers', async () => {
      mockAssessmentRepo.findById.mockResolvedValue({
        id: 'assess-123',
        createdBy: 'user-123',
      });
      mockExportService.exportToWord.mockResolvedValue(Buffer.from('PK...'));

      await controller.exportToWord(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      );
    });
  });
});
```

### 5b.6 - Frontend Tests (DownloadButton)

**File:** `apps/web/src/components/chat/__tests__/DownloadButton.test.tsx`

Add tests for the new `exportType="scoring"` prop:

```typescript
describe('DownloadButton with exportType', () => {
  it('uses questionnaire endpoint by default', async () => {
    const mockBlob = new Blob(['test'], { type: 'application/pdf' });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      blob: () => Promise.resolve(mockBlob),
    });

    render(<DownloadButton assessmentId="test-123" format="pdf" />);
    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/assessments/test-123/export/pdf'),
        expect.any(Object)
      );
    });
  });

  it('uses scoring endpoint when exportType="scoring"', async () => {
    const mockBlob = new Blob(['test'], { type: 'application/pdf' });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      blob: () => Promise.resolve(mockBlob),
    });

    render(
      <DownloadButton
        assessmentId="test-123"
        format="pdf"
        exportType="scoring"
      />
    );
    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/export/scoring/test-123/pdf'),
        expect.any(Object)
      );
    });
  });

  it('uses scoring endpoint for word format', async () => {
    const mockBlob = new Blob(['test'], { type: 'application/vnd.openxmlformats' });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      blob: () => Promise.resolve(mockBlob),
    });

    render(
      <DownloadButton
        assessmentId="test-123"
        format="word"
        exportType="scoring"
      />
    );
    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/export/scoring/test-123/word'),
        expect.any(Object)
      );
    });
  });
});
```

**Why this approach:**
- Tests the actual DownloadButton component with new prop
- Existing tests still pass (default behavior unchanged)
- No new utility files needed

---

## Agent Execution Plan

### Parallel Execution Command

```bash
# Run both agents in parallel from main agent
Task(subagent_type: "chat-backend-agent", prompt: "Execute Story 5b backend tasks...")
Task(subagent_type: "frontend-agent", prompt: "Execute Story 5b frontend tasks...")
```

### chat-backend-agent Prompt

```
Execute Story 5b Backend Implementation:

1. Create ScoringExportController at:
   packages/backend/src/infrastructure/http/controllers/ScoringExportController.ts
   - Follow ExportController pattern
   - exportToPDF and exportToWord methods
   - Verify assessment ownership before export

2. Create routes at:
   packages/backend/src/infrastructure/http/routes/scoring.export.routes.ts
   - GET /:assessmentId/pdf
   - GET /:assessmentId/word
   - Use authMiddleware

3. Register routes in index.ts:
   - Import controller and routes
   - Instantiate controller with ScoringExportService + AssessmentRepository
   - Register at /api/export/scoring

4. Create unit tests at:
   packages/backend/__tests__/unit/infrastructure/http/ScoringExportController.test.ts

5. Run: pnpm --filter @guardian/backend test:unit

Refer to: tasks/epic-15/5b-scoring-export-delivery.md for implementation details.
```

### frontend-agent Prompt

```
Execute Story 5b Frontend Implementation:

Goal: Reuse DownloadButton component for scoring exports (UI consistency).

1. Extend DownloadButton (apps/web/src/components/chat/DownloadButton.tsx):
   - Add optional prop: exportType?: 'questionnaire' | 'scoring'
   - Default to 'questionnaire' for backward compatibility
   - Build URL based on exportType:
     - questionnaire: /api/assessments/${id}/export/${format}
     - scoring: /api/export/scoring/${id}/${format}

2. Update ScoringResultCard (apps/web/src/components/chat/ScoringResultCard.tsx):
   - Replace custom inline buttons with DownloadButton components
   - Remove onExportPDF, onExportWord, isExporting props
   - Add: <DownloadButton assessmentId={...} format="pdf" exportType="scoring" />

3. Add tests to DownloadButton.test.tsx:
   - Test default uses questionnaire endpoint
   - Test exportType="scoring" uses scoring endpoint

4. Run: pnpm --filter @guardian/web test:unit

API Contract:
- GET /api/export/scoring/:assessmentId/pdf
- GET /api/export/scoring/:assessmentId/word

Refer to: tasks/epic-15/5b-scoring-export-delivery.md for details.
```

---

## Acceptance Criteria

**Backend:**
- [ ] HTTP endpoint `GET /api/export/scoring/:assessmentId/pdf` implemented
- [ ] HTTP endpoint `GET /api/export/scoring/:assessmentId/word` implemented
- [ ] Endpoint validates assessment ownership via `createdBy` (403 if not owner)
- [ ] Endpoint returns 404 if assessment or scoring results not found
- [ ] PDF downloads with correct Content-Type and filename
- [ ] Word downloads with correct Content-Type and filename
- [ ] Unit tests for controller pass

**Frontend:**
- [ ] `DownloadButton` extended with `exportType` prop
- [ ] Default `exportType` is 'questionnaire' (backward compatible)
- [ ] `exportType="scoring"` uses `/api/export/scoring/:id/:format` endpoint
- [ ] `ScoringResultCard` uses `DownloadButton` (removes custom buttons)
- [ ] UI consistent: same spinner, error handling, auth flow as questionnaire export
- [ ] Unit tests for `exportType` prop pass

**Build:**
- [ ] `pnpm build` passes

---

## Time Estimates

| Phase | Duration | Parallelism |
|-------|----------|-------------|
| Phase 0 (Research) | 5 min | Sequential |
| Phase 1 (Implementation) | 15 min | 2 agents parallel |
| Phase 2 (Unit Tests) | 10 min | 2 agents parallel |
| Phase 3 (Verification) | 5 min | Sequential |
| **Total** | **~25 min** | (vs ~45 min sequential) |
