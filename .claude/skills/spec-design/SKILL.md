---
name: spec-design
description: Opus-GPT planning phase - create sprint/story specs with GPT deep review loops. Use for Opus-GPT workflow epic planning with plan-agent and GPT-5.2 validation.
allowed-tools: Read, Write, Edit, Bash, Grep, Glob, Task, WebFetch
model: opus
---

# Spec Design - Opus-GPT Planning Phase

You are starting the **planning phase** of the Opus-GPT automated workflow.

**CRITICAL:** This skill runs in the main conversation context so you CAN spawn subagents via the Task tool.

## Your Task

Create detailed sprint and story specifications with **per-sprint GPT deep review loops** until each sprint is approved.

---

## Step 1: Gather Context

Ask user for:

1. **Epic number:** Which epic to plan?
2. **Goals document:** Location of epic goals (e.g., `tasks/epic-19/epic-19-goals.md`)
3. **Scope:** Full epic, single sprint, or specific stories?
4. **Custom GPT review prompt:** (Enter for default)

---

## Step 2: Initialize State

**CRITICAL:** Include `workflow` field for compatibility checking.

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
        return
    else:
        # Same workflow - resume from existing state
        log(f"Resuming opus-gpt workflow from phase: {existing_state['phase']}")
        state = existing_state
else:
    # Create new state
    state = {
        "workflow": "opus-gpt",
        "workflowVersion": "1.0.0",
        "epic": N,
        "scope": scope,
        "phase": "planning",
        "status": "started",
        "currentSprint": 0,
        "totalSprints": 0,
        "approvedSprints": [],
        "codex": {
            "roundCount": 0,
            "lastResponse": "",
            "mode": "bash"
        },
        "reviewRounds": {
            "specPerSprint": {},
            "specFinalPass": 0
        },
        "startedAt": now_iso()
    }
    write_json(state_path, state)
```

---

## Step 3: Invoke Plan Agent

Use the Task tool to spawn plan-agent:

```
Task(
  subagent_type: "plan-agent",
  prompt: "Create sprint and story specifications for Epic {N}.
    Goals: {goals document path}
    Scope: {scope}

    REQUIREMENTS (CRITICAL):
    1. Each story MUST have 'Files Touched' section (enables parallelization)
    2. Each story MUST have agent assignment (frontend-agent or backend-agent)
    3. Each story MUST have testable acceptance criteria
    4. Each story MUST have 'Tests Required' section
    5. Each story MUST have 'Tests Affected' section (existing tests that may break)
    6. Each frontend story with UI changes MUST have 'QA Verification' section

    PARALLEL PLANNING (CRITICAL):
    7. Sprint overview MUST have 'Dependency Graph' with File Overlap Analysis
    8. Sprint overview MUST have 'Parallel Execution Strategy' with Phases
    9. Stories in same phase must NOT touch same files

    Output files to /tasks/epic-{N}/"
)
```

---

## Step 4: GPT Sprint Spec Review Loop (MANDATORY)

**For each sprint, run the Opus↔GPT review loop until approval:**

```python
MAX_REVIEW_ROUNDS = 7

for sprint_id in sprints:
    review_round = 0
    approved = False

    state.currentSprint = sprint_id
    save_state()

    log(f"📋 Starting review for Sprint {sprint_id}")

    while not approved and review_round < MAX_REVIEW_ROUNDS:
        review_round += 1
        state.reviewRounds.specPerSprint[sprint_id] = review_round
        save_state()

        log(f"🤖 GPT Review Round {review_round} for Sprint {sprint_id}")

        # 1. Read sprint spec content
        sprint_content = read_sprint_spec(sprint_id)
        stories_content = read_sprint_stories(sprint_id)

        # 2. Invoke GPT via Codex CLI
        gpt_response = invoke_codex_review(
            type="sprint_spec",
            sprint_id=sprint_id,
            content={
                "sprint_overview": sprint_content,
                "stories": stories_content
            }
        )

        # 3. Parse response
        status = parse_status(gpt_response)  # "APPROVED" or "NEEDS_REVISION"
        confidence = parse_confidence(gpt_response)  # 0.0 - 1.0
        findings = parse_findings(gpt_response) if status == "NEEDS_REVISION" else []

        # 4. Log to .review-log.md
        append_review_log(f"sprint_{sprint_id}_spec", review_round, gpt_response)

        # 5. Handle result
        if status == "APPROVED" and confidence >= 0.5:
            log(f"✅ Sprint {sprint_id} spec APPROVED (round {review_round}, confidence {confidence})")
            state.approvedSprints.append(sprint_id)
            approved = True
            break

        elif status == "APPROVED" and confidence < 0.5:
            log(f"⚠️ Low confidence approval ({confidence}) - requiring re-review")
            # Continue loop

        elif status == "NEEDS_REVISION":
            log(f"📝 Sprint {sprint_id} spec needs revision (round {review_round})")

            for finding in findings:
                severity = finding.severity  # CRITICAL, HIGH, MEDIUM, LOW
                file_affected = finding.file or "sprint overview"

                if opus_agrees_with_finding(finding):
                    # Apply fix to spec
                    apply_spec_fix(sprint_id, finding)
                    log(f"  ✓ Fixed ({severity}) in {file_affected}: {finding.summary}")
                else:
                    # Create pushback response for next round
                    pushback = create_pushback_response(finding)
                    log(f"  ↩ Pushback ({severity}): {finding.summary}")
                    log(f"    Reasoning: {pushback.reasoning}")

            save_state()
            # Continue loop for re-review...

    # After loop exits
    if not approved:
        log(f"⚠️ Max review rounds ({MAX_REVIEW_ROUNDS}) reached for Sprint {sprint_id}")
        log("GPT has final say - applying all remaining recommendations")
        apply_all_remaining_gpt_recommendations(sprint_id)
        state.approvedSprints.append(sprint_id)

    output(f"<promise>SPRINT_SPEC_APPROVED</promise>")
    save_state()
