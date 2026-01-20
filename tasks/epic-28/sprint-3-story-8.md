# Story 28.6.3: Update ChatServer to delegate mode switch

**Sprint:** 3 - Conversation Management
**Agent:** backend-agent
**Estimation:** Small (1 file)

---

## Description

Update ChatServer to use ModeSwitchHandler for the `switch_mode` event. Remove the inline mode switching code.

---

## Acceptance Criteria

- [ ] ChatServer creates ModeSwitchHandler in constructor
- [ ] `switch_mode` event delegates to handler
- [ ] All inline mode switch code removed
- [ ] Mode guidance messages work correctly
- [ ] All existing tests pass

---

## Technical Approach

1. Add import:
```typescript
import { ModeSwitchHandler } from './handlers/ModeSwitchHandler';
```

2. Add property and initialize:
```typescript
private readonly modeSwitchHandler: ModeSwitchHandler;

constructor(...) {
  // ...
  this.modeSwitchHandler = new ModeSwitchHandler(this.conversationService);
}
```

3. Update event handler:
```typescript
socket.on('switch_mode', async (payload) => {
  await this.modeSwitchHandler.handleSwitchMode(
    socket as IAuthenticatedSocket,
    payload
  );
});
```

4. Remove from ChatServer:
- Inline `switch_mode` handler code
- Mode guidance message constants (moved to handler)
- Any mode validation inline code

---

## Files Touched

- `packages/backend/src/infrastructure/websocket/ChatServer.ts` - Delegate to ModeSwitchHandler

---

## Tests Required

Run full test suite:
```bash
pnpm --filter @guardian/backend test
```

---

## Definition of Done

- [ ] ModeSwitchHandler integrated into ChatServer
- [ ] switch_mode event delegated
- [ ] All inline code removed
- [ ] All existing tests pass
- [ ] Mode guidance messages work
