---
name: delegate
description: Full Opus-GPT automation - runs spec-design then implement with GPT review loops and browser QA. Use for complete autonomous epic execution with minimal intervention.
allowed-tools: Read, Write, Edit, Bash, Grep, Glob, Task, WebFetch
model: opus
---

# Delegate - Full Opus-GPT Automation

You are the **orchestrator** for the Opus-GPT automated workflow. You control the full planning and implementation cycle with minimal user intervention.

**CRITICAL:** This skill runs in the main conversation context so you CAN spawn subagents via the Task tool.

## Your Task

1. Run planning phase (spec-design) with per-sprint GPT deep reviews
2. Run spec final pass (holistic cross-sprint review)
3. Run parallelization phase (file-grouping-agent creates batches)
4. Run implementation phase with GPT code review loops
5. Run browser QA for frontend stories
6. Run sprint final pass
7. Report completion

---

## Step 1: Gather Input

Ask user for:

1. **Epic number:** Which epic to work on?
2. **Goals document:** Location (e.g., `tasks/epic-20/epic-20-goals.md`)
3. **Scope selection:**
   - [1] Full Epic - All sprints
   - [2] Single Sprint - Specify sprint number
   - [3] Specific Stories - Specify story IDs
4. **Custom GPT review prompt:** (Enter for default)

---

## Step 2: Initialize State

**CRITICAL:** Include `workflow` field for compatibility checking.

Create state file at `/tasks/epic-{N}/.orchestrator-state.json`:

```json
{
  "workflow": "opus-gpt",
  "workflowVersion": "1.0.0",
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
    "roundCount": 0,
    "lastResponse": "",
    "mode": "bash"
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
  },
  "batchReview": {
    "reReviewRequired": false,
    "lastReviewConfidence": 0,
    "fixesApplied": false
  }
}
```

**Workflow Compatibility Check:**
```python
if existing_state and existing_state.get("workflow") != "opus-gpt":
    error(f"""
    WORKFLOW MISMATCH: Epic started with {existing_state.get('workflow')}.
    Options: 1) Use original workflow, 2) rm state file, 3) Different epic
    """)
    return
```

---

## Step 3: Planning Phase (Per-Sprint Deep Reviews)

### 3a. Invoke Plan Agent

```
Task(
  subagent_type: "plan-agent",
  prompt: "Create sprint and story specifications for Epic {N}.
    Goals: {goals_path}
    Scope: {scope}

    REQUIREMENTS:
    - Each story MUST have 'Files Touched' section (critical for parallelization)
    - Each story MUST have agent assignment (frontend-agent or backend-agent)
    - Each story MUST have testable acceptance criteria
    - Each story with UI changes MUST have 'QA Verification' section
    - Sprint overview MUST have 'Parallel Execution Strategy' with phases

    Output files to /tasks/epic-{N}/"
)
```

### 3b. GPT Sprint Spec Review Loop (MANDATORY)

**For each sprint created, run this loop until GPT approves:**

```python
MAX_REVIEW_ROUNDS = 7

for sprint_id in sprints:
    review_round = 0
    approved = False

    while not approved and review_round < MAX_REVIEW_ROUNDS:
        review_round += 1
        state.reviewRounds.specPerSprint[sprint_id] = review_round
        save_state()

        # 1. Invoke GPT via Codex CLI
        gpt_response = invoke_codex_review(
            type="sprint_spec",
            sprint_id=sprint_id,
            sprint_content=read_sprint_spec(sprint_id)
        )

        # 2. Parse response
        status = parse_status(gpt_response)  # "APPROVED" or "NEEDS_REVISION"
        confidence = parse_confidence(gpt_response)
        findings = parse_findings(gpt_response) if status == "NEEDS_REVISION" else []

        # 3. Log to .review-log.md
        append_review_log(sprint_id, review_round, gpt_response)

        # 4. Handle result
        if status == "APPROVED" and confidence >= 0.5:
            log(f"✅ Sprint {sprint_id} APPROVED (round {review_round}, confidence {confidence})")
            state.approvedSprints.append(sprint_id)
            approved = True
            break

        elif status == "NEEDS_REVISION":
            log(f"📝 Sprint {sprint_id} needs revision (round {review_round})")

            for finding in findings:
                if opus_agrees_with_finding(finding):
                    # Apply fix to spec
                    apply_spec_fix(sprint_id, finding)
                    log(f"  Fixed: {finding.summary}")
                else:
                    # Pushback - will be included in next review
                    log(f"  Pushback: {finding.summary} - {opus_reasoning}")

            # Continue loop for re-review...

    # After loop
    if not approved:
        log(f"⚠️ Max rounds reached for {sprint_id} - GPT has final say")
        apply_all_remaining_gpt_recommendations(sprint_id)
        state.approvedSprints.append(sprint_id)

    output(f"<promise>SPRINT_SPEC_APPROVED</promise>")
```

