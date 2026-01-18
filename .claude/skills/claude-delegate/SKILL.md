---
name: claude-delegate
description: Full Claude-only automation - runs claude-plan then claude-implement end-to-end. Use for complete autonomous epic execution without GPT, using architect-agent, spec-review-agent, and code-review-agent.
---

# Claude Delegate - Full Automation (Claude-Only)

You are starting the **full Claude-only automated workflow** (claude-plan + claude-implement).

This command runs both phases back-to-back with minimal user intervention, using only Claude agents (no GPT).

## Workflow Overview

```
/claude-delegate
    │
    ▼
[Gather Input]
    │
    ▼
[PHASE 1: PLANNING (/claude-plan)]
    │
    ├── plan-agent creates specs
    ├── architect-agent reviews structure (max 5 rounds)
    ├── spec-review-agent validates feasibility (max 5 rounds)
    ├── spec final pass (cross-sprint)
    └── <promise>PLAN_APPROVED</promise>
    │
    ▼
[PHASE 2: IMPLEMENTATION (/claude-implement)]
    │
    ├── file-grouping-agent creates batches
    ├── For each batch:
    │   ├── Spawn frontend-agent / backend-agent (parallel)
    │   ├── Test loop until passing
    │   ├── code-review-agent validates
    │   └── Commit approved batch
    ├── Integration tests
    ├── Browser QA (if applicable)
    └── <promise>EPIC_COMPLETE</promise>
```

## Your Task

1. Gather input from user
2. Run planning phase (claude-plan) with two-stage review
3. Auto-handoff to implementation phase (claude-implement)
4. Report completion

## Step 1: Gather Input

Ask user for:

1. **Epic number:** "Which epic to work on?"

2. **Goals document:** "Location of epic goals?" (e.g., `tasks/epic-{N}/epic-{N}-goals.md`)

3. **Scope selection:**
   "What scope?"
   - [1] Full Epic
   - [2] Single Sprint
   - [3] Specific Stories

## Step 2: Initialize State

Create state file at `/tasks/epic-{N}/.orchestrator-state.json`:

```json
{
  "workflow": "claude-autonomous",
  "workflowVersion": "1.9.0",
  "epic": "{N}",
  "scope": "{scope}",
  "phase": "planning",
  "currentBatch": 0,
  "currentStory": null,
  "currentSprint": 0,
  "totalSprints": 0,
  "retryCount": 0,
  "status": "started",
  "completedStories": [],
  "stuckStories": [],
  "approvedSprints": [],
  "startedAt": "{ISO timestamp}",
  "architectAttempts": 0,
  "specReviewAttempts": 0,
  "reviewRounds": {
    "architect": 0,
    "specReview": 0,
    "specFinalPass": 0,
    "codeReview": 0,
    "sprintFinal": 0
  }
}
```

## Step 3: Planning Phase

### 3a. Create Specs (Plan Agent)

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

### 3b. Architect Review (Fast, ~30s)

```
MAX_ARCHITECT_REVIEWS = 5

for attempt in range(MAX_ARCHITECT_REVIEWS):
    review = Task(
        subagent_type: "architect-agent",
        prompt: "Review specs for Epic {epic}.
            Focus ONLY on:
            - File size (>500 lines = flag)
            - Single responsibility
            - Module boundaries
            - Decomposition needs
            - Technical debt"
    )

    if review.approved:
        break

    # Fix issues and retry
    fix_issues(review.findings)

state.reviewRounds.architect = attempt + 1
save_state()
```

### 3c. Spec Review (Thorough, ~2min)

```
MAX_SPEC_REVIEWS = 5

for attempt in range(MAX_SPEC_REVIEWS):
    review = Task(
        subagent_type: "spec-review-agent",
        prompt: "Review specs for Epic {epic}.
            Architecture already approved.
            Focus ONLY on:
            - File paths exist and are correct
            - Patterns match existing codebase
            - Cross-story dependencies ordered correctly
            - Acceptance criteria testable"
    )

    if review.approved:
        break

    fix_issues(review.findings)

state.reviewRounds.specReview = attempt + 1
save_state()
```

### 3d. Spec Final Pass

```
final_review = Task(
    subagent_type: "spec-review-agent",
    prompt: "SPEC FINAL PASS - Holistic Review
        All sprints individually approved. Now review TOGETHER:
        - Cross-sprint dependencies
        - File conflicts across sprints
        - Architectural consistency
        - Scope completeness"
)

if final_review.approved:
    state.phase = "implementation"
    state.status = "plan_approved"
    save_state()
    output("<promise>PLAN_APPROVED</promise>")
```

