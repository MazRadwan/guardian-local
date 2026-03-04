# Sprint 1: Rubric v1.1 — Full 10-Dimension Weighted Scoring

**Epic:** 40 - Rubric v1.1
**Branch:** `feat/rubric-v1.1-full-dimension-weights`
**Stories:** 40.1.1 - 40.1.7 (7 stories)
**Estimated Effort:** 8-12 hours
**Dependencies:** Epic 39 complete and merged to main
**Agents:** `backend-agent`

---

## Context

Guardian's scoring rubric (v1.0) only assigns composite weights to 5 of 10 risk dimensions.
The remaining 5 — Vendor Capability, AI Transparency, Ethical Considerations, Regulatory
Compliance, and Sustainability — are scored by Claude but carry 0% weight, meaning they
have zero impact on the composite score or recommendation.

This sprint corrects the gap by:
1. Designing sub-score rubric criteria for the 5 missing dimensions
2. Assigning non-zero weights per solution type
3. Fixing the scoring prompt composite formula instructions
4. Splitting the helpers file to stay under 300 LOC
5. Updating all tests and snapshots

**Source spec:** `docs/guardian_v1.2_specification.md` Section 1.3

---

## Stories

| Story | Name | Focus | Dependencies |
|-------|------|-------|--------------|
| **40.1.4** | Split scoringPrompt.helpers.ts | Extract rubric criteria to new files | None (executes FIRST) |
| **40.1.1** | Define rubric criteria for 5 new dimensions | subScoreRules.ts + rubricCriteriaNew.ts | 40.1.4 |
| **40.1.2** | Update dimension weights to v1.1 | rubric.ts weights + version bump | 40.1.1 |
| **40.1.3** | Fix scoring prompt composite formula | scoringPrompt.ts lines 162-167 | 40.1.2 |
| **40.1.5** | Update unit tests for new rubric | 17 test files: composites, assertions, version strings | 40.1.1, 40.1.2, 40.1.3, 40.1.4 |
| **40.1.6** | Add anti-drift contract test | Rubric criteria ↔ subScoreRules alignment | 40.1.1, 40.1.4 |
| **40.1.7** | Update golden-sample regression snapshot | Regenerate snapshot with v1.1 | 40.1.5 |

---

## Dependency Graph

```
                    SPRINT 1 DEPENDENCIES

    40.1.4 (Split Helpers) ←── MUST execute first (300 LOC constraint)
        │
        ▼
    40.1.1 (Rubric Criteria) ←── adds to rubricCriteriaNew.ts
        │
        ▼
    40.1.2 (Weights)
        │
        ▼
    40.1.3 (Prompt Fix)
        │
        ▼
    40.1.5 (Update Tests)
        │
        ▼
    40.1.6 (Contract Test)
        │
        ▼
    40.1.7 (Golden Snapshot)
```

---

## File Overlap Analysis

```
┌─────────┬──────────────────────────────────────────────────────┬──────────────┐
│ Story   │ Files Touched                                        │ Conflicts    │
├─────────┼──────────────────────────────────────────────────────┼──────────────┤
│ 40.1.4  │ scoringPrompt.helpers.ts, rubricCriteria*.ts (3 NEW) │ None (first) │
│ 40.1.1  │ subScoreRules.ts, rubricCriteriaNew.ts               │ None         │
│ 40.1.2  │ rubric.ts                                            │ None         │
│ 40.1.3  │ scoringPrompt.ts                                     │ None         │
│ 40.1.5  │ 17 test files (version ripple)                       │ 40.1.6       │
│ 40.1.6  │ 1 new test file                                      │ None         │
│ 40.1.7  │ golden-sample snapshot                               │ None         │
└─────────┴──────────────────────────────────────────────────────┴──────────────┘
```

---

## Parallel Execution Strategy

### Phase 1: File Split + Rubric Design (2 stories — split FIRST, then criteria)

```
┌────────────────────────────────────────────────────────────────────┐
│                   PHASE 1 - SEQUENTIAL (BLOCKING)                  │
├────────────────────────────────────────────────────────────────────┤
│   40.1.4 (FIRST)                                                   │
│   Split scoringPrompt.helpers.ts into 3-file structure             │
│   (Extract existing buildRubricCriteria → rubricCriteria*.ts)      │
│   Must happen BEFORE adding new criteria to avoid 300 LOC          │
│   violation in helpers.ts                                          │
│                                                                    │
│   THEN:                                                            │
│                                                                    │
│   40.1.1                                                           │
│   Define Rubric Criteria for 5 New Dimensions                      │
│   (subScoreRules.ts + rubricCriteriaNew.ts — NOT helpers.ts)       │
│                                                                    │
│   THE HARD PART — domain design decisions                          │
│   backend-agent                                                    │
└────────────────────────────────────────────────────────────────────┘
```

