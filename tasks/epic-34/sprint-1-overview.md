# Sprint 1: Extract Consult Tool Loop

**Epic:** 34 - Extract Consult Tool Loop Service
**Stories:** 34.1.1 - 34.1.4 (4 stories)
**Agent:** `backend-agent`

---

## Objective

Extract `executeConsultToolLoop()` and `buildAugmentedMessages()` from MessageHandler.ts into `ConsultToolLoopService`.

**DO NOT modify any other MessageHandler methods.**

---

## Stories

| Story | Name | Dependencies |
|-------|------|--------------|
| 34.1.1 | Create IConsultToolLoopService interface | None |
| 34.1.2 | Implement ConsultToolLoopService | 34.1.1 |
| 34.1.3 | Wire service into MessageHandler | 34.1.2 |
| 34.1.4 | Tests and regression verification | 34.1.3 |

---

## Code to Extract

**Source:** `MessageHandler.ts`

```
Line 72:    MAX_TOOL_ITERATIONS = 3
Lines 917-1172:  executeConsultToolLoop()
Lines 1186-1222: buildAugmentedMessages()
```

**DO NOT TOUCH business logic in other MessageHandler methods.**

**Test files will need mock updates** for new constructor parameter (listed in Story 34.1.3).

---

## Execution Order

All stories are sequential:

```
34.1.1 → 34.1.2 → 34.1.3 → 34.1.4
```

---

## Exit Criteria

- [ ] ConsultToolLoopService exists
- [ ] Tool loop methods removed from MessageHandler
- [ ] MessageHandler calls service
- [ ] All tests pass
- [ ] Manual QA: web search works
- [ ] Manual QA: multi-search works
- [ ] Manual QA: abort works
