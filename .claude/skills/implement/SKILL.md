---
name: implement
description: Implementation phase - execute specs with parallel agents and GPT code review. Use after /spec-design to implement approved story specifications.
---

# Implement - Implementation Phase

You are starting the **implementation phase** of the Opus-GPT automated workflow.

**Prerequisite:** Specs must exist (run `/spec-design` first, or have existing story files).

## Your Task

Execute story specifications using parallel specialist agents, with GPT-5.2 code review.

## Step 1: Workflow Validation

**CRITICAL:** Check for workflow mismatch before proceeding.

```python
state_path = f"/tasks/epic-{epic}/.orchestrator-state.json"
state = read_json_if_exists(state_path)

if state and state.get("workflow") != "opus-gpt":
    error(f"""
    WORKFLOW MISMATCH DETECTED

    This epic was started with: {state.get('workflow', 'unknown')}
    You are trying to run: opus-gpt

    Options:
    1. Use the correct workflow command
    2. Start fresh: rm {state_path}
    """)
    return
```

## Step 2: Scope Selection (ALWAYS PROMPT)

**Ask user EVERY time** (not just when no state file):

```
What scope do you want to implement?

[1] Full Epic - All sprints and stories
[2] Single Sprint - Specify sprint number
[3] Specific Stories - Specify story IDs (e.g., 26.1.1, 26.1.2)

Custom GPT review prompt? [Enter for default]:
```

Store selection in state: `targetScope: "epic" | "sprint:2" | "stories:26.1.1,26.1.2"`

## Step 3: Verify Prerequisites

Check for:
1. Story files exist in `/tasks/epic-{N}/`
2. State file exists (create if new)

## Step 4: Initialize/Resume State

If state exists AND matches selected scope, resume from current phase.
If new or scope changed, update state file at `/tasks/epic-{N}/.orchestrator-state.json`

## Step 5: File Grouping (Parallelization)

Invoke file-grouping-agent to create execution batches:

```
Task(
  subagent_type: "file-grouping-agent",
  prompt: "Analyze stories in /tasks/epic-{N}/ for scope: {scope}.
    Create parallel execution batches based on file conflicts.
    Output execution plan."
)
```

## Step 6: Execute Batches

**RATE LIMIT OPTIMIZATION:** GPT code reviews happen every 2-3 batches, not every batch (~42% reduction).

### Review Schedule

| Batches in Sprint | Review After Batches | Total GPT Calls |
|-------------------|---------------------|-----------------|
| 1-3 | All at once | 1 |
| 4-6 | 3, then 6 | 2 |
| 7-10 | 3, 6, then rest | 3-4 |

For each batch:

### 6a. Spawn Specialists (Parallel)

```
// Parallel execution within batch
Task(subagent_type: "frontend-agent", prompt: "Implement story 19.0.1...", run_in_background: true)
Task(subagent_type: "frontend-agent", prompt: "Implement story 19.0.2...", run_in_background: true)
Task(subagent_type: "backend-agent", prompt: "Implement story 19.0.3...", run_in_background: true)
```

### 6b. Wait for Completion

Collect summaries from all agents in batch.

### 6c. Verification Phase

Run verification before GPT review:

```bash
pnpm test
pnpm lint
pnpm typecheck
```

### 6d. GPT Code Review

**Primary: Codex CLI (recommended)**

```bash
# Kill any orphaned codex processes first
pkill -f "codex.*mcp-server" 2>/dev/null || true

# Use gtimeout on macOS (brew install coreutils)
gtimeout 300 codex review - <<'EOF'
## TASK
Review code implementation for Epic {epic_id}: Batch {batch_num}.

## EXPECTED OUTCOME
Identify issues in THIS batch's code only.
Return STATUS: APPROVED or STATUS: NEEDS_REVISION with findings.

## CONTEXT
Batch: {batch_num}
Stories completed: {story_list}
Files changed: {file_list}

Test Results:
- Unit tests: {pass/fail}
- Lint: {pass/fail}
- Typecheck: {pass/fail}

## CONSTRAINTS
- Clean architecture: domain → application → infrastructure
- Existing codebase patterns
- No regressions
- OWASP security standards

## MUST DO
- Verify code matches story acceptance criteria
- Check for security vulnerabilities
- Verify error handling
- Check architectural boundaries

## MUST NOT DO
- Review files not in this batch
- Flag previously-approved code
- Nitpick style without substance

## OUTPUT FORMAT

**CRITICAL: Response MUST start with exactly:**
STATUS: APPROVED
or
STATUS: NEEDS_REVISION

REQUIRED CHANGES (if any):
1. [Change] — Why: [rationale]

RECOMMENDATIONS (optional):
- [Improvement] — Why: [benefit]

**CONFIDENCE: [0.0-1.0] is REQUIRED.**
EOF
```

