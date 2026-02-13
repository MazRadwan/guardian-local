# Epic 37: ISO Foundation + Scoring Enrichment

## Goal

Build the database foundation for ISO compliance frameworks and enrich the scoring pipeline with explainability, confidence assessment, and ISO traceability. After this epic, Guardian's scoring produces ISO-anchored, explainable scores with confidence indicators — even though reports and UI don't display them yet.

## Problem Statement

Guardian scores vendors across 10 risk dimensions using a proprietary rubric, but scores lack traceability to recognized international standards. Assessors cannot answer: "Why did this vendor score 3/5 on Data Governance, and how confident are we in that score?"

This epic builds the data layer and scoring enrichment. Epic 38 will wire it to exports and UI.

## Scope — EXPLICIT BOUNDARIES

**IN SCOPE (this epic):**

### Database & Domain
- New tables: `compliance_frameworks`, `framework_versions`, `framework_controls`, `interpretive_criteria`, `dimension_control_mappings`, `assessment_compliance_results`
- Two-level versioning: standard versions (external, immutable) + Guardian criteria versions (internal, mutable)
- Domain entities and value objects for ISO types
- Seed script for Tier 1: ISO 42001:2023 (38 controls) + ISO 23894:2023 (supplementary)
- Interpretive criteria: Guardian's own language referencing ISO clause numbers (not verbatim ISO text)

### Scoring Pipeline
- Scoring prompt enrichment: inject relevant ISO controls into scoring context
- Static catalog in system prompt (cacheable), per-assessment applicability in user prompt (dynamic)
- Add `assessmentConfidence` (H/M/L + rationale) to scoring output
- Add ISO clause references to scoring output per dimension
- Update `scoringComplete.ts` tool schema for new fields
- Update `ScoringPayloadValidator` to validate ISO + confidence fields
- `rawToolPayload` provenance fix (D-10): save full Claude output pre-validation
- `ScoringService.ts` split if needed to stay under 300 LOC (D-15)

### Prompt Engineering
- Scoring prompt updates (iterative, with golden sample regression testing)
- ISO messaging compliance in scoring prompt (no "compliant"/"certified" language)
- `maxTokens` assessment and increase if needed (8000 → 10000)

**OUT OF SCOPE (do NOT touch):**
- Export templates (PDF, Word, Excel) — Epic 38
- Frontend UI components — Epic 38
- `guardian-prompt.md` (chat prompt) — NOT modified for ISO
- Question generation pipeline — unchanged
- Intake extraction pipeline — unchanged
- Tier 2/3 standards (validated via extensibility test only)

## Key Documents

| Document | Location | Purpose |
|----------|----------|---------|
| PRD (approved v1.0) | `docs/products/prd-iso-compliance.md` | Full requirements, schema, confidence model, messaging guidelines |
| Prompt audit findings | `docs/products/prompt-audit-findings.md` | Completed hardening, feeds into this epic |
| Session handoff | `docs/products/session-handoff-iso-epic.md` | Prior session context and locked decisions |
| Database schema (existing) | `docs/design/data/database-schema.md` | Current 6 MVP tables |
| Scoring prompt (current) | `packages/backend/src/infrastructure/ai/prompts/scoringPrompt.ts` | Already hardened with rating scales |
| Scoring validator (current) | `packages/backend/src/domain/scoring/ScoringPayloadValidator.ts` | Already has sub-score soft warnings |

## Locked Decisions (Do NOT Revisit)

These were resolved through design council, experiment, and user approval:

