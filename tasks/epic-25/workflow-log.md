# Opus-GPT Workflow Log

**Workflow:** opus-gpt (`/delegate`, `/spec-design`, `/implement`)
**Reference Doc:** `/tasks/epic-20/opus-gpt-automation-plan.md`

> **Note:** Claude-* workflow issues are in `/tasks/epic-26/claude-workflow-log.md`

---

## Issue: Workflow Crash on SubagentStop Hooks

**Date:** 2026-01-19
**Epic:** 26 (running via /implement)
**Last Story Completed:** Story 26.3 (Shimmer Timeout & Cleanup)

---

## Crash Details

### Timeline
- `16:17:08` - Tests passed (1280 tests, 50 suites)
- `16:17:21.709Z` - SubagentStop hook triggered: `post-implementation.sh`
- `16:17:21.746Z` - SubagentStop hook triggered: `post-plan.sh`
- `16:17:21` - Workflow stopped/crashed
- Log file last modified: 12:33 NST (21 minutes before investigation)

### Symptom
Workflow froze after completing Story 26.3. Both SubagentStop hooks fired simultaneously when only one should have.

---

## Root Cause Analysis

### 1. Hook Matcher Bug
**Location:** `.claude/settings.json`

```json
"SubagentStop": [
  {
    "matcher": "plan-agent",
    "hooks": [{ "command": ".claude/hooks/post-plan.sh" }]
  },
  {
    "matcher": "frontend-agent|backend-agent",
    "hooks": [{ "command": ".claude/hooks/post-implementation.sh" }]
  }
]
```

**Problem:** The completing agent (slug: `foamy-popping-platypus`, agentId: `a1bbb0c`) didn't match either pattern specifically, but BOTH hooks ran. This suggests:
- Matchers may not be working as expected
- Or empty/null matcher matches everything
- Or the agent type metadata wasn't set correctly

### 2. Heavy Hook Operations
**Location:** `.claude/hooks/post-implementation.sh`

```bash
# Lines 52-81 run full verification suite:
pnpm test      # Full test suite - can take minutes
pnpm lint      # Full lint - can hang
pnpm typecheck # Full typecheck - can hang
```

**Problem:** Running full test suite in a hook is risky:
- Blocks workflow for several minutes
- Can hang on certain conditions
- Conflicts if another test is already running

### 3. No Error Recovery
Both hooks use `set -e` which exits on any error. Combined with no timeout, any failure crashes the workflow with no recovery.

---

## Recommended Fixes

### Fix 1: Improve Hook Matchers
```json
// Option A: Add explicit default case
"SubagentStop": [
  {
    "matcher": "^plan-agent$",  // Exact match
    "hooks": [...]
  },
  {
    "matcher": "^(frontend-agent|backend-agent)$",  // Exact match
    "hooks": [...]
  }
  // No default = no hook for other agents
]

// Option B: Add agent type to implement workflow
// Ensure subagents are spawned with correct type metadata
```

### Fix 2: Lightweight Hook Verification
```bash
# Instead of full test suite, run quick checks only:
pnpm test:unit --bail --maxWorkers=1  # Stop on first failure
pnpm lint --quiet                      # Only show errors
pnpm tsc --noEmit --skipLibCheck       # Fast typecheck
```

### Fix 3: Add Timeout and Error Handling
```bash
#!/bin/bash
# Remove set -e, add manual error handling

timeout 120 pnpm test:unit --bail || {
  echo "Tests failed or timed out"
  # Continue anyway, log the failure
}
```

### Fix 4: Make Hooks Non-Blocking (Future)
Consider making hooks async/non-blocking so workflow continues while verification runs in background.

---

## GPT Review Issue (Earlier)

**Symptom:** User reported 401 error when GPT was invoked, fell back to Opus architect-agent.

**Finding:** The orchestrator-agent.md only had GPT fallback defined for code reviews. Spec reviews and final pass had no fallback handling.

**Status:** Root cause identified. User does NOT want Opus fallback.

**Location of missing error handling:**
- Phase 1: Batched Sprint Spec Reviews (line ~123)
- Phase 1.5: Spec Final Pass (line ~367)
- Phase 3.5: Sprint Final Pass (line ~603)

