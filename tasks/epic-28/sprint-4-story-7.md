# Story 28.8.3: Update ChatServer to delegate questionnaire events

**Sprint:** 4 - Business Logic Handlers
**Agent:** backend-agent
**Estimation:** Small (1 file)

---

## Description

Update ChatServer to use QuestionnaireHandler for questionnaire-related events. Remove the extracted code from ChatServer.

---

## Acceptance Criteria

- [ ] ChatServer creates QuestionnaireHandler in constructor
- [ ] `generate_questionnaire` event delegates to handler
- [ ] `get_export_status` event delegates to handler
- [ ] All inline questionnaire code removed
- [ ] **Existing ChatServer.handleGenerateQuestionnaire.test.ts passes**
- [ ] All tests pass

---

## Technical Approach

1. Add import:
```typescript
import { QuestionnaireHandler } from './handlers/QuestionnaireHandler';
```

2. Add property and initialize:
```typescript
private readonly questionnaireHandler: QuestionnaireHandler;

constructor(...) {
  // ...
  this.questionnaireHandler = new QuestionnaireHandler(
    this.questionnaireService,
    this.streamingHandler
  );
}
```

3. Update event handlers:
```typescript
socket.on('generate_questionnaire', async (payload) => {
  await this.questionnaireHandler.handleGenerateQuestionnaire(
    socket as IAuthenticatedSocket,
    payload,
    this.chatContext
  );
});

socket.on('get_export_status', async (payload) => {
  await this.questionnaireHandler.handleGetExportStatus(
    socket as IAuthenticatedSocket,
    payload
  );
});
```

4. Preserve public methods for test compatibility:
```typescript
// Public methods that tests expect - delegate to handler
async handleGenerateQuestionnaire(...args) {
  return this.questionnaireHandler.handleGenerateQuestionnaire(...args);
}

async handleGetExportStatus(...args) {
  return this.questionnaireHandler.handleGetExportStatus(...args);
}
```

5. Remove from ChatServer:
- Inline generate_questionnaire handler code
- Inline get_export_status handler code
- Questionnaire phase emission code

---

## Files Touched

- `packages/backend/src/infrastructure/websocket/ChatServer.ts` - Delegate to QuestionnaireHandler

---

## Tests Required

Run full test suite, specifically ensuring existing test passes:
```bash
pnpm --filter @guardian/backend test:unit -- --grep "handleGenerateQuestionnaire"
pnpm --filter @guardian/backend test
```

---

## Definition of Done

- [ ] QuestionnaireHandler integrated into ChatServer
- [ ] All questionnaire events delegated
- [ ] Public methods preserved for test compatibility
- [ ] **ChatServer.handleGenerateQuestionnaire.test.ts passes**
- [ ] All tests pass
