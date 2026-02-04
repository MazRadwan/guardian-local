---
name: implement
description: Opus-GPT implementation phase - execute specs with parallel agents, GPT code review loops, and browser QA. Use after /spec-design when plan is approved.
allowed-tools: Read, Write, Edit, Bash, Grep, Glob, Task, WebFetch
model: opus
---

# Implement - Opus-GPT Implementation Phase

You are starting the **implementation phase** of the Opus-GPT workflow.

**Prerequisite:** Specs must exist and be approved (run `/spec-design` first).

**CRITICAL:** This skill runs in the main conversation context so you CAN spawn subagents via the Task tool.

## Your Task

1. Validate workflow compatibility
2. Get scope selection from user
3. Run parallelization phase (file-grouping-agent)
4. Execute batches with parallel agents
5. Run GPT code review loops (until approval)
6. Run browser QA for frontend stories
7. Run sprint final pass
8. Report completion

---

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
    1. Use the correct workflow command (e.g., /claude-implement)
    2. Start fresh: rm {state_path}
    3. Use a different epic number
    """)
    return

# Verify plan was approved
if not state or state.phase == "planning":
    error("Plan not approved. Run /spec-design first.")
    return
```

---

## Step 2: Scope Selection (ALWAYS PROMPT)

**Ask user EVERY time** (even if resuming):

```
What scope do you want to implement?

[1] Full Epic - All sprints and stories
[2] Single Sprint - Specify sprint number
[3] Specific Stories - Specify story IDs (e.g., 26.1.1, 26.1.2)

GPT Review Scope?

[1] Sprint-scoped (default) - GPT reviews each batch/sprint before advancing
[2] Epic-scoped - GPT reviews entire epic once at end (faster, less token usage)
    Recommended when: specs are well-vetted (multiple review rounds)

Custom GPT review prompt? [Enter for default]:
```

Update state with selection:
```python
state.targetScope = scope  # "epic" | "sprint:2" | "stories:26.1.1,26.1.2"
state.reviewScope = review_scope  # "sprint" (default) | "epic"
state.gptReviewPrompt = custom_prompt or DEFAULT_PROMPT
save_state()
```

**Review Scope Behavior:**

| reviewScope | GPT Reviews When | Use Case |
|-------------|------------------|----------|
| `"sprint"` (default) | After each batch/sprint | Normal workflow, catches issues early |
| `"epic"` | Once at end of all sprints | Well-vetted specs, faster execution |

---

## Step 3: Parallelization Phase

```
batches = Task(
  subagent_type: "file-grouping-agent",
  prompt: "Analyze stories in /tasks/epic-{N}/ for scope: {scope}.

    Read the Parallel Execution Strategy from sprint overviews.
    Validate file conflicts within each phase.
    Convert phases to execution batches (1:1 mapping).

    Output: Execution plan with batches, showing:
    - Which stories run in parallel (same batch)
    - Which stories run sequentially (different batches)
    - File conflict analysis"
)

state.batches = batches
state.totalBatches = len(batches)
state.phase = "implementation"
save_state()
```

---

## Step 4: Execute Batches

**⚠️ HARD GATE (sprint-scoped only): Each batch MUST pass GPT review before advancing.**

**Note:** When `reviewScope="epic"`, the hard gate is skipped and GPT reviews the entire epic once at the end (Step 5b).

### 4a. Spawn Parallel Agents

```python
for batch_num, batch in enumerate(state.batches):
    # ════════════════════════════════════════════════════════════════════════
    # HARD GATE CHECK: Only applies when reviewScope="sprint" (default)
    # ════════════════════════════════════════════════════════════════════════
    if state.reviewScope != "epic":
        if batch_num > 0 and state.reviewRounds.code < batch_num:
            error(f"""
            🚫 BATCH GATE BLOCKED

            You are trying to start Batch {batch_num + 1} but Batch {batch_num}
            was never GPT-reviewed (reviewRounds.code = {state.reviewRounds.code}).

            You MUST run GPT code review for each batch before advancing.

            Do NOT skip this step. Execute Step 5 (GPT Code Review Loop) now.
            """)
            return  # STOP - do not proceed

    state.currentBatch = batch_num
    save_state()

    log(f"📦 Starting Batch {batch_num + 1}/{state.totalBatches}")

    # Spawn parallel agents for stories in batch
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

            Return JSON:
            {{
              "status": "complete" | "stuck",
              "story_id": "{story.id}",
              "files_changed": ["path/to/file1.ts", ...],
              "tests_added": ["path/to/test1.test.ts", ...],
              "summary": "Brief description of what was implemented",
              "error": null | "Error description if stuck"
            }}
            """,
            run_in_background=True
        )
        agents.append(agent)

    # Wait for all agents in batch to complete
    results = wait_all(agents)

    # Checkpoint per-story (CRITICAL - not per-batch)
    for result in results:
        if result.status == "complete":
            state.completedStories.append(result.story_id)
            log(f"  ✅ {result.story_id} complete")
        else:
            state.skippedStories.append(result.story_id)
            append_stuck_log(result.story_id, result.error)
            log(f"  ❌ {result.story_id} stuck: {result.error}")
        save_state()  # Checkpoint immediately after each story

    # ════════════════════════════════════════════════════════════════════════
    # 4b. GPT REVIEW (Conditional based on reviewScope)
    # ════════════════════════════════════════════════════════════════════════

    # Run verification first (ALWAYS - regardless of reviewScope)
    run_verification()  # pnpm test, lint, typecheck

    if state.reviewScope == "epic":
        # ════════════════════════════════════════════════════════════════════
        # EPIC-SCOPED: Skip per-batch GPT review, just verify tests pass
        # ════════════════════════════════════════════════════════════════════
        log(f"📦 Batch {batch_num + 1} complete (GPT review deferred to epic-level)")
        state.batchReview.reReviewRequired = False  # Will be reviewed at epic level
        save_state()
    else:
        # ════════════════════════════════════════════════════════════════════
        # SPRINT-SCOPED (default): Mandatory per-batch GPT review
        # ════════════════════════════════════════════════════════════════════
        log(f"🤖 GPT Review for Batch {batch_num + 1} (MANDATORY)")

        # Invoke GPT review via Bash
        gpt_approved = False
        review_round = 0

        while not gpt_approved and review_round < 7:
            review_round += 1
            state.reviewRounds.code = state.reviewRounds.code + 1

            # Build and send GPT review prompt (see Step 5 for full prompt)
            gpt_response = Bash(f'''
                codex review - <<'EOF'
                STATUS: APPROVED or STATUS: NEEDS_REVISION required.
                Review batch {batch_num + 1}: stories {batch.stories}
                CONFIDENCE: [0.0-1.0] required at end.
                EOF
            ''')

            if "STATUS: APPROVED" in gpt_response:
                gpt_approved = True
                log(f"✅ Batch {batch_num + 1} APPROVED by GPT")
                state.batchReview.reReviewRequired = False
            else:
                log(f"📝 Batch {batch_num + 1} needs revision (round {review_round})")
                # Parse findings, apply fixes, re-run verification
                apply_gpt_fixes(gpt_response)
                run_verification()

            save_state()

        if not gpt_approved:
            log(f"⚠️ Max rounds reached - applying remaining GPT recommendations")

        # Log to review log
        append_to_review_log(batch_num, gpt_response)

    # ════════════════════════════════════════════════════════════════════════
    # END OF BATCH - Now safe to continue to next batch
    # ════════════════════════════════════════════════════════════════════════
