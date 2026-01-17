# Claude Autonomous Workflow Plan

> **Version:** 1.9.0
> **Created:** 2026-01-16
> **Updated:** 2026-01-17
> **Model:** Claude Opus 4.5 (fully autonomous, no GPT)

## Overview

A fully autonomous Claude workflow optimized for:
- **Minimal context window usage** - aggressive state externalization
- **Git worktrees** - for separate epics only (not per-story)
- **Parallel agents** - within epic, agents run in parallel on same branch (file-grouping prevents conflicts)
- **Self-correcting loops** - no human pushback, Claude iterates until tests pass
- **Browser QA** - Chrome DevTools via Playwright MCP for visual verification
- **Ralph Wiggum hook** - native exit interception for persistent loops

---

## Key Parameters

> **Single source of truth for all tunable values.** Adjust here, not scattered through docs.

| Parameter | Value | Phase | Rationale |
|-----------|-------|-------|-----------|
| **Max architect retries** | 5 | Planning | Architect gets final say after max attempts |
| **Max spec-review retries** | 5 | Planning | Thorough validation may need iterations |
| **Max spec final pass retries** | 3 | Planning | Cross-sprint issues should be few |
| **Max implementation retries** | 10 | Implementation | Complex fixes may need multiple attempts |
| **Circuit breaker threshold** | 3 | Recovery | Same error 3x → give up, move on |
| **Session timeout** | 24h | Recovery | Fresh start after long pause |
| **Max iterations (hook)** | 50 | Stop Hook | Safety net for runaway loops |
| **Parallel agents per batch** | 4 | Execution | Balance speed vs resource usage |
| **CRITICAL fixes (sprint review)** | 3 max | Sprint Review | Prevent infinite fix loops |
| **MAJOR fix batches** | 1 max | Sprint Review | Limit late-stage scope creep |

### Completion Promises

| Promise | Meaning | Phase |
|---------|---------|-------|
| `PLAN_APPROVED` | Specs ready for implementation | Planning |
| `PLAN_APPROVED_WITH_WARNINGS` | Specs approved, architect noted concerns | Planning |
| `PLAN_STUCK_FEASIBILITY` | Feasibility issues unresolvable | Planning |
| `PLAN_STUCK_INTEGRATION` | Cross-sprint issues unresolvable | Planning |
| `EPIC_COMPLETE` | All stories implemented | Implementation |
| `PAUSE_REQUESTED` | Clean exit, state preserved, resume later | Any |
| `EXIT_MODE` | Exit workflow mode, return to normal chat | Any |

### Exiting Workflow Mode

**How modes work:**
- `/claude-plan` and `/claude-implement` use `context: fork` (isolated context)
- Ralph Wiggum hook keeps the loop running until a completion promise
- When promise found → hook allows exit → returns to main conversation

**Ways to exit:**

| Method | How | State | When to Use |
|--------|-----|-------|-------------|
| **Natural completion** | Workflow outputs `EPIC_COMPLETE` or `PLAN_APPROVED` | Committed | Workflow finished successfully |
| **Pause for later** | Say "pause" or output `PAUSE_REQUESTED` | Preserved | Need to stop, will resume later |
| **Exit to chat** | Say "exit" or output `EXIT_MODE` | Preserved | Want normal chat, may resume |
| **Force quit** | Ctrl+C | Last checkpoint | Emergency stop |

**User commands during workflow:**
```
"pause"  → Agent outputs PAUSE_REQUESTED → Clean exit, state saved
"exit"   → Agent outputs EXIT_MODE → Return to normal chat
"status" → Agent reports current progress without exiting
"skip"   → Agent marks current story stuck, moves to next
```

**Resuming after exit:**
```bash
# Resume planning
/claude-plan epic 20
# → Detects existing state, continues from checkpoint

# Resume implementation
/claude-implement epic 20
# → Detects existing state, continues from checkpoint
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                    RALPH WIGGUM HOOK (Outer Shell)                  │
│            Blocks exit until "EPIC_COMPLETE" • Max 50 iterations    │
├─────────────────────────────────────────────────────────────────────┤
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                  ORCHESTRATOR (Claude Opus)                   │  │
│  │                 Minimal context - delegates all               │  │
│  ├───────────────────────────────────────────────────────────────┤  │
│  │                                                               │  │
│  │   BATCH 1 (parallel - no file conflicts)                      │  │
│  │   ┌─────────────┐    ┌─────────────┐    ┌─────────────┐      │  │
│  │   │  Agent A    │    │  Agent B    │    │  Agent C    │      │  │
│  │   │  (story 1)  │    │  (story 2)  │    │  (story 3)  │      │  │
│  │   └──────┬──────┘    └──────┬──────┘    └──────┬──────┘      │  │
│  │          │                  │                  │              │  │
│  │          ▼                  ▼                  ▼              │  │
│  │   ┌───────────────────────────────────────────────────────┐  │  │
│  │   │              Test + Review Loop (per story)            │  │  │
│  │   │  Unit → Lint → Type → Code Review → Browser QA → Pass │  │  │
│  │   └───────────────────────────────────────────────────────┘  │  │
│  │                              │                                │  │
│  │                              ▼                                │  │
│  │                    Commit approved batch                      │  │
│  │                              │                                │  │
│  │                              ▼                                │  │
│  │                 BATCH 2 (sequential stories)                  │  │
│  │                             ...                               │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  Claude exits → Hook checks for "EPIC_COMPLETE" → Not found? → ↺   │
└─────────────────────────────────────────────────────────────────────┘

WORKTREES: Only for running multiple epics simultaneously
┌──────────────────┐    ┌──────────────────┐
│  Main Worktree   │    │  Epic 21 Worktree │
│  (Epic 20)       │    │  ../app-epic-21   │
└──────────────────┘    └──────────────────┘
```

## Key Principles

### 1. Context Window Optimization

> **FOR FUTURE CLAUDE SESSIONS:** This section explains WHY we use these patterns.
> Context is finite (~200K tokens). Long-running autonomous loops WILL exhaust context
> without aggressive optimization. These patterns are battle-tested from Epic 20 development.

#### Why Context Optimization Matters

```
Problem: Autonomous loop runs for hours
         ↓
Context fills with: conversation history, tool results, file contents, errors
         ↓
Context exhaustion → agent fails mid-task → lost work
         ↓
Solution: Externalize state, scope prompts, summarize returns
```

#### Core Strategies

| Strategy | Implementation | WHY |
|----------|----------------|-----|
| **State externalization** | All state in `.orchestrator-state.json` | Context survives compaction; enables resume |
| **Aggressive delegation** | Orchestrator only coordinates, never implements | Orchestrator stays minimal (~2K tokens) |
| **Scoped prompts** | Sub-agents get ONLY relevant story + files | Each agent focused, not bloated |
| **No conversation history** | Each agent call is stateless with full context | Prevents history accumulation |
| **Checkpoint frequently** | Save after every atomic action | Can resume from any point |
| **Summarize on return** | Agents return 1-paragraph summaries, not full logs | 50 tokens vs 5000 tokens |

#### Just-In-Time (JIT) Retrieval Pattern

**WHY:** Traditional approach preloads all data → wastes tokens on unused info.

```
❌ BAD: Load all 20 story specs into context at start
✅ GOOD: Load story spec only when agent starts that story

❌ BAD: Include full file contents in prompts
✅ GOOD: Pass file paths → agent reads only what it needs

❌ BAD: Return full error logs from sub-agents
✅ GOOD: Return summary + error type → agent fetches details if needed
```

#### Context Rot Prevention

**WHY:** Long sessions accumulate stale/conflicting information that degrades performance.

