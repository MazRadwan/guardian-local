# Session Handoff: ISO Compliance Epic

**Date:** 2026-02-12
**Branch:** main (all work committed)
**Next task:** Plan and implement ISO Compliance, Explainability & Confidence Scoring epic

---

## What Was Done This Session

1. **Prompt hardening completed** — `feat/prompt-scoring-hardening` merged to main
   - `guardian-prompt.md`: 1,221 → 612 lines (50% reduction, gitignored/disk-only)
   - `scoringPrompt.ts`: Rating scales added for 4 dimensions (219 → 348 lines)
   - `ScoringPayloadValidator.ts`: Sub-score soft validation added (178 → 275 LOC)
   - New `subScoreRules.ts` (86 LOC) with rubric constants
   - 1,994 tests passing across 91 suites

2. **Confidence heuristics experiment** — `experiments/confidence-heuristics/` (gitignored)
   - Tested deterministic TypeScript heuristics vs Claude's confidence assessment
   - Result: Pearson r = 0.287 (weak). Heuristics measure surface features, Claude evaluates semantic meaning
   - Deterministic approach rejected. Claude does H/M/L confidence in existing scoring call

3. **Agent workflow rules overhauled** — `tasks/agent-workflow.md` (799 → 203 lines)
   - Added agent team patterns (knowledge pipeline, pre-planning audit, post-batch swarm)
   - Added batching rules (by dependency/files, not fixed count)
   - Clarified skills vs workflow rules relationship
   - Added Codex gate at batch level

4. **PRD updated to v1.0** — `docs/products/prd-iso-compliance.md`
   - Collapsed Phase 1/2 into single epic (DB + scoring + export ship together)
   - Added experimental validation results
   - Updated prompt system status
   - Folded D-10, D-15 prerequisites into epic delivery

---

## What To Do Next

### Immediate: Plan the ISO Epic

Per updated workflow rules (`tasks/agent-workflow.md`):

1. **Deploy pre-planning audit team** — reads actual codebase before any specs
   - Cascade chain auditor (tool schema → validator → DB → types → export → prompt → template)
   - File boundary auditor (300 LOC limits, file collision detection)
   - Pattern verifier (confirm specs match reality)

2. **Create sprint/story specs** — the `/claude-plan` skill exists but may not incorporate the updated workflow rules. User noted this concern. Options:
   - Update the skill to reference workflow rules
   - Orchestrate manually using workflow rules
   - Use skill for mechanics, manually add audit team + review gates

3. **Execute batches** with per-story code review, post-batch swarm + Codex gate

### Key Decision: Skill Update

The `/claude-plan` and `/claude-implement` skills don't have the new workflow rules (audit teams, swarm reviews, Codex gates). User was undecided on whether to update skills or orchestrate manually. Resolve this before starting.

---

## Key Documents (Read in Order)

| # | Document | What It Tells You |
|---|----------|-------------------|
| 1 | `docs/products/prd-iso-compliance.md` | **Start here.** Full PRD v1.0 — requirements, decisions, schema, scope |
| 2 | `docs/products/iso-design-council-consensus.md` | 16 design decisions with full rationale |
| 3 | `docs/products/iso-discovery-findings.md` | Technical analysis — pipeline flows, injection points, cascade chain |
| 4 | `docs/products/prompt-audit-findings.md` | Prompt system audit — what was trimmed and why |
| 5 | `tasks/agent-workflow.md` | Orchestration rules — teams, batching, review gates |

---

## Decisions Already Made (Do Not Revisit)

- **Single epic** — DB + scoring + export ship together (not phased)
- **Confidence = H/M/L** from Claude in existing scoring call (no extra API call)
- **Deterministic heuristics rejected** — experiment proved r=0.287, too weak
- **Tier 1 only** — ISO 42001 + 23894, everything else deferred
- **Interpretive controls** — Guardian's language, reference ISO clause numbers (copyright constraint)
- **Two-level versioning** — ISO standard versions + Guardian criteria versions (separate)
- **"ISO-traceable" language** — never "ISO-compliant" or "ISO-certified" (D-16)
- **Question generation unchanged** — too much regression risk
- **All 38 controls stored in DB** — only dimension-mapped ones (~30) injected into prompts
- **DB-driven extensibility** — adding new standard = DB seed + human review, zero code changes
- **Confidence in existing scoring call** — added to tool schema, no separate API call
- **Coverage completeness (SQL counting)** viable as supplementary signal but not primary

---

## Codebase State

- **Main branch:** up to date, all work merged
- **Tests:** 1,994 passing (91 suites)
- **Architecture:** All backend source files under 300 LOC (except ScoringService.ts at 542 — split is part of this epic)
- **Prompt system:** Hardened. 6 isolated pipelines confirmed. Chat prompt trimmed 50%.
- **Experiment folder:** `experiments/confidence-heuristics/` exists (gitignored), can be deleted anytime
