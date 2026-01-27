# Sprint 2: Race Condition Mitigation

**Goal:** Add heuristic wait in MessageHandler to reduce race condition window

**Status:** Planning (depends on Sprint 1 completion)

## Overview

Even with Sprint 1's fix (faster file_attached), users can still send messages before file record exists in DB. This sprint adds a smart wait in MessageHandler.

## Dependencies

- Requires Sprint 1 complete
- Stories in this sprint are sequential

## Stories

### 31.2.1: Add File Existence Check with Retry in MessageHandler

**Description:** When MessageHandler receives a message with attachedFileIds, verify files exist in DB before proceeding. If not found, retry with exponential backoff (max 3 attempts, 100ms/200ms/400ms).

**Acceptance Criteria:**
- [ ] MessageHandler checks file existence before building context
- [ ] Retry logic with exponential backoff (max 3 attempts)
- [ ] Log warning if files not found after retries
- [ ] Proceed with available files (don't block on missing)

**Files Touched:**
- `packages/backend/src/infrastructure/websocket/handlers/MessageHandler.ts`

**Agent:** backend-agent

---

### 31.2.2: Add "File Still Processing" User Feedback via WebSocket

**Description:** If files not ready after retry, emit a `file_processing` event to inform user their file context may be incomplete.

**Acceptance Criteria:**
- [ ] Emit `file_processing` event with fileIds when retries exhausted
- [ ] Frontend handles event gracefully (optional toast/warning)
- [ ] Does not block message processing

**Files Touched:**
- `packages/backend/src/infrastructure/websocket/handlers/MessageHandler.ts`
- `apps/web/src/hooks/useChatController.ts` - Main chat state & message handling (optional: handle event)
- `apps/web/src/hooks/useMultiFileUpload.ts` - File upload handling, captures fileId from file_attached (optional: handle event)

**Agent:** backend-agent (frontend optional)

## Definition of Done

- [ ] All stories complete
- [ ] Unit tests pass
- [ ] Race condition window significantly reduced
- [ ] User informed when file context incomplete
