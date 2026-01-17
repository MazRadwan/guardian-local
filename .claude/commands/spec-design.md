---
description: Planning phase - create sprint/story specs with batched GPT deep review
allowed-tools: Read, Write, Edit, Bash, Grep, Glob, Task
---

# Spec Design - Planning Phase

You are starting the **planning phase** of the Opus-GPT automated workflow.

## Your Task

Create detailed sprint and story specifications with **batched GPT deep analysis** (every 2 sprints to reduce API calls).

## Step 1: Gather Context

Ask user for:
1. **Epic number:** Which epic to plan?
2. **Goals document:** Location of epic goals (e.g., `tasks/epic-19/epic-19-goals.md`)
3. **Scope:** Full epic, single sprint, or specific stories?

## Step 2: Initialize State

**First, check for existing state and workflow compatibility:**

```python
state_path = f"/tasks/epic-{N}/.orchestrator-state.json"
existing_state = read_json_if_exists(state_path)

if existing_state:
    if existing_state.get("workflow") != "opus-gpt":
        # WORKFLOW MISMATCH - cannot proceed
        error(f"""
        ⚠️  WORKFLOW MISMATCH DETECTED

        This epic was started with: {existing_state.get('workflow', 'unknown')}
        You are trying to run: opus-gpt (via /spec-design)

        Options:
        1. Continue with original workflow (e.g., /claude-plan for claude-autonomous)
        2. Start fresh (loses progress): rm {state_path}
        3. Use a different epic number

        Cannot proceed with mismatched workflow.
        """)
        return  # Exit command
    else:
        # Same workflow - resume from existing state
        log(f"Resuming opus-gpt workflow from phase: {existing_state['phase']}")
        state = existing_state
else:
    # No existing state - create new
    state = { ... }  # See below
```

**Create state file at `/tasks/epic-{N}/.orchestrator-state.json`:**

```json
{
  "workflow": "opus-gpt",
  "workflowVersion": "1.0.0",
  "epic": "{N}",
  "scope": "{user's scope choice}",
  "phase": "planning",
  "currentBatch": 0,
  "currentStory": null,
  "currentSprint": 0,
  "totalSprints": 0,
  "retryCount": 0,
  "status": "planning",
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
    "specPerBatch": {},
    "specFinalPass": 0
  },
  "currentSprintBatch": []
}
```

## Step 3: Invoke Plan Agent

Use the Task tool to spawn plan-agent:

```
Task(
  subagent_type: "plan-agent",
  prompt: "Create sprint and story specifications for Epic {N}.
    Goals: {goals document path}
    Scope: {scope}

    Requirements:
    - Each story must have 'Files Touched' section (critical for parallelization)
    - Each story must have agent assignment (frontend-agent or backend-agent)
    - Each story must have testable acceptance criteria

    Output files to /tasks/epic-{N}/"
)
```

## Step 4: Batched Sprint GPT Deep Review

**RATE LIMIT OPTIMIZATION:** Review every 2 sprints together to reduce API calls (~42% reduction).

### Flow

```
For sprint batches (every 2 sprints):
    │
    ├── Send sprints 1-2 specs to GPT with Deep Analysis Prompt
    │
    ├── Re-review loop until GPT approves
    │
    ├── Output: <promise>SPRINT_BATCH_APPROVED</promise>
    │
    ├── Send sprints 3-4 specs to GPT (if applicable)
    │
    └── Continue until all sprint batches approved
```

### Review Schedule

| Total Sprints | Batches | GPT Calls |
|---------------|---------|-----------|
| 1-2 | [1-2] | 1 |
| 3-4 | [1-2], [3-4] | 2 |
| 5-6 | [1-2], [3-4], [5-6] | 3 |

### Batched Sprint Spec Review Prompt (Deep Analysis)

**Primary: Bash with `codex review` (recommended - MCP causes crashes)**