---

## Step 4: Spec Final Pass

**After all sprints individually approved**, holistic cross-sprint review:

```python
# Gather all sprint summaries
all_sprints_content = gather_all_sprint_summaries()

# Send to GPT for holistic review
gpt_response = invoke_codex_review(
    type="spec_final_pass",
    content=all_sprints_content,
    focus=["cross-sprint dependencies", "file conflicts", "architectural consistency", "scope coverage"]
)

# Handle response (same loop pattern as above)
# ...

output("<promise>PLAN_APPROVED</promise>")
state.phase = "parallelization"
save_state()
```

---

## Step 5: Parallelization Phase

```
batches = Task(
  subagent_type: "file-grouping-agent",
  prompt: "Analyze stories in /tasks/epic-{N}/ for scope: {scope}.

    Read the Parallel Execution Strategy from sprint overviews.
    Validate file conflicts within each phase.
    Convert phases to execution batches (1:1 mapping).

    Output: Execution plan with batches."
)

state.batches = batches
state.phase = "implementation"
save_state()
```

---

## Step 6: Implementation Phase

### 6a. Execute Batches with Parallel Agents

```python
for batch_num, batch in enumerate(state.batches):
    state.currentBatch = batch_num
    save_state()

    # Spawn parallel agents
    agents = []
    for story in batch.stories:
        agent_type = story.agent_assignment  # frontend-agent or backend-agent

        agent = Task(
            subagent_type=agent_type,
            prompt=f"""Implement story {story.id}.

            Spec location: {story.spec_path}

            WORKFLOW:
            1. Read the full story spec
            2. Implement the code changes
            3. Run tests: pnpm test:unit
            4. Run lint: pnpm lint
            5. Run typecheck: pnpm typecheck
            6. If any fail → fix → retry (max 10 attempts)
            7. When all pass → return summary

            Return: {{status: "complete"|"stuck", files_changed: [...], summary: "..."}}
            """,
            run_in_background=True
        )
        agents.append(agent)

    # Wait for all agents in batch
    results = wait_all(agents)

    # Checkpoint per-story (CRITICAL)
    for result in results:
        if result.status == "complete":
            state.completedStories.append(result.story_id)
        else:
            state.skippedStories.append(result.story_id)
            append_stuck_log(result.story_id, result.error)
        save_state()  # Checkpoint immediately
```

### 6b. Verification Phase

```bash
# Run full verification before GPT review
pnpm test
pnpm lint
pnpm typecheck
```

### 6c. GPT Code Review Loop (MANDATORY)

**After each batch (or every 2-3 batches for rate limit optimization):**

```python
MAX_REVIEW_ROUNDS = 7
review_round = 0

state.batchReview.reReviewRequired = True

while state.batchReview.reReviewRequired and review_round < MAX_REVIEW_ROUNDS:
    review_round += 1
    state.reviewRounds.code = review_round
    save_state()

    # 1. Build context
    batch_context = {
        "stories": batch.stories,
        "files_changed": get_changed_files(batch),
        "test_results": run_verification(),
    }

    # 2. Invoke GPT
    gpt_response = invoke_codex_review(
        type="code_review",
        batch_num=batch_num,
        context=batch_context
    )

    # 3. Parse response
    status = parse_status(gpt_response)
    confidence = parse_confidence(gpt_response)
    findings = parse_findings(gpt_response)

    # 4. Log
    append_review_log(f"batch_{batch_num}", review_round, gpt_response)

    # 5. Handle result
    if status == "APPROVED" and confidence >= 0.5:
        log(f"✅ Batch {batch_num} APPROVED (round {review_round})")
        state.batchReview.reReviewRequired = False
        state.batchReview.lastReviewConfidence = confidence
        break

    elif status == "NEEDS_REVISION":
        log(f"📝 Batch {batch_num} needs revision")
        state.batchReview.fixesApplied = False

        for finding in findings:
            if opus_agrees_with_finding(finding):
                apply_code_fix(finding)
                log(f"  Fixed: {finding.summary}")
            else:
                create_pushback_response(finding)

        state.batchReview.fixesApplied = True
        # Re-run verification after fixes
        run_verification()
        # Continue loop for re-review...

# After loop
if review_round >= MAX_REVIEW_ROUNDS:
    log("⚠️ Max rounds - GPT final say")
    apply_all_remaining_recommendations()
    state.batchReview.reReviewRequired = False
```