**Stories:** 40.1.4 then 40.1.1
**Agents needed:** 1
**Dependencies:** None (but 40.1.4 MUST execute before 40.1.1)
**Sequencing rationale:** helpers.ts is 296 LOC. Adding 5 rubric sections would inflate
it to ~590 LOC, violating the 300 LOC hard rule. The split creates `rubricCriteriaNew.ts`
where new criteria are added directly, so helpers.ts never exceeds 300 LOC.
**Review:** After both complete — rubric criteria review is the quality gate

---

### Phase 2: Weights (1 story)

```
┌────────────────────────────────────────────────────────────────────┐
│                   PHASE 2 - SEQUENTIAL                             │
├────────────────────────────────────────────────────────────────────┤
│   40.1.2                                                           │
│   Update Weights to v1.1                                           │
│   (rubric.ts — needs rubric criteria from 40.1.1 to exist first)  │
│                                                                    │
│   backend-agent                                                    │
└────────────────────────────────────────────────────────────────────┘
```

**Stories:** 40.1.2
**Agents needed:** 1
**Dependencies:** 40.1.1 (rubric criteria must exist first)
**Review:** After complete

---

### Phase 3: Prompt Fix (1 story)

```
┌────────────────────────────────────────────────────────────────────┐
│                   PHASE 3 - SEQUENTIAL                             │
├────────────────────────────────────────────────────────────────────┤
│   40.1.3                                                           │
│   Fix Scoring Prompt Composite Formula                             │
│   (scoringPrompt.ts — needs weight values from 40.1.2)             │
│                                                                    │
│   backend-agent                                                    │
└────────────────────────────────────────────────────────────────────┘
```

**Stories:** 40.1.3
**Agents needed:** 1
**Dependencies:** 40.1.2 (needs to know which dims are risk vs capability with weights)
**Review:** After complete

---

### Phase 4: Tests (2 stories — can overlap if no file conflict)

```
┌────────────────────────────────────────────────────────────────────┐
│                   PHASE 4 - SEQUENTIAL                             │
│              (40.1.5 first, then 40.1.6 can overlap)               │
├────────────────────────────────────────────────────────────────────┤
│   40.1.5                                                           │
│   Update Unit Tests for New Rubric                                 │
│   (17 test files: composites, assertions, version strings)         │
│                                                                    │
│   40.1.6                                                           │
│   Add Anti-Drift Contract Test                                     │
│   (new test file — no overlap with 40.1.5)                         │
│                                                                    │
│   backend-agent                                                    │
└────────────────────────────────────────────────────────────────────┘
```

**Stories:** 40.1.5, 40.1.6
**Agents needed:** 1-2
**Dependencies:** 40.1.5 depends on 40.1.1-40.1.4 all complete
**Review:** After both complete — all tests must pass

---

### Phase 5: Golden Snapshot (1 story — final)

```
┌────────────────────────────────────────────────────────────────────┐
│                   PHASE 5 - FINAL                                  │
├────────────────────────────────────────────────────────────────────┤
│   40.1.7                                                           │
│   Regenerate Golden-Sample Regression Snapshot                     │
│                                                                    │
│   backend-agent                                                    │
└────────────────────────────────────────────────────────────────────┘
```

**Stories:** 40.1.7
**Agents needed:** 1
**Dependencies:** 40.1.5 must pass (all tests green)
**Review:** After complete (Sprint 1 complete)

---

## Review Checkpoints

| Checkpoint | After Phase | Stories to Review | Focus |
|------------|-------------|-------------------|-------|
| **Review 1** | Phase 1 | 40.1.4, 40.1.1 | File split correctness, rubric criteria quality — are sub-scores defensible? |
| **Review 2** | Phase 2+3 | 40.1.2, 40.1.3 | Weight distribution (check deviations), prompt accuracy, dynamic generation |
| **Review 3** | Phase 4+5 | 40.1.5, 40.1.6, 40.1.7 | Test coverage, anti-drift, snapshot validity |

---

## Story Files

