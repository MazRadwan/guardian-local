# Sprint 5: Seed Data + ISO Services

**Epic:** 37 - ISO Foundation + Scoring Enrichment
**Focus:** Tier 1 seed script, ISO control retrieval service, ISO prompt builder, confidence validator
**Stories:** 37.5.1 - 37.5.4 (4 stories)
**Dependencies:** Sprint 4 complete (repositories exist and tested)
**Agents:** `backend-agent`

---

## Context

With the database, domain, and repository layers complete, this sprint builds the application services that query ISO data and prepare it for injection into the scoring pipeline. Also creates the seed script to populate Tier 1 data (ISO 42001 + 23894).

---

## Stories

| Story | Name | Focus | Dependencies |
|-------|------|-------|--------------|
| **37.5.1** | Tier 1 seed script | Seed ISO 42001 + 23894 controls + criteria + dimension mappings | None |
| **37.5.2** | ISOControlRetrievalService | Service to query ISO controls by dimension | None |
| **37.5.3** | ISO prompt builder (scoringPrompt.iso.ts) | Build ISO catalog + applicability prompt sections from DB | 37.5.1, 37.5.2 |
| **37.5.4** | ScoringConfidenceValidator | Validate assessmentConfidence fields in scoring output | None |

---

## Dependency Graph

```
    File Overlap Analysis:
    +----------+-------------------------------------------------------+--------------------+
    | Story    | Files Touched                                         | Conflicts          |
    +----------+-------------------------------------------------------+--------------------+
    | 37.5.1   | scripts/seed-iso-tier1.ts (NEW)                       | None               |
    |          | scripts/data/iso42001-controls.ts (NEW)                |                    |
    | 37.5.2   | application/services/ISOControlRetrievalService.ts    | 37.5.3             |
    |          | (NEW)                                                 |                    |
    | 37.5.3   | infrastructure/ai/prompts/scoringPrompt.iso.ts        | None               |
    |          | (MODIFY - replace placeholder)                        |                    |
    | 37.5.4   | domain/scoring/ScoringConfidenceValidator.ts (NEW)    | None               |
    +----------+-------------------------------------------------------+--------------------+
```

---

## Parallel Execution Strategy

### Phase 1: Independent Services (3 stories in parallel)

```
+------------------------------------------------------------------------+
|                     PHASE 1 - RUN IN PARALLEL                          |
|             (No file overlap between these stories)                    |
+------------------------+------------------------+----------------------+
|   37.5.1               |   37.5.2               |   37.5.4             |
|   Seed Script          |   ISO Retrieval Svc    |   Confidence Valid.  |
|                        |                        |                      |
|   FILES:               |   FILES:               |   FILES:             |
|   scripts/seed-iso-    |   ISOControlRetrieval  |   ScoringConfidence  |
|   tier1.ts (NEW)       |   Service.ts (NEW)     |   Validator.ts (NEW) |
|                        |                        |                      |
|   backend-agent        |   backend-agent        |   backend-agent      |
+------------------------+------------------------+----------------------+
```

**Stories:** 37.5.1, 37.5.2, 37.5.4
**Agents needed:** Up to 3
**File overlap:** None
**Review:** After all complete

### Phase 2: ISO Prompt Builder (depends on Phase 1)

```
+------------------------------------------------------------------------+
|                     PHASE 2 - SEQUENTIAL                               |
|         (Uses ISOControlRetrievalService + seed data from Phase 1)     |
+------------------------------------------------------------------------+
|   37.5.3                                                               |
|   ISO Prompt Builder                                                   |
|                                                                        |
|   FILES:                                                               |
|   - infrastructure/ai/prompts/scoringPrompt.iso.ts (MODIFY)           |
|                                                                        |
|   MUST wait for 37.5.1 (seed data needed for integration test)        |
|   MUST wait for 37.5.2 (uses ISOControlRetrievalService interface)    |
|                                                                        |
|   backend-agent                                                        |
+------------------------------------------------------------------------+
```

**Stories:** 37.5.3
**Dependencies:** 37.5.1, 37.5.2
**Review:** After complete (Sprint done)

---

## Story Files

| Story | File | Agent |
|-------|------|-------|
| 37.5.1 | `sprint-5-story-1.md` | backend-agent |
| 37.5.2 | `sprint-5-story-2.md` | backend-agent |
| 37.5.3 | `sprint-5-story-3.md` | backend-agent |
| 37.5.4 | `sprint-5-story-4.md` | backend-agent |

---

## Exit Criteria

Sprint 5 is complete when:
- [ ] Seed script loads Tier 1 data (ISO 42001 + 23894)
- [ ] ISOControlRetrievalService queries controls by dimension
- [ ] ISO prompt builder generates catalog and applicability sections from DB data
- [ ] ScoringConfidenceValidator validates H/M/L + rationale fields
- [ ] Unit tests for all 4 stories
- [ ] Integration test: seed script -> retrieval service -> prompt builder end-to-end (owned by Story 37.5.3, which depends on all upstream stories and can verify the full path)
- [ ] No TypeScript errors
