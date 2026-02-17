# Session Handoff: ISO Epic Sprint Specification (In Progress)

**Date:** 2026-02-13
**Branch:** `feat/iso-compliance`
**Phase:** SPEC DESIGN (planning) — NOT implementation
**Prior Handoff:** `docs/products/session-handoff-iso-epic.md` (still valid for background context)

---

## CRITICAL: DO NOT IMPLEMENT

The plan-agent was writing sprint/story specs when this session ended. The specs may be complete in `/tasks/epic-37/`. **These are DRAFT specs that have NOT been GPT-reviewed yet.**

**The workflow is:**
```
[DONE] Pre-planning audit (3 agents) → audit-report.md written
[IN PROGRESS] Plan-agent writing specs → overview.md, sprint-N-overview.md, sprint-N-story-M.md
[NOT DONE] Spec review swarm (agent team — mesh review of specs before Codex)
[NOT DONE] Codex sprint spec review loops (per /spec-design skill)
[NOT DONE] Spec final pass (holistic cross-sprint review)
[NOT DONE] User approval of specs
[NOT DONE] Implementation
```

**Next session must:**
1. Check if plan-agent completed — look for `tasks/epic-37/overview.md` and story files
2. If complete: run GPT sprint spec review loops (Codex gate on each sprint)
3. If incomplete or poor quality: re-run plan-agent with audit-report.md context
4. Do NOT start implementation until specs are GPT-reviewed AND user-approved

---

## What Was Done This Session

### 1. New Skill: `/audited-delegate`
- Location: `.claude/skills/audited-delegate/SKILL.md`
- Wraps existing `/spec-design` and `/implement` with quality gates
- Adds: pre-planning audit (parallel agents) + post-batch review swarm (agent team) + Codex gate
- Existing skills untouched — this orchestrates around them
- **First time running this skill** — it's experimental

### 2. Pre-Planning Audit (Complete)
- 3 parallel Explore agents audited the codebase
- Output: `tasks/epic-37/audit-report.md` (consolidated findings)
- Key findings:
  - **ScoringService.ts is 542 LOC** — must split before ISO work
  - **scoringPrompt.ts is 348 LOC** — must split (already over 300)
  - **ScoringPayloadValidator.ts is 275 LOC** — will exceed 300 with ISO additions
  - **D-10 (rawToolPayload) is already implemented** — removed from scope
  - All 9 PRD assumptions verified correct against actual codebase
  - ~37-42 new files, ~11-13 modified files estimated

### 3. Epic Structure Created
- `tasks/epic-37/epic-37-goals.md` — full goals with locked decisions
- `tasks/epic-38/epic-38-goals.md` — skeleton for Export + UI epic (depends on 37)
- Epic 37 = ISO Foundation + Scoring Enrichment (all backend)
- Epic 38 = ISO Export + UI Enrichment (mixed frontend/backend/export, deferred)

### 4. Agent Teams Enabled
- `.claude/settings.json` now has `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: "1"`
- The `/audited-delegate` skill uses agent teams for post-batch review swarm

### 5. Agent Workflow Doc Updated (Prior Session)
- `tasks/agent-workflow.md` — overhauled to 203 lines with team orchestration rules
- Includes: parallel vs team decision guide, pre-planning audit team, post-batch swarm, batching rules

---

## Nuances for Next Session

### Story Granularity
Stories must be bite-sized — an agent with ZERO context picks up the spec, implements, tests, done. Each story has exact file paths, line numbers, current signatures. See `tasks/epic-36/sprint-1-story-1.md` as the gold standard.

### Sprint 1 = Refactoring Only
Sprint 1 is NOT ISO features. It's splitting the 3 blocker files to comply with 300 LOC limit:
- ScoringService.ts (542 → thin orchestrator + extracted services)
- scoringPrompt.ts (348 → main + scoringPrompt.iso.ts)
- ScoringPayloadValidator.ts (275 → main + ScoringConfidenceValidator.ts)

ISO feature work starts Sprint 2.

### D-10 Is Done
The audit found `rawToolPayload` provenance is already implemented. The PRD listed it as a dependency but it's been done since ~Jan 19. Do NOT create stories for it.

### Two Confidence Concepts
- `extractionConfidence` — exists in `responses` table (real 0-1, document parsing quality)
- `assessmentConfidence` — NEW, goes in `dimension_scores.findings` JSONB (H/M/L string, evidence quality)
- Different tables, types, semantics. No collision risk. Locked decision.

### Guardian-Native Dimensions
3 dimensions get NO ISO mapping (labeled "Guardian healthcare-specific criteria"):
- `clinical_risk`, `vendor_capability`, `ethical_considerations` / `sustainability`

### Post-Batch Review Swarm
The `/audited-delegate` skill calls for an agent TEAM (not parallel agents) for code review after each implementation batch. 3 reviewers with mesh communication:
- Line-by-line reviewer
- Data flow tracer
- Architecture compliance checker
This happens BEFORE the Codex gate to reduce Codex re-review tokens.

### CORS Note
Backend `.env` now has `CORS_ORIGIN=http://localhost:3000,http://localhost:3001` because port 3000 was occupied by a stale process. If frontend starts on 3000 cleanly, this is fine. If issues, check CORS.

---

## Key Documents (Read Order)

1. `tasks/epic-37/audit-report.md` — Verified codebase facts (read FIRST)
2. `tasks/epic-37/epic-37-goals.md` — Goals, locked decisions, success criteria
3. `docs/products/prd-iso-compliance.md` — Full PRD (v1.0, approved)
4. `.claude/skills/audited-delegate/SKILL.md` — The workflow skill
5. `tasks/agent-workflow.md` — Orchestration rules (teams, batching, swarm)
6. `tasks/epic-37/overview.md` — Sprint specs (if plan-agent completed)

---

## Commits on feat/iso-compliance

```
2ba1d84 feat(iso): Add audited-delegate skill, Epic 37/38 goals, enable agent teams
c37b6dd docs(iso): Update Epic 37/38 story estimates to granular decomposition
[pending] audit-report.md + plan-agent specs (uncommitted)
```

---

## What to Do Next

```
1. Read this handoff
2. Check tasks/epic-37/ for plan-agent output (overview.md, sprint files)
3. If specs exist → deploy spec review swarm (agent team, mesh communication)
   - Reviewers cross-check specs against audit-report.md facts
   - Catch file conflicts, missing dependencies, wrong assumptions
4. After swarm → run Codex sprint spec review loops (per /spec-design Step 4)
5. If specs are missing/incomplete → re-run plan-agent with audit-report.md
6. After Codex approves all sprints → spec final pass (holistic review)
7. After final pass → user reviews and approves
8. THEN and only then → /implement (or /audited-delegate Phase 4+)
```

**Review order: Swarm FIRST → Codex SECOND.** Swarm catches structural issues cheaply. Codex deep-reviews what swarm missed.
