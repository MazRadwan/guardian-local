# Story 39.4.5: Split ScoringHandler -- Extract Post-Score Behaviors

## Description

Extract the post-score behaviors from `ScoringHandler.ts` (~567 LOC) into a new `ScoringPostProcessor.ts`. The post-score section (lines 230-340) handles: result data assembly, `scoring_complete` emission, file status update, narrative message persistence, assessment linking, and follow-up query flow. These are distinct from the core scoring orchestration and can be cleanly extracted.

The follow-up query handling (`handleFollowUpQuery`, `buildScoringFollowUpContext`) is also extracted, as it is a self-contained sub-flow triggered after scoring.

This is a pure refactor with zero behavioral change.

## Acceptance Criteria

- [ ] `ScoringPostProcessor.ts` created with post-score behavior methods
- [ ] `processSuccess()` method handles: result data assembly, scoring_complete emission, file status update, narrative persistence, assessment linking
- [ ] `processFailure()` method handles: file status update, scoring_error emission, error message persistence
- [ ] `handleFollowUpQuery()` method moved from ScoringHandler
- [ ] `buildScoringFollowUpContext()` helper moved from ScoringHandler
- [ ] `ScoringHandler.ts` delegates post-score behavior to `ScoringPostProcessor`
- [ ] `ScoringHandler.ts` under 300 LOC
- [ ] `ScoringPostProcessor.ts` under 300 LOC
- [ ] All existing ScoringHandler tests pass
- [ ] No TypeScript errors

## Technical Approach

### 1. Create ScoringPostProcessor

**File:** `packages/backend/src/infrastructure/websocket/handlers/ScoringPostProcessor.ts`

```typescript
export class ScoringPostProcessor {
  constructor(
    private readonly conversationService: ConversationService,
    private readonly fileRepository: IFileRepository,
    private readonly claudeClient: IClaudeClient
  ) {}

  /**
   * Handle successful scoring: emit results, persist narrative, link assessment
   */
  async processSuccess(
    socket: IAuthenticatedSocket,
    conversationId: string,
    fileId: string,
    scoringResult: ScoringOutput,
    userQuery?: string,
    buildConversationContext?: BuildConversationContext
  ): Promise<void> {
    // 1. Build result data for frontend (batchId + assessmentId CRITICAL)
    // 2. Emit scoring_complete
    // 3. Mark file as completed
    // 4. Save narrative as assistant message
    // 5. Emit message event
    // 6. Link assessment (non-fatal)
    // 7. Handle follow-up query (if present)
  }

  /**
   * Handle failed scoring: emit error, persist error message
   */
  async processFailure(
    socket: IAuthenticatedSocket,
    conversationId: string,
    fileId: string,
    error: string,
    code: string
  ): Promise<void> {
    // 1. Update file parse status to 'failed'
    // 2. Emit scoring_error
    // 3. Save error as system message
  }

  /**
   * Handle follow-up user query after scoring (Epic 18.4.3)
   */
  private async handleFollowUpQuery(
    socket: IAuthenticatedSocket,
    conversationId: string,
    userQuery: string,
    report: ScoringReportData,
    buildConversationContext: BuildConversationContext
  ): Promise<void> {
    // Moved from ScoringHandler.handleFollowUpQuery
  }

  /**
   * Build scoring context for follow-up queries
   */
  private buildScoringFollowUpContext(report: ScoringReportData): string {
    // Moved from ScoringHandler.buildScoringFollowUpContext
  }
}
```

### 2. Update ScoringHandler

**File:** `packages/backend/src/infrastructure/websocket/handlers/ScoringHandler.ts`

Replace the inline post-score logic (lines 230-340) with delegation:

```typescript
// After scoring completes:
if (scoringResult.success && scoringResult.report) {
  await this.postProcessor.processSuccess(
    socket, conversationId, fileId, scoringResult,
    userQuery, buildConversationContext
  );
} else {
  await this.postProcessor.processFailure(
    socket, conversationId, fileId,
    scoringResult.error || 'Scoring failed',
    scoringResult.code || 'SCORING_FAILED'
  );
}
```

### 3. Constructor Update

Add `ScoringPostProcessor` to `ScoringHandler` constructor (or create it internally from existing dependencies).

### 4. Critical Behaviors to Preserve

From the ScoringHandler docstring, these behaviors MUST be preserved in the extraction:
- `scoring_complete` resultData includes `batchId` + `assessmentId`
- Narrative message persistence (NO components -- card from `scoring_complete`)
- `conversationService.linkAssessment()` (non-fatal on failure)
- Follow-up query flow when `userQuery` provided
- `scoring_error` includes `code` field for frontend handling

## Files Touched

- `packages/backend/src/infrastructure/websocket/handlers/ScoringPostProcessor.ts` - CREATE (~250 LOC)
- `packages/backend/src/infrastructure/websocket/handlers/ScoringHandler.ts` - MODIFY (remove post-score logic, add delegation, ~250 LOC target)

## Tests Affected

Existing tests that may need updates:
- `packages/backend/__tests__/unit/infrastructure/websocket/handlers/ScoringHandler.test.ts` - Tests for post-score behavior (scoring_complete emission, narrative persistence, assessment linking) may need to target ScoringPostProcessor or verify delegation.
- `packages/backend/__tests__/unit/ChatServer.userQueryPostScoring.test.ts` - Tests for follow-up query flow may need updates if they assert on ScoringHandler internals.

## Agent Assignment

- [x] backend-agent

## Tests Required

- [ ] `packages/backend/__tests__/unit/infrastructure/websocket/handlers/ScoringPostProcessor.test.ts`
  - Test processSuccess emits scoring_complete with batchId and assessmentId
  - Test processSuccess persists narrative as assistant message (no components)
  - Test processSuccess links assessment (non-fatal on failure)
  - Test processSuccess handles follow-up query when present
  - Test processSuccess updates file status to completed
  - Test processFailure emits scoring_error with code field
  - Test processFailure updates file status to failed
  - Test processFailure persists error as system message

## Definition of Done

- [ ] ScoringPostProcessor created with processSuccess and processFailure
- [ ] Follow-up query handling moved to ScoringPostProcessor
- [ ] ScoringHandler.ts under 300 LOC
- [ ] ScoringPostProcessor.ts under 300 LOC
- [ ] All existing ScoringHandler tests pass
- [ ] All critical behaviors preserved (batchId, assessmentId, narrative, linkAssessment, follow-up)
- [ ] No TypeScript errors
- [ ] No lint errors
