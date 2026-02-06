# Sprint 1: Extract Title Update Service

**Epic:** 35 - Extract Title Generation from MessageHandler
**Stories:** 35.1.1 - 35.1.3 (3 stories)
**Agent:** `backend-agent`

---

## Objective

Extract `generateTitleIfNeeded()` and `updateScoringTitle()` from MessageHandler.ts into `TitleUpdateService`. Wire into ChatServer directly.

**DO NOT modify any other MessageHandler methods.**

---

## Stories

| Story | Name | Dependencies |
|-------|------|--------------|
| 35.1.1 | Create ITitleUpdateService interface + TitleUpdateService implementation | None |
| 35.1.2 | Wire service into ChatServer, remove from MessageHandler | 35.1.1 |
| 35.1.3 | Tests and regression verification | 35.1.2 |

---

## Dependency Graph

```
35.1.1 (create interface + impl) → 35.1.2 (wire + remove) → 35.1.3 (tests)
```

### File Overlap Analysis

| Story | Files | Overlap |
|-------|-------|---------|
| 35.1.1 | CREATE ITitleUpdateService.ts, CREATE TitleUpdateService.ts, MODIFY ITitleGenerationService.ts, MODIFY services/index.ts | None |
| 35.1.2 | MODIFY ChatServer.ts, MODIFY MessageHandler.ts, MODIFY test mocks | None with 35.1.1 |
| 35.1.3 | CREATE TitleUpdateService.test.ts | None with 35.1.1 or 35.1.2 |

### Parallel Execution Strategy

All sequential — no parallelization possible. Single dependency chain with 3 stories. Each story modifies files the next one depends on.

---

## Code to Extract

**Source:** `MessageHandler.ts`

```
Lines 1040-1141:  generateTitleIfNeeded()   (~100 LOC)
Lines 1282-1318:  updateScoringTitle()      (~37 LOC)
```

**Imports to remove from MessageHandler:**
```typescript
import type { ITitleGenerationService } from '../../../application/interfaces/ITitleGenerationService.js';
import type { TitleContext } from '../../../application/services/TitleGenerationService.js';
import { isPlaceholderTitle } from '../../../application/services/TitleGenerationService.js';
```

**Call sites in ChatServer:**
```
Line 267:  this.messageHandler.updateScoringTitle(...)
Line 323:  this.messageHandler.generateTitleIfNeeded(...)
```

**DO NOT TOUCH business logic in other MessageHandler methods.**

**Test files will need mock updates** for new constructor parameter (listed in Story 35.1.2).

---

## Exit Criteria

- [ ] TitleUpdateService exists with interface
- [ ] Title methods removed from MessageHandler
- [ ] ChatServer calls TitleUpdateService directly
- [ ] All existing tests pass
- [ ] New unit tests for TitleUpdateService
- [ ] Manual QA: consult mode title generates after first exchange
- [ ] Manual QA: assessment mode title generates at 3 and 5 messages
- [ ] Manual QA: scoring mode shows "Scoring: filename.yaml"
- [ ] Manual QA: manually edited title is not overwritten
