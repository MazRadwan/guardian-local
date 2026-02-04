# Epic 34: Extract Consult Tool Loop Service

**Status:** Planning
**Branch:** `epic/34-extract-tool-loop`
**Created:** 2026-02-04

---

## Summary

Extract `executeConsultToolLoop()` and `buildAugmentedMessages()` from MessageHandler.ts into a dedicated `ConsultToolLoopService`.

**This is the ONLY scope of this epic.** Do not refactor other MessageHandler methods.

---

## Scope

**EXTRACT THESE (and only these):**
- `executeConsultToolLoop()` (~255 lines)
- `buildAugmentedMessages()` (~36 lines)
- `MAX_TOOL_ITERATIONS` constant

**DO NOT TOUCH anything else in MessageHandler.**

See `epic-34-goals.md` for explicit out-of-scope list.

---

## Sprints

| Sprint | Focus | Stories | Status |
|--------|-------|---------|--------|
| Sprint 1 | Extract Consult Tool Loop | 34.1.1-34.1.4 (4 stories) | Planning |

---

## Story Files

- `sprint-1-story-1.md` - Create IConsultToolLoopService interface
- `sprint-1-story-2.md` - Implement ConsultToolLoopService
- `sprint-1-story-3.md` - Wire service into MessageHandler
- `sprint-1-story-4.md` - Tests and regression verification

---

## Files Touched

**Create:**
- `IConsultToolLoopService.ts` (interface)
- `ConsultToolLoopService.ts` (implementation)
- `ConsultToolLoopService.test.ts` (tests)

**Modify:**
- `MessageHandler.ts` - Remove tool loop methods, add service call
- `ChatServer.ts` - Inject new service

---

## Success Criteria

- [ ] Tool loop code moved to service
- [ ] MessageHandler calls service instead of inline method
- [ ] All existing tests pass
- [ ] Consult mode web search works
- [ ] Multi-search works
- [ ] Abort works