| Problem | Symptom | Solution |
|---------|---------|----------|
| **Context Poisoning** | Agent uses outdated info | Refresh state files each batch |
| **Context Distraction** | Agent loses focus | Scoped prompts with only relevant data |
| **Context Confusion** | Agent mixes up similar items | Explicit IDs (story-20.1.1 not "the auth story") |
| **Context Clash** | Agent gets conflicting instructions | Single source of truth (state file) |

#### Skill-Based Context Isolation (Claude Code 2.1+)

**WHY:** Skills with `context: fork` run in isolated sub-agent context. Main conversation stays clean.

```yaml
# .claude/commands/claude-implement.md
---
description: Execute epic implementation
context: fork          # ← Isolated context for entire implementation
allowed-tools: Task, Read, Write, Bash, Glob, Grep
hooks:
  Stop:
    - path: .claude/hooks/stop.sh  # Ralph Wiggum hook
---
```

**Benefits of `context: fork`:**
- Implementation details don't pollute main conversation
- Each epic runs in fresh context
- Main session can monitor multiple forked implementations
- Compaction in fork doesn't affect main session

#### Sub-Agent Return Format

**WHY:** Full logs waste tokens. Summaries preserve context for more iterations.

```python
# ❌ BAD: Agent returns everything
return {
    "status": "complete",
    "files_modified": [...full list...],
    "test_output": [...500 lines...],
    "review_feedback": [...full exchange...],
    "git_diff": [...entire diff...]
}

# ✅ GOOD: Agent returns summary
return {
    "status": "complete",
    "summary": "Implemented auth middleware. 3 files, 12 tests pass.",
    "details_at": ".orchestrator-state.json#stories.20.1.1"
}
```

### 2. Git Worktrees (Epic-Level Only)

Worktrees are used **only for running separate epics simultaneously**, not for per-story isolation.

```bash
# Create worktree for a different epic (optional - for multi-epic work)
git worktree add ../guardian-app-epic-21 -b epic/21

# Work on Epic 21 in separate worktree while Epic 20 runs in main
cd ../guardian-app-epic-21
# ... Epic 21 work happens here ...

# When epic complete, merge back
git checkout main
git merge epic/21
git worktree remove ../guardian-app-epic-21
git branch -d epic/21
```

**When to use worktrees:**
- Running 2+ epics in parallel (rare)
- Long-running epic that shouldn't block other work

**Within an epic:** Agents run in parallel on the same branch. File-grouping ensures no conflicts.

### 3. Self-Correcting Test Loop

No human pushback. Claude loops until ALL pass:

```
WHILE not all_tests_pass:
    IF unit_tests_fail:
        analyze_failure → fix_code → retry
    IF integration_tests_fail:
        analyze_failure → fix_code → retry
    IF lint_fail:
        run eslint --fix → retry
    IF typecheck_fail:
        analyze_errors → fix_types → retry
    IF browser_qa_fail:
        analyze_screenshot/console → fix_ui → retry

    INCREMENT retry_count
    IF retry_count > MAX_RETRIES:
        mark_story_stuck → move_to_next
```

### 4. Browser QA with Chrome DevTools MCP

Use the **official Chrome DevTools MCP** (not deprecated Puppeteer MCP).

**Install:** `claude mcp add chrome-devtools npx chrome-devtools-mcp@latest`

**Available tools:**

| Category | Tools |
|----------|-------|
| **Navigation** | `navigate_page`, `new_page`, `wait_for` |
| **User Input** | `click`, `fill`, `drag`, `hover` |
| **Runtime State** | `list_console_messages`, `evaluate_script`, `list_network_requests`, `get_network_request` |
| **Emulation** | `emulate_cpu`, `emulate_network`, `resize_page` |
| **Screenshots** | Take screenshots |

**QA workflow:**
```
1. navigate_page → load page
2. wait_for → ensure page ready
3. list_console_messages → check for errors
4. list_network_requests → verify API calls
5. click/fill → test interactions
6. take screenshot → visual verification
7. evaluate_script → run assertions
```

**Note:** MCP tools cannot run in background subagents. Browser QA must run in foreground.

### 5. Ralph Wiggum Hook (Exit Interception)

Native Claude Code hook that keeps the loop running until completion.

**How it works:**

```
You: "Run /claude-implement epic 20"
     ↓
Claude: *works on stories*
     ↓
Claude: "Done with batch 1" *tries to exit*
     ↓
Stop Hook: checks for "EPIC_COMPLETE"
     ↓
Not found → exit code 2 → re-inject prompt
     ↓
Claude: *continues with batch 2*
     ↓
... repeats ...
     ↓
Claude: "EPIC_COMPLETE"
     ↓
Stop Hook: magic word found → allow exit
```

**Configuration (`.claude/hooks/stop.sh`):**

```bash
#!/bin/bash
# Ralph Wiggum stop hook - keeps Claude running until completion promise

COMPLETION_PROMISE="${COMPLETION_PROMISE:-EPIC_COMPLETE}"
MAX_ITERATIONS="${MAX_ITERATIONS:-50}"
ITERATION_FILE="/tmp/claude-iteration-count"

# Track iterations
if [ -f "$ITERATION_FILE" ]; then
    count=$(cat "$ITERATION_FILE")
    count=$((count + 1))
else
    count=1
fi
echo "$count" > "$ITERATION_FILE"

# Safety: max iterations
if [ "$count" -ge "$MAX_ITERATIONS" ]; then
    echo "Max iterations ($MAX_ITERATIONS) reached. Stopping."
    rm -f "$ITERATION_FILE"
    exit 0
fi

# Check for completion promise in Claude's output
if echo "$CLAUDE_OUTPUT" | grep -q "$COMPLETION_PROMISE"; then
    echo "Completion promise found: $COMPLETION_PROMISE"
    rm -f "$ITERATION_FILE"
    exit 0  # Allow exit
fi

# Not complete - block exit, re-inject prompt
echo "Iteration $count: No completion promise. Continuing..."
exit 2  # Exit code 2 = re-run with same prompt
```

**Claude Code settings (`.claude/settings.json`):**

```json
{
  "hooks": {
    "stop": ".claude/hooks/stop.sh"
  }
}
```

**Usage:**

```bash
# Set completion promise and max iterations
export COMPLETION_PROMISE="EPIC_COMPLETE"
export MAX_ITERATIONS=50

# Run autonomous loop
claude "/claude-implement epic 20"
```

**Key difference from vanilla Ralph Wiggum:**

| Aspect | Vanilla Ralph | Our Implementation |
|--------|---------------|-------------------|
| Loop content | Same prompt repeated | Detailed specs + state |
| Quality gate | Tests pass only | Tests + Code Review |
| Parallelism | None | Git worktrees |
| State | Git history only | `.orchestrator-state.json` |
| Browser QA | None | Playwright MCP |

We use the hook mechanism but keep our sophisticated workflow inside.

---

## Workflow Phases

### Phase 1: Planning (Two-Stage Spec Review)

```
/claude-plan [epic-number]
```

**Review Pipeline:**

```
Plan Agent → Architect Agent (fast, ~30s) → Spec Review Agent (thorough, ~2min) → Approved
                    │                                │
                    │ Structure issues?              │ Feasibility issues?
                    ▼                                ▼
              Fix & re-review                  Fix & re-review
              (architect only)                 (spec-review only)
```

**Why two stages:**
- **Architect catches structural issues early** - prevents 3K line files, technical debt
- **Spec review validates feasibility** - ensures specs can actually be implemented
- **Each loop is isolated** - fix architect issues → re-run architect only; fix spec issues → re-run spec only
- **Fast pre-filter** - architect rejects bad structure in 30s before 2-min spec review runs

**Orchestrator actions:**