```

### 4c. Verification Details

```bash
# Run full verification before GPT review
log("🔍 Running verification...")

pnpm test
pnpm lint
pnpm typecheck

# If any fail, fix before sending to GPT
if verification_failed:
    fix_verification_errors()
    re_run_verification()
```

---

## Step 5: GPT Code Review Loop (MANDATORY)

**After each batch (or every 2-3 batches for rate limit optimization):**

```python
MAX_REVIEW_ROUNDS = 7
review_round = 0

state.batchReview.reReviewRequired = True
state.status = "awaiting_gpt_review"
save_state()

while state.batchReview.reReviewRequired and review_round < MAX_REVIEW_ROUNDS:
    review_round += 1
    state.reviewRounds.code = review_round
    save_state()

    log(f"🤖 GPT Review Round {review_round} for Batch {batch_num}")

    # 1. Build context for GPT
    batch_context = build_batch_context(batch)

    # 2. Invoke GPT via Codex CLI
    gpt_response = invoke_codex_review(
        type="code_review",
        batch_num=batch_num,
        context=batch_context
    )

    # 3. Parse response
    status = parse_status(gpt_response)  # "APPROVED" or "NEEDS_REVISION"
    confidence = parse_confidence(gpt_response)  # 0.0 - 1.0
    findings = parse_findings(gpt_response) if status == "NEEDS_REVISION" else []

    # 4. Log to .review-log.md
    append_review_log(f"batch_{batch_num}", review_round, gpt_response)

    # 5. Handle result
    if status == "APPROVED" and confidence >= 0.5:
        log(f"✅ Batch {batch_num} APPROVED (round {review_round}, confidence {confidence})")
        state.batchReview.reReviewRequired = False
        state.batchReview.lastReviewConfidence = confidence
        break

    elif status == "APPROVED" and confidence < 0.5:
        log(f"⚠️ Low confidence approval ({confidence}) - requiring re-review")
        # Continue loop

    elif status == "NEEDS_REVISION":
        log(f"📝 Batch {batch_num} needs revision (round {review_round})")
        state.batchReview.fixesApplied = False

        for finding in findings:
            severity = finding.severity  # CRITICAL, HIGH, MEDIUM, LOW

            if opus_agrees_with_finding(finding):
                # Apply the fix
                apply_code_fix(finding)
                log(f"  ✓ Fixed ({severity}): {finding.summary}")
            else:
                # Create pushback response for next round
                pushback = create_pushback_response(finding)
                log(f"  ↩ Pushback ({severity}): {finding.summary}")
                log(f"    Reasoning: {pushback.reasoning}")

        state.batchReview.fixesApplied = True
        save_state()

        # Re-run verification after fixes
        run_verification()

        # Continue loop for re-review...

