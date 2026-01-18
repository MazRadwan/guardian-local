---
name: delegate
description: Full automation - runs spec-design then implement end-to-end with GPT deep review. Use for complete autonomous epic execution with minimal intervention.
---

# Delegate - Full Automation

You are starting the **full automated workflow** (spec-design + implement).

This command runs both phases back-to-back with minimal user intervention.

## Your Task

1. Run planning phase (spec-design) with per-sprint deep reviews
2. Run spec final pass
3. Run implementation phase (implement)
4. Run sprint final pass
5. Report completion

## Step 1: Gather Input

Ask user for:

1. **Orchestrator prompt:**
   "Paste your orchestrator prompt (goals, context, constraints):"

2. **Scope selection:**
   "What scope?"
   - [1] Full Epic
   - [2] Single Sprint
   - [3] Specific Stories

3. **Epic details:**
   - Epic number
   - Goals document location

4. **GPT review prompt (optional):**
   "Custom GPT-5.2 review prompt? [Enter for default]"

## Step 2: Initialize State

Create state file at `/tasks/epic-{N}/.orchestrator-state.json`:

```json
{
  "epic": "{N}",
  "scope": "{scope}",
  "phase": "planning",
  "currentBatch": 0,
  "currentStory": null,
  "currentSprint": 0,
  "totalSprints": 0,
  "retryCount": 0,
  "status": "started",
  "codex": {
    "conversationId": null,
    "roundCount": 0,
    "lastResponse": "",
    "mode": "mcp"
  },
  "completedStories": [],
  "skippedStories": [],
  "approvedSprints": [],
  "startedAt": "{ISO timestamp}",
  "orchestratorPrompt": "{user's prompt}",
  "gptReviewPrompt": "{user's prompt or default}",
  "reviewRounds": {
    "specPerSprint": {},
    "specFinalPass": 0,
    "code": 0,
    "sprintFinal": 0
  }
}
```

## Step 3: Planning Phase (Per-Sprint Deep Reviews)

**CRITICAL:** Review each sprint INDIVIDUALLY for deeper analysis.

### Flow

```
For each sprint (1 to N):
    │
    ├── 1. plan-agent creates sprint + stories
    │
    ├── 2. GPT deep review of THAT sprint's specs
    │       └── Re-review loop until approved
    │
    ├── 3. Output: <promise>SPRINT_SPEC_APPROVED</promise>
    │
    └── 4. Move to next sprint
```

## Step 4: Spec Final Pass

**After all sprints individually approved**, do a holistic review.

Log: `<promise>PLAN_APPROVED</promise>`

## Step 5: Parallelization Phase

1. Invoke file-grouping-agent
2. Get execution batches
3. Update state with batch plan

## Step 6: Implementation Phase

Execute implementation (same as /implement):

For each batch:
1. Spawn specialists (parallel where possible)
2. Run verification (tests/lint/typecheck)
3. Mark batch complete

After all batches in sprint:
4. Send to GPT-5.2 for code review
5. Handle pushback loop
6. Update CLAUDE.md with learnings

Log each: `<promise>BATCH_APPROVED</promise>`

## Step 7: Sprint Final Pass

After all batches complete, holistic sprint review:
1. Gather all files modified across the sprint
2. Send to GPT-5.2 with sprint review prompt
3. Handle CRITICAL/MAJOR/MINOR issues
4. Update CLAUDE.md with learnings

Log: `<promise>SPRINT_REVIEWED</promise>`

## Step 8: Completion

1. Generate completion summary
2. Write to `/tasks/epic-{N}/completion.md`
3. Final output: `<promise>SCOPE_COMPLETE</promise>`

## Error Recovery

### If Interrupted

State file enables resume:
1. Read `.orchestrator-state.json`
2. Check `phase` and `status`
3. Resume from last checkpoint

### Stuck Detection

If same error 3x:
1. Log to `.stuck-log.md`
2. Skip story, continue with next
3. Include in final report

## Flow Diagram

```
/delegate
    │
    ▼
[Gather Input]
    │
    ▼
[Planning Phase - Per-Sprint]
    │
    ├── For each sprint:
    │   ├── plan-agent creates specs
    │   ├── GPT deep review (search codebase!)
    │   ├── Re-review loop until approved
    │   └── <promise>SPRINT_SPEC_APPROVED</promise>
    │
    ▼
[Spec Final Pass]
    │
    ├── GPT reviews ALL specs together
    ├── Check cross-sprint dependencies
    └── <promise>PLAN_APPROVED</promise>
    │
    ▼
[Parallelization Phase]
    │
    └── file-grouping-agent creates batches
    │
    ▼
[Implementation Phase]
    │
    ├── For each batch:
    │   ├── Spawn specialists (parallel)
    │   ├── Verify (tests/lint)
    │   └── Mark batch complete
    │
    ├── After all batches:
    │   ├── GPT code review
    │   ├── Re-review loop
    │   ├── Update CLAUDE.md
    │   └── <promise>BATCH_APPROVED</promise>
    │
    ▼
[Sprint Final Pass]
    │
    ├── GPT holistic sprint review
    ├── Fix CRITICAL/MAJOR inline
    ├── Defer MINOR to CLAUDE.md
    └── <promise>SPRINT_REVIEWED</promise>
    │
    ▼
[Completion]
    │
    └── <promise>SCOPE_COMPLETE</promise>
```

## Important Rules

1. **User only at start and end** - No intervention during workflow
2. **Spec reviews are per-sprint** - Deep analysis for each sprint individually
3. **Deep analysis** - GPT must search codebase, verify files, check conflicts
4. **Spec final pass is mandatory** - Catches cross-sprint issues
5. **State is checkpoint** - Always update state for recovery
6. **GPT reviews everything** - Specs per-sprint, code per-sprint, final passes
7. **Log all exchanges** - Audit trail in .review-log.md
8. **Update CLAUDE.md** - Prevent repeat issues
9. **Respect limits** - 7 pushback rounds max
10. **Skip, don't block** - Stuck stories get logged and skipped
11. **Report everything** - Completion summary has full details