```

---

## Step 5: Spec Final Pass (Holistic Review)

**After all sprints individually approved**, run holistic cross-sprint review:

```python
state.phase = "spec_final_pass"
save_state()

log("🔍 Running Spec Final Pass (holistic review)...")

# Gather all approved sprint summaries
all_sprints_content = gather_all_sprint_summaries()

# GPT holistic review
gpt_response = invoke_codex_review(
    type="spec_final_pass",
    content=all_sprints_content,
    focus=[
        "cross-sprint dependencies",
        "file conflicts across sprints",
        "architectural consistency",
        "scope coverage vs goals",
        "integration risks",
        "missing gaps"
    ]
)

# Same review loop pattern
review_round = 0
approved = False

while not approved and review_round < MAX_REVIEW_ROUNDS:
    review_round += 1
    state.reviewRounds.specFinalPass = review_round
    save_state()

    status = parse_status(gpt_response)
    confidence = parse_confidence(gpt_response)
    findings = parse_findings(gpt_response)

    append_review_log("spec_final_pass", review_round, gpt_response)

    if status == "APPROVED" and confidence >= 0.5:
        log(f"✅ Spec Final Pass APPROVED (round {review_round})")
        approved = True
        break

    elif status == "NEEDS_REVISION":
        for finding in findings:
            if opus_agrees_with_finding(finding):
                apply_cross_sprint_fix(finding)
            else:
                create_pushback_response(finding)

        # Re-invoke GPT for next round
        gpt_response = invoke_codex_review(
            type="spec_final_pass_recheck",
            previous_findings=findings,
            fixes_applied=get_fixes_applied()
        )

if not approved:
    apply_all_remaining_gpt_recommendations("final_pass")
```

---

## Step 6: Finalize

```python
state.phase = "complete"
state.status = "plan_approved"
save_state()

# Commit approved specs
git_add(f"tasks/epic-{epic}/")
git_commit(f"spec(epic-{epic}): approved sprint specs")

# Summary
summary = f"""
## Planning Complete

**Epic:** {N}
**Scope:** {scope}
**Sprints:** {len(state.approvedSprints)}
**Total Stories:** {count_stories()}
**GPT Review Rounds:** {sum(state.reviewRounds.specPerSprint.values()) + state.reviewRounds.specFinalPass}

### Sprints Approved
{format_sprint_list(state.approvedSprints)}

### Artifacts Created
- Sprint overviews: /tasks/epic-{N}/sprint-*-overview.md
- Story specs: /tasks/epic-{N}/sprint-*-story-*.md
- Review log: /tasks/epic-{N}/.review-log.md
- State: /tasks/epic-{N}/.orchestrator-state.json

Plan is ready. Run `/implement` to begin implementation.
"""

output(summary)
output("<promise>PLAN_APPROVED</promise>")
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
Review sprint specifications for Epic {epic_id}: Sprint {sprint_id}.

## EXPECTED OUTCOME
Identify issues in THIS sprint's specs only.
Return STATUS: APPROVED or STATUS: NEEDS_REVISION with findings.

## CONTEXT
Sprint: {sprint_id}
Stories: {story_count}