# After loop exits
if review_round >= MAX_REVIEW_ROUNDS:
    log(f"⚠️ Max review rounds ({MAX_REVIEW_ROUNDS}) reached - GPT has final say")
    apply_all_remaining_gpt_recommendations()
    state.batchReview.reReviewRequired = False

save_state()
```

---

## Step 5b: Epic-Level GPT Review (When reviewScope="epic")

**Only runs when `reviewScope="epic"` was selected in Step 2.**

This is a single comprehensive GPT review of the entire epic's implementation, run after all batches complete.

```python
if state.reviewScope == "epic":
    log("🤖 Starting Epic-Level GPT Review (all sprints)")

    state.phase = "epic_code_review"
    save_state()

    # Gather ALL files and stories from entire epic
    all_files = gather_all_epic_files(state.completedStories)
    all_stories = gather_all_epic_stories(state.completedStories)

    MAX_REVIEW_ROUNDS = 7
    review_round = 0
    gpt_approved = False

    while not gpt_approved and review_round < MAX_REVIEW_ROUNDS:
        review_round += 1
        state.reviewRounds.epicLevel = review_round
        save_state()

        log(f"🤖 Epic-Level GPT Review Round {review_round}")

        # Run full verification
        run_verification()  # pnpm test, lint, typecheck

        # Build epic-level context for GPT
        epic_context = build_epic_context(all_stories, all_files)

        # Invoke GPT via Codex CLI
        gpt_response = invoke_codex_review(
            type="epic_code_review",
            epic_id=state.epic,
            stories=all_stories,
            files=all_files,
            context=epic_context,
            focus=[
                "cross-sprint integration",
                "architectural consistency",
                "security vulnerabilities",
                "error handling patterns",
                "test coverage gaps",
                "clean architecture compliance"
            ]
        )

        status = parse_status(gpt_response)
        confidence = parse_confidence(gpt_response)
        findings = parse_findings(gpt_response) if status == "NEEDS_REVISION" else []

        # Log to review log
        append_review_log(f"epic_review", review_round, gpt_response)

        if status == "APPROVED" and confidence >= 0.5:
            log(f"✅ Epic APPROVED (round {review_round}, confidence {confidence})")
            gpt_approved = True
            break

        elif status == "NEEDS_REVISION":
            log(f"📝 Epic needs revision (round {review_round})")

            for finding in findings:
                severity = finding.severity

                if opus_agrees_with_finding(finding):
                    apply_code_fix(finding)
                    log(f"  ✓ Fixed ({severity}): {finding.summary}")
                else:
                    pushback = create_pushback_response(finding)
                    log(f"  ↩ Pushback ({severity}): {finding.summary}")

            save_state()

    if not gpt_approved:
        log(f"⚠️ Max rounds reached - applying remaining GPT recommendations")
        apply_all_remaining_gpt_recommendations()

    state.epicReviewComplete = True
    save_state()

    output("<promise>EPIC_REVIEWED</promise>")
