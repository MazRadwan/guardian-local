---
name: claude-implement
description: Claude-only implementation with parallel agents and browser QA. Use after /claude-plan to execute specs with frontend-agent, backend-agent, and code-review-agent.
---

# Claude Implement

> **WHY context: fork?** Implementation runs for hours across many stories.
> Forked context prevents main session exhaustion. State file enables resume.

> **WHY Stop hook?** Ralph Wiggum pattern - blocks exit until EPIC_COMPLETE found.
> Enables autonomous multi-hour runs without human intervention.

## Usage

```
/claude-implement [epic-number]
```

## Workflow

### Step 1: Initialize/Resume State

```python
state_path = f"/tasks/epic-{epic}/.orchestrator-state.json"
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

# Check if plan was approved
if not state or state.phase == "planning":
    error("Plan not approved. Run /claude-plan first.")
    output("EXIT_MODE")
    return

# Resume from checkpoint if exists
if state.phase == "implementation":
    log(f"Resuming from batch {state.currentBatch}")
```

### Step 2: File Grouping (Create Batches)

```
batches = Task(
    subagent_type: "file-grouping-agent",
    prompt: "Analyze all story specs for Epic {epic}.
        Create execution batches where:
        - Stories in same batch don't touch same files
        - Stories in same batch can run in parallel

        Output: List of batches with story IDs"
)

state.batches = batches
state.totalBatches = len(batches)
save_state()
```

### Step 3: Execute Batches

```python
for batch_num, batch in enumerate(state.batches):
    state.currentBatch = batch_num
    save_state()

    # Spawn parallel agents for stories in batch
    agents = []
    for story in batch.stories:
        agent_type = get_agent_type(story)  # frontend-agent or backend-agent

        agent = Task(
            subagent_type: agent_type,
            prompt: f"Implement story {story.id}.
                Spec: {story.spec}

                Run test loop until all pass:
                1. Implement code
                2. Run tests (unit, lint, typecheck)
                3. If tests fail -> fix -> retry
                4. When tests pass -> invoke code-review-agent
                5. If review fails -> fix -> retry from step 2
                6. When review passes -> run browser QA (if applicable)
                7. Return status: complete or stuck

                Max retries: 10",
            run_in_background: True
        )
        agents.append(agent)

    # Wait for all agents in batch
    results = wait_all(agents)

    # Process results
    for result in results:
        if result.status == "complete":
            state.completedStories.append(result.story_id)
        else:
            state.stuckStories.append(result.story_id)
        save_state()

    # Commit batch
    git_add(batch.files)
    git_commit(f"feat(epic-{epic}): batch {batch_num} - {batch.story_ids}")
```

### Step 4: Integration Tests

```python
# Run full test suite
unit = run("pnpm test")
lint = run("pnpm lint")
typecheck = run("pnpm typecheck")
build = run("pnpm build")

if not all_pass(unit, lint, typecheck, build):
    # Create fix stories for failures
    fix_stories = analyze_failures_and_create_fixes()
    run_fix_batch(fix_stories)
```

### Step 5: Browser QA (Full Suite)

```python
# Use Chrome DevTools MCP for visual verification
chrome_devtools.navigate_page(base_url)

for qa_flow in epic.qa_flows:
    run_qa_flow(qa_flow)
    check_console_errors()
    check_network_requests()
    take_screenshot()
```

### Step 6: Complete

```python
state.phase = "complete"
state.status = "complete"
save_state()

# Report summary
report = f"""
EPIC {epic} IMPLEMENTATION COMPLETE

Stories completed: {len(state.completedStories)}
Stories stuck: {len(state.stuckStories)}

{if state.stuckStories: 'See .stuck-log.md for details'}
"""

output(report)
output("EPIC_COMPLETE")
```

## Test + Review Loop (Per Story)

Each implementation agent runs this loop:

```
MAX_RETRIES = 10
change_log = []

for attempt in range(MAX_RETRIES):

    # 1. Run tests
    tests = run_tests()
    if not tests.pass:
        fix_test_failures()
        continue

    # 2. Code review (after tests pass)
    review = Task(
        subagent_type: "code-review-agent",
        prompt: "Review implementation for story {id}.
            Attempt: {attempt}
            {if change_log: 'Changes since last review: {change_log}'}

            Tests: ALL PASSING
            Files changed: {files}

            Review for:
            - Correctness
            - Security (OWASP)
            - Architecture compliance
            - Patterns consistency
            - Error handling"
    )

    if not review.approved:
        for finding in review.findings:
            fix = apply_fix(finding)
            change_log.append(fix)
        continue

    # 3. Browser QA (after review passes)
    if story.has_qa_steps:
        qa = run_browser_qa(story.qa_steps)
        if not qa.pass:
            fix_ui_issues()
            continue

    # All passed!
    return { status: "complete" }

return { status: "stuck" }
```

## State File

`/tasks/epic-{N}/.orchestrator-state.json`

## Completion Promises

| Promise | Meaning |
|---------|---------|
| `EPIC_COMPLETE` | All stories implemented |
| `PAUSE_REQUESTED` | Clean exit, state preserved |
| `EXIT_MODE` | Return to normal chat |

## User Commands During Workflow

Say these words to control the workflow:

```
"pause"   -> Saves state, exits cleanly, resume later
"exit"    -> Returns to normal chat mode
"status"  -> Reports current progress without exiting
"skip"    -> Marks current story stuck, moves to next
```

## Recovery

If the workflow crashes or you interrupt it:

```bash
# Resume from last checkpoint
/claude-implement epic 20

# Force restart (keeps git history)
rm tasks/epic-20/.orchestrator-state.json
/claude-implement epic 20
```

## Parallel Execution

```
BATCH 1 (parallel - no file conflicts)
+-------------+  +-------------+  +-------------+
|  Agent A    |  |  Agent B    |  |  Agent C    |
|  (story 1)  |  |  (story 2)  |  |  (story 3)  |
+------+------+  +------+------+  +------+------+
       |                |                |
       v                v                v
+--------------------------------------------------+
|        Test + Review Loop (per story)            |
| Unit -> Lint -> Type -> Code Review -> Browser QA|
+--------------------------------------------------+
                        |
                        v
               Commit approved batch
                        |
                        v
              BATCH 2 (next batch)
```