Uses structured 7-section prompt format (based on [claude-delegator](https://github.com/jarrodwatts/claude-delegator) patterns):

```bash
# Kill orphaned processes first
pkill -f "codex.*mcp-server" 2>/dev/null || true

# Use codex review with structured 7-section prompt via stdin
gtimeout 300 codex review - <<'EOF'
## TASK
Review Sprint Specifications for Epic {epic_id}: {sprint_ids} (e.g., "Sprint 1 and Sprint 2").

## EXPECTED OUTCOME
Deep analysis of sprint specs BEFORE implementation begins.
Identify feasibility issues, conflicts, missing dependencies, and architectural concerns.
Return STATUS: APPROVED or STATUS: NEEDS_REVISION with findings.

## CONTEXT
Epic: {epic_id}
Sprints being reviewed: {sprint_ids}
Total Stories: {story_count}

Sprint Specifications:
{sprint_file_content}

Story Specifications:
{story_files_content}

## CONSTRAINTS
- Clean architecture: domain → application → infrastructure
- Existing codebase patterns must be followed
- Files Touched must be accurate and complete
- Acceptance criteria must be testable
- No conflicts with existing implementations

## MUST DO
- **Search the codebase** for each file in 'Files Touched' sections
- **Verify** proposed changes don't conflict with existing code
- **Check** for missing dependencies or breaking changes
- **Look for** similar implementations and ensure consistency
- **Validate** technical approach against existing patterns
- **Identify** race conditions, security issues, architectural violations

Take your time. Think deeply. Search continuously.

## MUST NOT DO
- Approve specs without searching codebase
- Skip verification of file paths
- Ignore cross-sprint dependencies
- Rubber-stamp without deep analysis

## RE-REVIEW CYCLE
- After agent revises specs, you will receive an updated submission
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

No blocking issues found. Sprint specification is ready for implementation.

CONFIDENCE: 0.85
```

Example valid response with issues:
```
STATUS: NEEDS_REVISION

CRITICAL (blocks implementation - must fix before coding):
1. Missing dependency — File: story-20.1.2.md — Why: Requires story 20.1.1 to complete first

CONFIDENCE: 0.7
```

[If NEEDS_REVISION, organize findings by severity:]

CRITICAL (blocks implementation - must fix before coding):
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

**Note:** Specs are passed via prompt CONTEXT section, not git diff. GPT can still search the codebase to verify feasibility of proposed changes.

**Alternative: MCP (use with caution - may crash)**
```
mcp__codex__codex - Known issue: needs_follow_up loop causes Cursor crashes after ~5 min.
Only use for quick queries, not full spec reviews.
```

**If GPT rate limited, use Opus fallback:**
```
Task(
  subagent_type: "code-review-agent",
  prompt: "You are reviewing SPRINT SPECS as a FALLBACK because GPT is rate limited.

    ## Context
    - Primary reviewer (GPT-5.2) is unavailable due to rate limits
    - Your review keeps the automation running

    ## Your Role
    Review these sprint specifications for:
    - Feasibility and completeness
    - File path accuracy
    - Dependency identification
    - Clean architecture adherence
    - Potential conflicts

    ## Specs to Review
    {sprint_specs}

    ## Response Format
    STATUS: APPROVED or STATUS: NEEDS_REVISION
    [findings organized by severity: CRITICAL, HIGH, MEDIUM, LOW]
    CONFIDENCE: [0.0-1.0]"
)
```

When using Opus fallback:
1. Set `reviewFallback.usedOpus = true`
2. Add sprint to `reviewFallback.pendingGPTReReview`
3. Log: "GPT rate limited - using Opus fallback for spec review"

### Handle Review Response

For each sprint:
1. If GPT has CRITICAL/HIGH issues → make changes → re-submit for review
2. If Opus disagrees → pushback loop (max 7 retries, GPT final say)
3. Continue until GPT approves with no CRITICAL/HIGH items
4. Log to `.review-log.md`
5. Add sprint to `approvedSprints`
6. Output `<promise>SPRINT_SPEC_APPROVED</promise>`
7. Move to next sprint

## Step 5: Spec Final Pass

**After all sprints individually approved**, do a holistic review.

### Spec Final Pass Prompt

```
mcp__codex__codex with prompt:
"You are assuming the role of a 10x senior dev. Review ALL SPRINT SPECS together holistically.

Epic: {epic_id}
Total Sprints: {sprint_count}
Total Stories: {story_count}

## Your Task

You have already reviewed each sprint individually. Now review them TOGETHER to catch:

1. **Cross-sprint dependencies:** Are they correctly ordered?
2. **File conflicts across sprints:** Do later sprints assume earlier changes?
3. **Architectural consistency:** Does the sum align with clean architecture?
4. **Scope creep:** Does the total scope match the original goals?
5. **Integration risks:** Will these pieces work together?
6. **Missing gaps:** Anything implied by goals but not covered?

## All Sprints Summary

{all_sprints_summary}

## Review Focus

1. **Dependencies:** Cross-sprint dependencies correctly identified?
2. **Ordering:** Sprint order makes sense for implementation?
3. **Conflicts:** Any file touched in multiple sprints that could conflict?
4. **Architecture:** Overall approach maintains clean architecture?
5. **Completeness:** All goals from the epic covered?
6. **Integration:** Will the pieces integrate correctly?

## Response Format

**If issues found**, respond with:

STATUS: NEEDS_REVISION

CROSS-SPRINT ISSUES:
1. [Issue] — Sprints affected: [list] — Why: [rationale]

DEPENDENCY ISSUES:
1. [Issue] — Why: [rationale]

GAPS:
1. [Missing item] — Why: [should be covered]

**If no issues**, respond with:

STATUS: APPROVED

No cross-sprint issues found. Epic specification is ready for implementation.

## Important
- This is the final gate before implementation begins
- Focus on CROSS-SPRINT issues, not per-sprint details (already reviewed)
- STATUS: APPROVED means 'entire epic spec is ready'"
```

## Step 6: Finalize

Once spec final pass approved:
1. Update state: `phase: "complete"`, `status: "plan_approved"`
2. Write to `.review-log.md`
3. **Commit approved specs:**
   ```bash
   git add tasks/epic-{N}/sprint-*.md tasks/epic-{N}/.orchestrator-state.json tasks/epic-{N}/.review-log.md
   git commit -m "docs(epic-{N}): approved sprint specifications

   Sprints: {list}
   Stories: {count}
   GPT review rounds: {total}

   Ready for implementation.
   "
   ```
4. Output summary:

```
## Planning Complete

**Epic:** {N}
**Scope:** {scope}
**Sprints:** {list}
**Stories:** {count}

### Per-Sprint Review Rounds
- Sprint 1: {N} rounds
- Sprint 2: {N} rounds
- ...

### Spec Final Pass
- Rounds: {N}

Plan is ready. Run `/implement` to begin implementation.

<promise>PLAN_APPROVED</promise>
```

## Important Rules

1. **Review per-sprint** - Don't review entire epic at once
2. **Deep analysis** - GPT must search codebase, verify files, check conflicts
3. **Spec final pass is mandatory** - Catches cross-sprint issues
4. **Always initialize state file first** - Enables resume if interrupted
5. **Log all GPT exchanges** - Audit trail in .review-log.md
6. **Respect 7 retry limit** - GPT gets final say after that
7. **Be specific in plan-agent prompt** - Files Touched is critical
8. **Opus fallback for rate limits** - If GPT rate limited, use code-review-agent to prevent stalls
9. **Kill orphaned processes** - Run `pkill -f "codex.*mcp"` before new reviews

## Error Handling

If something goes wrong:
1. Update state with error details
2. Output `<promise>ERROR</promise>`
3. Provide clear error message and resume instructions

## Output

When complete, the following should exist:
- `/tasks/epic-{N}/.orchestrator-state.json` - State with phase: complete
- `/tasks/epic-{N}/sprint-*.md` - Sprint files
- `/tasks/epic-{N}/sprint-*-story-*.md` - Story files
- `/tasks/epic-{N}/.review-log.md` - GPT exchange log (with per-sprint rounds)