| Decision | Choice | Why |
|----------|--------|-----|
| Confidence model | Qualitative H/M/L from Claude | Deterministic heuristics rejected (r=0.287) |
| ISO copyright | Interpretive controls (Guardian's language + clause numbers) | Cannot reproduce ISO text |
| Versioning | Two-level (standard + criteria) | Non-negotiable per PRD |
| Phase structure | Single epic for DB + scoring; separate epic for export + UI | Natural dependency boundary |
| Confidence naming | `assessmentConfidence` (not `confidence`) | Avoids conflict with `extractionConfidence` |
| ISO messaging | "ISO-traceable" / "ISO-informed" only | No "compliant" / "certified" language |
| Prompt approach | Static catalog (system prompt) + dynamic applicability (user prompt) | Enables prompt caching |
| Coverage gaps | Clinical Risk + Vendor Capability = Guardian-native (no ISO mapping) | ISO 42001 has no clinical controls |

## Success Criteria

- [ ] All 6 new DB tables created with migrations applied
- [ ] Tier 1 seed data loaded (ISO 42001 + 23894 interpretive criteria)
- [ ] Two-level versioning working (standard version + criteria version tracked independently)
- [ ] Scoring pipeline produces ISO clause references per dimension
- [ ] Scoring pipeline produces `assessmentConfidence` (H/M/L + rationale) per dimension
- [ ] `rawToolPayload` stores full Claude output pre-validation
- [ ] Golden sample regression: existing scoring quality does not degrade
- [ ] Extensibility test: seed a fake Tier 2 standard with zero code changes (validates SC-3)
- [ ] All existing tests pass (2000+)
- [ ] New unit + integration tests for all new code
- [ ] ISO messaging compliance in scoring prompt (no prohibited terms)

## Architecture Notes

### Prompt Injection Strategy
```
System Prompt (cacheable):
  [existing scoring rubric]
  [ISO Control Catalog — static, ~30 dimension-mapped controls]

User Prompt (dynamic, per-assessment):
  [vendor responses]
  [applicable controls for this assessment's dimensions]
```

### Confidence Output (Per Dimension)
```json
{
  "confidence": {
    "level": "high" | "medium" | "low",
    "rationale": "Specific explanation citing evidence and ISO references"
  }
}
```

### Two Confidence Concepts (NEVER Conflate)
| Name | Context | Meaning |
|------|---------|---------|
| `extractionConfidence` | Scoring extraction (document parsing) | "I parsed this document correctly" — existing |
| `assessmentConfidence` | Dimension scoring / export | "The evidence supports this score" — new |

## Estimated Scope

Stories are granular, bite-sized units — an agent with zero context picks up the spec, implements, tests, done.

| Area | Rough Decomposition | Stories | Agent |
|------|---------------------|---------|-------|
| DB schema (6 tables) | 1 per table + migration + repository | 6-8 | backend-agent |
| Domain entities + value objects | 1 per entity + types file | 4-6 | backend-agent |
| Seed script (Tier 1) | Seed data + review workflow | 2-3 | backend-agent |
| ISO control retrieval service | Service + tests | 1-2 | backend-agent |
| Prompt injection service | Static catalog + dynamic applicability | 2-3 | backend-agent |
| Scoring tool schema update | scoringComplete.ts + types | 1-2 | backend-agent |
| Scoring prompt enrichment | Iterative changes with regression tests | 3-4 | backend-agent |
| ScoringPayloadValidator updates | Confidence + ISO field validation | 2-3 | backend-agent |
| rawToolPayload provenance (D-10) | Schema + service + migration | 2-3 | backend-agent |
| ScoringService split (D-15) | Extract concerns to stay under 300 LOC | 1-2 | backend-agent |
| Golden sample regression baseline | Capture + compare framework | 1-2 | backend-agent |
| Extensibility validation | Fake Tier 2 seed test | 1 | backend-agent |

**Total: ~25-35 stories across 5-8 sprints, all backend.**

## Artifacts (Per Epic Convention)

```
tasks/epic-37/
├── epic-37-goals.md              # This file
├── overview.md                   # Sprint summary, dependency chart, quality gates
├── .orchestrator-state.json      # Workflow state (auto-managed)
├── sprint-1-overview.md          # Per-sprint: stories, dependencies, parallel strategy
├── sprint-1-story-1.md           # Per-story: granular spec (under 300 LOC)
├── sprint-1-story-2.md
├── ...
├── audit-report.md               # Pre-planning audit output (auto-generated)
└── .review-log.md                # GPT review audit trail (auto-managed)
```