```python
MAX_ARCHITECT_REVIEWS = 5
MAX_SPEC_REVIEWS = 5

# Step 1: Create initial specs
specs = spawn_plan_agent(goals)
write_specs_to_disk(specs)

# ═══════════════════════════════════════════════════════════════
# Step 2: ARCHITECT REVIEW (fast pre-filter, ~30s)
# Catches: decomposition needs, module boundaries, technical debt
# After max attempts: architect gets FINAL SAY (approve with warnings)
# ═══════════════════════════════════════════════════════════════

change_log = []  # Track what was changed for reviewer context

for attempt in range(MAX_ARCHITECT_REVIEWS):

    # Build context for reviewer (includes change explanations after first attempt)
    review_context = f"""
        ## Architecture Review Request

        Epic: {epic_id}
        Stories: {story_count}
        Attempt: {attempt + 1} of {MAX_ARCHITECT_REVIEWS}

        ## Specs to Review
        {story_specs}
        """

    # After first attempt, include what changed
    if attempt > 0 and change_log:
        review_context += f"""
        ## Changes Since Last Review
        The following changes were made to address your previous findings:

        {format_change_log(change_log)}

        Please verify these changes address the issues you raised.
        """
        change_log = []  # Reset for this round

    review_context += """
        ## Review Focus (YOUR ONLY CONCERNS)
        - File Size: Any touched file >500 lines? Flag for decomposition
        - Single Responsibility: Is each module doing ONE thing?
        - Module Boundaries: Are dependencies going correct direction?
        - Decomposition: Should anything be split before implementation?
        - Technical Debt: Are we creating painful refactors?

        ## DO NOT REVIEW
        - File path accuracy (spec-review-agent does this)
        - Pattern consistency (spec-review-agent does this)
        - Cross-story dependencies (spec-review-agent does this)

        ## Response Format
        {
          approved: true/false,
          findings: [...],
          summary: '...'
        }
      """

    architect_review = Task(
      subagent_type: "architect-agent",
      prompt: review_context
    )

    if architect_review.approved:
        break  # Proceed to spec review

    # Fix structural issues and log what changed
    for finding in architect_review.findings:
        if finding.severity in ["CRITICAL", "HIGH"]:
            # May need to decompose existing files first
            if finding.requires_decomposition:
                create_decomposition_story(finding)

            revised_spec = spawn_plan_agent(
                "Revise {finding.story} to address: {finding.issue}"
            )
            update_spec_file(revised_spec)

            # Log the change for next review round
            change_log.append({
                "finding": finding.issue,
                "story": finding.story,
                "action_taken": revised_spec.change_summary,
                "files_affected": revised_spec.files_changed
            })

    # Loop back for architect re-review ONLY

# ═══════════════════════════════════════════════════════════════
# ARCHITECT FINAL SAY: After max attempts, proceed with warnings
# (Does NOT block - architect's concerns logged for implementation)
# ═══════════════════════════════════════════════════════════════

if not architect_review.approved:
    log_warning(f"Architect did not approve after {MAX_ARCHITECT_REVIEWS} attempts")
    log_warning(f"Remaining concerns: {architect_review.findings}")

    # Log to CLAUDE.md so implementation agents are aware
    append_to_claude_md(
        scope="tasks",
        content=f"""
## Architect Warnings (Epic {epic_id})
**Status:** Proceeding with warnings after {MAX_ARCHITECT_REVIEWS} review rounds
**Concerns:** {architect_review.summary}
**Note:** Implementation agents should be aware of these structural concerns.
"""
    )

    # Continue anyway - architect gets final say but doesn't block
    architect_approved_with_warnings = True
else:
    architect_approved_with_warnings = False

# ═══════════════════════════════════════════════════════════════
# Step 3: SPEC REVIEW (thorough validation, ~2min)
# Catches: path errors, pattern mismatches, dependency ordering
# ═══════════════════════════════════════════════════════════════

spec_change_log = []  # Track what was changed for reviewer context

for attempt in range(MAX_SPEC_REVIEWS):

    # Build context for reviewer (includes change explanations after first attempt)
    spec_review_context = f"""
        ## Spec Review Request

        Epic: {epic_id}
        Stories: {story_count}
        Attempt: {attempt + 1} of {MAX_SPEC_REVIEWS}

        **NOTE: Architecture already approved by architect-agent.**
        """

    # After first attempt, include what changed
    if attempt > 0 and spec_change_log:
        spec_review_context += f"""
        ## Changes Since Last Review
        The following changes were made to address your previous findings:

        {format_change_log(spec_change_log)}

        Please verify these changes address the issues you raised.
        """
        spec_change_log = []  # Reset for this round

    spec_review_context += """
        ## Specs to Review
        {story_specs}

        ## Review Focus (YOUR ONLY CONCERNS)
        - File Paths: Do files exist? Are paths correct?
        - Patterns: Does approach match existing codebase?
        - Dependencies: Are cross-story dependencies ordered correctly?
        - Conflicts: Any files touched by multiple stories in same batch?
        - Testability: Are acceptance criteria testable?

        ## DO NOT REVIEW
        - File size/decomposition (architect-agent approved this)
        - Module boundaries (architect-agent approved this)
        - Technical debt (architect-agent approved this)

        ## Response Format
        {
          approved: true/false,
          findings: [...],
          summary: '...'
        }
      """

    spec_review = Task(
      subagent_type: "spec-review-agent",
      prompt: spec_review_context
    )

    if spec_review.approved:
        mark_sprint_approved(current_sprint)
        continue_to_next_sprint_or_final_pass()

    # Check if issue is actually architectural (rare - architect should catch)
    architectural_issues = [f for f in spec_review.findings
                           if f.type == "architectural"]
    if architectural_issues:
        # Send back to architect, then spec-review again
        return_to_architect(architectural_issues)
        continue

    # Fix feasibility issues and log what changed
    for finding in spec_review.findings:
        if finding.severity in ["CRITICAL", "HIGH"]:
            revised_spec = spawn_plan_agent(
                "Revise {finding.story} to address: {finding.issue}"
            )
            update_spec_file(revised_spec)

            # Log the change for next review round
            spec_change_log.append({
                "finding": finding.issue,
                "story": finding.story,
                "action_taken": revised_spec.change_summary,
                "files_affected": revised_spec.files_changed
            })

    # Loop back for spec re-review ONLY

# ═══════════════════════════════════════════════════════════════
# Step 4: SPEC FINAL PASS (after ALL sprints individually approved)
# Catches: cross-sprint dependencies, integration risks, scope gaps
# ═══════════════════════════════════════════════════════════════

if not all_sprints_approved():
    output("<promise>PLAN_STUCK_FEASIBILITY</promise>")
    return

final_pass = Task(
    subagent_type: "spec-review-agent",
    prompt: "
        ## Spec Final Pass - Holistic Review

        **All sprints have been individually approved. Now review them TOGETHER.**

        Epic: {epic_id}
        Total Sprints: {sprint_count}
        Total Stories: {story_count}

        ## All Sprints Summary
        {all_sprints_summary}

        ## Review Focus (CROSS-SPRINT ONLY)
        You already approved each sprint individually. Now check:

        1. **Cross-Sprint Dependencies:** Are they correctly ordered?
           - Does Sprint 2 assume Sprint 1 changes exist?
           - Any circular dependencies across sprints?

        2. **File Conflicts Across Sprints:** Do later sprints modify files
           that earlier sprints also touch? Could cause integration issues?

        3. **Architectural Consistency:** Does the SUM of all sprints
           maintain clean architecture? Or do pieces conflict?

        4. **Scope Completeness:** Does total scope match original goals?
           Anything implied by goals but not covered?

        5. **Integration Risks:** Will these pieces work together when
           implemented sequentially?

        ## DO NOT RE-REVIEW
        - Individual story feasibility (already approved)
        - File path accuracy (already approved)
        - Per-sprint patterns (already approved)

        ## Response Format
        {
            approved: true/false,
            findings: [
                { type: 'cross_sprint_dependency' | 'file_conflict' |
                         'architecture' | 'scope_gap' | 'integration_risk',
                  sprints_affected: [...],
                  issue: '...',
                  suggestion: '...' }
            ],
            summary: '...'
        }
    "
)

if final_pass.approved:
    commit_specs()
    if architect_approved_with_warnings:
        output("<promise>PLAN_APPROVED_WITH_WARNINGS</promise>")
    else:
        output("<promise>PLAN_APPROVED</promise>")
    return

# Fix cross-sprint issues (may need to revise multiple sprints)
for finding in final_pass.findings:
    for sprint in finding.sprints_affected:
        revised_spec = spawn_plan_agent(
            "Revise {sprint} to address cross-sprint issue: {finding.issue}"
        )
        update_spec_file(revised_spec)

# Re-run final pass (issues fixed, check again)
# Loop continues until final pass approved

output("<promise>PLAN_STUCK_INTEGRATION</promise>")
```