### 6d. Browser QA (Frontend Stories)

**After code review passes, run browser QA for frontend stories:**

```python
frontend_stories = [s for s in batch.stories if s.agent == "frontend-agent"]

if frontend_stories:
    log("🌐 Running Browser QA...")

    # Start dev server if not running
    ensure_dev_server_running()

    for story in frontend_stories:
        if story.qa_verification:
            run_browser_qa(story)

def run_browser_qa(story):
    """Use Chrome DevTools MCP for visual verification"""

    # Navigate to the relevant page
    mcp__chrome_devtools__navigate_page(
        url=f"http://localhost:3000{story.qa_verification.route}"
    )

    # Wait for page load
    mcp__chrome_devtools__wait_for(
        selector=story.qa_verification.wait_for_selector,
        timeout=10000
    )

    # Check for console errors
    console_messages = mcp__chrome_devtools__list_console_messages()
    errors = [m for m in console_messages if m.level == "error"]
    if errors:
        log(f"❌ Console errors found: {errors}")
        raise QAError("Console errors detected")

    # Check for failed network requests
    network_requests = mcp__chrome_devtools__list_network_requests()
    failed = [r for r in network_requests if r.status >= 400]
    if failed:
        log(f"❌ Failed requests: {failed}")
        raise QAError("Network request failures")

    # Execute verification steps
    for step in story.qa_verification.steps:
        if step.action == "click":
            mcp__chrome_devtools__click(selector=step.selector)
        elif step.action == "fill":
            mcp__chrome_devtools__fill(selector=step.selector, value=step.value)
        elif step.action == "verify_text":
            result = mcp__chrome_devtools__evaluate_script(
                script=f"document.querySelector('{step.selector}')?.textContent"
            )
            assert step.expected in result, f"Expected '{step.expected}', got '{result}'"

    # Take screenshot for verification
    mcp__chrome_devtools__take_screenshot(
        filename=f"qa-{story.id}.png"
    )

    log(f"✅ Browser QA passed for {story.id}")
```

### 6e. Commit Approved Batch

```bash
git add {batch_files}
git commit -m "feat(epic-{N}): batch {batch_num} - stories {story_ids}"
```

### 6f. Update CLAUDE.md with Learnings

```python
if gpt_findings:
    learnings = extract_learnings(gpt_findings)
    target_file = determine_claude_md_target(batch.files)
    append_to_claude_md(target_file, learnings)
```

---

## Step 7: Sprint Final Pass

**After all batches complete**, holistic sprint review:

```python
state.phase = "sprint_review"
save_state()

# Gather all files modified in sprint
all_files = gather_sprint_files(sprint_id)

# GPT holistic review
gpt_response = invoke_codex_review(
    type="sprint_final_pass",
    sprint_id=sprint_id,
    files=all_files,
    focus=["integration", "patterns", "gaps", "regressions", "architecture"]
)

# Handle CRITICAL/MAJOR/MINOR
findings = parse_categorized_findings(gpt_response)

for finding in findings.critical:
    apply_inline_fix(finding)  # Max 3 inline fixes

for finding in findings.major:
    create_fix_story(finding)  # Max 1 fix batch

for finding in findings.minor:
    append_to_claude_md(finding)  # Defer

output("<promise>SPRINT_REVIEWED</promise>")
```

---

## Step 8: Completion

