---
description: Implementation phase - execute specs with parallel agents and GPT code review
allowed-tools: Read, Write, Edit, Bash, Grep, Glob, Task
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
If new, create state file:

```json
{
  "epic": "{N}",
  "scope": "{scope}",
  "phase": "parallelization",
  "currentBatch": 0,
  "currentStory": null,
  "currentSprint": 1,
  "totalSprints": 0,
  "retryCount": 0,
  "status": "grouping",
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
  "reviewRounds": {
    "specPerSprint": {},
    "specFinalPass": 0,
    "code": 0,
    "sprintFinal": 0
  },
  "sprintReview": {
    "round": 0,
    "inlineFixCount": 0,
    "fixStoriesCreated": [],
    "maxInlineFixes": 3,
    "maxFixBatches": 1
  }
}
```

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

Save execution plan to state or separate file.

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

For parallel batches, spawn multiple agents simultaneously:

```
// Parallel execution within batch
Task(subagent_type: "frontend-agent", prompt: "Implement story 19.0.1...", run_in_background: true)
Task(subagent_type: "frontend-agent", prompt: "Implement story 19.0.2...", run_in_background: true)
Task(subagent_type: "backend-agent", prompt: "Implement story 19.0.3...", run_in_background: true)
```

For sequential batches, run one at a time.

### 4b. Wait for Completion

Collect summaries from all agents in batch.

### 4c. Verification Phase

Run verification before GPT review:

```bash
pnpm test
pnpm lint
pnpm typecheck
```

If any fail:
1. Attempt auto-fix (eslint --fix, prettier)
2. If still failing, note in review request to GPT

### 4d. GPT Code Review

Send batch results to GPT-5.2:

**Primary: Bash with `codex review` (recommended - MCP causes crashes)**