| Story | File | Agent |
|-------|------|-------|
| 40.1.1 | `sprint-1-story-1.md` | backend-agent |
| 40.1.2 | `sprint-1-story-2.md` | backend-agent |
| 40.1.3 | `sprint-1-story-3.md` | backend-agent |
| 40.1.4 | `sprint-1-story-4.md` | backend-agent |
| 40.1.5 | `sprint-1-story-5.md` | backend-agent |
| 40.1.6 | `sprint-1-story-6.md` | backend-agent |
| 40.1.7 | `sprint-1-story-7.md` | backend-agent |

---

## Key Design Decisions

### 1. Sustainability Stays as `capability` Type

The v1.2 spec reclassifies sustainability as a RISK dimension (`integration_complexity`,
lower is better). However, since dimension renames are out of scope for Epic 40, changing
the scoring direction without the rename creates a confusing mismatch — a dimension called
"Sustainability" scored as a risk. The type flip is deferred to the rename epic.

### 2. Balanced Weight Redistribution

New 5 dimensions get 25-35% combined weight (original 5 keep 65-75%). This preserves
clinical_risk as the dominant weight for clinical_ai while giving meaningful influence
to the new dimensions. See Story 40.1.2 for exact values.

### 3. Sub-Score Design Pattern

Each new dimension follows the established pattern: 4-6 sub-scores with discrete allowed
point values summing to 100. Capability dimensions score higher = better. This enables
SubScoreValidator enforcement without special-casing.

### 4. File Split Strategy

`scoringPrompt.helpers.ts` (296 LOC) will exceed 300 LOC after adding 5 rubric sections.
Extract `buildRubricCriteria()` into `rubricCriteria.ts`. The helpers file keeps the
dimension list builder, disqualifier list builder, and response formatter.

---

## Success Metrics

- [ ] All 10 dimensions have non-zero weights for all 3 solution types
- [ ] All 10 dimensions have sub-score rules in subScoreRules.ts
- [ ] All 10 dimensions have rubric criteria in scoring prompt
- [ ] Scoring prompt composite formula lists all 10 dimensions correctly
- [ ] RUBRIC_VERSION bumped to `guardian-v1.1`
- [ ] Anti-drift contract test verifies rubric criteria ↔ subScoreRules alignment
- [ ] All source files under 300 LOC
- [ ] All unit tests passing
- [ ] All integration tests passing
- [ ] Golden-sample snapshot regenerated

---

## Review Findings (2026-02-24)

**Architect Review:** 2 HIGH, 3 MEDIUM, 1 LOW — all addressed in spec updates.
**Spec Review:** 0 BLOCKER, 7 WARNING, 11 NOTE — all addressed in spec updates.

| # | Source | Severity | Finding | Resolution |
|---|--------|----------|---------|------------|
| 1 | Architect | HIGH | Version string ripple: 9+ test files (40 occurrences), not 7 | Story 40.1.5 expanded to 17 files |
| 2 | Architect | HIGH | rubricCriteria.ts split deferred to implementer | Story 40.1.4 rewritten with mandatory 3-file split |
| 3 | Both | MEDIUM | golden-sample user prompt weight assertions (lines 183-186) | Added to Story 40.1.7 |
| 4 | Architect | MEDIUM | data_governance bug also in ScoringRehydrationController.test.ts | Added to Story 40.1.5 |
| 5 | Architect | MEDIUM | SUB_SCORE_RULES should change from Partial to full Record | Added to Story 40.1.1 |
| 6 | Spec | WARNING | .toBe(63) attributed to wrong file | Fixed in Story 40.1.5 |
| 7 | Spec | WARNING | ScoringService.test.ts line 277 progress message missed | Added to Story 40.1.5 |
| 8 | Spec | WARNING | scoringPrompt.test.ts needs 5 new dim assertions | Added to Story 40.1.5 |
| 9 | Spec | NOTE | subScoreRules.test.ts "if exists" — it does exist | Qualifier removed in Story 40.1.5 |
| 10 | Spec | NOTE | Export snapshots may need regeneration | Added to Story 40.1.7 |

---

## Exit Criteria

Sprint 1 is complete when:

- [ ] Stories 40.1.1-40.1.7 implemented
- [ ] All 10 dimensions fully weighted and scored
- [ ] Scoring prompt accurately reflects all-10-weighted reality
- [ ] All tests passing (unit + integration)
- [ ] Golden-sample snapshot updated
- [ ] Code reviewed and approved
- [ ] No TypeScript errors, no lint errors