```python
state.phase = "complete"
state.status = "completed"
save_state()

# Generate completion summary
summary = f"""
# Epic {epic} Complete

## Summary
- Stories completed: {len(state.completedStories)}
- Stories skipped: {len(state.skippedStories)}
- Review rounds: {sum(state.reviewRounds.values())}

## Completed Stories
{format_list(state.completedStories)}

## Skipped Stories
{format_list(state.skippedStories)}
See .stuck-log.md for details.

## Files
- Specs: /tasks/epic-{epic}/sprint-*.md
- Review log: /tasks/epic-{epic}/.review-log.md
- Stuck log: /tasks/epic-{epic}/.stuck-log.md
"""

write_file(f"/tasks/epic-{epic}/completion.md", summary)

output(summary)
output("<promise>SCOPE_COMPLETE</promise>")
```

---

## GPT Integration (Codex CLI)

**Primary method - Bash with heredoc:**

```bash
# Kill any orphaned codex processes first
pkill -f "codex.*mcp-server" 2>/dev/null || true

# Use gtimeout on macOS (brew install coreutils)
RESPONSE=$(gtimeout 300 codex review - <<'EOF'
CRITICAL: Your response MUST begin with exactly:
STATUS: APPROVED
or
STATUS: NEEDS_REVISION

CONFIDENCE: [0.0-1.0] is REQUIRED at the end.

---

## TASK
Review {type} for Epic {epic_id}: {batch_or_sprint_id}.

## EXPECTED OUTCOME
Identify issues in THIS {batch/sprint} only.
Return STATUS: APPROVED or STATUS: NEEDS_REVISION with findings.

## CONTEXT
{Specific context: stories, files changed, test results}

## CONSTRAINTS
- Clean architecture: domain → application → infrastructure
- Existing codebase patterns
- No regressions
- OWASP security standards

## MUST DO
- Focus ONLY on items listed in CONTEXT
- Search codebase for conflicts
- Verify architectural boundaries

## MUST NOT DO
- Review files not in this batch
- Flag previously-approved code
- Nitpick style without substance

## RE-REVIEW & PUSHBACK
- Re-review cycle continues until STATUS: APPROVED
- Agent may pushback with reasoning - evaluate objectively
- After 7 pushback rounds, you have final say

## OUTPUT FORMAT
STATUS: APPROVED | STATUS: NEEDS_REVISION
[If NEEDS_REVISION: CRITICAL, HIGH, MEDIUM, LOW findings]
CONFIDENCE: [0.0-1.0]
EOF
)

# Capture exit code
EXIT_CODE=$?

if [ $EXIT_CODE -ne 0 ]; then
    echo "ERROR: Codex failed with exit code $EXIT_CODE"
    echo "Response: $RESPONSE"
fi
```

---

## Error Handling

### GPT Rate Limited (NO Opus Fallback)

```python
if "rate_limit" in error or error_code == 429:
    state.status = "gpt_error"
    state.errorType = "rate_limited"
    state.errorAt = now()
    state.resumeFrom = current_phase
    save_state()

    log("GPT rate limited. Wait and run /delegate to resume.")
    exit()
```

### Stuck Detection

```python
if same_error_count >= 3:
    append_stuck_log(story_id, error)
    state.skippedStories.append(story_id)
    save_state()
    continue  # Move to next story
```

---

## Important Rules

1. **Runs in main context** - Can spawn subagents via Task tool
2. **User only at start and end** - Autonomous execution
3. **Per-sprint spec reviews** - Deep analysis for each sprint
4. **GPT review loops are MANDATORY** - Loop until APPROVED
5. **Browser QA for frontend** - Visual verification with Chrome DevTools
6. **State is checkpoint** - Update frequently for recovery
7. **Log all GPT exchanges** - Audit trail in .review-log.md
8. **Update CLAUDE.md** - Institutional memory
9. **Respect 7 round limit** - GPT final say after that
10. **Checkpoint per-story** - Not per-batch
11. **Commit after approval** - Keep git clean for next review
12. **No Opus fallback for GPT errors** - Clean exit, user fixes, resume

---

## Completion Promises

| Promise | Meaning |
|---------|---------|
| `SPRINT_SPEC_APPROVED` | Sprint spec approved by GPT |
| `PLAN_APPROVED` | All specs approved (after final pass) |
| `BATCH_APPROVED` | Implementation batch approved |
| `SPRINT_REVIEWED` | Sprint final pass approved |
| `SCOPE_COMPLETE` | All work done |
| `STUCK` | Unrecoverable issue, skipping |
| `ERROR` | Critical failure, needs user |
