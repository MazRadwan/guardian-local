# Story 22.1.1: Backend Scoring Rehydration Endpoint

## Description

Create a new REST API endpoint to fetch scoring results for a conversation. This enables the frontend to rehydrate the scoring card after page reload by fetching persisted data from the database instead of relying on in-memory state populated by WebSocket events.

The endpoint joins data from `assessmentResults`, `dimensionScores`, and `conversations` tables to return the complete scoring payload.

## Critical Pre-Requisite: Fix Conversation-Assessment Linkage

**PROBLEM:** The rehydration endpoint depends on `conversation.assessmentId` being set. However, in the **scoring-from-upload flow** (`DocumentUploadController.ts`), this linkage is **NEVER created**:

```typescript
// QuestionnaireGenerationService.ts:372 - DOES link assessment
await this.conversationService.linkAssessment(context.conversationId, assessmentResult.assessmentId);

// DocumentUploadController.ts - Does NOT link assessment after scoring!
// The assessment is created from uploaded document, but conversation.assessmentId is never set
```

**FIX REQUIRED:** Add `linkAssessment` call to `DocumentUploadController.runScoring()` after successful scoring:

```typescript
// DocumentUploadController.ts - After scoring success (around line 726)
// Link assessment to conversation for rehydration support
await this.conversationService.linkAssessment(conversationId, assessmentId);
```

## Acceptance Criteria

- [ ] **CRITICAL:** `DocumentUploadController.runScoring()` links assessment to conversation after scoring
- [ ] `GET /api/scoring/conversation/:conversationId` endpoint exists
- [ ] Returns 404 if no scoring results exist for conversation (no assessmentId linked)
- [ ] Returns 403 if authenticated user doesn't own the conversation
- [ ] Response shape matches `ScoringCompletePayload['result']` from frontend types
- [ ] Correctly joins assessmentResults + dimensionScores tables (NO assessment table join)
- [ ] Only returns the LATEST scoring batch (most recent `scoredAt`)
- [ ] Unit tests for controller with mocked service
- [ ] Integration test for full database flow

## Technical Approach

### 1. New Route File

Create `packages/backend/src/infrastructure/http/routes/scoring.routes.ts`:
- Single route: `GET /conversation/:conversationId`
- Apply `authMiddleware` for authentication
- Delegate to `ScoringRehydrationController`

### 2. New Controller

Create `packages/backend/src/infrastructure/http/controllers/ScoringRehydrationController.ts`:
- Extract `conversationId` from params
- Extract `userId` from authenticated request
- Call `ScoringService.getResultForConversation(conversationId, userId)`
- Map response or return appropriate HTTP status

### 3. Add Service Method

Add to `packages/backend/src/application/services/ScoringService.ts`:
```typescript
async getResultForConversation(
  conversationId: string,
  userId: string
): Promise<ScoringCompletePayload['result'] | null>
```

Logic:
1. Look up conversation by ID
2. Verify user owns conversation (403 if not)
3. Get assessmentId from conversation (return 404 if not linked)
4. Fetch latest assessmentResult for that assessment (most recent `scoredAt`)
5. Fetch dimensionScores for that batch
6. Map to `ScoringCompletePayload['result']` shape

**Note:** This is a read-model query (retrieval, not orchestration). Consider extracting to a dedicated read service in future if `ScoringService` grows.

### 4. Register Route

In `packages/backend/src/index.ts`:
```typescript
import { createScoringRoutes } from './infrastructure/http/routes/scoring.routes.js';
// ...
const scoringRehydrationController = new ScoringRehydrationController(scoringService);
server.registerRoutes('/api/scoring', createScoringRoutes(scoringRehydrationController, authService));
```

### Response Shape

**MUST match `ScoringCompletePayload['result']` from `apps/web/src/lib/websocket.ts:227-240`:**

```typescript
// Exact type from apps/web/src/lib/websocket.ts
interface ScoringRehydrationResponse {
  compositeScore: number;
  recommendation: 'approve' | 'conditional' | 'decline' | 'more_info';
  overallRiskRating: 'low' | 'medium' | 'high' | 'critical';
  executiveSummary: string;
  keyFindings: string[];
  dimensionScores: Array<{
    dimension: string;
    score: number;
    riskRating: 'low' | 'medium' | 'high' | 'critical';
  }>;
  batchId: string;
  assessmentId: string;
}
```

**Note:** Do NOT add `vendorName`/`solutionName` - they are not in the existing type. The frontend already gets vendor info from elsewhere.

## Files Touched

- `packages/backend/src/infrastructure/http/controllers/DocumentUploadController.ts` - **MODIFY** Add `linkAssessment` call after scoring success
- `packages/backend/src/infrastructure/http/routes/scoring.routes.ts` - **NEW** route file
- `packages/backend/src/infrastructure/http/controllers/ScoringRehydrationController.ts` - **NEW** controller
- `packages/backend/src/application/services/ScoringService.ts` - Add `getResultForConversation` read-model query
- `packages/backend/src/application/interfaces/IScoringService.ts` - Add interface method
- `packages/backend/src/index.ts` - Register new route

## Tests Affected

Existing tests that may need updates:
- `packages/backend/__tests__/unit/application/services/ScoringService.test.ts` - Add tests for new method
- `packages/backend/__tests__/integration/auto-trigger-scoring.test.ts` - May need update to verify linkAssessment is called
- `packages/backend/__tests__/unit/infrastructure/http/DocumentUploadController.test.ts` - If exists, add test for linkAssessment call

## Agent Assignment

- [x] backend-agent

## Tests Required

- [ ] `packages/backend/__tests__/unit/infrastructure/http/ScoringRehydrationController.test.ts` - Unit test with mocked service
  - Test successful retrieval returns 200 with correct shape
  - Test 404 when no scoring results
  - Test 403 when user doesn't own conversation
  - Test 401 when not authenticated
- [ ] `packages/backend/__tests__/integration/scoring-rehydration.test.ts` - Integration test
  - Create user, conversation, assessment, scoring results in test DB
  - Call endpoint and verify response
  - Test ownership check with different user
  - Test conversation without assessment returns 404

## Definition of Done

- [ ] All acceptance criteria met
- [ ] Unit tests written and passing
- [ ] Integration tests written and passing
- [ ] No TypeScript errors
- [ ] No lint errors
- [ ] Response shape matches frontend `ScoringCompletePayload['result']`