---

## GPT Error Handling Strategy (REVISED)

**Decision:** NO Opus fallback. Clean exit instead.

**Rationale:** Silent fallback masks real problems (auth/rate limit issues) and produces inconsistent review quality. Better to fail fast with clear error.

### Error Handling Rules

| Error | Action |
|-------|--------|
| **401 Unauthorized** | Log "GPT authentication failed. Check OPENAI_API_KEY." → Exit cleanly |
| **429 Rate Limited** | Retry with exponential backoff (30s, 60s, 120s) → After 3 retries, exit |
| **5xx Server Error** | Retry once after 30s → If still failing, exit |
| **Timeout (>120s)** | Exit with "GPT request timed out" |

### State File for Resume

On GPT error, save state for clean resume:

```json
{
  "workflow": "opus-gpt",
  "phase": "implementation",
  "status": "gpt_error",
  "errorType": "rate_limited",
  "errorAt": "2026-01-19T16:17:21Z",
  "resumeFrom": "story_26.4_code_review",
  "retryCount": 3
}
```

### Resume Command

After fixing the issue (refresh API key, wait for rate limit):
```bash
/implement --resume
```

Workflow picks up from `resumeFrom` point.

---

## State at Crash

```json
{
  "workflow": "opus-gpt",
  "epic": 26,
  "phase": "implementation",
  "status": "awaiting_gpt_review",
  "currentSprint": 1,
  "approvedSprints": [1],
  "reviews": [
    { "type": "architect_review", "verdict": "NEEDS_REVISION", "resolved": true },
    { "type": "spec_review", "verdict": "NEEDS_REVISION", "resolved": true },
    { "type": "final_pass", "verdict": "APPROVED" }
  ]
}
```

**Note:** Reviews show Opus agents were used (architect_review, spec_review), not GPT - confirming the fallback was active.

---

## Files Changed Before Crash (Story 26.3)

All changes were successful before the crash:

1. `apps/web/src/stores/chatStore.ts` - Timeout tracking added
2. `apps/web/src/hooks/useWebSocket.ts` - Clear on disconnect
3. `apps/web/src/hooks/useWebSocketEvents.ts` - Clear on error
4. `apps/web/src/components/chat/TitleLoadingCleanup.tsx` - NEW
5. `apps/web/src/app/layout.tsx` - Import cleanup component
6. `apps/web/src/stores/__tests__/chatStore.titleLoading.test.ts` - NEW (13 tests)

**Tests:** All 1280 passed before crash.

---

## Action Items

### Hook Fixes
- [ ] Fix hook matchers to be more specific (regex anchors)
- [ ] Replace full test suite with quick verification in hooks
- [ ] Add timeout to hook commands
- [ ] Consider removing `set -e` from hooks

### GPT Error Handling (NO FALLBACK)
- [ ] Add retry logic with exponential backoff (30s, 60s, 120s)
- [ ] Add clean exit on auth failure (401) with clear message
- [ ] Add clean exit after 3 rate limit retries (429)
- [ ] Save `resumeFrom` state on exit for `/implement --resume`
- [ ] Remove any existing Opus fallback code from orchestrator-agent.md

### Workflow Separation
- [ ] Separate hook directories: `opus-gpt/` and `claude/`
- [ ] Add workflow-prefixed matchers in settings.json
- [ ] Add workflow validation at start of each skill
- [ ] Ensure claude-* commands don't touch opus-gpt state files

### Restore Missing Features (from original opus-gpt-automation-plan.md)
- [ ] Scope selection should ALWAYS prompt (not just when no state file):
  - [1] Full Epic
  - [2] Single Sprint
  - [3] Specific Stories
- [ ] Custom GPT review prompt option: "Custom GPT-5.2 review prompt? [Enter for default]:"
- [ ] Remove Opus fallback from implement/SKILL.md (lines 152-159, 209-213)
- [ ] Replace fallback with clean exit + retry logic per GPT Error Handling Strategy

### Resume
- [ ] Resume Epic 26 implementation from Story 26.4

---

## Log File Location

Full crash log: `/private/tmp/claude/-Users-mazradwan-Documents-PROJECTS-guardian-app/tasks/a1bbb0c.output`