**Alternative: Codex MCP Tool**

```
mcp__codex__codex(
  prompt: "{same prompt as above}",
  model: "gpt-5.2-codex",
  sandbox: "read-only"
)
```

### GPT Error Handling (NO FALLBACK - Clean Exit)

**DO NOT use Opus fallback.** Exit cleanly on GPT errors so user can fix and resume.

| Error | Action |
|-------|--------|
| **401 Unauthorized** | Log "GPT authentication failed. Check OPENAI_API_KEY." → Save state → Exit |
| **429 Rate Limited** | Retry with exponential backoff (30s, 60s, 120s) → After 3 retries, save state → Exit |
| **5xx Server Error** | Retry once after 30s → If still failing, save state → Exit |
| **Timeout (>300s)** | Log "GPT request timed out" → Save state → Exit |

On exit, save state for resume:
```json
{
  "status": "gpt_error",
  "errorType": "rate_limited",
  "errorAt": "2026-01-19T16:17:21Z",
  "resumeFrom": "batch_3_code_review",
  "retryCount": 3
}
```

Resume with: `/implement --resume` (or just `/implement` - will detect state and resume)

### 6e. Handle Pushback

1. Analyze GPT recommendations
2. Agree or pushback (max 7 rounds)
3. GPT gets final say after 7
4. Log all exchanges

### 6f. Update CLAUDE.md (Institutional Memory)

If GPT caught issues, append learnings to scoped CLAUDE.md.

### 6g. Commit Approved Batch

**After GPT approves a batch**, commit the changes:

```bash
git add {file1} {file2} ...
git commit -m "feat(epic-{N}): batch {X} - stories {story_list}"
```

### 6h. Mark Batch Complete

Update state and move to next batch.

## Step 7: Sprint Final Pass

**After all batches complete**, do a holistic sprint review.

1. If CRITICAL issues → inline fix → re-review (max 3 rounds)
2. If MAJOR issues → create fix stories → run through batch flow (max 1 batch)
3. If MINOR issues → log to CLAUDE.md
4. Output `<promise>SPRINT_REVIEWED</promise>`

## Step 8: Completion

After sprint final pass approved:

1. Update state: `phase: "complete"`, `status: "completed"`
2. Generate completion summary at `/tasks/epic-{N}/completion.md`
3. Output: `<promise>SCOPE_COMPLETE</promise>`

## Error Handling

### Stuck Story
If same error 3x: Log to `.stuck-log.md`, skip, continue.

### Agent Failure
Retry once, then mark story as skipped.

### GPT Rate Limited
**NO FALLBACK.** Clean exit with state saved for resume.

1. Retry with exponential backoff (30s, 60s, 120s)
2. After 3 retries, save state with `status: "gpt_error"`, `errorType: "rate_limited"`
3. Exit cleanly with message: "GPT rate limited. Wait and run `/implement` to resume."

User fixes the issue (waits for rate limit, refreshes API key) then resumes.

## Important Rules

1. **Verify before review** - Don't waste GPT's time on failing tests
2. **Parallel when possible** - Use file-grouping to maximize throughput
3. **Log everything** - All GPT exchanges to .review-log.md
4. **Update CLAUDE.md** - Institutional memory prevents repeat issues
5. **Never skip GPT review** - Every batch and sprint final pass gets reviewed
6. **Sprint final pass is mandatory** - Catches integration issues
7. **Re-review is MANDATORY after fixes** - Don't skip just because tests pass
8. **Checkpoint per-story** - Update completedStories immediately
9. **Confidence threshold** - Don't auto-approve reviews with confidence < 0.5
10. **No Opus fallback** - Clean exit on GPT errors, resume when fixed
