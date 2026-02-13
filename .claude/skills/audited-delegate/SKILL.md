---
name: audited-delegate
description: Opus-GPT workflow with pre-planning audit and post-batch review swarm. Wraps existing spec-design and implement skills with quality gates. Use for full epic execution with audit + swarm + Codex.
allowed-tools: Read, Write, Edit, Bash, Grep, Glob, Task, WebFetch
model: opus
---

# Audited Delegate - Opus-GPT with Quality Gates

Wraps existing `/spec-design` and `/implement` workflows. Adds two gates:
- **Pre-planning audit** (parallel agents) — feeds verified codebase facts into plan-agent
- **Post-batch review swarm** (agent team) — deep cross-cutting review before Codex gate

Existing skills are NOT modified. This skill orchestrates around them.

---

## Phase 1: Gather Input

Ask user for:
1. **Epic number**
2. **Goals document** location
3. **Scope** (full epic, single sprint, specific stories)

---

## Phase 2: Pre-Planning Codebase Audit

**Purpose:** Produce verified facts so plan-agent builds specs on reality, not assumptions.

**Spawn 3 parallel agents** (NOT a team — outputs are additive, not interdependent):

```python
# Agent 1: Cascade Chain Auditor
Task(
  subagent_type="Explore",
  prompt="""Trace the full cascade for the feature area described in {goals_doc}.
    For each relevant pipeline, trace: tool schema -> validator -> DB schema -> types -> export -> narrative prompt -> template.
    Report: what exists, what's missing, what would need to change.
    Be specific — file paths, line numbers, current signatures.""",
  run_in_background=True
)

# Agent 2: File Boundary Auditor
Task(
  subagent_type="Explore",
  prompt="""Analyze the codebase areas that {goals_doc} will touch.
    Report:
    - Files likely affected and their current LOC (flag any near 300 limit)
    - Layer boundary violations (domain importing from infrastructure, etc.)
    - Shared files that multiple stories might collide on
    - Current test coverage for affected areas""",
  run_in_background=True
)

# Agent 3: Pattern Verifier
Task(
  subagent_type="Explore",
  prompt="""Read {goals_doc} and verify its assumptions against the actual codebase.
    Report:
    - Assumptions that are correct (with file:line evidence)
    - Assumptions that are wrong (what actually exists vs what's assumed)
    - Patterns the feature should follow (based on existing similar features)
    - Dependencies that exist but aren't mentioned""",
  run_in_background=True
)
```

**Merge reports** into `/tasks/epic-{N}/audit-report.md`. This file is consumed by plan-agent.

---

## Phase 3: Planning (Existing Skill)

Invoke plan-agent with audit context injected:

```python
Task(
  subagent_type="plan-agent",
  prompt="""Create sprint and story specifications for Epic {N}.
    Goals: {goals_doc}
    Scope: {scope}

    CRITICAL CONTEXT — Read this FIRST:
    /tasks/epic-{N}/audit-report.md
    This contains verified codebase facts from a pre-planning audit.
    Your specs MUST align with these facts. Do not assume — verify against the audit.

    REQUIREMENTS:
    1. Each story MUST have 'Files Touched' section
    2. Each story MUST have agent assignment
    3. Each story MUST have testable acceptance criteria
    4. Each story MUST have 'Tests Required' and 'Tests Affected' sections
    5. Sprint overview MUST have 'Parallel Execution Strategy'

    Output files to /tasks/epic-{N}/"""
)
```

Then run **GPT sprint spec review loops** (same pattern as `/spec-design` Step 4-5).

---

## Phase 4: Implementation (Existing Skill)

Run implementation batches (same pattern as `/implement` Steps 3-4):
- File-grouping-agent creates batches from specs
- Parallel specialist agents implement each batch
- Verification (tests, lint, typecheck) after each batch

---

## Phase 5: Post-Batch Review Swarm

**After each batch passes verification, BEFORE Codex gate.**

**Purpose:** Deep cross-cutting review via mesh communication. Catches issues before Codex, saving re-review tokens.

**Spawn agent team** (TeamCreate — reviewers need to share findings):

```python
TeamCreate(team_name=f"epic-{N}-batch-{batch_num}-review")

# Reviewer 1: Line-by-Line Reviewer
Task(
  subagent_type="code-reviewer",
  team_name=team_name,
  name="line-reviewer",
  prompt="""Review ALL files changed in this batch line by line.
    Files: {changed_files}
    Focus: correctness, edge cases, error handling, missing validation.
    Share findings with teammates as you go."""
)

# Reviewer 2: Data Flow Tracer
Task(
  subagent_type="code-reviewer",
  team_name=team_name,
  name="flow-tracer",
  prompt="""Trace the data flow for each feature in this batch end to end.
    Start from entry point (API/WebSocket) through services to DB and back.
    Focus: data loss, transformation errors, missing error propagation.
    Cross-reference with line-reviewer findings."""
)

# Reviewer 3: Architecture Compliance
Task(
  subagent_type="code-reviewer",
  team_name=team_name,
  name="arch-reviewer",
  prompt="""Verify strict clean architecture compliance for this batch.
    Focus: layer violations, dependency direction, domain purity, 300 LOC limit.
    Check that no infrastructure leaks into domain, no business logic in controllers.
    Cross-reference with flow-tracer findings on boundary crossings."""
)
```

**Wait for team to complete.** Collect consolidated findings.

**Shut down team** after review.

---

## Phase 6: Codex Gate

Feed the swarm's consolidated findings + batch context to Codex:

```python
# Swarm findings are prepended to Codex prompt so it knows what was already caught
codex_prompt = f"""
Previously caught by review swarm (already fixed or acknowledged):
{swarm_findings_summary}

Your job: find what the swarm MISSED.
Focus on cross-cutting concerns, subtle integration issues, and edge cases.

{standard_codex_review_prompt}
"""
```

Same Opus-GPT review loop (max 7 rounds, pushback/accept pattern).

---

## Phase 7: Completion

- Commit approved batch
- Update CLAUDE.md with learnings
- Report summary to user
- Advance to next batch or finalize epic

---

## Swarm Evolution Notes

The 3-reviewer swarm is the starting point. After running on an epic:

1. Check what Codex caught that the swarm missed
2. If a pattern emerges (e.g., Codex consistently catches type mismatches) — add a focused reviewer for that
3. Target: 3-5 reviewers max per swarm. Beyond 5, orchestration overhead degrades quality.

Track in `/tasks/implementation-logs/` what each gate catches to calibrate over time.

---

## Key Principles

- **Existing skills untouched** — this wraps, never modifies
- **Audit = parallel agents** (additive outputs, no mesh needed)
- **Swarm = agent team** (mesh communication, cross-cutting review)
- **Swarm before Codex** (reduce re-review token cost)
- **Orchestrator stays thin** (route, don't reason)
- **Iterate from evidence** (add reviewers based on what gets caught, not theory)
