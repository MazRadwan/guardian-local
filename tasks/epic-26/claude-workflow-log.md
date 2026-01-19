# Claude-* Workflow Log

**Date:** 2026-01-19
**Workflow:** claude-autonomous (`/claude-plan`, `/claude-implement`)
**Reference Doc:** `/tasks/epic-20/claude-autonomous-plan.md`

---

## Original Plan vs Current Implementation

| Feature | Original Plan | Current Status |
|---------|---------------|----------------|
| **Ralph Wiggum Stop Hook** | Full implementation (lines 305-401) with promise checking, iteration counter, exit code 2 | ❌ Only notification sound |
| **Key Parameters Table** | Single source of truth (lines 22-36) with all tunable values | ❌ Scattered/missing |
| **User Commands** | "pause", "exit", "status", "skip" (lines 65-71) | ❌ Not enforced |
| **Circuit Breaker** | Same error 3x → stuck, append to CLAUDE.md (lines 1599-1633) | ❌ Not implemented |
| **Session Expiration** | 24h timeout, reset counters (lines 1636-1662) | ❌ Not implemented |
| **Recovery Fields in State** | last_commit, same_error_count, session_started_at (lines 1709-1725) | ❌ Not in state schema |
| **Git Reconciliation** | Sync state with git history on resume (lines 1727-1758) | ❌ Not implemented |
| **Scope Selection** | Full epic / Single sprint / Specific stories | ⚠️ Only in /claude-plan |
| **Scoped CLAUDE.md Auto-Routing** | Route learnings to apps/web/, packages/backend/, tasks/ (lines 1249-1309) | ⚠️ Files exist, routing not active |
| **Context Fork** | `context: fork` in skill frontmatter (lines 185-206) | ⚠️ Referenced but not in settings |
| **JIT Retrieval** | Load story spec only when needed (lines 159-172) | ⚠️ Partially followed |
| **Sub-Agent Return Format** | 1-paragraph summaries, not full logs (lines 207-227) | ⚠️ Not enforced |
| **Browser QA Integration** | Full Chrome DevTools MCP with QA step types (lines 1312-1359) | ⚠️ Referenced but not integrated |

---

## Issue: Epic-Only Scope is Too Rigid

**Problem:** The claude-* workflow (`/claude-implement`) only supports full epic scope. This is prohibitive for:

1. **Bug fix sprints** - Epic is "complete" but features broke → need to add Sprint N+1 with fix stories → run workflow on just that sprint
2. **Small enhancements** - 2-3 stories don't warrant a whole new epic
3. **Incremental work** - Run workflow on specific stories without touching the rest

**Current Behavior:**
- `/claude-implement` assumes full epic scope
- No prompt for scope selection
- Can't add sprints to "completed" epics

**Required Fix:**

1. **Add scope selection prompt to `/claude-implement`:**
   ```
   Scope options:
   [1] Full Epic (current behavior)
   [2] Single Sprint - specify epic + sprint number
   [3] Specific Stories - specify story IDs
   ```

2. **Allow adding sprints to completed epics:**
   - When user selects sprint scope on a completed epic
   - Change state from `phase: "complete"` back to `phase: "implementation"`
   - Only process the specified sprint, not re-run completed sprints

3. **Track completion at sprint level:**
   ```json
   {
     "completedSprints": [1, 2],
     "currentSprint": 3,
     "sprintScope": "single",
     "targetSprint": 3
   }
   ```

4. **State file should support incremental runs:**
   - `completedStories` already tracks individual stories
   - Add `targetScope` field: `"epic"`, `"sprint:2"`, or `"stories:26.4.1,26.4.2"`

---

## Issue: Missing Ralph Wiggum Stop Hook (FUTURE - Large Epics)

**Problem:** The current Stop hook only plays a notification sound. It does NOT implement the Ralph Wiggum pattern needed for autonomous long-running workflows.