```

**Epic-Level Review Prompt Template:**

```bash
RESPONSE=$(codex review - <<'EOF'
CRITICAL: Your response MUST begin with exactly:
STATUS: APPROVED
or
STATUS: NEEDS_REVISION

CONFIDENCE: [0.0-1.0] is REQUIRED at the end.

---

## TASK
Review ENTIRE epic implementation for Epic {epic_id}.

## EXPECTED OUTCOME
Comprehensive review of all code changes across all sprints.
Return STATUS: APPROVED or STATUS: NEEDS_REVISION with findings.

## CONTEXT
Epic: {epic_id}
Total Stories: {story_count}
Total Files Changed: {file_count}
Sprints: {sprint_list}

Test Results:
- Unit tests: {pass/fail}
- Lint: {pass/fail}
- Typecheck: {pass/fail}

## FOCUS AREAS
- Cross-sprint integration issues
- Architectural consistency
- Security vulnerabilities (OWASP)
- Error handling patterns
- Test coverage completeness
- Clean architecture compliance

## MUST DO
- Verify all stories meet acceptance criteria
- Check for cross-file/cross-sprint regressions
- Validate integration points work correctly
- Review security implications holistically

## OUTPUT FORMAT
STATUS: APPROVED | STATUS: NEEDS_REVISION

REQUIRED CHANGES (if any):
1. [Story/File] — [Change] — Why: [rationale] — Severity: [CRITICAL|HIGH|MEDIUM|LOW]

CONFIDENCE: [0.0-1.0]
EOF
)
```

---

## Step 6: Browser QA (Frontend Stories)

**After code review passes, run browser QA for frontend stories:**

```python
frontend_stories = [s for s in batch.stories if s.agent == "frontend-agent"]

if frontend_stories:
    log("🌐 Running Browser QA for frontend stories...")

    # Ensure dev server is running
    ensure_dev_server_running()  # pnpm dev

    for story in frontend_stories:
        if hasattr(story, 'qa_verification') and story.qa_verification:
            try:
                run_browser_qa(story)
                log(f"  ✅ Browser QA passed: {story.id}")
            except QAError as e:
                log(f"  ❌ Browser QA failed: {story.id} - {e}")
                # Fix and retry
                fix_qa_issues(story, e)
                run_browser_qa(story)  # Retry once


