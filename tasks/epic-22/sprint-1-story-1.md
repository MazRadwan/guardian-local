# Story 22.1.1: Backend Scoring Rehydration Endpoint

## Description

Create a new REST API endpoint to fetch scoring results for a conversation. This enables the frontend to rehydrate the scoring card after page reload by fetching persisted data from the database instead of relying on in-memory state populated by WebSocket events.

The endpoint joins data from `assessmentResults`, `dimensionScores`, `assessments`, and `conversations` tables to return the complete scoring payload.

## Acceptance Criteria

- [ ] `GET /api/scoring/conversation/:conversationId` endpoint exists
- [ ] Returns 404 if no scoring results exist for conversation
- [ ] Returns 403 if authenticated user doesn't own the conversation
- [ ] Response shape matches `ScoringCompletePayload['result']` from frontend types
- [ ] Correctly joins assessmentResults + dimensionScores + assessments tables
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
3. Get assessmentId from conversation
4. Fetch latest assessmentResult for that assessment
5. Fetch dimensionScores for that batch
6. Fetch assessment + vendor for names
7. Map to frontend payload shape

### 4. Register Route

In `packages/backend/src/index.ts`:
```typescript
import { createScoringRoutes } from './infrastructure/http/routes/scoring.routes.js';
// ...
const scoringRehydrationController = new ScoringRehydrationController(scoringService);
server.registerRoutes('/api/scoring', createScoringRoutes(scoringRehydrationController, authService));
```

### Response Shape

```typescript
interface ScoringRehydrationResponse {
  assessmentId: string;
  compositeScore: number;
  overallRiskRating: 'Low' | 'Moderate' | 'High' | 'Critical';
  recommendation: 'Approved' | 'Conditional' | 'Not Recommended';
  executiveSummary: string;
  keyFindings: string[];
  dimensionScores: Array<{
    dimension: string;
    score: number;
    riskRating: string;
    findings: string[];
  }>;
  vendorName: string;
  solutionName: string;
}
```

## Files Touched

- `packages/backend/src/infrastructure/http/routes/scoring.routes.ts` - **NEW** route file
- `packages/backend/src/infrastructure/http/controllers/ScoringRehydrationController.ts` - **NEW** controller
- `packages/backend/src/application/services/ScoringService.ts` - Add `getResultForConversation` method
- `packages/backend/src/application/interfaces/IScoringService.ts` - Add interface method
- `packages/backend/src/index.ts` - Register new route

## Tests Affected

Existing tests that may need updates:
- `packages/backend/__tests__/unit/application/services/ScoringService.test.ts` - May need to add tests for new method, existing tests should still pass
- No existing tests directly touch the new files (all new code)

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
