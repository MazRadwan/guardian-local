# Guardian Agent Workflow

**Version:** 5.0
**Last Updated:** 2026-02-10

---

## Orchestration Model

Main agent is the **orchestrator**. Delegates all work. Never implements directly.

```
Audit team → /claude-plan (or /spec-design) → /claude-implement (per batch) → Swarm + Codex → User Review → Next batch
```

### Skills vs Workflow Rules

Skills (`/claude-plan`, `/claude-implement`, `/claude-delegate`) handle execution mechanics — creating specs, batching stories, running test+review loops.

Workflow rules add quality gates the skills don't have:

| Gate | When | What |
|------|------|------|
| **Pre-planning audit team** | Before plan-agent creates specs | Reads codebase, produces verified facts specs are built on |
| **Post-batch team swarm** | After skill's per-story code-review | Team of specialists reviews batch (mesh communication) |
| **Codex gate** | After team swarm, before user review | External review catches what internal agents miss |

Skills and workflow rules don't conflict — skills execute, workflow rules wrap quality gates around execution.

---

## Agent Roster

### Specialists

| Agent | Scope | Model |
|-------|-------|-------|
| `backend-agent` | Express, WebSocket, Drizzle, APIs | Opus |
| `frontend-agent` | React, Next.js, UI components | Sonnet |
| `export-agent` | PDF, Word, Excel export | Sonnet |
| `question-gen-agent` | Question generation (Claude) | Sonnet |
| `assessment-agent` | Vendor/assessment management | Sonnet |
| `ui-ux-agent` | UI/UX polish, layouts, styling | Sonnet |
| `setup-agent` | Project setup, database, Docker | Sonnet |
| `auth-agent` | Authentication, user management | Sonnet |
| `bug-fix-agent` | Fix bugs, refine based on feedback | Sonnet |

### Reviewers (Opus)

| Agent | When | Duration |
|-------|------|----------|
| `code-reviewer` | After EACH story | ~5-10 min |
| `final-reviewer` | After ALL stories in epic | ~45-60 min, NOT a rubber stamp |

---

## Story Lifecycle

1. **Specialist reads story specs** from epic file
2. **Implements** feature + tests
3. **Runs tests** — must pass
4. **Code-reviewer** reviews → approves or requests fixes
5. **Iterate** until approved, then next story
6. **After each batch** → swarm review → Codex gate → summary to user, WAIT for approval
7. **Epic complete** → final-reviewer deep audit

### Review Outputs
- `.claude/review-approved.md` or `.claude/review-feedback.md` (per story)
- `.claude/final-review-epic-{N}.md` (per epic)

---

## Parallel Agents vs Agent Teams

### Decision: Do agents need each other's output?

**NO → Parallel agents (Task tool, no team).** Cheaper, simpler, no coordination overhead.
- 3 independent file audits (each reads different files, reports back)
- Frontend + backend stories that touch different files
- Running tests while another agent researches a question
- Multiple Explore agents searching different areas of the codebase

**YES → Agent team (TeamCreate).** Agents communicate, share findings, build on each other's work.
- Source-auditor finds facts → fixers need those facts to implement correctly
- Spec reviewer finds a schema conflict → implementation agent needs to know before coding
- Security reviewer finds auth gap → other reviewers need to check if their areas are affected
- Code reviewer rejects a fix → fixer needs the feedback to iterate (without orchestrator relay)

### The Test

Ask: "If Agent A discovers something unexpected, does Agent B need to know immediately?"
- Yes → team (mesh communication)
- No → parallel agents (independent, report to orchestrator)

### Right-Sizing Teams

| Size | When |
|------|------|
| **Single agent** | 1 file, 1 clear task, no cross-referencing |
| **Team of 2** | Fix + review cycle on a single artifact |
| **Team of 3-4** | Knowledge pipeline (audit → fix → review) or specialist review panel |
| **Team of 5+** | Large cross-cutting reviews or multi-file refactors only |

**Principle:** Teams add value when one agent's output improves another agent's work.

### Knowledge Pipeline Pattern

Upstream agent produces facts, downstream agents consume them.

```
source-auditor → fixers (parallel) → reviewers (parallel)
```

**Rules:**
- Spawn upstream FIRST, wait for output, THEN spawn downstream
- Source agent shares verified facts — downstream works from facts, not assumptions
- Reviewers cross-reference fixes against source, not just story text

**Anti-pattern:** Spawning all agents simultaneously with "wait for X" in prompt.

### Pre-Planning Audit Team

Deploy BEFORE writing any overview/sprints/stories. Reads actual codebase, produces verified facts that specs are built on.

**Composition (Guardian-specific):**
- **Cascade chain auditor** — traces tool schema → validator → DB → types → export → narrative prompt → template
- **File boundary auditor** — checks file collisions between stories, 300 LOC limits, layer boundary violations
- **Pattern verifier** — confirms specs don't assume things that don't exist or miss things that do

**Refine based on what gets caught.** If Codex consistently catches type mismatches, add a types auditor.

### Batching

Orchestrator analyzes stories and groups into parallel batches based on:
- **No file conflicts** — stories in a batch touch different files
- **No dependency chains** — no story in the batch blocks another
- Batch size varies (2, 3, 4+ stories) depending on the epic structure

### Post-Batch Review Gate

Deploy AFTER each parallel batch completes, before Codex and user review.

```
Batch of N parallel stories (per-story code-reviewer each)
  → Team swarm review (specialists in mesh)
  → Codex gate (batch-level)
  → User approval
  → Next batch
```

**Swarm reviewers** cover different angles of the batch (architecture, security, test coverage, consistency). Each has ONE focus. They share findings with each other (mesh, not hub-and-spoke).

### Fix Cycle Pattern

```
1. source-auditor reads files, shares facts
2. fixers edit in parallel (different files)
3. reviewers verify against source facts
```

### Sequencing Rules

- Upstream before downstream — never spawn consumers before producer finishes
- Independent tasks in parallel — different files with no shared deps
- Reviewers AFTER fixers — don't review work that hasn't happened yet
- Shut down completed agents promptly — don't leave idle agents running

### Communication Rules

- Mesh over hub-and-spoke — specialists share findings with each other
- Source agent shares verified facts — downstream agents work from facts, not assumptions
- Team lead orchestrates sequencing — doesn't do the actual work

---

## Bug-Fix Workflow

1. Bug-fix agent reads implementation log (if exists) or git history
2. Investigates root cause
3. Fixes with tests, all tests pass
4. Code-reviewer reviews the fix
5. Commit with `fix:` prefix

---

## Implementation Logs (Optional)

**Location:** `/tasks/implementation-logs/epic-X-[name].md`

Preserve context for session handoffs, bug-fix agent context, and design rationale.

**Source of Truth Hierarchy:**
1. Git history (what code exists)
2. task-overview.md (what's next)
3. Implementation logs (design rationale)

---

## Manual Intervention Points

You decide: when to invoke specialists, whether to fix or override, when to move to next epic, when to stop.

**Agents execute, you orchestrate.**
