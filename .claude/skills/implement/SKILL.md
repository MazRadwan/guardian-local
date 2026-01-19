---
name: implement
description: Implementation phase - execute specs with parallel agents and GPT code review. Use after /spec-design to implement approved story specifications.
---

# Implement - Implementation Phase

You are starting the **implementation phase** of the Opus-GPT automated workflow.

**Prerequisite:** Specs must exist (run `/spec-design` first, or have existing story files).

## Your Task

Execute story specifications using parallel specialist agents, with GPT-5.2 code review.

## Step 1: Verify Prerequisites

Check for:
1. Story files exist in `/tasks/epic-{N}/`
2. State file exists (or ask user for epic number)

If no state file, ask user:
- **Epic number:** Which epic to implement?
- **Scope:** Full epic, single sprint, or specific stories?

## Step 2: Initialize/Resume State

If state exists, resume from current phase.
If new, create state file at `/tasks/epic-{N}/.orchestrator-state.json`

## Step 3: File Grouping (Parallelization)

Invoke file-grouping-agent to create execution batches:

```
Task(
  subagent_type: "file-grouping-agent",
  prompt: "Analyze stories in /tasks/epic-{N}/ for scope: {scope}.
    Create parallel execution batches based on file conflicts.
    Output execution plan."
)
```

## Step 4: Execute Batches

**RATE LIMIT OPTIMIZATION:** GPT code reviews happen every 2-3 batches, not every batch (~42% reduction).

### Review Schedule

| Batches in Sprint | Review After Batches | Total GPT Calls |
|-------------------|---------------------|-----------------|
| 1-3 | All at once | 1 |
| 4-6 | 3, then 6 | 2 |
| 7-10 | 3, 6, then rest | 3-4 |

For each batch:

### 4a. Spawn Specialists (Parallel)

```
// Parallel execution within batch
Task(subagent_type: "frontend-agent", prompt: "Implement story 19.0.1...", run_in_background: true)
Task(subagent_type: "frontend-agent", prompt: "Implement story 19.0.2...", run_in_background: true)
Task(subagent_type: "backend-agent", prompt: "Implement story 19.0.3...", run_in_background: true)
```

### 4b. Wait for Completion

Collect summaries from all agents in batch.

### 4c. Verification Phase

Run verification before GPT review:

```bash
pnpm test
pnpm lint
pnpm typecheck
```

### 4d. GPT Code Review

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

**Fallback: Opus code-review-agent (if GPT rate limited)**

If GPT returns rate limit errors (HTTP 429, "quota exceeded"):
1. Set `state.reviewFallback.usedOpus = true`
2. Spawn `code-review-agent` for review
3. Add batch to `state.reviewFallback.pendingGPTReReview`
4. Continue automation

### 4e. Handle Pushback

1. Analyze GPT recommendations
2. Agree or pushback (max 7 rounds)
3. GPT gets final say after 7
4. Log all exchanges

### 4f. Update CLAUDE.md (Institutional Memory)

If GPT caught issues, append learnings to scoped CLAUDE.md.

### 4g. Commit Approved Batch

**After GPT approves a batch**, commit the changes:

```bash
git add {file1} {file2} ...
git commit -m "feat(epic-{N}): batch {X} - stories {story_list}"
```

### 4h. Mark Batch Complete

Update state and move to next batch.

## Step 5: Sprint Final Pass

**After all batches complete**, do a holistic sprint review.

1. If CRITICAL issues → inline fix → re-review (max 3 rounds)
2. If MAJOR issues → create fix stories → run through batch flow (max 1 batch)
3. If MINOR issues → log to CLAUDE.md
4. Output `<promise>SPRINT_REVIEWED</promise>`

## Step 6: Completion

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
Use Opus code-review-agent as fallback:
1. Set `reviewFallback.usedOpus = true`
2. Add batch to `pendingGPTReReview`
3. Continue automation

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
10. **Opus fallback for rate limits** - Prevent stalls