### Sprint Overview
{sprint_summary}

### Stories
{story_specs}

## CONSTRAINTS
- Clean architecture: domain → application → infrastructure
- Existing codebase patterns (search to verify)
- Files Touched sections must be accurate
- Parallel Execution Strategy must be valid (no file conflicts within phases)

## MUST DO (DEEP ANALYSIS REQUIRED)
- Search the codebase for EACH file in 'Files Touched' sections
- Verify proposed changes don't conflict with existing code
- Check for missing dependencies or breaking changes
- Validate technical approach against existing patterns
- Verify phase groupings have no file conflicts
- Check that QA Verification sections exist for frontend stories

## MUST NOT DO
- Review files not in these specs
- Flag previously-approved code
- Nitpick style without substance
- Approve without actually searching the codebase

## RE-REVIEW & PUSHBACK
- Re-review cycle continues until STATUS: APPROVED
- Agent may pushback with reasoning - evaluate objectively
- After 7 pushback rounds, you have final say

## OUTPUT FORMAT
STATUS: APPROVED | STATUS: NEEDS_REVISION

REQUIRED CHANGES (if any):
1. [Story/Section] — [Change] — Why: [rationale] — Severity: [CRITICAL|HIGH|MEDIUM|LOW]

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

## Error Handling (NO Opus Fallback)

**CRITICAL:** Do NOT fall back to Opus agents on GPT errors. Clean exit so user can fix and resume.

```python
def handle_gpt_error(error, error_code):
    if "rate_limit" in error or error_code == 429:
        state.status = "gpt_error"
        state.errorType = "rate_limited"
        state.errorAt = now()
        state.resumeFrom = f"sprint_{current_sprint}_spec_review"
        save_state()

        log("""
        ⚠️ GPT Rate Limited

        State saved. To resume:
        1. Wait for rate limit to reset
        2. Run: /spec-design
        """)
        exit()

    elif error_code == 401:
        state.status = "gpt_error"
        state.errorType = "auth_failed"
        save_state()

        log("❌ GPT authentication failed. Check OPENAI_API_KEY.")
        exit()

    elif error_code >= 500:
        # Retry once
        if state.retryCount < 1:
            state.retryCount += 1
            save_state()
            sleep(30)
            return "retry"

        state.status = "gpt_error"
        state.errorType = "server_error"
        save_state()
        log("❌ GPT server error. Try again later.")
        exit()
```

---

## Story Template Requirements

**Each story MUST include these sections:**

```markdown
# Story {epic}.{sprint}.{story}: [Title]

## Description
[What and why]

## Acceptance Criteria
- [ ] [Testable criterion 1]
- [ ] [Testable criterion 2]

## Technical Approach
[How to implement]

## Files Touched
- `path/to/file1.ts` - [what changes]
- `path/to/file2.ts` - [what changes]

## Tests Affected
Existing tests that may break:
- `__tests__/path/to/test.ts` - [why affected]
- None expected (if applicable)

## Agent Assignment
- [x] frontend-agent OR backend-agent

## Tests Required
- [ ] [Specific test 1]
- [ ] [Specific test 2]

## QA Verification (Frontend Stories Only)
**Route:** `/path/to/page`
**Wait For:** `[data-testid="element"]`

**Steps:**
1. action: verify_exists, selector: `[data-testid="feature"]`
2. action: click, selector: `[data-testid="button"]`
3. action: verify_text, selector: `.result`, expected: "Expected text"

## Definition of Done
- [ ] All acceptance criteria met
- [ ] Tests written and passing
- [ ] No TypeScript errors
- [ ] No lint errors
```

---

## Important Rules

1. **Runs in main context** - Can spawn subagents via Task tool
2. **Per-sprint review loops** - Each sprint gets MANDATORY Opus↔GPT loop
3. **Deep analysis required** - GPT must search codebase, verify files
4. **Spec final pass is mandatory** - Catches cross-sprint issues
5. **QA sections for frontend** - Every frontend story needs QA Verification
6. **Parallel planning included** - Plan-agent creates phases upfront
7. **Log all GPT exchanges** - Audit trail in .review-log.md
8. **Respect 7 round limit** - GPT gets final say after that
9. **No Opus fallback** - Clean exit on GPT errors, resume when fixed
10. **Checkpoint frequently** - Update state after each review round

---

## Completion Promises

| Promise | Meaning |
|---------|---------|
| `SPRINT_SPEC_APPROVED` | Individual sprint spec approved |
| `PLAN_APPROVED` | All specs approved (after final pass) |
| `ERROR` | Critical failure, needs user |