def run_browser_qa(story):
    """Use Chrome DevTools MCP for visual verification"""

    qa = story.qa_verification

    # 1. Navigate to the page
    mcp__chrome_devtools__navigate_page(
        url=f"http://localhost:3000{qa.route}"
    )

    # 2. Wait for page load
    mcp__chrome_devtools__wait_for(
        selector=qa.wait_for_selector or "body",
        timeout=10000
    )

    # 3. Check for console errors
    console_messages = mcp__chrome_devtools__list_console_messages()
    errors = [m for m in console_messages if m.level == "error"]
    warnings = [m for m in console_messages if m.level == "warning"]

    if errors:
        raise QAError(f"Console errors: {errors}")

    if warnings:
        log(f"  ⚠️ Console warnings (non-blocking): {len(warnings)}")

    # 4. Check for failed network requests
    network_requests = mcp__chrome_devtools__list_network_requests()
    failed = [r for r in network_requests if r.status >= 400]

    if failed:
        raise QAError(f"Failed network requests: {failed}")

    # 5. Execute verification steps
    for step in qa.steps:
        if step.action == "click":
            mcp__chrome_devtools__click(selector=step.selector)
        elif step.action == "fill":
            mcp__chrome_devtools__fill(selector=step.selector, value=step.value)
        elif step.action == "hover":
            mcp__chrome_devtools__hover(selector=step.selector)
        elif step.action == "verify_text":
            result = mcp__chrome_devtools__evaluate_script(
                script=f"document.querySelector('{step.selector}')?.textContent"
            )
            if step.expected not in (result or ""):
                raise QAError(f"Text mismatch: expected '{step.expected}', got '{result}'")
        elif step.action == "verify_exists":
            result = mcp__chrome_devtools__evaluate_script(
                script=f"!!document.querySelector('{step.selector}')"
            )
            if not result:
                raise QAError(f"Element not found: {step.selector}")
        elif step.action == "verify_not_exists":
            result = mcp__chrome_devtools__evaluate_script(
                script=f"!!document.querySelector('{step.selector}')"
            )
            if result:
                raise QAError(f"Element should not exist: {step.selector}")

    # 6. Take screenshot for verification
    screenshot_path = f"qa-screenshots/{story.id}.png"
    mcp__chrome_devtools__take_screenshot(filename=screenshot_path)
    log(f"  📸 Screenshot saved: {screenshot_path}")
```

---

## Step 7: Commit Approved Batch

**After GPT approval AND browser QA passes:**

```bash
# Stage batch files
git add {batch.files}

# Commit with descriptive message
git commit -m "feat(epic-{N}): batch {batch_num} - stories {story_ids}

Stories:
$(for story in batch.stories; echo "- $story.id: $story.title")

Co-Authored-By: GPT-5.2 <noreply@openai.com>"
```

---

## Step 8: Update CLAUDE.md with Learnings

```python
if gpt_findings:
    learnings = extract_learnings(gpt_findings)

    # Determine target based on files affected
    target_file = determine_claude_md_target(batch.files)
    # apps/web/** → /apps/web/CLAUDE.md
    # packages/backend/** → /packages/backend/CLAUDE.md
    # else → /CLAUDE.md

    append_to_claude_md(target_file, f"""
### Epic {epic} Batch {batch_num} ({date})

**Learnings from GPT Review:**
{format_learnings(learnings)}
""")

    log(f"📝 Updated {target_file} with {len(learnings)} learnings")
```

---

## Step 9: Sprint Final Pass

**After all batches in sprint complete:**

```python
state.phase = "sprint_review"
save_state()

log("🔍 Running Sprint Final Pass...")

# Gather all files modified in sprint
all_files = gather_sprint_files(sprint_id)
all_stories = gather_sprint_stories(sprint_id)

# GPT holistic review
gpt_response = invoke_codex_review(
    type="sprint_final_pass",
    sprint_id=sprint_id,
    stories=all_stories,
    files=all_files,
    focus=["integration", "patterns", "gaps", "regressions", "architecture"]
)

# Parse categorized findings
findings = parse_categorized_findings(gpt_response)

