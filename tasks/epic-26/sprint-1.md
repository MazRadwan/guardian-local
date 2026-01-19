# Sprint 1: Assessment Mode Title Fallback

**Epic:** 26 - Assessment Mode Title Fallback
**Focus:** Ensure Assessment mode conversations get meaningful titles even without completing full assessment flow
**Stories:** 26.1 - 26.3 (3 stories)
**Dependencies:** Epic 25 Sprint 1 & 2 complete (title generation infrastructure)
**Agents:** `backend-agent` | `frontend-agent`

---

## Stories

| Story | Name | Focus | Priority | Agent | Dependencies |
|-------|------|-------|----------|-------|--------------|
| **26.1** | LLM Title for Assessment Mode | Wire TitleGenerationService + generate title after first Q&A exchange | High | backend-agent | None |
| **26.2** | Vendor Title Upgrade | Update to "Assessment: {vendor}" on questionnaire generation | Medium | backend-agent | 26.1 |
| **26.3** | Shimmer Timeout & Cleanup | 5s timeout, clear on disconnect/delete/error | Medium | frontend-agent | None |

---

## Dependency Graph

```
    File Overlap Analysis:
    +----------+---------------------------------------------------------------+--------------------+
    | Story    | Files Touched                                                 | Conflicts          |
    +----------+---------------------------------------------------------------+--------------------+
    | 26.1     | ChatServer.ts, TitleGenerationService.ts, ConversationService | None               |
    |          | DrizzleMessageRepository.ts, IMessageRepository.ts            |                    |
    | 26.2     | ChatServer.ts (generate_questionnaire handler - verify only)  | None (diff section)|
    | 26.3     | chatStore.ts (frontend state)                                 | None               |
    +----------+---------------------------------------------------------------+--------------------+
```

**Note:** Story 26.1 is significantly larger than originally planned due to critical gap:
- Wires `TitleGenerationService` into production code (was never instantiated)
- Adds helper methods to ConversationService and MessageRepository
- 26.2 depends on 26.1 completing the wiring

**Story 26.2** is now primarily a verification story - the existing logic should work once 26.1 wires up the service.

**Backend-agent** should run 26.1 → 26.2 sequentially.
**Frontend-agent** can run 26.3 in parallel with backend work.

---

## Parallel Execution Strategy

### Phase 1: Backend + Frontend in Parallel (3 stories)

```
+------------------------------------------------------------------------+
|                     PHASE 1 - RUN IN PARALLEL                          |
|              (Backend and frontend agents work simultaneously)         |
+------------------------+-----------------------------------------------+
|   BACKEND (sequential) |   FRONTEND                                    |
+------------------------+-----------------------------------------------+
|   26.1 -> 26.2         |   26.3                                        |
|                        |                                               |
|   ChatServer.ts        |   chatStore.ts                                |
|   (title generation)   |   (timeout tracking)                          |
|                        |                                               |
|   backend-agent        |   frontend-agent                              |
+------------------------+-----------------------------------------------+
```

**Execution Order:**
1. **backend-agent:** Story 26.1 (LLM title), then Story 26.2 (verify existing works)
2. **frontend-agent:** Story 26.3 (shimmer timeout) - runs in parallel with backend

**File overlap:**
- Backend stories touch `ChatServer.ts` (same file, different sections)
- Frontend story touches `chatStore.ts` (no overlap with backend)

**Review:** After all 3 stories complete

---

## Story Files

| Story | File | Agent |
|-------|------|-------|
| 26.1 | `sprint-1-story-26.1-llm-title-assessment.md` | backend-agent |
| 26.2 | `sprint-1-story-26.2-vendor-title-upgrade.md` | backend-agent |
| 26.3 | `sprint-1-story-26.3-shimmer-timeout.md` | frontend-agent |

---

## Technical Context

### Existing Infrastructure (from Epic 25)

**TitleGenerationService** (`packages/backend/src/application/services/TitleGenerationService.ts`):
- `PLACEHOLDER_TITLES` constants: `DEFAULT`, `ASSESSMENT`, `SCORING`
- `isPlaceholderTitle()` helper for idempotency guard
- `generateModeAwareTitle()` with mode-specific strategies
- `generateTitle()` calls Claude Haiku for LLM-based titles
- **NOTE:** This service exists but is NOT wired into production code

**ChatServer Title Logic** (lines ~1349-1365):
```typescript
// Story 25.9: Title generation with mode-aware guards
const shouldGenerateTitle =
  isPlaceholderTitle(conversationForTitle.title) &&
  conversationForTitle.mode !== 'scoring' &&
  !conversationForTitle.titleManuallyEdited;

// Currently calls conversationService.getConversationTitle() which truncates
// NOT using TitleGenerationService!
```

**Current Problem (CRITICAL):**
1. `TitleGenerationService` is defined and tested but **never instantiated** in production
2. `ChatServer` calls `conversationService.getConversationTitle()` which just truncates the first message (no LLM)
3. Assessment mode conversations get stuck with "New Assessment" placeholder

**generate_questionnaire Handler** (lines ~2311-2335):
- Already updates title to "Assessment: {vendorName}" when questionnaire generated
- This is Story 26.2 - just need to verify it still works correctly

**Frontend chatStore** (`apps/web/src/stores/chatStore.ts`):
- `titleLoading?: boolean` on Conversation interface
- `setConversationTitleLoading(id, loading)` action
- No timeout tracking currently - needs to be added for Story 26.3

---

## Exit Criteria

Sprint 1 is complete when:
- [ ] Assessment mode conversations get LLM titles after first Q&A exchange
- [ ] Title updates to "Assessment: {vendorName}" when `generate_questionnaire` fires
- [ ] `titleLoading` shimmer clears within 5 seconds via hard timeout
- [ ] `titleLoading` clears on disconnect, unmount, delete, and error events
- [ ] Stale `titleLoading` states cleared on app initialization
- [ ] Manual renames are never overwritten
- [ ] No memory leaks from orphaned timeouts
- [ ] All tests passing
- [ ] Code reviewed and approved
