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

**IMPORTANT:** TitleGenerationService takes an API key string, NOT a claudeClient.

See ChatServer line 127:
```typescript
this.titleGenerationService = new TitleGenerationService(process.env.ANTHROPIC_API_KEY);
```

And TitleGenerationService constructor (line 80):
```typescript
constructor(private readonly apiKey?: string) {
  if (apiKey) {
    this.client = new Anthropic({ apiKey });
  }
}
```

1. Update ChatServer constructor:
```typescript
// Before:
constructor(
  // ...17 explicit dependencies...
) {
  // Hidden dependency (currently creates its own Anthropic client):
  this.titleGenerationService = new TitleGenerationService(process.env.ANTHROPIC_API_KEY);
}

// After:
constructor(
  // ...17 explicit dependencies...,
  private readonly titleGenerationService: TitleGenerationService  // Now explicit
) {
  // No internal instantiation
}
```

2. Update index.ts wiring (see Story 28.11.3):
```typescript
// TitleGenerationService takes API key string, NOT claudeClient
const titleGenerationService = new TitleGenerationService(process.env.ANTHROPIC_API_KEY);

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