**Current Stop Hook (settings.json lines 6-15):**
```json
"Stop": [
  {
    "hooks": [
      {
        "command": "osascript -e 'display notification \"Task Complete\"...'"
      }
    ]
  }
]
```

**This just plays a sound.** Claude can decide "I'm done" mid-epic and stop prematurely.

**What Ralph Wiggum Does (That We're Missing):**

| Feature | Ralph Wiggum | Current Setup |
|---------|--------------|---------------|
| Promise check | Scans output for `<promise>COMPLETE</promise>` | ❌ Missing |
| Exit blocking | Returns exit code 2 to block premature exit | ❌ Missing |
| Prompt re-injection | Feeds same prompt back to continue | ❌ Missing |
| Max iterations | Safety limit (e.g., 100) | ❌ Missing |
| Iteration counter | Tracks loop count in state | ❌ Missing |

**Required Fix - New Stop Hook Script:**

```bash
#!/bin/bash
# .claude/hooks/claude-stop.sh

STATE_FILE="$1"  # Path to .orchestrator-state.json
MAX_ITERATIONS=100
OUTPUT="$CLAUDE_OUTPUT"

# Check for completion promise
if echo "$OUTPUT" | grep -q "EPIC_COMPLETE\|PLAN_APPROVED\|PAUSE_REQUESTED"; then
  exit 0  # Allow exit
fi

# Check iteration count
ITERATIONS=$(jq -r '.iterations // 0' "$STATE_FILE")
if [ "$ITERATIONS" -ge "$MAX_ITERATIONS" ]; then
  echo "Max iterations reached"
  exit 0  # Allow exit (safety)
fi

# Increment counter
jq ".iterations = $((ITERATIONS + 1))" "$STATE_FILE" > tmp && mv tmp "$STATE_FILE"

# Block exit, re-inject prompt
exit 2
```

**Why This Matters (For Large Epics):**
- Without this, Claude can stop mid-epic whenever it "thinks" it's done
- The workflow promises (`EPIC_COMPLETE`, `PLAN_APPROVED`) are defined but nothing checks for them
- For small epics (tested so far), Claude completes within natural turn limits
- For large epics (10+ stories, multi-sprint), this becomes critical for unattended runs

---

## Issue: Missing Recovery Protocol

**From original plan (lines 1566-1758):**

### Circuit Breaker (Not Implemented)
```python
SAME_ERROR_THRESHOLD = 3

if state.same_error_count >= SAME_ERROR_THRESHOLD:
    # Add to scoped CLAUDE.md so future sessions know
    append_to_claude_md(rule=f"Known issue: {error.summary}")

    # Mark story stuck and move on
    mark_story_stuck(story, reason=f"Same error 3x")
    move_to_next_story()
```

### Session Expiration (Not Implemented)
```python
SESSION_TIMEOUT_HOURS = 24

if hours_elapsed >= SESSION_TIMEOUT_HOURS:
    # Keep progress, reset counters
    state.iteration = 0
    state.same_error_count = 0
    state.started_at = now()
```

### Git Reconciliation (Not Implemented)
```python
def reconcile_state_with_git():
    # Sync state file with actual git history
    commits = git_log_since(state.started_at)
    for commit in commits:
        story = extract_story_id(commit.message)
        if story not in state.completedStories:
            state.completedStories.append(story)
```

### Recovery Fields in State (Not Implemented)
```json
{
  "recovery": {
    "last_commit": "abc123...",
    "last_error_signature": "TypeError:undefined:ChatServer.ts:245",
    "same_error_count": 2,
    "session_started_at": "2026-01-17T09:00:00Z",
    "total_iterations": 15
  }
}
```

---

## Action Items

### HIGH Priority
- [ ] Add scope selection prompt to `/claude-implement`
- [ ] Add scope selection prompt to `/claude-plan`
- [ ] Allow re-opening completed epics for new sprints
- [ ] Add `targetScope` field to state file schema
- [ ] Track `completedSprints` array in state

### MEDIUM Priority (For Large Epics)
- [ ] Create `.claude/hooks/claude-stop.sh` with promise checking
- [ ] Update settings.json Stop hook to use new script
- [ ] Add `iterations` counter to state file schema
- [ ] Implement circuit breaker (3x same error → stuck)
- [ ] Add recovery fields to state schema

### LOW Priority
- [ ] Implement session expiration (24h)
- [ ] Implement git reconciliation on resume
- [ ] Implement scoped CLAUDE.md auto-routing
- [ ] Enforce sub-agent return format (summaries only)

---

## Proposed Flowchart

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         CLAUDE-* WORKFLOW (PROPOSED)                            │
│                                                                                 │
│  Legend: ✅ = Implemented  ⚠️ = Partial  ❌ = Missing                            │
└─────────────────────────────────────────────────────────────────────────────────┘

                              /claude-plan
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              USER PROMPTS                                       │
├─────────────────────────────────────────────────────────────────────────────────┤
│   ✅ 1. EPIC NUMBER                                                             │
│   ⚠️ 2. SCOPE SELECTION (exists in /claude-plan, MISSING in /claude-implement)  │
│      [1] Full Epic                                                              │
│      [2] Single Sprint ← ❌ NOT WORKING                                          │
│      [3] Specific Stories ← ❌ NOT WORKING                                       │
│   ❌ 3. ALLOW RE-OPENING COMPLETED EPICS                                         │
└─────────────────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           PLANNING PHASE                                        │
├─────────────────────────────────────────────────────────────────────────────────┤
│   ✅ PLAN-AGENT → ✅ ARCHITECT-AGENT (~30s) → ✅ SPEC-REVIEW-AGENT (~2min)        │
│                           │                                                     │
│                           ▼                                                     │
│                  ✅ SPEC FINAL PASS                                              │
│                           │                                                     │
│                           ▼                                                     │
│                    PLAN_APPROVED                                                │
└─────────────────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
                            /claude-implement
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         IMPLEMENTATION PHASE                                    │
├─────────────────────────────────────────────────────────────────────────────────┤
│   ❌ SCOPE SELECTION (MISSING)                                                   │
│   ✅ Workflow compatibility check                                                │
│   ✅ FILE-GROUPING-AGENT → Parallel batches                                      │
│                                                                                 │
│   FOR EACH BATCH:                                                               │
│   ✅ Spawn agents (frontend/backend) in parallel                                 │
│   ✅ Test + Review Loop (per story, max 10 retries)                              │
│   ✅ Code review (code-review-agent)                                             │
│   ✅ Browser QA (Chrome DevTools MCP)                                            │
│   ✅ Commit approved batch                                                       │
│   ❌ Circuit breaker (3x same error)                                             │
│                                                                                 │
│   ✅ INTEGRATION TESTS (after all batches)                                       │
│                           │                                                     │
│                           ▼                                                     │
│                    EPIC_COMPLETE                                                │
│                           │                                                     │
│   ❌ STOP HOOK checks for promise (MISSING - just plays sound)                   │
└─────────────────────────────────────────────────────────────────────────────────┘

STATE FILE SCHEMA (Current vs Proposed):

CURRENT:                              PROPOSED:
{                                     {
  "workflow": "claude-autonomous",      "workflow": "claude-autonomous",
  "epic": 26,                           "epic": 26,
  "phase": "complete",                  "phase": "implementation",
  "completedStories": [...]             "completedStories": [...],
}                                       "completedSprints": [1, 2],  ← NEW
                                        "targetScope": "sprint:3",   ← NEW
                                        "recovery": {                ← NEW
                                          "last_commit": "...",
                                          "same_error_count": 0,
                                          "iterations": 15
                                        }
                                      }
```

---

## Reference Files

- Original plan: `/tasks/epic-20/claude-autonomous-plan.md`
- Current /claude-plan skill: `.claude/skills/claude-plan/SKILL.md`
- Current /claude-implement skill: `.claude/skills/claude-implement/SKILL.md`
- Settings: `.claude/settings.json`
