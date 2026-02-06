# Epic 35: Extract Title Generation from MessageHandler

**Status:** Spec Review
**Branch:** TBD (will branch from `epic/34-extract-tool-loop` or `main`)
**Created:** 2026-02-06

---

## Summary

Extract `generateTitleIfNeeded()` and `updateScoringTitle()` from MessageHandler.ts into a dedicated `TitleUpdateService`.

**This is the ONLY scope of this epic.** Do not refactor other MessageHandler methods.

This is the second extraction in the multi-epic MessageHandler decomposition tracked in `tasks/messagehandler-decomposition.md`.

---

## Scope

**EXTRACT THESE (and only these):**
- `generateTitleIfNeeded()` (~100 LOC, lines 1040-1141)
- `updateScoringTitle()` (~37 LOC, lines 1282-1318)
- Related imports (`ITitleGenerationService`, `TitleContext`, `isPlaceholderTitle`)

**DO NOT TOUCH anything else in MessageHandler.**

See `epic-35-goals.md` for explicit out-of-scope list.

---

## Sprints

| Sprint | Focus | Stories | Status |
|--------|-------|---------|--------|
| Sprint 1 | Extract Title Update Service | 35.1.1-35.1.3 (3 stories) | Spec Review |

---

## Story Files

- `sprint-1-story-1.md` - Create ITitleUpdateService interface + TitleUpdateService implementation
- `sprint-1-story-2.md` - Wire service into ChatServer, remove from MessageHandler
- `sprint-1-story-3.md` - Tests and regression verification

---

## Files Touched

**Create:**
- `packages/backend/src/infrastructure/websocket/services/ITitleUpdateService.ts` (interface)
- `packages/backend/src/infrastructure/websocket/services/TitleUpdateService.ts` (implementation)
- `packages/backend/__tests__/unit/infrastructure/websocket/services/TitleUpdateService.test.ts` (tests)

**Modify:**
- `packages/backend/src/application/interfaces/ITitleGenerationService.ts` - Add `formatScoringTitle` to interface
- `packages/backend/src/infrastructure/websocket/handlers/MessageHandler.ts` - Remove title methods and deps
- `packages/backend/src/infrastructure/websocket/ChatServer.ts` - Create and use TitleUpdateService
- `packages/backend/src/infrastructure/websocket/services/index.ts` - Export new service

**Test files requiring mock updates (constructor signature change — these instantiate MessageHandler with full 10-arg signature):**
- `packages/backend/__tests__/unit/MessageHandler.toolLoop.test.ts`
- `packages/backend/__tests__/unit/MessageHandler.assistantDoneGating.test.ts`
- `packages/backend/__tests__/unit/MessageHandler.assistantDoneGating.abort.test.ts`
- `packages/backend/__tests__/unit/MessageHandler.assistantDoneGating.edgeCases.test.ts`

---

## Success Criteria

- [ ] `TitleUpdateService` exists and implements `ITitleUpdateService`
- [ ] `generateTitleIfNeeded()` removed from MessageHandler
- [ ] `updateScoringTitle()` removed from MessageHandler
- [ ] `ITitleGenerationService` removed from MessageHandler constructor
- [ ] ChatServer creates TitleUpdateService and calls it directly
- [ ] All existing tests pass (zero regressions)
- [ ] Consult mode title generation works (2 messages trigger)
- [ ] Assessment mode title generation works (3 and 5 message triggers)
- [ ] Scoring mode filename title works
- [ ] Manual title edit protection preserved
- [ ] `conversation_title_updated` event emitted correctly