**Review Pipeline Summary:**
```
Plan Agent creates specs
        ↓
┌─────────────────────────────────────────────────────┐
│  FOR EACH SPRINT:                                   │
│    Architect Review (30s) → Spec Review (2min)      │
│         ↓                        ↓                  │
│    Structure OK?            Feasibility OK?         │
│         ↓                        ↓                  │
│    Sprint Approved ────────────────────────────────►│
└─────────────────────────────────────────────────────┘
        ↓
All Sprints Approved
        ↓
SPEC FINAL PASS (holistic, cross-sprint)
        ↓
PLAN_APPROVED
```

**Context optimization:**
- Orchestrator never reads full codebase
- Plan agent searches codebase, returns summary
- Architect agent checks file sizes, module structure (~30s)
- Spec review agent validates paths, patterns (~2min)
- Final pass reviews sprint summaries only (not full specs)
- Each agent gets specs only, searches codebase itself

### Phase 2: Implementation (Batch-Based)

```
/claude-implement [epic-number]
```

#### Step 1: Initialize

```json
{
  "epic": "20",
  "phase": "implementation",
  "completedStories": [],
  "stuckStories": [],
  "currentBatch": 0,
  "totalBatches": 0
}
```

#### Step 2: File Grouping

Spawn `file-grouping-agent`:
- Input: All story specs
- Output: Execution batches with no file conflicts
- Stories in same batch can run in parallel (same branch)

#### Step 3: Execute Batch (Parallel Agents)

For each story in batch, spawn agents in parallel:

```
# Spawn implementation agents (parallel, same branch)
Task(
  subagent_type: "frontend-agent",
  prompt: "
    STORY: {story_id}
    SPEC: {story_spec}

    Implement this story. Run tests until ALL pass.
    Return: { status: 'complete'|'stuck', summary: '...' }
  ",
  run_in_background: true
)

Task(
  subagent_type: "backend-agent",
  prompt: "
    STORY: {story_id}
    SPEC: {story_spec}
    ...
  ",
  run_in_background: true
)
```

File-grouping ensures parallel agents don't touch same files.

#### Step 4: Test + Review Loop (Per Story)

Each agent runs this loop. **Tests AND code review must pass.**

```
MAX_RETRIES = 10
impl_change_log = []  # Track what was changed for reviewer context
review_attempt = 0    # Track review-specific attempts

for attempt in range(MAX_RETRIES):

    # ═══════════════════════════════════════════
    # PHASE 1: Tests (must pass before review)
    # ═══════════════════════════════════════════

    unit = run("pnpm test --related {files}")
    lint = run("pnpm lint {files}")
    type = run("pnpm typecheck")

    if not (unit.pass and lint.pass and type.pass):
        # Fix test failures
        if not unit.pass:
            analyze_test_failure(unit.output)
            fix_code()
        if not lint.pass:
            run("pnpm lint --fix")
        if not type.pass:
            analyze_type_errors(type.output)
            fix_types()
        continue  # Retry tests

    # ═══════════════════════════════════════════
    # PHASE 2: Code Review (after tests pass)
    # ═══════════════════════════════════════════

    review_attempt += 1

    # Build review context with change explanations
    review_context = {
        files_changed: {files},
        story_spec: {spec},
        test_results: {unit, lint, type},
        attempt: review_attempt
    }

    # After first review, include what changed to address previous findings
    if review_attempt > 1 and impl_change_log:
        review_context.changes_since_last_review = impl_change_log
        impl_change_log = []  # Reset for next round

    review = invoke_code_review_agent(review_context)

    if review.approved:
        # ═══════════════════════════════════════
        # PHASE 3: Browser QA (after review passes)
        # ═══════════════════════════════════════

        browser_qa = run_browser_qa(story_spec.qa_steps)
        if browser_qa.pass:
            return { status: "complete", summary: "..." }
        else:
            # Fix UI issues, loop back
            analyze_browser_failure(browser_qa)
            fix_ui()
            continue
    else:
        # ═══════════════════════════════════════
        # PHASE 2b: Fix Review Findings
        # ═══════════════════════════════════════

        for finding in review.findings:
            if finding.severity in ["CRITICAL", "HIGH"]:
                fix_result = apply_fix(finding)

                # Log the change for next review round
                impl_change_log.append({
                    "finding": finding.issue,
                    "file": finding.file,
                    "action_taken": fix_result.description,
                    "lines_changed": fix_result.diff_summary
                })

        # Loop back - tests will re-run, then re-review
        continue

return { status: "stuck", summary: "Failed after {MAX_RETRIES} attempts" }
```

### Code Review Agent Integration

The implementation agent invokes `code-review-agent` after tests pass:

```
Task(
  subagent_type: "code-review-agent",
  prompt: "
    ## Review Request

    Story: {story_id}
    Review Attempt: {attempt} of {MAX_RETRIES}

    Files changed:
    - {file_path}: {change_description}

    Test results: ALL PASSING
    - Unit: {count} passed
    - Lint: 0 errors
    - TypeCheck: 0 errors

    ## Changes Since Last Review (if attempt > 1)
    The following changes were made to address your previous findings:

    | Finding | File | Action Taken | Lines Changed |
    |---------|------|--------------|---------------|
    | {finding_1} | {file_1} | {action_1} | {diff_summary_1} |
    | {finding_2} | {file_2} | {action_2} | {diff_summary_2} |

    Please verify these changes address the issues you raised.

    ## Review Criteria
    - Correctness: Does it meet acceptance criteria?
    - Security: OWASP top 10, input validation
    - Architecture: Clean architecture layers respected?
    - Patterns: Consistent with existing codebase?
    - Edge cases: Error handling complete?

    ## Response Format
    {
      approved: true/false,
      findings: [
        { severity: 'CRITICAL'|'HIGH'|'MEDIUM'|'LOW',
          issue: '...',
          file: '...',
          suggestion: '...' }
      ],
      summary: '...'
    }
  "
)
```