## Step 4: Implementation Phase (Auto-Handoff)

**No user intervention needed** - automatically proceeds to implementation.

### 4a. File Grouping

```
batches = Task(
    subagent_type: "file-grouping-agent",
    prompt: "Analyze all story specs for Epic {epic}.
        Create execution batches where:
        - Stories in same batch don't touch same files
        - Stories in same batch can run in parallel"
)

state.batches = batches
save_state()
```

### 4b. Execute Batches

```python
for batch_num, batch in enumerate(state.batches):
    state.currentBatch = batch_num
    save_state()

    # Spawn parallel agents
    agents = []
    for story in batch.stories:
        agent_type = story.agent  # frontend-agent or backend-agent

        agent = Task(
            subagent_type: agent_type,
            prompt: f"Implement story {story.id}.
                Run test loop until all pass:
                1. Implement code
                2. Run tests (unit, lint, typecheck)
                3. If tests fail -> fix -> retry
                4. When tests pass -> invoke code-review-agent
                5. If review fails -> fix -> retry
                6. Return status: complete or stuck

                Max retries: 10",
            run_in_background: True
        )
        agents.append(agent)

    # Wait and process results
    results = wait_all(agents)

    for result in results:
        if result.status == "complete":
            state.completedStories.append(result.story_id)
        else:
            state.stuckStories.append(result.story_id)

    # Commit batch
    git_commit(f"feat(epic-{epic}): batch {batch_num}")
    save_state()
```

### 4c. Integration Tests

```bash
pnpm test
pnpm lint
pnpm typecheck
pnpm build
```

If failures, create fix stories and run through batch flow.

### 4d. Browser QA (Optional)

If epic has QA flows, use Chrome DevTools MCP for visual verification.

## Step 5: Completion

```python
state.phase = "complete"
state.status = "complete"
save_state()

output(f"""
## Epic {epic} Complete

**Workflow:** claude-autonomous (Claude-only)
**Stories completed:** {len(state.completedStories)}
**Stories stuck:** {len(state.stuckStories)}

### Review Rounds
- Architect: {state.reviewRounds.architect}
- Spec Review: {state.reviewRounds.specReview}
- Spec Final Pass: {state.reviewRounds.specFinalPass}
- Code Reviews: {state.reviewRounds.codeReview}

### Files
- State: /tasks/epic-{epic}/.orchestrator-state.json
- Stuck log: /tasks/epic-{epic}/.stuck-log.md (if any)

<promise>EPIC_COMPLETE</promise>
""")
```

## User Commands During Workflow

Say these words to control the workflow:

```
"pause"   -> Saves state, exits cleanly
"exit"    -> Returns to normal chat
"status"  -> Reports progress without exiting
"skip"    -> Marks current story stuck, moves to next
```

## Recovery

If interrupted:

```bash
# Resume from last checkpoint (auto-detects phase)
/claude-delegate {epic-number}

# Force restart
rm tasks/epic-{N}/.orchestrator-state.json
/claude-delegate {epic-number}
```

## Comparison: claude-delegate vs delegate

| Aspect | /claude-delegate | /delegate |
|--------|------------------|-----------|
| **Planning review** | architect-agent + spec-review-agent | GPT-5.2 deep analysis |
| **Code review** | code-review-agent (Opus) | GPT-5.2 code review |
| **Cost** | Lower (Claude only) | Higher (GPT API calls) |
| **Speed** | Faster (no external API) | Slower (API latency) |
| **Depth** | Good | Deeper analysis |

## Completion Promises

| Promise | Meaning |
|---------|---------|
| `PLAN_APPROVED` | Specs ready, auto-proceeding to implement |
| `EPIC_COMPLETE` | All stories implemented |
| `PAUSE_REQUESTED` | Clean exit, state preserved |
| `EXIT_MODE` | Return to normal chat |

## Important Rules

1. **Auto-handoff** - No user intervention between plan and implement
2. **State is checkpoint** - Always update state for recovery
3. **Two-stage planning review** - Architect first, then spec-review
4. **Parallel execution** - Stories in same batch run concurrently
5. **Skip, don't block** - Stuck stories get logged and skipped
6. **Test before review** - Don't waste code-review-agent on failing tests
7. **Commit per batch** - Keep git history clean and resumable