# Handle by severity
for finding in findings.critical:
    log(f"🔴 CRITICAL: {finding.summary}")
    apply_inline_fix(finding)  # Max 3 inline fixes

for finding in findings.major:
    log(f"🟠 MAJOR: {finding.summary}")
    create_fix_story(finding)  # Max 1 fix batch per sprint

for finding in findings.minor:
    log(f"🟡 MINOR (deferred): {finding.summary}")
    append_to_claude_md(finding)  # Log for future

output("<promise>SPRINT_REVIEWED</promise>")
```

---

## Step 10: Completion

```python
state.phase = "complete"
state.status = "completed"
save_state()

# Generate completion summary
summary = f"""
# Implementation Complete

## Epic {epic} - Scope: {state.targetScope}

### Summary
- ✅ Stories completed: {len(state.completedStories)}
- ❌ Stories skipped: {len(state.skippedStories)}
- 🔄 GPT review rounds: {state.reviewRounds.code}
- 🌐 Browser QA: {qa_summary}

### Completed Stories
{format_story_list(state.completedStories)}

### Skipped Stories
{format_story_list(state.skippedStories)}
See .stuck-log.md for details.

### Artifacts
- Specs: /tasks/epic-{epic}/sprint-*.md
- Review log: /tasks/epic-{epic}/.review-log.md
- Stuck log: /tasks/epic-{epic}/.stuck-log.md
- QA screenshots: /qa-screenshots/
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

## RE-REVIEW & PUSHBACK
- Re-review cycle continues until STATUS: APPROVED
- Agent may pushback with reasoning - evaluate objectively
- After 7 pushback rounds, you have final say

## OUTPUT FORMAT
STATUS: APPROVED | STATUS: NEEDS_REVISION

REQUIRED CHANGES (if any):
1. [Change] — Why: [rationale] — Severity: [CRITICAL|HIGH|MEDIUM|LOW]

RECOMMENDATIONS (optional):
- [Improvement] — Why: [benefit]

CONFIDENCE: [0.0-1.0]
EOF
)

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
    state.resumeFrom = f"batch_{batch_num}_code_review"
    save_state()

    log("""
    ⚠️ GPT Rate Limited

    State saved. To resume:
    1. Wait for rate limit to reset
    2. Run: /implement
    """)
    exit()
```

### Stuck Detection

```python
if same_error_count >= 3:
    log(f"❌ Story {story_id} stuck after 3 attempts")
    append_stuck_log(story_id, {
        "error": error,
        "attempts": 3,
        "last_attempt": now()
    })
    state.skippedStories.append(story_id)
    save_state()
    continue  # Move to next story
```

---

## Important Rules

1. **Runs in main context** - Can spawn subagents via Task tool
2. **Always prompt for scope** - Even when resuming (includes reviewScope option)
3. **GPT review loops are MANDATORY** - Loop until APPROVED or max rounds
4. **Review scope flexibility** - Sprint-scoped (default) or epic-scoped (one review at end)
5. **Browser QA for frontend** - Visual verification with Chrome DevTools MCP
6. **Checkpoint per-story** - Not per-batch, enables precise resume
7. **Commit after approval** - Keep git clean for next review
8. **Log all GPT exchanges** - Audit trail in .review-log.md
9. **Update CLAUDE.md** - Institutional memory from learnings
10. **Respect 7 round limit** - GPT gets final say after that
11. **No Opus fallback** - Clean exit on GPT errors, user fixes, resume
12. **Verification before GPT** - Don't waste GPT time on failing tests

---

## Completion Promises

| Promise | Meaning |
|---------|---------|
| `BATCH_APPROVED` | Implementation batch approved by GPT (sprint-scoped) |
| `EPIC_REVIEWED` | Epic-level GPT review approved (epic-scoped) |
| `SPRINT_REVIEWED` | Sprint final pass approved |
| `SCOPE_COMPLETE` | All work done |
| `STUCK` | Unrecoverable issue, skipping |
| `ERROR` | Critical failure, needs user |