**Review Loop Rules:**
- Tests must pass BEFORE code review (don't waste review on broken code)
- CRITICAL/HIGH findings → must fix → re-review
- MEDIUM/LOW findings → log to CLAUDE.md → proceed
- Max 10 total attempts (tests + review combined)
- Browser QA only runs after review approved

#### Step 5: Browser QA Protocol

```python
def run_browser_qa(qa_steps):
    results = []

    # Use Chrome DevTools MCP (official, not deprecated Puppeteer)
    chrome_devtools.navigate_page(url)
    chrome_devtools.wait_for(selector="body")  # Ensure page ready

    for step in qa_steps:
        if step.type == "screenshot":
            chrome_devtools.take_screenshot()
            # Agent visually verifies screenshot

        if step.type == "click":
            chrome_devtools.click(selector=step.selector)

        if step.type == "fill":
            chrome_devtools.fill(selector=step.selector, value=step.value)

        if step.type == "assert_visible":
            result = chrome_devtools.evaluate_script(
                f"!!document.querySelector('{step.selector}')"
            )
            results.append(result)

        if step.type == "assert_no_console_errors":
            messages = chrome_devtools.list_console_messages()
            errors = [m for m in messages if m.level == "error"]
            results.append(len(errors) == 0)

        if step.type == "assert_network":
            requests = chrome_devtools.list_network_requests()
            found = any(r.url == step.expected_url and r.status == step.expected_status
                       for r in requests)
            results.append(found)

    return all(results)
```

#### Step 6: Commit Approved Batch

When all agents in batch return `status: "complete"`:

```bash
# Stage batch files
git add {files_from_batch}

# Commit with descriptive message
git commit -m "feat(epic-{N}): batch {X} - stories {story_list}

Implemented:
- {story_id}: {brief description}
- {story_id}: {brief description}

Code review: APPROVED
"

# Update state
for story in batch:
    add_to_completedStories(story.id)
```

#### Step 7: Handle Stuck Stories

When agent returns `status: "stuck"`:

```bash
# Log to stuck file
append_to_stuck_log(story_id, agent_summary, last_error)

# Update state
add_to_stuckStories(story_id)

# Continue with remaining stories in batch
# Don't block other parallel agents
```

Stuck stories are logged but don't halt the workflow.

#### Step 8: Integration Test (After All Batches)

After all stories merged to main:

```bash
# Full test suite on main
pnpm test
pnpm lint
pnpm typecheck
pnpm build

# Full browser QA
run_full_browser_qa()

# If failures, create fix stories
if failures:
    create_fix_stories(failures)
    run_fix_batch()
```

---

## State Management

### State File Structure

```json
{
  "workflow": "claude-autonomous",  // REQUIRED: Identifies which workflow created this state
  "workflowVersion": "1.9.0",       // Version for compatibility checking
  "epic": "20",
  "phase": "implementation",
  "status": "executing",
  "currentBatch": 2,
  "totalBatches": 5,
  "batches": {
    "1": {
      "stories": ["20.1.1", "20.1.2", "20.1.3"],
      "status": "complete",
      "committedAt": "2026-01-16T10:30:00Z"
    },
    "2": {
      "stories": ["20.2.1", "20.2.2"],
      "status": "in_progress",
      "storyStatus": {
        "20.2.1": { "status": "testing", "attempt": 3 },
        "20.2.2": { "status": "complete" }
      }
    }
  },
  "completedStories": ["20.1.1", "20.1.2", "20.1.3", "20.2.2"],
  "stuckStories": [],
  "testResults": {
    "unit": { "pass": 142, "fail": 0 },
    "lint": { "errors": 0, "warnings": 3 },
    "typecheck": { "errors": 0 },
    "browserQA": { "pass": 8, "fail": 0 }
  },
  "startedAt": "2026-01-16T09:00:00Z",
  "checkpointedAt": "2026-01-16T10:35:00Z"
}
```

### Checkpoint Triggers

State is saved after:
- Story test attempt completed
- Story status changed (complete/stuck)
- Batch committed
- Any error

### Resume Protocol

On `/claude-implement` with existing state:

```python
state = read_state_if_exists()

# ═══════════════════════════════════════════════════════════════
# WORKFLOW COMPATIBILITY CHECK
# Prevents accidentally mixing Claude and Opus-GPT workflows
# ═══════════════════════════════════════════════════════════════

if state:
    if state.workflow != "claude-autonomous":
        error(f"""
        ⚠️  WORKFLOW MISMATCH DETECTED

        This epic was started with: {state.workflow}
        You are trying to run: claude-autonomous

        Options:
        1. Continue with original workflow: /{state.workflow.replace('-', ' ')}
        2. Start fresh (loses progress): rm tasks/epic-{epic}/.orchestrator-state.json
        3. Manually migrate state (advanced)

        Cannot proceed with mismatched workflow.
        """)
        output("<promise>EXIT_MODE</promise>")
        return

if state and state.phase == "implementation":
    current_batch = state.batches[state.currentBatch]

    # Check in-progress stories
    for story_id, story_state in current_batch.storyStatus.items():
        if story_state.status == "testing":
            # Resume test loop for this story
            resume_story_agent(story_id, story_state.attempt)
        elif story_state.status == "complete":
            # Already done, skip
            pass

    # If batch complete, commit and move to next
    if all_stories_complete(current_batch):
        commit_batch(current_batch)
        continue_from_batch(state.currentBatch + 1)
```

---

## Agent Definitions

### orchestrator-claude (Main)

**Role:** Coordinate workflow, minimal context
**Tools:** Task, Read (state files only), Write (state files only), Bash (git commands)
**Context:** Epic number, state file, batch plan

### plan-agent

**Role:** Create sprint/story specifications
**Tools:** Glob, Grep, Read, Write
**Context:** Epic goals, codebase access
**Output:** Sprint/story markdown files

### file-grouping-agent

**Role:** Analyze file conflicts, create parallel batches
**Tools:** Read
**Context:** Story specs only
**Output:** Batch execution plan

### frontend-agent

**Role:** Implement frontend stories
**Tools:** Read, Write, Edit, Bash, Glob, Grep, MCPSearch (Playwright)
**Context:** Story spec, relevant files
**Output:** `{ status: 'complete'|'stuck', summary: '...' }`

### backend-agent

**Role:** Implement backend stories
**Tools:** Read, Write, Edit, Bash, Glob, Grep
**Context:** Story spec, relevant files
**Output:** `{ status: 'complete'|'stuck', summary: '...' }`

### architect-agent

**Role:** Review specs for structural/architectural issues (FAST pre-filter)
**Tools:** Read, Grep, Glob
**Context:** Story specs only
**Output:** `{ approved: bool, findings: [], summary: '...' }`

**Checklist:**
- File size (>500 lines = flag)
- Single responsibility
- Module boundaries
- Decomposition needs
- Technical debt prevention

**Speed:** ~30 seconds per review

**When invoked:** AFTER plan-agent, BEFORE spec-review-agent

### spec-review-agent

**Role:** Review specs for feasibility and accuracy (THOROUGH validation)
**Tools:** Read, Grep, Glob
**Context:** Story specs (architecture already approved)
**Output:** `{ approved: bool, findings: [], summary: '...' }`

**Checklist:**
- File path accuracy
- Pattern consistency
- Cross-story dependencies
- Parallel execution conflicts
- Acceptance criteria testability

**Speed:** ~2 minutes per review

**When invoked:** AFTER architect-agent approves

### code-review-agent

**Role:** Review implementation code for quality (IMPLEMENTATION PHASE ONLY)
**Tools:** Glob, Grep, Read, Bash
**Context:** Files changed in story
**Output:** `{ approved: bool, findings: [] }`

**Checklist:**
- Test coverage (70% minimum)
- Security (OWASP top 10)
- Architecture compliance
- Code quality
- Error handling

**When invoked:** AFTER tests pass, during implementation phase

---

## Scoped CLAUDE.md Routing

> **WHY:** Prevents root CLAUDE.md bloat. Learnings accumulate where relevant.
> Each domain owns its rules. Context loaded on-demand (saves tokens).

### File Locations

| File | Scope | What to Append |
|------|-------|----------------|
| `/CLAUDE.md` | Project-wide | Architectural patterns, cross-cutting concerns |
| `/apps/web/CLAUDE.md` | Frontend | React/Next.js patterns, UI conventions, component rules |
| `/packages/backend/CLAUDE.md` | Backend | API patterns, DB conventions, service rules |
| `/tasks/CLAUDE.md` | Planning | Story format, spec conventions, task rules |

### Auto-Routing Logic

When circuit breaker triggers or review finds recurring issues:

```python
def append_learning_to_scoped_claude_md(issue):
    """
    Route learnings to the appropriate scoped CLAUDE.md file.
    Keeps root CLAUDE.md lean.
    """
    file_path = issue.file or issue.story_file or ""

    if file_path.startswith("apps/web/"):
        target = "/apps/web/CLAUDE.md"
    elif file_path.startswith("packages/backend/"):
        target = "/packages/backend/CLAUDE.md"
    elif file_path.startswith("tasks/") or issue.type == "spec":
        target = "/tasks/CLAUDE.md"
    else:
        target = "/CLAUDE.md"

    learning = f"""
## {issue.summary}
**Learned from:** Epic {issue.epic}, Story {issue.story}
**Issue:** {issue.description}
**Rule:** {issue.lesson}
"""

    append_to_file(target, learning)
    log(f"Learning appended to {target}")
```

### When to Append

1. **Circuit breaker triggers** (same error 3x) → Append to scoped CLAUDE.md
2. **Review finds pattern violation** → Append if likely to recur
3. **Architectural issue discovered** → Append to root CLAUDE.md

### Example Learning Entry

```markdown
## Don't add to ChatServer.ts
**Learned from:** Epic 20, Story 20.2.1
**Issue:** ChatServer.ts is 2800 lines. Adding more creates unmaintainable monolith.
**Rule:** Any new chat feature must extract to separate handler file first.
```

---

## Browser QA Specification

### Story Spec Format

Each story spec includes QA steps:

```markdown
## Browser QA Steps

1. Navigate to `/settings`
2. Assert visible: "User Settings" heading
3. Click: "Edit Profile" button
4. Fill: name input with "Test User"
5. Click: "Save" button
6. Assert visible: "Profile updated" toast
7. Assert no console errors
8. Assert network: POST /api/user/profile returns 200
```

### QA Step Types

| Step | MCP Tool | Verification |
|------|----------|--------------|
| `navigate` | `browser_navigate` | Page loads without error |
| `assert_visible` | `browser_snapshot` | Element in accessibility tree |
| `click` | `browser_click` | No error thrown |
| `fill` | `browser_fill` | Value entered |
| `type` | `browser_type` | Keys sent |
| `screenshot` | `browser_take_screenshot` | Visual inspection by agent |
| `assert_no_console_errors` | `browser_console_messages` | No error-level messages |
| `assert_network` | `browser_network_requests` | Expected request found |
| `evaluate` | `browser_evaluate` | JS assertion returns true |

### Visual Verification

Agent uses multimodal capability to verify screenshots:

```
1. Take screenshot
2. Agent receives image
3. Agent verifies:
   - Expected elements visible
   - Layout correct
   - No visual glitches
   - Matches design spec
4. Return pass/fail with description
```

---

## Commands (Skills)

> **FOR FUTURE CLAUDE SESSIONS:** These are Claude Code 2.1+ skills with optimized frontmatter.
> Key features: `context: fork` (isolated context), hooks (Ralph Wiggum), hot reload (edit without restart).

### /claude-plan

```markdown
---
description: Claude-only planning phase with two-stage spec review
context: fork
allowed-tools: Read, Write, Edit, Bash, Grep, Glob, Task
---

# Claude Plan

> **WHY context: fork?** Planning involves reading many files, creating specs,
> reviewing iterations. Forked context keeps main session clean for monitoring.

> **WHY two-stage review?** Architect catches structural issues (3K line files,
> tech debt) in 30s. Spec review validates feasibility in 2min. Fast pre-filter
> prevents wasted time reviewing infeasible specs with bad structure.

## Workflow
1. Gather epic context (JIT - read goals file only)
2. Spawn plan-agent → create specs (agent reads codebase, not orchestrator)
3. Spawn architect-agent → review structure (~30s)
   - Loop until approved (no human pushback needed)
   - Catches: decomposition needs, module boundaries, tech debt
4. Spawn spec-review-agent → review feasibility (~2min)
   - Loop until approved (no human pushback needed)
   - Catches: path errors, pattern mismatches, dependency ordering
5. Commit specs
6. Output: PLAN_APPROVED

## Review Pipeline
```
Plan Agent → Architect (30s) → Spec Review (2min) → Approved
                 ↑                    ↑
           Fix structure        Fix feasibility
           (isolated loop)      (isolated loop)
```

## State File
`/tasks/epic-{N}/.orchestrator-state.json`

## Completion Promises
- `PLAN_APPROVED` - specs ready for implementation
- `PLAN_STUCK_ARCHITECTURE` - structural issues unresolvable
- `PLAN_STUCK_FEASIBILITY` - feasibility issues unresolvable
```

### /claude-implement

```markdown
---
description: Claude-only implementation with parallel agents and browser QA
context: fork
allowed-tools: Read, Write, Edit, Bash, Grep, Glob, Task, MCPSearch
hooks:
  Stop:
    - path: .claude/hooks/stop.sh
---

# Claude Implement

> **WHY context: fork?** Implementation runs for hours across many stories.
> Forked context prevents main session exhaustion. State file enables resume.

> **WHY Stop hook?** Ralph Wiggum pattern - blocks exit until EPIC_COMPLETE found.
> Enables autonomous multi-hour runs without human intervention.

## Workflow
1. Load/create state (JIT - don't load all specs upfront)
2. Spawn file-grouping-agent → get batches
3. For each batch:
   a. Spawn specialist agents (parallel, background)
   b. Each agent: test loop → code review loop → browser QA
   c. Commit approved batch
   d. Checkpoint state immediately
4. Run integration tests on main
5. Run full browser QA (Chrome DevTools MCP, foreground only)
6. Create fix stories if needed
7. Output: EPIC_COMPLETE

## State File
`/tasks/epic-{N}/.orchestrator-state.json`

## Completion Promise
Output `EPIC_COMPLETE` when done. Stop hook checks for this exact string.
```

### Ralph Wiggum Stop Hook

**File:** `.claude/hooks/stop.sh`

```bash
#!/bin/bash
# WHY: Keeps Claude running until completion promise found.
# Without this, Claude exits after each response and workflow stops.

COMPLETION_PROMISE="${COMPLETION_PROMISE:-EPIC_COMPLETE}"
MAX_ITERATIONS="${MAX_ITERATIONS:-50}"
ITERATION_FILE="/tmp/claude-iteration-count"

# ═══════════════════════════════════════════════════════════════
# EXIT PROMISES - These allow clean exit from workflow mode
# ═══════════════════════════════════════════════════════════════
EXIT_PROMISES="EPIC_COMPLETE|PLAN_APPROVED|PLAN_APPROVED_WITH_WARNINGS|PAUSE_REQUESTED|EXIT_MODE|PLAN_STUCK"

# Track iterations (safety net)
if [ -f "$ITERATION_FILE" ]; then
    count=$(cat "$ITERATION_FILE")
    count=$((count + 1))
else
    count=1
fi
echo "$count" > "$ITERATION_FILE"

# Safety: max iterations prevents infinite loops
if [ "$count" -ge "$MAX_ITERATIONS" ]; then
    echo "Max iterations ($MAX_ITERATIONS) reached. Stopping."
    rm -f "$ITERATION_FILE"
    exit 0  # Allow exit
fi

# Check for ANY exit promise in Claude's output
if echo "$CLAUDE_OUTPUT" | grep -qE "$EXIT_PROMISES"; then
    matched=$(echo "$CLAUDE_OUTPUT" | grep -oE "$EXIT_PROMISES" | head -1)
    echo "Exit promise found: $matched"
    rm -f "$ITERATION_FILE"
    exit 0  # Allow exit
fi

# Not complete - block exit, re-inject prompt
echo "Iteration $count/$MAX_ITERATIONS: Continuing..."
exit 2  # Exit code 2 = re-run with same prompt
```

### Skill Hot Reload

**WHY:** Claude Code 2.1+ supports hot reload. Edit skills without restarting session.

```bash
# Edit skill
vim .claude/commands/claude-implement.md

# Changes take effect immediately - no restart needed
# Test with: /claude-implement
```

---

## Error Handling

### Stuck Story Protocol

After MAX_RETRIES (10):
1. Log final error to `.stuck-log.md`
2. Add to `stuckStories` in state
3. Continue with other stories in batch
4. At end of epic, report stuck stories to user

```markdown
## .stuck-log.md format

### Story 20.2.1 - STUCK
**Attempts:** 10
**Last Error:** TypeError: Cannot read property 'foo' of undefined
**Files Modified:** src/components/Foo.tsx, src/hooks/useFoo.ts
**Summary:** Agent could not resolve type mismatch between...
```

### Browser QA Failures

```python
if browser_qa_fail:
    # Capture diagnostics
    screenshot = take_screenshot()
    console = get_console_messages()
    network = get_network_requests()

    # Analyze with multimodal
    analysis = analyze_failure(screenshot, console, network, expected)

    # Attempt fix
    if analysis.fixable:
        apply_fix(analysis.suggestion)
        retry()
    else:
        mark_stuck(analysis.reason)
```

### Context Window Exhaustion

If agent approaches context limit:
1. Checkpoint current state
2. Return partial summary
3. Orchestrator spawns fresh agent with state

---

## Recovery Protocol

> **FOR FUTURE CLAUDE SESSIONS:** This section handles what happens when the loop
> breaks unexpectedly - crashes, context exhaustion, user interruption, etc.
> The goal is automatic resume without losing progress.

### 1. Automatic Restart Detection

On `/claude-implement` or `/claude-plan` start:

```python
state = read_state_if_exists()

if state and state.status == "in_progress":
    # RESTART detected - previous run didn't complete
    log(f"Resuming from iteration {state.iteration}, batch {state.currentBatch}")

    # Verify git history matches state
    last_commit = run("git log -1 --format=%H")
    if last_commit != state.last_commit:
        log("WARNING: Git history diverged from state. Reconciling...")
        reconcile_state_with_git()

    # Check for partial work in current story
    if state.current_story_in_progress:
        log(f"Story {state.current_story} was in progress. Checking status...")
        if tests_pass_for_story(state.current_story):
            mark_story_complete(state.current_story)
        # Otherwise, retry from where we left off

    continue_from_state(state)
else:
    start_fresh()
```

### 2. Circuit Breaker (Prevents Infinite Loops on Same Error)

```python
SAME_ERROR_THRESHOLD = 3

def handle_error(error):
    if error_signature(error) == state.last_error_signature:
        state.same_error_count += 1
    else:
        state.same_error_count = 1
        state.last_error_signature = error_signature(error)

    save_state()

    if state.same_error_count >= SAME_ERROR_THRESHOLD:
        log(f"Circuit breaker: Same error {SAME_ERROR_THRESHOLD}x")

        # Add to scoped CLAUDE.md so future sessions know
        append_to_claude_md(
            scope=get_scope_for_file(error.file),
            rule=f"Known issue: {error.summary} - requires manual fix"
        )

        # Mark story stuck and move on
        mark_story_stuck(
            story=state.current_story,
            reason=f"Same error {SAME_ERROR_THRESHOLD}x: {error.summary}",
            last_error=error
        )
        move_to_next_story()
        return

    # Not at threshold yet - retry
    retry_current_story()
```

### 3. Session Expiration

```python
SESSION_TIMEOUT_HOURS = 24

def check_session_validity():
    if not state.started_at:
        return True  # New session

    hours_elapsed = (now() - state.started_at).hours

    if hours_elapsed >= SESSION_TIMEOUT_HOURS:
        log(f"Session expired ({hours_elapsed}h > {SESSION_TIMEOUT_HOURS}h)")
        log("Resetting retry counters but preserving completed work")

        # Keep progress, reset counters
        state.iteration = 0
        state.same_error_count = 0
        state.last_error_signature = None
        state.started_at = now()  # New session start
        # completedStories preserved
        # stuckStories preserved

        save_state()
        return True

    return True
```

### 4. Manual Recovery Commands

**During workflow - just say these words:**
```
"pause"   → Saves state, exits cleanly, resume later with /claude-implement
"exit"    → Saves state, returns to normal chat mode
"status"  → Shows progress without exiting
"skip"    → Marks current story stuck, continues to next
```

**From terminal:**
```bash
# ─────────────────────────────────────────────────────────
# RESUME - Continue from last checkpoint
# ─────────────────────────────────────────────────────────
/claude-implement epic 20
# Automatically detects existing state and continues

/claude-plan epic 20
# Same for planning - detects state and continues

# ─────────────────────────────────────────────────────────
# FORCE RESTART - Clear state but keep git history
# ─────────────────────────────────────────────────────────
rm /tasks/epic-20/.orchestrator-state.json
/claude-implement epic 20
# Starts fresh but agent sees previous commits via git log

# ─────────────────────────────────────────────────────────
# FULL RESET - Start completely over
# ─────────────────────────────────────────────────────────
rm /tasks/epic-20/.orchestrator-state.json
git reset --hard origin/main  # Or appropriate branch
/claude-implement epic 20
```

**How the stop hook recognizes exit commands:**
```bash
# These promises all trigger clean exit:
EXIT_PROMISES="EPIC_COMPLETE|PLAN_APPROVED|PLAN_APPROVED_WITH_WARNINGS|PAUSE_REQUESTED|EXIT_MODE|PLAN_STUCK"

# When agent outputs any of these, hook allows exit
# State is preserved at last checkpoint
```

### 5. State File Recovery Fields

Add these fields to `.orchestrator-state.json`:

```json
{
  "recovery": {
    "last_commit": "abc123...",
    "last_error_signature": "TypeError:undefined:ChatServer.ts:245",
    "same_error_count": 2,
    "session_started_at": "2026-01-17T09:00:00Z",
    "total_iterations": 15,
    "last_checkpoint_at": "2026-01-17T10:35:00Z",
    "pause_requested": false
  }
}
```

### 6. Reconcile State with Git

When state and git history diverge (e.g., manual commits):

```python
def reconcile_state_with_git():
    """
    Sync state file with actual git history.
    Git is source of truth for what's implemented.
    """

    # Get commits since epic started
    commits = git_log_since(state.started_at)

    # Extract story IDs from commit messages
    implemented_stories = []
    for commit in commits:
        # Expect format: "feat(epic-20): story 20.1.1 - description"
        match = extract_story_id(commit.message)
        if match:
            implemented_stories.append(match)

    # Update state to match git
    for story in implemented_stories:
        if story not in state.completedStories:
            log(f"Reconciling: {story} found in git but not in state")
            state.completedStories.append(story)

    # Update last_commit
    state.recovery.last_commit = git_log_1_hash()
    save_state()
```

### 7. Stop Hook Update (for PAUSE support)

Update `.claude/hooks/stop.sh`:

```bash
#!/bin/bash
COMPLETION_PROMISE="${COMPLETION_PROMISE:-EPIC_COMPLETE}"
PAUSE_PROMISE="PAUSE_REQUESTED"
MAX_ITERATIONS="${MAX_ITERATIONS:-50}"
ITERATION_FILE="/tmp/claude-iteration-count"

# Track iterations
if [ -f "$ITERATION_FILE" ]; then
    count=$(cat "$ITERATION_FILE")
    count=$((count + 1))
else
    count=1
fi
echo "$count" > "$ITERATION_FILE"

# Safety: max iterations
if [ "$count" -ge "$MAX_ITERATIONS" ]; then
    echo "Max iterations ($MAX_ITERATIONS) reached. Stopping."
    rm -f "$ITERATION_FILE"
    exit 0
fi

# Check for completion promise
if echo "$CLAUDE_OUTPUT" | grep -q "$COMPLETION_PROMISE"; then
    echo "Completion promise found: $COMPLETION_PROMISE"
    rm -f "$ITERATION_FILE"
    exit 0
fi

# Check for pause request
if echo "$CLAUDE_OUTPUT" | grep -q "$PAUSE_PROMISE"; then
    echo "Pause requested. State preserved for resume."
    rm -f "$ITERATION_FILE"
    exit 0
fi

# Not complete - block exit, re-inject prompt
echo "Iteration $count/$MAX_ITERATIONS: Continuing..."
exit 2
```

---

## Performance Optimizations

### Parallel Agents (Same Branch)

- Up to 4 concurrent agents per batch (configurable)
- File-grouping ensures no conflicts
- Agents share same node_modules (no duplication)
- No disk overhead from worktrees

### Test Optimization

```bash
# Run only related tests (not full suite)
pnpm test --related {changed_files}

# Cache TypeScript compilation
pnpm typecheck --incremental

# Lint only changed files
pnpm lint {changed_files}
```

### Context Minimization

| Component | Context Size | Strategy |
|-----------|--------------|----------|
| Orchestrator | ~2K tokens | State file + batch IDs only |
| Worktree agent | ~8K tokens | Story spec + relevant files |
| Review agent | ~6K tokens | Files to review only |
| Plan agent | ~10K tokens | Goals + codebase search |

---

## Comparison: Claude-Only vs Opus-GPT

| Aspect | Claude-Only | Opus-GPT |
|--------|-------------|----------|
| **Review** | code-review-agent (Claude) | GPT external review |
| **Pushback** | None (auto-iterate) | 7-round pushback |
| **Parallelism** | File grouping + parallel agents | File grouping batches |
| **Worktrees** | Epic-level only | Not used |
| **Browser QA** | Playwright MCP | Manual verification |
| **Context** | Aggressive optimization | Standard |
| **Latency** | Lower (no external calls) | Higher (GPT roundtrips) |
| **Cost** | Opus tokens only | Opus + GPT tokens |
| **Quality gate** | Tests + code review pass | GPT approval |
| **Loop mechanism** | Ralph Wiggum hook | Manual orchestration |

---

## References

- [Git Worktrees Documentation](https://git-scm.com/docs/git-worktree)
- [Chrome DevTools MCP (Official)](https://github.com/ChromeDevTools/chrome-devtools-mcp) - Use this for Browser QA
- [Chrome DevTools MCP (npm)](https://www.npmjs.com/package/chrome-devtools-mcp)
- [Claude Code Task Tool](https://docs.anthropic.com/claude-code/task-tool)
- [Ralph Wiggum Plugin (GitHub)](https://github.com/anthropics/claude-code/tree/main/plugins/ralph-wiggum)
- [Ralph Wiggum Explained (Medium)](https://jpcaparas.medium.com/ralph-wiggum-explained-the-claude-code-loop-that-keeps-going-3250dcc30809)
- [Opus-GPT Automation Plan](./opus-gpt-automation-plan.md)

**Deprecated (do not use):**
- ~~Playwright MCP~~ - Less capable than Chrome DevTools MCP
- ~~@modelcontextprotocol/server-puppeteer~~ - Officially deprecated

---

## Changelog

### v1.9.0 (2026-01-17)
- **Architect Final Say:** Max retries increased to 5, architect gets final say (no hard stop)
- **Change Explanations:** When resubmitting to reviewers, include summary of what changed
- **Mode Exit Commands:** Added "pause", "exit", "status", "skip" commands during workflow
- **Workflow Identifier:** Added `workflow` and `workflowVersion` fields to state file
- **Compatibility Check:** Detects and warns if epic was started with different workflow (opus-gpt vs claude-autonomous)
- Replaced `PLAN_STUCK_ARCHITECTURE` with `PLAN_APPROVED_WITH_WARNINGS`
- Added `EXIT_MODE` promise for returning to normal chat
- Architect warnings logged to CLAUDE.md for implementation agent awareness
- Added `changes_since_last_review` context to all review loops (architect, spec, code)
- Updated stop hook to recognize all exit promises via regex
- Added "Exiting Workflow Mode" documentation section

### v1.8.0 (2026-01-17)
- **Spec Final Pass:** Holistic cross-sprint review after all sprints individually approved
- **Scoped CLAUDE.md Routing:** Auto-route learnings to appropriate scoped file
- **Key Parameters Table:** Single source of truth for all tunable values
- Added `PLAN_STUCK_INTEGRATION` completion promise for cross-sprint failures
- Added Review Pipeline Summary diagram
- Updated Context optimization notes

### v1.7.0 (2026-01-17)
- **Recovery Protocol:** Comprehensive restart/resume handling
- Added automatic restart detection (checks state on start)
- Added circuit breaker (3x same error → mark stuck, move on)
- Added session expiration (24hr timeout, reset retry counters)
- Added manual recovery commands (PAUSE, RESUME, FORCE RESTART, FULL RESET)
- Added state reconciliation with git history
- Updated stop hook with PAUSE_REQUESTED support
- Added `recovery` fields to state file schema

### v1.6.0 (2026-01-16)
- **Two-stage spec review:** architect-agent (fast, ~30s) → spec-review-agent (thorough, ~2min)
- Added `architect-agent.md` - catches decomposition needs, module boundaries, technical debt
- Added `spec-review-agent.md` - validates feasibility, paths, patterns, dependencies
- Updated Phase 1 with gated review pipeline (each loop isolated)
- `code-review-agent` now used ONLY in implementation phase
- Added new completion promise: `PLAN_STUCK_FEASIBILITY`
- Updated /claude-plan skill with two-stage workflow explanation

### v1.5.0 (2026-01-16)
- Added comprehensive "WHY" explanations for future Claude sessions
- Added `context: fork` to skills (isolated context per epic)
- Added JIT retrieval pattern documentation
- Added Context Rot prevention strategies
- Added Sub-Agent Return Format (summary vs full logs)
- Updated Commands section with full skill frontmatter examples
- Added Skill Hot Reload documentation
- Moved Ralph Wiggum hook to Commands section with inline comments

### v1.4.0 (2026-01-16)
- Switched Browser QA to Chrome DevTools MCP (official Google)
- Deprecated Playwright MCP and Puppeteer MCP references
- Added native `list_console_messages`, `list_network_requests` tools
- Updated Browser QA Protocol with Chrome DevTools examples

### v1.3.0 (2026-01-16)
- Added explicit code review loop to implementation phase (Step 4)
- Added explicit spec review loop to planning phase (Phase 1)
- Tests must pass BEFORE code review (no wasted reviews)
- CRITICAL/HIGH findings trigger fix + re-review cycle
- MEDIUM/LOW findings logged to CLAUDE.md but don't block

### v1.2.0 (2026-01-16)
- Simplified worktrees to epic-level only (not per-story)
- Parallel agents now run on same branch (file-grouping prevents conflicts)
- Updated state structure to track batches instead of worktrees
- Replaced worktree-impl-agent with frontend-agent/backend-agent
- Updated architecture diagram to show batch-based flow

### v1.1.0 (2026-01-16)
- Added Ralph Wiggum hook for native exit interception
- Added stop hook configuration (`.claude/hooks/stop.sh`)
- Added comparison table: vanilla Ralph vs our implementation
- Updated architecture to show hook integration

### v1.0.0 (2026-01-16)
- Initial design
- Self-correcting test loops
- Browser QA with Playwright MCP
- Context window optimization strategies
