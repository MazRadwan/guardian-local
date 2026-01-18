---
name: spec-design
description: Planning phase - create sprint/story specs with batched GPT deep review. Use for Opus-GPT workflow epic planning with plan-agent and GPT-5.2 validation.
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
        WORKFLOW MISMATCH DETECTED

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
    state = create_new_state()
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

Focus on:
1. **Cross-sprint dependencies:** Are they correctly ordered?
2. **File conflicts across sprints:** Do later sprints assume earlier changes?
3. **Architectural consistency:** Does the sum align with clean architecture?
4. **Scope creep:** Does the total scope match the original goals?
5. **Integration risks:** Will these pieces work together?
6. **Missing gaps:** Anything implied by goals but not covered?

## Step 6: Finalize

Once spec final pass approved:
1. Update state: `phase: "complete"`, `status: "plan_approved"`
2. Write to `.review-log.md`
3. **Commit approved specs**
4. Output: `<promise>PLAN_APPROVED</promise>`

```
## Planning Complete

**Epic:** {N}
**Scope:** {scope}
**Sprints:** {list}
**Stories:** {count}

Plan is ready. Run `/implement` to begin implementation.
```

## Important Rules

1. **Review per-sprint** - Don't review entire epic at once
2. **Deep analysis** - GPT must search codebase, verify files, check conflicts
3. **Spec final pass is mandatory** - Catches cross-sprint issues
4. **Always initialize state file first** - Enables resume if interrupted
5. **Log all GPT exchanges** - Audit trail in .review-log.md
6. **Respect 7 retry limit** - GPT gets final say after that
7. **Be specific in plan-agent prompt** - Files Touched is critical
8. **Opus fallback for rate limits** - If GPT rate limited, use code-review-agent

## Output

When complete, the following should exist:
- `/tasks/epic-{N}/.orchestrator-state.json` - State with phase: complete
- `/tasks/epic-{N}/sprint-*.md` - Sprint files
- `/tasks/epic-{N}/sprint-*-story-*.md` - Story files
- `/tasks/epic-{N}/.review-log.md` - GPT exchange log