Uses structured 7-section prompt format (based on [claude-delegator](https://github.com/jarrodwatts/claude-delegator) patterns):

```bash
# Kill orphaned processes first
pkill -f "codex.*mcp-server" 2>/dev/null || true

# Use codex review with structured 7-section prompt via stdin
gtimeout 300 codex review - <<'EOF'
## TASK
Review Batch {batch_id} implementation for Epic {epic_id}.

## EXPECTED OUTCOME
Identify correctness, security, architecture, and pattern issues in THIS batch only.
Return STATUS: APPROVED or STATUS: NEEDS_REVISION with findings.

## CONTEXT
Stories in this batch:
- {story_id}: {story_title}
- {story_id}: {story_title}

Files changed (THIS BATCH ONLY):
- {file_path} - {change_description}
- {file_path} - {change_description}

Test results: {pass/fail} ({test_count} tests)
Lint results: {pass/fail}
TypeCheck results: {pass/fail}

Previous review round: {N} (if re-review, include what was fixed)

## CONSTRAINTS
- Clean architecture: domain → application → infrastructure (no reverse imports)
- Existing codebase patterns (check similar implementations)
- No regressions to existing functionality
- Security: OWASP top 10, input validation, no credential exposure

## MUST DO
- Focus ONLY on the files listed above
- Search codebase for conflicts with existing code
- Verify changes align with existing patterns
- Check for race conditions, error handling gaps
- Validate architectural layer boundaries

## MUST NOT DO
- Review files not in this batch (ignore other uncommitted changes)
- Flag issues in previously-approved code
- Suggest stylistic changes without substance
- Nitpick naming or formatting unless it impacts clarity

## RE-REVIEW CYCLE
- After agent makes changes, you will receive an updated submission
- Review the changes and respond with STATUS: APPROVED or STATUS: NEEDS_REVISION
- This cycle continues until you give STATUS: APPROVED

## HANDLING PUSHBACK
- The agent may disagree with a recommendation and explain why
- Evaluate the agent's reasoning objectively
- If the agent's reasoning is sound, update your assessment
- If you still believe the change is necessary, restate your position with rationale
- After 7 pushback rounds, you have final say

## OUTPUT FORMAT

**CRITICAL: Your response MUST start with one of these exact lines:**
```
STATUS: APPROVED
```
or
```
STATUS: NEEDS_REVISION
```

**Responses without an explicit STATUS line are INVALID and will be rejected.**

Example valid response:
```
STATUS: APPROVED

No blocking issues found. Implementation meets quality standards.

CONFIDENCE: 0.85
```

Example valid response with issues:
```
STATUS: NEEDS_REVISION

CRITICAL (blocks approval - must fix):
1. Race condition in deleteOrphanBatches — File: repo.ts:245 — Why: Missing transaction lock

CONFIDENCE: 0.7
```

[If NEEDS_REVISION, organize findings by severity:]

CRITICAL (blocks approval - must fix):
1. [Issue] — File: [path] — Why: [rationale]

HIGH (significant risk if not addressed):
1. [Issue] — File: [path] — Why: [rationale]

MEDIUM (creates tech debt, should fix):
1. [Issue] — Why: [rationale]

LOW (nice to have):
- [Issue] — Why: [benefit if addressed]

**CONFIDENCE: [0.0-1.0] is also REQUIRED.**
EOF
```

**Note:** Remove `--uncommitted` flag - the structured prompt tells GPT exactly what to review, avoiding re-review of already-approved code.

**Alternative: MCP (use with caution - may crash)**
```
mcp__codex__codex - Known issue: needs_follow_up loop causes Cursor crashes after ~5 min.
Only use for quick queries, not full code reviews.
```

### 4e. Handle Pushback

Same as planning phase:
1. Analyze GPT recommendations
2. Agree or pushback (max 7 rounds)
3. GPT gets final say after 7
4. Log all exchanges

### 4f. Update CLAUDE.md (Institutional Memory)

If GPT caught issues, append learnings to scoped CLAUDE.md:

```
IF issue file in apps/web/**     → /apps/web/CLAUDE.md
IF issue file in packages/backend/** → /packages/backend/CLAUDE.md
ELSE                              → /CLAUDE.md
```

### 4g. Commit Approved Batch

**After GPT approves a batch**, commit the changes to keep git diff clean:

```bash
# Stage only this batch's files
git add {file1} {file2} ...

# Commit with descriptive message
git commit -m "feat(epic-{N}): batch {X} - stories {story_list}

Implemented:
- {story_id}: {brief description}
- {story_id}: {brief description}

GPT review: APPROVED (confidence: {score})
"
```

**Why commit after approval:**
- Next `codex review` only sees NEW uncommitted changes
- Prevents re-reviewing already-approved code
- Keeps git history granular and meaningful
- Enables easy rollback if issues found later

### 4h. Mark Batch Complete

Update state:
- Add completed stories to `completedStories`
- Increment `currentBatch`
- Reset `retryCount`

### 4i. Check if GPT Review Due

**Only trigger GPT code review when:**
1. Completed 2-3 batches since last review, OR
2. Reached end of sprint, OR
3. Accumulated 4+ stories since last review

**If review NOT due:** Continue to next batch (skip 4d GPT Code Review)
**If review IS due:** Run GPT Code Review (step 4d) on ALL accumulated batches

## Step 5: Sprint Final Pass

**After all batches complete**, do a holistic sprint review.

### Sprint Final Pass Prompt

```
mcp__codex__codex with prompt:
"You are assuming the role of a 10x senior dev. Review this COMPLETED SPRINT holistically.

Sprint: {sprint_id}
Stories completed: {story_list}
Files modified: {file_list}

## Review Focus
1. **Integration:** Do the pieces work together correctly?
2. **Patterns:** Consistent conventions across all stories?
3. **Gaps:** Anything missing that acceptance criteria implied?
4. **Regressions:** Any cross-story conflicts or breaks?
5. **Architecture:** Does the sum align with clean architecture?

## Response Format

**If issues found**, respond with:

STATUS: NEEDS_REVISION

CRITICAL (must fix before sprint complete):
1. [Issue] — Why: [rationale]

MAJOR (should fix, creates tech debt if skipped):
1. [Issue] — Why: [rationale]

MINOR (nice to have, can defer):
- [Issue] — Why: [benefit if addressed]

**If no issues**, respond with:

STATUS: APPROVED

No blocking issues found. Sprint implementation meets quality standards.

## Important
- CRITICAL items block approval (inline fix, max 3 rounds)
- MAJOR items should be fixed but can be overridden after discussion
- MINOR items are deferred to CLAUDE.md for institutional memory"
```

### Handle Sprint Final Pass

1. If CRITICAL issues → inline fix → re-review (max 3 rounds)
2. If MAJOR issues → create fix stories → run through batch flow (max 1 batch)
3. If MINOR issues → log to CLAUDE.md
4. Update `reviewRounds.sprintFinal`
5. Output `<promise>SPRINT_REVIEWED</promise>`

## Step 6: Completion

After sprint final pass approved:

1. Update state: `phase: "complete"`, `status: "completed"`
2. Generate completion summary at `/tasks/epic-{N}/completion.md`:

```markdown
# Epic {N} Implementation Complete

## Summary
- **Scope:** {scope}
- **Stories completed:** {count}
- **Stories skipped:** {count}
- **Duration:** {time}

## Completed Stories
- [x] 19.0.1 - [title]
- [x] 19.0.2 - [title]

## Skipped Stories
- [ ] 19.0.4 - [reason] (see .stuck-log.md)

## GPT Review Rounds
### Per-Sprint Spec Reviews
- Sprint 1: {N} rounds
- Sprint 2: {N} rounds

### Spec Final Pass
- Rounds: {N}

### Code Reviews
- Batch 1: {N} rounds
- Batch 2: {N} rounds

### Sprint Final Pass
- Rounds: {N}
- CRITICAL fixes: {count}
- MAJOR fixes: {count}
- MINOR deferred: {count}

## CLAUDE.md Updates
- {count} rules added to /apps/web/CLAUDE.md
- {count} rules added to /packages/backend/CLAUDE.md
```

3. Output: `<promise>SCOPE_COMPLETE</promise>`

## Error Handling

### Stuck Story
If same error 3x:
1. Log to `.stuck-log.md`
2. Add to `skippedStories`
3. Continue with next story
4. Output: `<promise>STUCK</promise>` (but continue)

### Agent Failure
If specialist agent crashes:
1. Log error
2. Retry once
3. If still failing, mark story as skipped

### MCP Failure
1. Retry 3x with backoff
2. Kill orphaned codex processes first: `pkill -f "codex.*mcp-server" 2>/dev/null || true`
3. Fall back to Bash with correct syntax: `codex exec -m gpt-5.2 -s read-only --json "..."`

**DO NOT use:** `codex --prompt` (wrong syntax)

### GPT Rate Limited
If GPT returns rate limit errors (HTTP 429, "rate_limit", "quota exceeded"):

1. **Don't stall** - Use Opus code-review-agent as fallback
2. **Track it** - Set `reviewFallback.usedOpus = true`, add batch to `pendingGPTReReview`
3. **Log it** - "GPT rate limited - using Opus fallback for batch N"

**Spawn Opus Fallback:**
```
Task(
  subagent_type: "code-review-agent",
  prompt: "You are reviewing code as a FALLBACK because GPT is rate limited.

    ## Context
    - Primary reviewer (GPT-5.2) is unavailable due to rate limits
    - Your review keeps the automation running
    - This batch may get GPT re-review later when quota resets

    ## Your Role
    Review this implementation for:
    - Correctness and completeness
    - Security vulnerabilities
    - Clean architecture adherence
    - Pattern consistency with codebase
    - Potential regressions

    Be thorough - you are the only reviewer for now.

    ## Code to Review
    {batch_summary}
    {file_changes}

    ## Response Format
    STATUS: APPROVED or STATUS: NEEDS_REVISION
    [findings if any]
    CONFIDENCE: [0.0-1.0]

    ## Important
    - Apply same quality bar as GPT would
    - Don't rubber-stamp - find real issues"
)
```

**After rate limit resets:** Optionally re-review batches in `pendingGPTReReview` with GPT

## State Updates

Update state file after:
- **Each story completes** (not just batch - checkpoint per-story!)
- Each batch starts
- Each batch completes
- Each GPT review round
- Each error/skip

This enables resume from any point.

## GPT Review Completion Detection

Parse for completion signals instead of polling:
1. Check for `needs_follow_up: false` in output
2. Check for `STATUS: APPROVED` or `STATUS: NEEDS_REVISION`
3. Don't poll file size - use explicit signals

## Re-Review Enforcement

**After making fixes based on GPT feedback:**
1. Set `batchReview.reReviewRequired = true`
2. Make the fixes
3. Run GPT re-review (MANDATORY)
4. Only proceed when GPT returns `STATUS: APPROVED`
5. Set `batchReview.reReviewRequired = false`

**Tests passing is NECESSARY but NOT SUFFICIENT for approval.**

## Confidence Threshold

Parse confidence score from GPT response:
- **≥ 0.7**: Auto-approve
- **0.5 - 0.69**: Approve with warning
- **0.4 - 0.49**: Pause for human review
- **< 0.4**: Reject, require re-review

## Important Rules

1. **Verify before review** - Don't waste GPT's time on failing tests
2. **Parallel when possible** - Use file-grouping to maximize throughput
3. **Log everything** - All GPT exchanges to .review-log.md
4. **Update CLAUDE.md** - Institutional memory prevents repeat issues (ANY findings must be logged)
5. **Never skip GPT review** - Every batch and sprint final pass gets reviewed
6. **Sprint final pass is mandatory** - Catches integration issues batch reviews miss
7. **Fix severity matters** - CRITICAL inline, MAJOR as stories, MINOR deferred
8. **Respect retry limits** - 7 max for pushback, 3 max for inline fixes
9. **Re-review is MANDATORY after fixes** - Don't skip just because tests pass
10. **Checkpoint per-story** - Update completedStories immediately, not at batch end
11. **Kill orphaned processes** - Run pkill before new reviews
12. **Parse completion signals** - Look for `needs_follow_up: false`
13. **Confidence threshold** - Don't auto-approve reviews with confidence < 0.5
14. **Opus fallback for rate limits** - If GPT rate limited, use code-review-agent to prevent stalls

## macOS Compatibility

Use `gtimeout` (from coreutils) instead of `timeout`:
```bash
brew install coreutils
gtimeout 120 codex exec ...
```
