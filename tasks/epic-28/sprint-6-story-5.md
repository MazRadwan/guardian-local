# Story 28.11.1: Inject TitleGenerationService

**Sprint:** 6 - Final Integration
**Agent:** backend-agent
**Estimation:** Small (2 files)

---

## Description

Fix the hidden TitleGenerationService dependency. Currently ChatServer creates it internally. It should be injected like all other services.

---

## Acceptance Criteria

- [ ] TitleGenerationService added as constructor parameter
- [ ] Internal instantiation removed from ChatServer
- [ ] index.ts creates and injects TitleGenerationService
- [ ] All existing tests pass

---

## Technical Approach

1. Update ChatServer constructor:
```typescript
// Before:
constructor(
  // ...17 explicit dependencies...
) {
  // Hidden dependency:
  this.titleService = new TitleGenerationService(this.claudeClient);
}

// After:
constructor(
  // ...17 explicit dependencies...,
  private readonly titleService: TitleGenerationService  // Now explicit
) {
  // No internal instantiation
}
```

2. Update index.ts wiring (see Story 28.11.3):
```typescript
const titleGenerationService = new TitleGenerationService(claudeClient);

const chatServer = new ChatServer(
  // ...existing dependencies...,
  titleGenerationService
);
```

---

## Files Touched

- `packages/backend/src/infrastructure/websocket/ChatServer.ts` - Add constructor param, remove internal instantiation
- `packages/backend/__tests__/unit/ChatServer.*.test.ts` - Update mocks if needed

---

## Tests Required

Update test setup to provide mock TitleGenerationService:
```typescript
const mockTitleService = {
  generateTitle: jest.fn().mockResolvedValue('Generated Title'),
};

// Pass to ChatServer in test setup
```

---

## Definition of Done

- [ ] TitleGenerationService is constructor parameter
- [ ] No internal instantiation in ChatServer
- [ ] Tests updated with mock
- [ ] All tests pass
