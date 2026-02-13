# Epic 38: ISO Export + UI Enrichment

## Goal

Wire the ISO compliance data (built in Epic 37) into exports and frontend. After this epic, assessors see ISO traceability, confidence badges, and explainability narratives in PDF/Word/Excel reports and in the UI.

## Dependency

**Requires Epic 37 complete.** Epic 37 builds the DB foundation and scoring enrichment. This epic consumes that data in exports and UI.

## Scope (High-Level — Detailed Specs Deferred)

### Export Enrichment
- PDF template: ISO references, confidence badges, Guardian-native labels per dimension
- Word template: same enrichment
- Excel template: ISO control mapping sheet, confidence column
- Export narrative prompt: inject ISO controls + confidence into narrative generation context
- ISO messaging enforcement in all templates (no "compliant"/"certified" language)

### Frontend
- Dimension score display: confidence badge (H/M/L) + explainability narrative
- ISO Standards Alignment section in assessment view
- Guardian-native dimension labeling ("Guardian healthcare-specific criteria")
- Assessment detail view enrichment

### Integration
- End-to-end: score with ISO context → export with ISO enrichment → verify report output
- Snapshot tests for report format stability
- Manual QA: 5 reports reviewed for ISO messaging compliance

## Key Documents

Same as Epic 37 — the PRD covers both epics:
- `docs/products/prd-iso-compliance.md` (v1.0)
- `tasks/epic-37/epic-37-goals.md` (dependency)

## Estimated Scope

Stories are granular, bite-sized units — an agent with zero context picks up the spec, implements, tests, done.

| Area | Rough Decomposition | Stories | Agent |
|------|---------------------|---------|-------|
| Export narrative prompt | Inject ISO + confidence into narrative context | 2-3 | backend-agent |
| PDF template — ISO references | Per-dimension ISO clause rendering | 2-3 | export-agent |
| PDF template — confidence badges | H/M/L badge + rationale per dimension | 1-2 | export-agent |
| PDF template — Guardian-native labels | Healthcare-specific dimension labels | 1 | export-agent |
| Word template — ISO enrichment | Mirror PDF enrichment for Word format | 2-3 | export-agent |
| Excel template — ISO mapping sheet | Control mapping tab, confidence column | 2-3 | export-agent |
| Frontend — confidence badge component | Reusable H/M/L badge with tooltip rationale | 1-2 | frontend-agent |
| Frontend — dimension score enrichment | ISO refs + confidence in assessment detail view | 2-3 | frontend-agent |
| Frontend — ISO alignment section | Standalone section listing clause statuses | 2-3 | frontend-agent |
| Frontend — Guardian-native dimension UI | Healthcare-specific label treatment | 1-2 | frontend-agent |
| ISO messaging enforcement | Prohibited term linting in templates + prompts | 1-2 | backend-agent |
| E2E integration tests | Score → export → verify report end-to-end | 2-3 | backend-agent |
| Snapshot tests | Report format stability tests | 1-2 | backend-agent |
| Manual QA checklist | 5-report messaging compliance review spec | 1 | backend-agent |

**Total: ~25-35 stories across 5-8 sprints, mixed frontend/backend/export.**

## Notes for Future Session

- Detailed sprint specs will be created when Epic 37 is complete or near-complete
- The export templates and frontend components depend on the exact shape of Epic 37's output
- The pre-planning audit team should read Epic 37's actual implementation before speccing this epic
- ISO messaging guidelines (PRD Section 13) apply heavily here — every template must be audited
