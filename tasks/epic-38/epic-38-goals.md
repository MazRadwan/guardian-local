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

| Area | Rough Size | Agent |
|------|-----------|-------|
| Export narrative prompt | 1-2 stories | backend-agent |
| PDF template enrichment | 1-2 stories | export-agent |
| Word template enrichment | 1-2 stories | export-agent |
| Excel template enrichment | 1 story | export-agent |
| Frontend confidence display | 2-3 stories | frontend-agent |
| Frontend ISO alignment section | 1-2 stories | frontend-agent |
| E2E integration tests | 1-2 stories | backend-agent |
| Report messaging audit | 1 story | backend-agent |

**Total: ~10-14 stories, mixed frontend/backend/export.**

## Notes for Future Session

- Detailed sprint specs will be created when Epic 37 is complete or near-complete
- The export templates and frontend components depend on the exact shape of Epic 37's output
- The pre-planning audit team should read Epic 37's actual implementation before speccing this epic
- ISO messaging guidelines (PRD Section 13) apply heavily here — every template must be audited
