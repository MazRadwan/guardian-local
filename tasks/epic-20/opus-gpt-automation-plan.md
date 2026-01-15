# Epic 20: Opus-GPT Automated Workflow Plan

## Overview

Automate the planning and implementation review cycle between Opus (Claude Code) and GPT-5.2 (Codex) with a "pushback" mechanism. User defines scope upfront, then hands off until completion.

**Goals:**
- Minimize user intervention (only entry + completion)
- Opus creates plans/code, GPT-5.2 reviews
- Pushback loop resolves disagreements (GPT final say after 7 retries)
- Parallel execution where file conflicts allow
- Robust error handling with fallbacks

---

## Flowchart

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              ENTRY POINT                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   User: /delegate                                                        │
│                           │                                                 │
│                           ▼                                                 │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │  1. PROMPT INPUT                                                    │   │
│   │                                                                     │   │
│   │  "Paste your orchestrator prompt (goals, context, constraints):"    │   │
│   │                                                                     │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                           │                                                 │
│                           ▼                                                 │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │  2. SCOPE SELECTION                                                 │   │
│   │                                                                     │   │
│   │  "What scope?"                                                      │   │
│   │    [1] Full Epic                                                    │   │
│   │    [2] Single Sprint                                                │   │
│   │    [3] Specific Stories                                             │   │
│   │                                                                     │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                           │                                                 │
│                           ▼                                                 │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │  3. GPT REVIEW PROMPT                                               │   │
│   │                                                                     │   │
│   │  "Custom GPT-5.2 review prompt? [Enter for default]:"               │   │
│   │                                                                     │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                           │                                                 │
│                           ▼                                                 │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │  ORCHESTRATOR TAKES OVER                                            │   │
│   │  (Ralph-style loop with Stop hook)                                  │   │
│   │                                                                     │   │
│   │  Max iterations: 7 per review cycle                                 │   │
│   │  Promises:                                                          │   │
│   │    <promise>SPRINT_SPEC_APPROVED</promise> (per-sprint)             │   │
│   │    <promise>PLAN_APPROVED</promise> (after spec final pass)         │   │
│   │    <promise>BATCH_APPROVED</promise>                                │   │
│   │    <promise>SPRINT_REVIEWED</promise>                               │   │
│   │    <promise>SCOPE_COMPLETE</promise>                                │   │
│   │    <promise>STUCK</promise>                                         │   │
│   │    <promise>ERROR</promise>                                         │   │
│   │                                                                     │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          PLANNING PHASE (Per-Sprint Reviews)                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌──────────────────────┐                                                  │
│   │     plan-agent       │                                                  │
│   │                      │                                                  │
│   │ • Read epic goals    │                                                  │
│   │ • Create ALL sprints │                                                  │
│   │ • Create stories     │                                                  │
│   │ • Write to /tasks/   │                                                  │
│   └──────────┬───────────┘                                                  │
│              │                                                              │
│              ▼                                                              │
│   ┌──────────────────────────────────────────────────────────┐              │
│   │  FOR EACH SPRINT (deep analysis per sprint):             │              │
│   │                                                          │              │
│   │    ┌────────────────────────────────────────────────┐    │              │
│   │    │  GPT-5.2 SPRINT SPEC REVIEW (Deep Analysis)    │    │              │
│   │    │                                                │    │              │
│   │    │  • Search codebase for each file in spec       │    │              │
│   │    │  • Verify no conflicts with existing code      │    │              │
│   │    │  • Check dependencies and patterns             │    │              │
│   │    │  • Identify race conditions, security issues   │    │              │
│   │    │                                                │    │              │
│   │    │  Response: CRITICAL/HIGH/MEDIUM/LOW issues     │    │              │
│   │    └────────────────────┬───────────────────────────┘    │              │
│   │                         │                                │              │
│   │                         ▼                                │              │
│   │    ┌────────────────────────────────────────────────┐    │              │
│   │    │  Re-review loop until approved                 │    │              │
│   │    │  <promise>SPRINT_SPEC_APPROVED</promise>       │    │              │
│   │    └────────────────────────────────────────────────┘    │              │
│   │                                                          │              │
│   └──────────────────────┬───────────────────────────────────┘              │
│                          │                                                  │
│                          ▼                                                  │
│   ┌──────────────────────────────────────────────────────────┐              │
│   │              SPEC FINAL PASS (All Sprints)               │              │
│   │                                                          │              │
│   │  • Review ALL specs together holistically                │              │
│   │  • Check cross-sprint dependencies                       │              │
│   │  • Verify architectural consistency                      │              │
│   │  • Identify integration risks                            │              │
│   │                                                          │              │
│   └──────────────────────┬───────────────────────────────────┘              │
│                          │                                                  │
│                          ▼                                                  │
│              ┌───────────────────────┐                                      │
│              │  GPT has              │                                      │
│              │  recommendations?     │                                      │
│              └───────────┬───────────┘                                      │
│                          │                                                  │
│            ┌─────────────┴─────────────┐                                    │
│            │                           │                                    │
│            ▼                           ▼                                    │
│     ┌─────────────┐             ┌─────────────┐                             │
│     │  NO (clean  │             │ YES (has    │                             │
│     │  approval)  │             │ feedback)   │                             │
│     └──────┬──────┘             └──────┬──────┘                             │
│            │                           │                                    │
│            │                           ▼                                    │
│            │              ┌────────────────────────┐                        │
│            │              │  Opus agrees with      │                        │
│            │              │  recommendations?      │                        │
│            │              └───────────┬────────────┘                        │
│            │                          │                                     │
│            │              ┌───────────┴───────────┐                         │
│            │              │                       │                         │
│            │              ▼                       ▼                         │
│            │       ┌────────────┐         ┌────────────┐                    │
│            │       │  YES:      │         │  NO:       │                    │
│            │       │  Make      │         │  Pushback  │◄────────┐          │
│            │       │  changes   │         │  (max 7)   │         │          │
│            │       └─────┬──────┘         └─────┬──────┘         │          │
│            │             │                      │                │          │
│            │             ▼                      ▼                │          │
│            │      ┌────────────┐        ┌────────────────┐       │          │
│            │      │ Re-submit  │        │ GPT reviews    │       │          │
│            │      │ to GPT     │───┐    │ pushback       │       │          │
│            │      └────────────┘   │    └───────┬────────┘       │          │
│            │                       │            │                │          │
│            │                       │    ┌───────┴───────┐        │          │
│            │                       │    │               │        │          │
│            │                       │    ▼               ▼        │          │
│            │                       │ ┌────────┐   ┌──────────┐   │          │
│            │                       │ │APPROVED│   │ REJECTED │───┘          │
│            │                       │ └───┬────┘   │ retry<7? │              │
│            │                       │     │        └──────────┘              │
│            │                       │     │              │                   │
│            │                       │     │              ▼                   │
│            │                       │     │        ┌──────────┐              │
│            │                       │     │        │ NO: GPT  │              │
│            │                       │     │        │ FINAL SAY│              │
│            │                       │     │        └────┬─────┘              │
│            │                       │     │             │                    │
│            │    ┌──────────────────┴─────┴─────────────┘                    │
│            │    │  (back to GPT review - loop until satisfied)              │
│            │    └──────────────────┬────────────────────────────────────────│
│            │                       │                                        │
│            ▼                       ▼                                        │
│   ┌────────────────────────────────────────────────────────────┐            │
│   │                    PLAN APPROVED                           │            │
│   │              Update /tasks/ with final plan                │            │
│   │              <promise>PLAN_APPROVED</promise>              │            │
│   └────────────────────────────────┬───────────────────────────┘            │
│                                │                                            │
└────────────────────────────────┼────────────────────────────────────────────┘
                                 │
                                 ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                        PARALLELIZATION PHASE                               │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                            │
