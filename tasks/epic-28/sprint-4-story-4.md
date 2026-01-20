# Story 28.7.4: Update ChatServer to delegate scoring events

**Sprint:** 4 - Business Logic Handlers
**Agent:** backend-agent
**Estimation:** Medium (1 file)

---

## Description

Update ChatServer to use ScoringHandler for scoring-related events and logic. Remove the extracted scoring code from ChatServer.

---

## Acceptance Criteria

- [ ] ChatServer creates ScoringHandler in constructor
- [ ] `vendor_selected` event delegates to handler
- [ ] Scoring trigger logic uses ScoringHandler
- [ ] All inline scoring code removed
- [ ] All existing tests pass

---

## Technical Approach

1. Add import:
```typescript
import { ScoringHandler } from './handlers/ScoringHandler';
```

2. Add property and initialize:
```typescript
private readonly scoringHandler: ScoringHandler;

constructor(...) {
  // ...
  this.scoringHandler = new ScoringHandler(
    this.scoringService,
    this.vendorValidationService,
    this.fileRepository
  );
}
```

3. Update event handler:
```typescript
socket.on('vendor_selected', async (payload) => {
  await this.scoringHandler.handleVendorSelected(
    socket as IAuthenticatedSocket,
    payload
  );
});
```

4. Update scoring trigger in send_message flow:
```typescript
// In message handling after Claude response
if (this.scoringHandler.shouldTriggerScoring(mode, hasDocuments, true)) {
  await this.scoringHandler.triggerScoring(
    socket as IAuthenticatedSocket,
    conversationId,
    fileIds
  );
}
```

5. Remove from ChatServer:
- `triggerScoringOnSend()` method
- `buildScoringFollowUpContext()` method
- Inline vendor clarification logic
- Scoring progress emission code

---

## Files Touched

- `packages/backend/src/infrastructure/websocket/ChatServer.ts` - Delegate to ScoringHandler

---

## Tests Required

Run full test suite:
```bash
pnpm --filter @guardian/backend test
```

---

## Definition of Done

- [ ] ScoringHandler integrated into ChatServer
- [ ] vendor_selected event delegated
- [ ] Scoring trigger uses handler
- [ ] All inline code removed
- [ ] All existing tests pass
