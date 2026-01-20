# Story 28.11.3: Update index.ts wiring

**Sprint:** 6 - Final Integration
**Agent:** backend-agent
**Estimation:** Small (1 file)

---

## Description

Update index.ts to wire all new dependencies for ChatServer, including TitleGenerationService.

---

## Acceptance Criteria

- [ ] TitleGenerationService created in index.ts
- [ ] Passed to ChatServer constructor
- [ ] All dependencies explicitly wired
- [ ] Server starts successfully
- [ ] All tests pass

---

## Technical Approach

```typescript
// index.ts

import { TitleGenerationService } from './application/services/TitleGenerationService';

// ... existing service creation ...

// Create title generation service
const titleGenerationService = new TitleGenerationService(claudeClient);

// Create chat server with all dependencies
const chatServer = new ChatServer(
  io,
  conversationService,
  messageService,
  fileRepository,
  fileStorage,
  textExtractionService,
  claudeClient,
  questionnaireService,
  questionnaireReadyService,
  scoringService,
  vendorValidationService,
  rateLimiter,
  promptCacheManager,
  enrichmentService,
  documentSummaryService,
  titleGenerationService  // New explicit dependency
);
```

---

## Files Touched

- `packages/backend/src/index.ts` - Update ChatServer instantiation

---

## Tests Required

```bash
# Verify server starts
pnpm --filter @guardian/backend dev

# Run integration tests
pnpm --filter @guardian/backend test:integration
```

---

## Definition of Done

- [ ] index.ts updated
- [ ] Server starts without errors
- [ ] All dependencies wired
- [ ] Integration tests pass