│   ┌───────────────────────────────────────┐                                │
│   │       file-grouping-agent             │                                │
│   │                                       │                                │
│   │ • Read sprint overview                │                                │
│   │ • Extract phase structure             │                                │
│   │   (plan-agent already defined phases) │                                │
│   │ • Validate file conflicts (safety)    │                                │
│   │ • Convert phases to batches (1:1)     │                                │
│   │ • Output execution plan               │                                │
│   └───────────────────┬───────────────────┘                                │
│                       │                                                    │
│                       ▼                                                    │
│   ┌─────────────────────────────────────────────────────────────────────┐  │
│   │  EXECUTION PLAN EXAMPLE                                             │  │
│   │                                                                     │  │
│   │  Batch 1 (parallel):  19.0.1, 19.0.2, 19.0.3  [no file overlap]     │  │
│   │  Batch 2 (sequential): 19.0.4                  [overlaps with 0.3]  │  │
│   │  Batch 3 (parallel):  19.0.5, 19.1.1           [no overlap]         │  │
│   │                                                                     │  │
│   └─────────────────────────────────────────────────────────────────────┘  │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                       IMPLEMENTATION PHASE                                 │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                            │
│   ┌─────────────────────────────────────────────────────────────────────┐  │
│   │  FOR EACH BATCH:                                                    │  │
│   └─────────────────────────────────────────────────────────────────────┘  │
│                       │                                                    │
│                       ▼                                                    │
│   ┌─────────────────────────────────────────────────────────────────────┐  │
│   │  SPAWN SPECIALISTS (parallel within batch)                          │  │
│   │                                                                     │  │
│   │   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │  │
│   │   │frontend-agent│  │frontend-agent│  │backend-agent │              │  │
│   │   │  Story 19.0.1│  │  Story 19.0.2│  │  Story 19.0.3│              │  │
│   │   └──────┬───────┘  └──────┬───────┘  └──────┬───────┘              │  │
│   │          │                 │                 │                      │  │
│   │          └────────────┬────┴─────────────────┘                      │  │
│   │                       │                                             │  │
│   │                       ▼                                             │  │
│   │          ┌────────────────────────┐                                 │  │
│   │          │  ALL RETURN SUMMARIES  │                                 │  │
│   │          └────────────┬───────────┘                                 │  │
│   │                       │                                             │  │
│   └───────────────────────┼─────────────────────────────────────────────┘  │
│                           │                                                │
│                           ▼                                                │
│              ┌────────────────────────┐                                    │
│              │  [HOOK: SubagentStop]  │                                    │
│              │  triggers GPT review   │                                    │
│              └────────────┬───────────┘                                    │
│                           │                                                │
│                           ▼                                                │
│   ┌──────────────────────────────────────────────────────────┐             │
│   │                GPT-5.2 CODE REVIEW                       │             │
│   │                                                          │             │
│   │  MCP: mcp__codex__codex (user's custom review prompt)    │             │
│   │  Fallback: codex --prompt (if MCP fails)                 │             │
│   │                                                          │             │
│   └──────────────────────┬───────────────────────────────────┘             │
│                          │                                                 │
│                          ▼                                                 │
│              ┌───────────────────────┐                                     │
│              │  GPT has              │                                     │
│              │  recommendations?     │                                     │
│              └───────────┬───────────┘                                     │
│                          │                                                 │
│            ┌─────────────┴─────────────┐                                   │
│            │                           │                                   │
│            ▼                           ▼                                   │
│     ┌─────────────┐             ┌─────────────┐                            │
│     │  NO (clean  │             │ YES (has    │                            │
│     │  approval)  │             │ feedback)   │                            │
│     └──────┬──────┘             └──────┬──────┘                            │
│            │                           │                                   │
│            │                           ▼                                   │
│            │              ┌────────────────────────┐                       │
│            │              │  Opus agrees?          │                       │
│            │              │  YES: Make changes,    │                       │
│            │              │       re-submit to GPT │◄───────┐              │
│            │              │  NO: Pushback (max 7)  │        │              │
│            │              └───────────┬────────────┘        │              │
│            │                          │                     │              │
│            │                   (loop until GPT satisfied)───┘              │
│            │                          │                                    │
│            ▼                          ▼                                    │
│   ┌────────────────────────────────────────────────────────────┐           │
│   │                    BATCH APPROVED                          │           │
│   │              <promise>BATCH_APPROVED</promise>             │           │
│   └────────────────────────────┬───────────────────────────────┘           │
│                                │                                           │
│                                ▼                                           │
│                   ┌────────────────────────┐                               │
│                   │  More batches?         │                               │
│                   └───────────┬────────────┘                               │
│                               │                                            │
│               ┌───────────────┴───────────────┐                            │
│               │                               │                            │
│               ▼                               ▼                            │
│        ┌────────────┐                  ┌────────────┐                      │
│        │    YES     │                  │     NO     │                      │
│        │ next batch │                  │ all done   │                      │
│        └─────┬──────┘                  └─────┬──────┘                      │
│              │                               │                             │
│              └───────────────────────────────┼─────────────────────────────┤
│                                              │                             │
└──────────────────────────────────────────────┼─────────────────────────────┘
                                               │
                                               ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        SPRINT FINAL PASS                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │  GPT-5.2 HOLISTIC SPRINT REVIEW                                     │   │
│   │                                                                     │   │
│   │  Prompt focuses on:                                                 │   │
│   │  • Integration: Do the pieces work together?                        │   │
│   │  • Patterns: Consistent conventions across stories?                 │   │
│   │  • Gaps: Anything missing from acceptance criteria?                 │   │
│   │  • Regressions: Cross-story conflicts?                              │   │
│   │  • Architecture: Does sum align with clean architecture?            │   │
│   │                                                                     │   │
│   └────────────────────────────┬────────────────────────────────────────┘   │
│                                │                                            │
│                                ▼                                            │
│              ┌─────────────────────────────────────┐                        │
│              │  GPT categorizes findings:          │                        │
│              │  • CRITICAL - must fix              │                        │
│              │  • MAJOR - should fix               │                        │
│              │  • MINOR - defer to CLAUDE.md       │                        │
│              └─────────────────┬───────────────────┘                        │
│                                │                                            │
│            ┌───────────────────┼───────────────────┐                        │
│            │                   │                   │                        │
│            ▼                   ▼                   ▼                        │
│     ┌────────────┐      ┌────────────┐      ┌────────────┐                  │
│     │  CRITICAL  │      │   MAJOR    │      │   MINOR    │                  │
│     │ inline fix │      │ fix story  │      │ log defer  │                  │
│     │ (max 3)    │      │ (max 1     │      │ CLAUDE.md  │                  │
│     │            │      │  batch)    │      │            │                  │
│     └─────┬──────┘      └─────┬──────┘      └─────┬──────┘                  │
│           │                   │                   │                         │
│           ▼                   ▼                   │                         │
│    ┌─────────────┐     ┌─────────────┐            │                         │
│    │  Re-review  │     │ Run batch   │            │                         │
│    │  until      │     │ flow for    │            │                         │
│    │  approved   │     │ fix stories │            │                         │
│    └──────┬──────┘     └──────┬──────┘            │                         │
│           │                   │                   │                         │
│           └───────────────────┴───────────────────┘                         │
│                                │                                            │
│                                ▼                                            │
│   ┌────────────────────────────────────────────────────────────────────┐    │
│   │                   SPRINT REVIEWED                                  │    │
│   │            <promise>SPRINT_REVIEWED</promise>                      │    │
│   └────────────────────────────┬───────────────────────────────────────┘    │
│                                │                                            │
└────────────────────────────────┼────────────────────────────────────────────┘
                                 │
                                 ▼
                    <promise>SCOPE_COMPLETE</promise>
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           COMPLETION                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   "Sprint 0 complete."                                                      │
│   "5 stories implemented, all approved."                                    │
│   "Sprint final pass: 2 CRITICAL fixed, 1 MAJOR fixed, 3 MINOR deferred"    │
│   "1 story skipped (STUCK) - see /tasks/epic-19/.stuck-log.md"              │
│   "Summary: /tasks/epic-19/completion.md"                                   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Error Handling

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        ERROR HANDLING                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │  STUCK DETECTION                                                    │   │
│   │                                                                     │   │
│   │  IF same error 3x in a row:                                         │   │
│   │    → Output <promise>STUCK</promise>                                │   │
│   │    → Document: what's blocking, what was tried                      │   │
│   │    → Auto-skip story, log to .stuck-log.md                          │   │
│   │    → Continue with next task                                        │   │
│   │                                                                     │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │  PREMATURE EXIT                                                     │   │
│   │                                                                     │   │
│   │  Stop hook intercepts exit                                          │   │
│   │    → Check: scope complete?                                         │   │
│   │    → NO: re-inject prompt, continue                                 │   │
│   │    → YES: allow exit                                                │   │
│   │                                                                     │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │  MCP FAILURE                                                        │   │
│   │                                                                     │   │
│   │  TRY: mcp__codex__codex / codex-reply                               │   │
│   │    → Fail (timeout/crash)                                           │   │
│   │    → Retry MCP 3x with backoff                                      │   │
│   │    → Still failing: FALLBACK to Bash mode                           │   │
│   │      codex --prompt "{context + lastResponse}"                      │   │
│   │    → Continue workflow                                              │   │
│   │                                                                     │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │  CRITICAL ERROR                                                     │   │
│   │                                                                     │   │
│   │  IF unrecoverable (API down, auth fail, etc):                       │   │
│   │    → Output <promise>ERROR</promise>                                │   │
│   │    → Save progress to .orchestrator-state.json                      │   │
│   │    → Notify user with resume instructions                           │   │
│   │                                                                     │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Components

### Agents

| Agent | Location | Purpose | Status |
|-------|----------|---------|--------|
| `orchestrator-agent` | `.claude/agents/orchestrator-agent.md` | Controls full flow, manages state/logs, spawns specialists, coordinates GPT reviews | ✅ Done |
| `plan-agent` | `.claude/agents/plan-agent.md` | Creates sprint/story specs with phase structure in /tasks/ | ✅ Done |
| `file-grouping-agent` | `.claude/agents/file-grouping-agent.md` | Validates phase structure, converts phases to batches (1:1) | ✅ Done |
| `frontend-agent` | `.claude/agents/frontend-agent.md` | Implements frontend stories | ✅ Existing |
| `backend-agent` | `.claude/agents/backend-agent.md` | Implements backend stories | ✅ Existing |

### Hooks

| Hook | Location | Trigger | Action |
|------|----------|---------|--------|
| `Stop` | `.claude/settings.json` | Agent tries to exit | Check scope complete, re-inject prompt if not |
| `SubagentStop` | `.claude/settings.json` | Specialist returns | Trigger GPT review, update state |

### Slash Commands

| Command | Location | Purpose |
|---------|----------|---------|
| `/spec-design` | `.claude/commands/spec-design.md` | Planning only - creates sprints/stories, GPT reviews plan |
| `/implement` | `.claude/commands/implement.md` | Implementation only - executes existing specs with GPT code review |
| `/delegate` | `.claude/commands/delegate.md` | Full automation - runs spec-design then implement end-to-end |

**Workflow Options:**
- `/delegate` → Full hands-off automation (spec-design + implement)
- `/spec-design` → Review plan → `/implement` → Checkpoint workflow
- `/implement` → Specs already exist, skip to implementation

### MCP Integration

| Server | Purpose | Fallback |
|--------|---------|----------|
| `codex` | Stateful GPT-5.2 conversation for pushback loop | Bash: `codex --prompt` |

**MCP Config:**
```json
// .mcp.json
{
  "mcpServers": {
    "codex": {
      "type": "stdio",
      "command": "codex",
      "args": ["-m", "gpt-5.2-codex", "mcp-server"]
    }
  }
}
```

**Note:** Requires global codex install (`npm install -g codex`).

### State Files

| File | Location | Purpose |
|------|----------|---------|
| `.orchestrator-state.json` | `/tasks/epic-{N}/` | Cursor: current phase/story/retry/codex state + sprint review tracking |
| `.review-log.md` | `/tasks/epic-{N}/` | GPT responses (append-only audit) - plan, code, and sprint reviews |
| `.stuck-log.md` | `/tasks/epic-{N}/` | Skipped stories + reasons |
| `.sprint-review-notes.md` | `/tasks/epic-{N}/` | Deferred MINOR items from sprint final pass |
| `completion.md` | `/tasks/epic-{N}/` | Final summary including sprint review stats |

### Scoped CLAUDE.md Files (Institutional Memory)

**Purpose:** When GPT catches issues, auto-append learnings to the appropriate scoped CLAUDE.md to prevent recurrence. Keeps root CLAUDE.md lean.

| File | Scope | What to Append |
|------|-------|----------------|
| `/CLAUDE.md` | Project-wide | Architectural patterns, cross-cutting concerns |
| `/apps/web/CLAUDE.md` | Frontend | React/Next.js patterns, UI conventions, component rules |
| `/packages/backend/CLAUDE.md` | Backend | API patterns, DB conventions, service rules |
| `/tasks/CLAUDE.md` | Planning | Story format, spec conventions, task rules |

**Auto-Append Logic:**
```
IF issue file in apps/web/**     → append to /apps/web/CLAUDE.md
IF issue file in packages/backend/** → append to /packages/backend/CLAUDE.md
IF issue is planning/spec related → append to /tasks/CLAUDE.md
ELSE                              → append to /CLAUDE.md
```

**Benefits:**
- Root CLAUDE.md stays lean (project-wide rules only)
- Learnings accumulate where relevant
- Context loaded on-demand (saves tokens)
- Teams own their domain's rules

---

## State File Schema

```json
{
  "epic": "19",
  "scope": "sprint-0",
  "phase": "planning|spec_final_pass|parallelization|implementation|sprint_review|complete",
  "currentBatch": 2,
  "currentStory": "19.0.4",
  "currentSprint": 1,
  "totalSprints": 4,
  "retryCount": 2,
  "status": "started|planning|awaiting_gpt_review|pushback|implementing|sprint_review|completed",

  "codex": {
    "conversationId": "abc-123",
    "roundCount": 3,
    "lastResponse": "summary of GPT position",
    "mode": "mcp"
  },

  "completedStories": ["19.0.1", "19.0.2", "19.0.3"],
  "skippedStories": [],
  "approvedSprints": ["sprint-1", "sprint-2"],
  "startedAt": "2026-01-14T10:00:00Z",

  "reviewRounds": {
    "specPerSprint": {
      "sprint-1": 3,
      "sprint-2": 2
    },
    "specFinalPass": 1,
    "code": 0,
    "sprintFinal": 0
  },

  "sprintReview": {
    "round": 0,
    "inlineFixCount": 0,
    "fixStoriesCreated": [],
    "maxInlineFixes": 3,
    "maxFixBatches": 1
  }
}
```

**Phase Transitions:**
| From | To | Trigger |
|------|-----|---------|
| `planning` | `spec_final_pass` | All individual sprint specs approved |
| `spec_final_pass` | `parallelization` | Spec final pass approved by GPT |
| `parallelization` | `implementation` | Batches created |
| `implementation` | `sprint_review` | All batches complete |
| `sprint_review` | `complete` | Sprint final pass approved |

---

## Hook Configuration

```json
// .claude/settings.json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": ".claude/hooks/stop-hook.sh"
          }
        ]
      }
    ],
    "SubagentStop": [
      {
        "matcher": "plan-agent",
        "hooks": [
          {
            "type": "command",
            "command": ".claude/hooks/post-plan.sh"
          }
        ]
      },
      {
        "matcher": "frontend-agent|backend-agent",
        "hooks": [
          {
            "type": "command",
            "command": ".claude/hooks/post-implementation.sh"
          }
        ]
      }
    ]
  }
}
```

---

## Key Parameters

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| Max retries (pushback) | 7 | User preference |
| Hard disagree resolution | GPT-5.2 final say | User preference |
| Re-review after changes | Always | Loop until GPT satisfied (critical for quality) |
| MCP retry before fallback | 3 | Balance reliability vs speed |
| Stuck detection | Same error 3x | Avoid infinite loops |
| Parallel conflict detection | Per-file analysis | Prevent edit conflicts |
| Sprint review inline fixes | Max 3 | Prevent infinite review loops |
| Sprint review fix batches | Max 1 | Limit scope of late-stage fixes |
| **Spec review level** | **Per-sprint** | **Enables deeper analysis (not epic-level)** |
| **Spec deep analysis** | **Required** | **GPT must search codebase, verify files** |
| **Spec final pass** | **Required** | **Catches cross-sprint integration issues** |
| GPT touchpoints per sprint | 4+ | Per-sprint spec review(s), spec final pass, code review, sprint final pass |

---

## Directory Structure

```
.claude/
├── agents/
│   ├── orchestrator-agent.md      # NEW
│   ├── plan-agent.md              # NEW
│   ├── file-grouping-agent.md     # NEW
│   ├── frontend-agent.md          # UPDATED
│   └── backend-agent.md           # EXISTING
├── commands/
│   ├── spec-design.md             # NEW - planning only
│   ├── implement.md               # NEW - implementation only
│   └── delegate.md                # NEW - full automation
├── hooks/
│   ├── stop-hook.sh               # NEW
│   ├── post-plan.sh               # NEW
│   ├── post-implementation.sh     # NEW
│   └── post-tool-format.sh        # NEW - auto-format after edits
└── settings.json                  # UPDATE (add hooks)

.mcp.json                          # UPDATE (add codex server)

# Scoped CLAUDE.md files (institutional memory)
/CLAUDE.md                         # Project-wide rules (keep lean)
/apps/web/CLAUDE.md                # Frontend learnings (NEW)
/packages/backend/CLAUDE.md        # Backend learnings (NEW)
/tasks/CLAUDE.md                   # Planning learnings (NEW)

# Runtime state (per epic)
tasks/epic-{N}/
├── .orchestrator-state.json       # Created at runtime
├── .review-log.md                 # Created at runtime
├── .stuck-log.md                  # Created at runtime
└── completion.md                  # Created at runtime
```

---

## User Touchpoints

| Workflow | User Actions |
|----------|--------------|
| **Full automation** | `/delegate` → paste prompt → select scope → paste GPT review prompt → receive completion |
| **Checkpoint** | `/spec-design` → review plan → `/implement` → receive completion |
| **Specs exist** | `/implement` → receive completion |

Everything else is automated.

---

## Implementation Order

1. **Phase 1: Core Infrastructure** ✅ DONE
   - [x] Create orchestrator-agent
   - [x] Create plan-agent (with phase structure)
   - [x] Create `/spec-design` command
   - [x] Create `/implement` command
   - [x] Create `/delegate` command (wrapper)
   - [x] Configure Stop hook
   - [x] Configure SubagentStop hooks

2. **Phase 2: MCP Integration** ✅ DONE
   - [x] Add codex to .mcp.json
   - [x] Implement MCP calls in orchestrator
   - [x] Implement Bash fallback

3. **Phase 3: Parallelization** ✅ DONE
   - [x] Create file-grouping-agent (validates phases, converts to batches)
   - [x] Integrate with orchestrator

4. **Phase 4: State Management** ✅ DONE
   - [x] Implement state file read/write
   - [x] Implement logging to .review-log.md
   - [x] Implement .stuck-log.md

5. **Phase 5: Verification & Quality** ✅ DONE
   - [x] Add verification phase (tests/lint/typecheck before GPT review)
   - [x] Configure PostToolUse formatting hook
   - [x] Pre-authorize safe commands (`pnpm test`, `pnpm lint`, `pnpm build`)

6. **Phase 6: Institutional Memory** ✅ DONE
   - [x] Create scoped CLAUDE.md files (`/apps/web/`, `/packages/backend/`, `/tasks/`)
   - [x] Implement auto-append logic (GPT catches issue → append to scoped CLAUDE.md)
   - [x] Add instructions to determine correct scope based on file path

7. **Phase 7: Error Handling** ✅ DONE
   - [x] Implement stuck detection
   - [x] Implement MCP fallback
   - [x] Implement checkpoint/resume

8. **Phase 8: Sprint Final Pass** ✅ DONE
   - [x] Add sprint_review phase to state machine
   - [x] Create sprint review prompt (holistic: integration, patterns, gaps)
   - [x] Implement severity-based handling (CRITICAL/MAJOR/MINOR)
   - [x] Add .sprint-review-notes.md for deferred items
   - [x] Add limits to prevent infinite loops (max 3 inline, max 1 fix batch)

---

## Best Practices (Boris Cherny)

Patterns from the Claude Code creator incorporated into this workflow:

| Practice | How Applied |
|----------|-------------|
| **Plan-then-execute** | `/spec-design` → `/implement` split |
| **Specialized subagents** | plan-agent, frontend-agent, backend-agent, file-grouping-agent |
| **CLAUDE.md institutional memory** | Scoped CLAUDE.md files, auto-append on GPT feedback |
| **Verification loop** | Tests/lint/typecheck before GPT review |
| **PostToolUse formatting hook** | Auto-format after edits |
| **Permission pre-authorization** | Pre-allow safe commands in commands |
| **Parallel fleet** | file-grouping-agent creates batches for parallel execution |

---

## GPT-5.2 Review Prompts

### Plan & Code Review Prompt

**Custom prompt (provided by user):**
```
You are assuming the role of a 10x senior dev for this entire chat.

## Your Role
You will review the agent's work against the existing codebase. You will receive two types of submissions:

1. **Specs (Plans):** Sprint and story specifications before implementation
2. **Code:** Implementation changes after each sprint

Review all submissions for:
- Quality
- Completeness
- Security
- Strict adherence to clean architecture
- No regressions
- Consistency with existing codebase patterns

Do not write code — all code will be written by the agent.

## Response Format

**If issues found**, respond with:

STATUS: NEEDS_REVISION

REQUIRED CHANGES:
1. [Change] — Why: [brief rationale]
2. [Change] — Why: [brief rationale]

RECOMMENDATIONS (optional):
- [Improvement] — Why: [benefit/risk if skipped]

**If no issues**, respond with:

STATUS: APPROVED

No blocking issues found. Implementation meets quality standards.

## Re-Review Cycle
- After agent makes changes, you will receive an updated submission
- Review the changes and respond with STATUS: APPROVED or STATUS: NEEDS_REVISION
- This cycle continues until you give STATUS: APPROVED

## Handling Pushback
- The agent may disagree with a recommendation and explain why
- Evaluate the agent's reasoning objectively
- If the agent's reasoning is sound, update your assessment
- If you still believe the change is necessary, restate your position with rationale
- After 7 pushback rounds, you have final say

## Important
- STATUS: APPROVED means "no more changes needed" — be explicit
- Only use NEEDS_REVISION if changes are actually required
- Distinguish between blocking issues (REQUIRED) and suggestions (RECOMMENDATIONS)
```

**Default prompt (if user skips custom):** Use the above as default.

### Sprint Final Pass Prompt

**Holistic review after all implementation complete:**
```
You are assuming the role of a 10x senior dev. Review this COMPLETED SPRINT holistically.

Sprint: {sprint_id}
Stories completed: {story_list}
Files modified: {file_list}

## Review Focus
1. **Integration:** Do the pieces work together correctly?
2. **Patterns:** Consistent conventions across all stories?
3. **Gaps:** Anything missing that acceptance criteria implied?
4. **Regressions:** Any cross-story conflicts or breaks?
5. **Architecture:** Does the sum align with clean architecture?

## Response Format

**If issues found**, respond with:

STATUS: NEEDS_REVISION

CRITICAL (must fix before sprint complete):
1. [Issue] — Why: [rationale]

MAJOR (should fix, creates tech debt if skipped):
1. [Issue] — Why: [rationale]

MINOR (nice to have, can defer):
- [Issue] — Why: [benefit if addressed]

**If no issues**, respond with:

STATUS: APPROVED

No blocking issues found. Sprint implementation meets quality standards.

## Re-Review Cycle
- After agent fixes CRITICAL/MAJOR items, you will receive an updated submission
- Review and respond with STATUS: APPROVED or STATUS: NEEDS_REVISION
- MINOR items are logged for future improvement, not blocking

## Important
- STATUS: APPROVED means "sprint is ready to ship"
- CRITICAL items block approval
- MAJOR items should be fixed but can be overridden after discussion
- MINOR items are deferred to CLAUDE.md for institutional memory
```

---

## References

- [Ralph Wiggum Plugin](https://github.com/anthropics/claude-code/tree/main/plugins/ralph-wiggum)
- [Codex MCP Server](https://developers.openai.com/codex/guides/agents-sdk/)
- [Claude Code Sub-Agents](https://code.claude.com/docs/en/sub-agents)
- [Claude Code Hooks](https://code.claude.com/docs/en/hooks)
- [Boris Cherny's Claude Code Workflow](https://karozieminski.substack.com/p/boris-cherny-claude-code-workflow) - Parallel fleet, CLAUDE.md institutional memory, verification loops
- [Using CLAUDE.MD Files (Anthropic)](https://claude.com/blog/using-claude-md-files) - Hierarchical/scoped CLAUDE.md documentation
