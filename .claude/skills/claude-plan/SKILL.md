---
name: claude-plan
description: Claude-only planning phase with two-stage spec review (architect + feasibility). Use for autonomous epic planning with plan-agent, architect-agent, and spec-review-agent.
---

# Claude Plan

> **WHY context: fork?** Planning involves reading many files, creating specs,
> reviewing iterations. Forked context keeps main session clean for monitoring.

> **WHY two-stage review?** Architect catches structural issues (3K line files,
> tech debt) in 30s. Spec review validates feasibility in 2min. Fast pre-filter
> prevents wasted time reviewing infeasible specs with bad structure.

## Usage

```
/claude-plan [epic-number]
```

## Workflow

### Step 1: Gather Context

Ask user for:
1. **Epic number:** Which epic to plan?
2. **Goals document:** Location of epic goals (e.g., `tasks/epic-{N}/epic-{N}-goals.md`)
3. **Scope:** Full epic, single sprint, or specific stories?

### Step 2: Initialize/Resume State

```python
state_path = f"/tasks/epic-{epic}//.orchestrator-state.json"
state = read_json_if_exists(state_path)

# Workflow compatibility check
if state and state.get("workflow") != "claude-autonomous":
    error(f"""
    WORKFLOW MISMATCH DETECTED

    This epic was started with: {state.get('workflow', 'unknown')}
    You are trying to run: claude-autonomous

    Options:
    1. Continue with original workflow
    2. Start fresh: rm {state_path}
    """)
    output("EXIT_MODE")
    return

if not state:
    state = {
        "workflow": "claude-autonomous",
        "workflowVersion": "1.9.0",
        "epic": epic,
        "phase": "planning",
        "status": "started",
        "currentSprint": 0,
        "completedStories": [],
        "stuckStories": [],
        "approvedSprints": [],
        "startedAt": now_iso(),
        "architectAttempts": 0,
        "specReviewAttempts": 0
    }
    write_json(state_path, state)
```

### Step 3: Create Specs (Plan Agent)

```
Task(
    subagent_type: "plan-agent",
    prompt: "Create sprint and story specifications for Epic {epic}.
        Goals: {goals_path}
        Scope: {scope}

        Requirements:
        - Each story must have 'Files Touched' section
        - Each story must have agent assignment (frontend-agent or backend-agent)
        - Each story must have testable acceptance criteria

        Output files to /tasks/epic-{epic}/"
)
```

### Step 4: Architect Review (Fast, ~30s)

**Purpose:** Catch structural issues before detailed review.

```
MAX_ARCHITECT_REVIEWS = 5

for attempt in range(MAX_ARCHITECT_REVIEWS):
    review = Task(
        subagent_type: "architect-agent",
        prompt: "Review specs for Epic {epic}.
            Attempt: {attempt + 1} of {MAX_ARCHITECT_REVIEWS}

            {if attempt > 0: 'Changes since last review: {change_log}'}

            Focus ONLY on:
            - File size (>500 lines = flag)
            - Single responsibility
            - Module boundaries
            - Decomposition needs
            - Technical debt

            DO NOT review file paths or patterns (spec-review does that)."
    )

    if review.approved:
        break

    # Fix issues, log changes for next review
    for finding in review.findings:
        fix_and_log_change(finding)

# After max attempts, architect gets final say (proceed with warnings)
if not review.approved:
    log_warnings_to_claude_md(review.findings)
    architect_approved_with_warnings = True
```

### Step 5: Spec Review (Thorough, ~2min)

**Purpose:** Validate feasibility after architecture is approved.

```
MAX_SPEC_REVIEWS = 5

for attempt in range(MAX_SPEC_REVIEWS):
    review = Task(
        subagent_type: "spec-review-agent",
        prompt: "Review specs for Epic {epic}.
            Architecture already approved.
            Attempt: {attempt + 1} of {MAX_SPEC_REVIEWS}

            {if attempt > 0: 'Changes since last review: {change_log}'}

            Focus ONLY on:
            - File paths exist and are correct
            - Patterns match existing codebase
            - Cross-story dependencies ordered correctly
            - No parallel conflicts
            - Acceptance criteria testable

            DO NOT review architecture (already approved)."
    )

    if review.approved:
        mark_sprint_approved()
        break

    # Fix issues, log changes for next review
    for finding in review.findings:
        fix_and_log_change(finding)

if not review.approved:
    output("PLAN_STUCK_FEASIBILITY")
    return
```

### Step 6: Spec Final Pass (After All Sprints)

**Purpose:** Holistic cross-sprint review.

```
final_review = Task(
    subagent_type: "spec-review-agent",
    prompt: "SPEC FINAL PASS - Holistic Review

        All sprints individually approved. Now review TOGETHER:
        - Cross-sprint dependencies
        - File conflicts across sprints
        - Architectural consistency
        - Scope completeness
        - Integration risks

        DO NOT re-review individual stories."
)

if not final_review.approved:
    # Fix cross-sprint issues, re-run final pass
    ...

if final_review.approved:
    commit_specs()
    if architect_approved_with_warnings:
        output("PLAN_APPROVED_WITH_WARNINGS")
    else:
        output("PLAN_APPROVED")
```

## State File

`/tasks/epic-{N}/.orchestrator-state.json`

## Completion Promises

| Promise | Meaning |
|---------|---------|
| `PLAN_APPROVED` | Specs ready for implementation |
| `PLAN_APPROVED_WITH_WARNINGS` | Specs approved with architect concerns noted |
| `PLAN_STUCK_FEASIBILITY` | Feasibility issues unresolvable |
| `PLAN_STUCK_INTEGRATION` | Cross-sprint issues unresolvable |
| `PAUSE_REQUESTED` | Clean exit, state preserved |
| `EXIT_MODE` | Return to normal chat |

## User Commands During Workflow

Say these words to control the workflow:

```
"pause"   -> Saves state, exits cleanly
"exit"    -> Returns to normal chat
"status"  -> Reports progress without exiting
```

## Review Pipeline

```
Plan Agent creates specs
        |
        v
+----------------------------------+
|  ARCHITECT REVIEW (~30s)         |
|  Structure / Decomposition       |
|  Max 5 attempts, then final say  |
+----------------------------------+
        |
        v
+----------------------------------+
|  SPEC REVIEW (~2min)             |
|  Feasibility / Patterns / Paths  |
|  Max 5 attempts                  |
+----------------------------------+
        |
        v
+----------------------------------+
|  SPEC FINAL PASS (holistic)      |
|  Cross-sprint issues only        |
+----------------------------------+
        |
        v
    PLAN_APPROVED
```
