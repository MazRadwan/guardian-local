# Sprint 6: Scoring Pipeline Enrichment

**Epic:** 37 - ISO Foundation + Scoring Enrichment
**Focus:** Wire ISO + confidence into the scoring pipeline end-to-end
**Stories:** 37.6.1 - 37.6.5 (5 stories)
**Dependencies:** Sprint 5 complete (services, prompt builder, confidence validator exist)
**Agents:** `backend-agent`

---

## Context

This is the integration sprint. All the pieces exist (database, entities, repos, services, prompt builders, validators). Now we wire them into the existing scoring pipeline:
1. Update the tool schema (what Claude outputs)
2. Update the types/DTOs (what TypeScript expects)
3. Update the validator (what we check)
4. Update the prompts (what Claude sees)
5. Wire it all together in ScoringService + DI container

---

## Stories

| Story | Name | Focus | Dependencies |
|-------|------|-------|--------------|
| **37.6.1** | Update scoringComplete tool schema | Add assessmentConfidence + isoClauseReferences to tool | None |
| **37.6.2** | Update scoring types + DTOs | Add ISO fields to DimensionScoreData findings type | 37.6.1 |
| **37.6.3** | Update ScoringPayloadValidator | Add ISO + confidence validation via delegated validators | 37.6.1 |
| **37.6.4** | Update ScoringPromptBuilder + scoringPrompt | Inject ISO catalog into system prompt, applicability into user prompt | None |
| **37.6.5** | Wire into ScoringService + DI container | Connect ISO services, increase maxTokens, update DI | 37.6.1-37.6.4 |

---

## Dependency Graph

```
    File Overlap Analysis:
    +----------+-------------------------------------------------------+--------------------+
    | Story    | Files Touched                                         | Conflicts          |
    +----------+-------------------------------------------------------+--------------------+
    | 37.6.1   | domain/scoring/tools/scoringComplete.ts (MODIFY)      | None               |
    +----------+-------------------------------------------------------+--------------------+
    | 37.6.2   | domain/scoring/types.ts (MODIFY)                      | None               |
    |          | domain/scoring/dtos.ts (MODIFY)                       |                    |
    +----------+-------------------------------------------------------+--------------------+
    | 37.6.3   | domain/scoring/ScoringPayloadValidator.ts (MODIFY)    | None               |
    +----------+-------------------------------------------------------+--------------------+
    | 37.6.4   | infrastructure/ai/ScoringPromptBuilder.ts (MODIFY)    | None               |
    |          | infrastructure/ai/prompts/scoringPrompt.ts (MODIFY)   |                    |
    |          | application/interfaces/IPromptBuilder.ts (MODIFY)     |                    |
    +----------+-------------------------------------------------------+--------------------+
    | 37.6.5   | application/services/ScoringService.ts (MODIFY)       | None               |
    |          | application/services/ScoringLLMService.ts (MODIFY)    |                    |
    |          | index.ts (MODIFY)                                     |                    |
    +----------+-------------------------------------------------------+--------------------+
```

---

## Parallel Execution Strategy

### Phase 1: Schema + Prompt Updates (2 stories in parallel)

```
+------------------------------------------------------------------------+
|                     PHASE 1 - RUN IN PARALLEL                          |
|             (No file overlap between these stories)                    |
+------------------------------------+-----------------------------------+
|   37.6.1                           |   37.6.4                          |
|   Tool Schema Update               |   Prompt Builder Update           |
|                                    |                                   |
|   FILES:                           |   FILES:                          |
|   scoringComplete.ts               |   ScoringPromptBuilder.ts         |
|                                    |   scoringPrompt.ts                |
|                                    |   IPromptBuilder.ts               |
|   backend-agent                    |   backend-agent                   |
+------------------------------------+-----------------------------------+
```

**Stories:** 37.6.1, 37.6.4
**Agents needed:** 2
**File overlap:** None

### Phase 2: Types + Validator (2 stories in parallel, depends on Phase 1)

```
+------------------------------------------------------------------------+
|                     PHASE 2 - RUN IN PARALLEL                          |
|              (Depends on tool schema from Phase 1)                     |
+------------------------------------+-----------------------------------+
|   37.6.2                           |   37.6.3                          |
|   Types + DTOs                     |   Validator Update                |
|                                    |                                   |
|   FILES:                           |   FILES:                          |
|   domain/scoring/types.ts          |   ScoringPayloadValidator.ts      |
|   domain/scoring/dtos.ts           |                                   |
|                                    |                                   |
|   backend-agent                    |   backend-agent                   |
+------------------------------------+-----------------------------------+
```

**Stories:** 37.6.2, 37.6.3
**Dependencies:** 37.6.1 (schema defines what fields exist)
**Agents needed:** 2

### Phase 3: Integration Wiring (sequential)

```
+------------------------------------------------------------------------+
|                     PHASE 3 - SEQUENTIAL                               |
|              (Depends on all Phase 1 + Phase 2 stories)                |
+------------------------------------------------------------------------+
|   37.6.5                                                               |
|   Wire into ScoringService + DI container                              |
|                                                                        |
|   FILES:                                                               |
|   - ScoringService.ts (MODIFY)                                        |
|   - ScoringLLMService.ts (MODIFY)                                     |
|   - index.ts (MODIFY)                                                 |
|                                                                        |
|   MUST wait for 37.6.1-37.6.4 to complete                             |
|                                                                        |
|   backend-agent                                                        |
+------------------------------------------------------------------------+
```

**Stories:** 37.6.5
**Dependencies:** All Phase 1 + Phase 2

---

## Story Files

| Story | File | Agent |
|-------|------|-------|
| 37.6.1 | `sprint-6-story-1.md` | backend-agent |
| 37.6.2 | `sprint-6-story-2.md` | backend-agent |
| 37.6.3 | `sprint-6-story-3.md` | backend-agent |
| 37.6.4 | `sprint-6-story-4.md` | backend-agent |
| 37.6.5 | `sprint-6-story-5.md` | backend-agent |

---

## Exit Criteria

Sprint 6 is complete when:
- [ ] Tool schema includes assessmentConfidence + isoClauseReferences
- [ ] Types/DTOs reflect new ISO fields in findings JSONB
- [ ] Validator checks confidence + ISO fields (soft warnings)
- [ ] Prompts inject ISO catalog (system) and applicability (user)
- [ ] ScoringService wired to ISO services
- [ ] maxTokens increased from 8000 to 10000
- [ ] All existing tests pass
- [ ] New unit tests for all changes
- [ ] Contract test (scoringContract.test.ts) updated and passing
- [ ] No TypeScript errors
