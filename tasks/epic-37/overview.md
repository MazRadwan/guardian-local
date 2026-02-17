# Epic 37: ISO Foundation + Scoring Enrichment

**Goal:** Build the database foundation for ISO compliance frameworks and enrich the scoring pipeline with explainability, confidence assessment, and ISO traceability.

**Agent:** `backend-agent` (all stories)

---

## Sprint Summary

| Sprint | Name | Stories | Focus | Depends On |
|--------|------|---------|-------|------------|
| 1 | Refactoring Splits | 37.1.1 - 37.1.5 (5) | Split ScoringService, scoringPrompt, ScoringPayloadValidator to stay under 300 LOC | None |
| 2 | Database Foundation | 37.2.1 - 37.2.8 (8) | 6 new tables + schema index + test-db update + migrations | Sprint 1 |
| 3 | Domain Layer | 37.3.1 - 37.3.5 (5) | Domain entities, value objects, ISO types | Sprint 2 |
| 4 | Repository Layer | 37.4.1 - 37.4.5 (5) | Repository interfaces + Drizzle implementations | Sprint 3 |
| 5 | Seed Data + ISO Services | 37.5.1 - 37.5.4 (4) | Tier 1 seed script, ISOControlRetrievalService, ISO prompt builder | Sprint 4 |
| 6 | Scoring Pipeline Enrichment | 37.6.1 - 37.6.5 (5) | Tool schema, prompt injection, validator, integration wiring | Sprint 5 |
| 7 | Validation + Regression | 37.7.1 - 37.7.3 (3) | Golden sample baseline, extensibility test, messaging audit | Sprint 6 |

**Total: 35 stories across 7 sprints**

---

## Cross-Sprint Dependency Graph

```
Sprint 1: Refactoring Splits (BLOCKER)
  ├── ScoringService.ts split (542 LOC -> orchestrator + helpers)
  ├── scoringPrompt.ts split (348 LOC -> main + ISO file placeholder)
  └── ScoringPayloadValidator.ts prep (275 LOC -> extract confidence validator)
      │
      v
Sprint 2: Database Foundation
  ├── compliance_frameworks schema
  ├── framework_versions schema
  ├── framework_controls schema
  ├── interpretive_criteria schema
  ├── dimension_control_mappings schema
  ├── assessment_compliance_results schema
  ├── schema/index.ts barrel exports
  └── test-db.ts truncation update
      │
      v
Sprint 3: Domain Layer
  ├── ISO types (types + DTOs)
  ├── ComplianceFramework entity
  ├── FrameworkVersion entity
  ├── FrameworkControl value object
  ├── InterpretiveCriteria value object
  └── DimensionControlMapping value object
      │
      v
Sprint 4: Repository Layer
  ├── IComplianceFrameworkRepository + Drizzle impl
  ├── IFrameworkVersionRepository + Drizzle impl
  ├── IFrameworkControlRepository + Drizzle impl
  ├── IInterpretiveCriteriaRepository + Drizzle impl
  └── IDimensionControlMappingRepository + Drizzle impl
      │
      v
Sprint 5: Seed Data + ISO Services
  ├── Tier 1 seed script (ISO 42001 + 23894)
  ├── ISOControlRetrievalService
  ├── scoringPrompt.iso.ts (ISO prompt builder)
  └── ScoringConfidenceValidator
      │
      v
Sprint 6: Scoring Pipeline Enrichment
  ├── scoringComplete.ts tool schema update
  ├── scoring types + DTOs ISO fields
  ├── ScoringPayloadValidator ISO + confidence validation
  ├── ScoringPromptBuilder + scoringPrompt ISO injection
  └── ScoringService integration wiring + maxTokens
      │
      v
Sprint 7: Validation + Regression
  ├── Golden sample regression baseline
  ├── Extensibility test (fake Tier 2)
  └── ISO messaging compliance audit
```

---

## Quality Gates

| Gate | Sprint | Criterion |
|------|--------|-----------|
| G1 | After Sprint 1 | All 3 split files under 300 LOC, all existing tests pass |
| G2 | After Sprint 2 | Migrations apply cleanly to both dev and test DB |
| G3 | After Sprint 4 | Repository integration tests pass with real test DB |
| G4 | After Sprint 5 | Seed script loads Tier 1 data, retrieval service queries it |
| G5 | After Sprint 6 | Scoring pipeline produces ISO refs + confidence per dimension |
| G6 | After Sprint 7 | Golden sample regression passes, extensibility test passes |

---

## Scope Exclusions (Confirmed)

- D-10 (rawToolPayload): Already implemented, confirmed by audit
- Export templates (PDF, Word, Excel): Epic 38
- Frontend UI components: Epic 38
- `guardian-prompt.md` (chat prompt): Not modified for ISO
- Question generation pipeline: Unchanged
- Intake extraction pipeline: Unchanged
- Tier 2/3 standards: Validated via extensibility test only

---

## Key Files Modified (Across All Sprints)

| File | Sprint | Change |
|------|--------|--------|
| `application/services/ScoringService.ts` | 1, 6 | Split to orchestrator; wire ISO services |
| `infrastructure/ai/prompts/scoringPrompt.ts` | 1, 6 | Split; add ISO catalog section |
| `domain/scoring/ScoringPayloadValidator.ts` | 1, 6 | Prep for confidence; add ISO validation |
| `domain/scoring/tools/scoringComplete.ts` | 6 | Add confidence + ISO clause fields |
| `domain/scoring/types.ts` | 6 | Add ISO + confidence types |
| `domain/scoring/dtos.ts` | 6 | Add ISO fields to findings |
| `infrastructure/ai/ScoringPromptBuilder.ts` | 6 | Add ISO prompt methods |
| `infrastructure/database/schema/index.ts` | 2 | Add 6 new table exports |
| `__tests__/setup/test-db.ts` | 2 | Add 6 tables to TRUNCATE list |
| `index.ts` (DI container) | 6 | Wire new services |

All paths relative to `packages/backend/src/`.
