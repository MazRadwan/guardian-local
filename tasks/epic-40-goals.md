# Epic 40: Rubric v1.1 — Full 10-Dimension Weighted Scoring

**Branch:** `feat/rubric-v1.1-full-dimension-weights`
**Status:** Planning
**Source Spec:** `docs/guardian_v1.2_specification.md` (Section 1.3)
**Predecessor:** Epic 39 (Scoring Pipeline Optimization)

---

## Problem Statement

Guardian's scoring rubric (v1.0) only assigns composite weights to 5 of 10 risk dimensions.
The remaining 5 — Vendor Capability, AI Transparency, Ethical Considerations, Regulatory
Compliance, and Sustainability — are scored by Claude but carry 0% weight, meaning they
have zero impact on the composite score or recommendation.

This is a spec gap, not intentional design. The original rubric document (Part IV) only
defined weights for 5 dimensions. When `rubric.ts` was created, the missing 5 were
backfilled with 0. The v1.2 specification corrects this, defining weight ranges for all 10.

**Impact today:**
- Composite score reflects only half the risk picture
- A vendor scoring CRITICAL on regulatory_compliance has no composite score impact
- Recommendation logic for these 5 dimensions is entirely prompt-guided, not code-enforced
- Claude scores these dimensions without rubric criteria (no sub-score guidance)

---

## Goals

### Goal 1: Define Rubric Criteria for 5 Missing Dimensions (Design)

Create sub-score breakdowns for each unscored dimension, matching the pattern of the
existing 5 (Clinical Risk, Privacy Risk, Security Risk, Technical Credibility, Operational
Excellence). Each dimension needs 4-6 sub-scores summing to 100, with 3-5 discrete
allowed point values per sub-score.

**Dimensions needing criteria:**

| Dimension | Type | v1.2 Weight Range | v1.2 Factors |
|---|---|---|---|
| Vendor Capability | capability | 10-15% | Company stability, healthcare experience, customer references, support capability, roadmap credibility |
| AI Transparency | capability | 5-20% | Model explainability, audit trail, confidence scoring, limitations documentation, interpretability |
| Ethical Considerations | capability | 5-15% | Bias testing/mitigation, fairness across populations, equity impact, rural/Indigenous health, algorithmic justice |
| Regulatory Compliance | capability | 10-20% | Health Canada status, QMS (ISO 13485), clinical evidence standards, post-market surveillance, regulatory roadmap |
| Sustainability | capability | 10-20% | ITIL4 maturity (overlap with OpEx), NIST CSF tier, support model, BCP, total cost of ownership |

**Source:** v1.2 spec Section 1.3 factor lists. Sub-score point values and thresholds need
to be designed — the spec provides factors but not scoring granularity.

**Constraint:** Sub-scores must use discrete allowed values (not continuous ranges) to
enable SubScoreValidator enforcement, matching the pattern of existing dimensions.

---

### Goal 2: Define Specific Weight Values Per Solution Type

The v1.2 spec provides weight ranges, not fixed values. We need to pick specific values
for each of the 3 solution types such that all 10 dimensions sum to 100%.

**Current weights (v1.0) — only 5 non-zero:**

| Dimension | clinical_ai | administrative_ai | patient_facing |
|---|---|---|---|
| clinical_risk | 40 | 10 | 25 |
| privacy_risk | 20 | 30 | 35 |
| security_risk | 15 | 25 | 20 |
| technical_credibility | 15 | 15 | 12 |
| operational_excellence | 10 | 20 | 8 |
| vendor_capability | 0 | 0 | 0 |
| ai_transparency | 0 | 0 | 0 |
| ethical_considerations | 0 | 0 | 0 |
| regulatory_compliance | 0 | 0 | 0 |
| sustainability | 0 | 0 | 0 |

**Target:** Redistribute weights so all 10 are non-zero while preserving the relative
priority of the original 5 dimensions where feasible (clinical_risk remains dominant for
clinical_ai, privacy_risk dominant for administrative_ai). The `patient_facing` profile
is an exception: clinical_risk drops below security_risk because ethical_considerations
and ai_transparency now carry the patient-safety concerns that clinical_risk previously
proxied. See Story 40.1.2 for full rationale.
The existing 5 will have their weights reduced to make room for the new 5.

**Design decision:** How much weight to shift. Options:
- Conservative: New 5 get 15-25% combined (original 5 keep 75-85%)
- Balanced: New 5 get 25-35% combined (original 5 keep 65-75%)
- Equal: All 10 get ~10% (loses clinical nuance — not recommended)

---

### Goal 3: Update Code and Prompt Configuration

Once Goals 1 and 2 are decided, update the codebase:

**Backend changes:**
- `rubric.ts` — Update `DIMENSION_WEIGHTS` (30 values), bump `RUBRIC_VERSION` to `v1.1`
- `rubricCriteriaNew.ts` — Add 5 rubric criteria sections (new file, created by file split)
- `subScoreRules.ts` — Add sub-score rules for 5 new dimensions (allowed values, max points)
- `scoringPrompt.ts` — **[Codex Critical]** Fix composite formula instructions (lines 162-167):
  - Update CAPABILITY dimension list to include all 5 capability dims (not just 2)
  - Remove "All other dimensions are scored but do NOT contribute" line
  - Ensure prompt matches the new all-10-weighted reality

**Note:** The helpers file (296 LOC) would exceed 300 LOC after adding 5 new sections.
Must split `buildRubricCriteria()` FIRST into `rubricCriteria.ts` (orchestrator),
`rubricCriteriaExisting.ts` (5 existing dims), and `rubricCriteriaNew.ts` (5 new dims).
New criteria are added directly to `rubricCriteriaNew.ts` — helpers.ts never exceeds 300 LOC.

**Anti-drift contract test [Codex Medium]:** Add a test that asserts dimension coverage
in rubric criteria files (`rubricCriteria*.ts`) matches `subScoreRules.ts` (validator rules).
Prevents silent drift where prompt describes sub-scores the validator doesn't enforce, or
vice versa — which would cause retry churn.

**Auto-cascading changes (no code edits, different output):**
- `buildWeightedDimensions()` — Automatically shows all 10 (filters `weight > 0`)
- `exportNarrativeUserPrompt.ts` — "Weighting Applied" section expands from 5 to 10 lines
- `CompositeScoreValidator` — Automatically includes all 10 dimensions in validation
- Frontend `ScoreDashboard` / `ScoringResultCard` — Data-driven, renders whatever backend sends

---

### Goal 4: Update Tests

**Composite recalculation:**
- Recalculate `compositeScore` in all test payloads for new weight distributions
- Specific files with hardcoded `compositeScore: 63` (or similar):
  - `ScoringService.test.ts` — hardcoded composite based on old 5-weight shape
  - `scoring-trigger.test.ts` — integration test with old composite value

**Validator tests:**
- `CompositeScoreValidator.test.ts` — Remove "zero-weight dimensions optional" test,
  update to expect all 10 non-zero weights
- `subScoreRules.test.ts` — Remove assertions that new 5 dimensions have no rules;
  add tests for new sub-score rules
- `SubScoreValidator.test.ts` — Remove "skip dimensions without rules" for `vendor_capability`;
  add validation tests for all 5 new dimensions
- `ScoringPayloadValidator.test.ts` — Same: remove skip-without-rules assertions

**Version bump ripple [Codex High]:**
- All fixtures/assertions referencing `guardian-v1.0` must update to `guardian-v1.1`
- Scoring prompt test snapshots that embed version string
- Export test snapshots that embed version string
- Repository test fixtures using literal `guardian-v1.0`

**New tests:**
- Add sub-score validation tests for 5 new dimensions
- Update weight count assertions (5 → 10 non-zero)
- Regenerate golden-sample regression snapshot
- Add anti-drift contract test: rubric criteria dimension coverage === subScoreRules coverage

---

### Goal 5: End-to-End Validation

- Run live scoring test with updated rubric
- Verify Claude uses new sub-scores correctly for all 10 dimensions
- Verify composite score calculates correctly
- Check system prompt token budget (adding ~1500-2500 tokens of rubric criteria)
- Verify no retry regressions

---

## Out of Scope (Deferred)

| Item | Reason | When |
|---|---|---|
| Dimension renames (`vendor_capability` → `vendor_maturity`, `sustainability` → `integration_complexity`) | 20+ file change, DB migration, API contract break | Separate epic |
| `sustainability` type flip (`capability` → `risk`) | v1.2 spec classifies as RISK (integration_complexity), but current code has `capability`. Changing scoring direction without the rename creates confusing mismatch. | Bundle with rename epic |
| Recommendation threshold tightening (approve ≤20, decline ≥41 per v1.2) | Policy change, needs stakeholder sign-off | Can bundle with renames or do standalone |
| Code-enforced recommendation/dimension coherence | Currently prompt-guided only; adding a validator check for "no CRITICAL dimensions for approve" | Consider adding as safety net story |
| Programmatic tool calling | Not needed — scoring works in single pass after max_tokens fix | Revisit if batch scoring needed |

---

## Dependencies

- **Epic 39 (complete, merged):** Two-tier disqualifiers, composite score validator, sub-score
  validator, retry service. All infrastructure this epic builds on.
- **v1.2 Specification:** `docs/guardian_v1.2_specification.md` Section 1.3 provides factor
  lists and weight ranges for all 10 dimensions.
- **No database migration required:** `rubricVersion` is stored with each result, so old v1.0
  results remain valid. New results use v1.1 weights.
- **No frontend changes required:** Score display is data-driven.

---

## Risk Assessment

| Risk | Severity | Mitigation |
|---|---|---|
| Wrong sub-score definitions bias scoring | High | Base on v1.2 factors; review before merging |
| Scoring prompt contradicts new weights [Codex Critical] | High | Fix composite formula instructions in `scoringPrompt.ts` — must list all capability dims and remove "do NOT contribute" line |
| Weight redistribution changes composite for same vendor data | Medium | Expected and intentional; document in RUBRIC_VERSION bump |
| Prompt-validator drift causes retry churn [Codex Medium] | Medium | Add contract test: rubric criteria coverage === subScoreRules coverage |
| Sub-score presence not enforced [Codex Medium] | Medium | SubScoreValidator skips when `findings.subScores` is absent; consider adding presence check for weighted dimensions |
| Naming confusion during QA [Codex Medium] | Medium | Document canonical dimension name mapping (v1.0 names used, v1.2 renames deferred) in implementation notes |
| Version bump ripple wider than expected [Codex High] | Medium | Grep for `guardian-v1.0` across all test/fixture files before starting test updates |
| System prompt token budget exceeded | Low | Monitor; split rubric text into cacheable blocks if needed |
| Claude ignores new sub-scores | Low | Existing 5 dimensions follow sub-scores reliably; same pattern |
| Composite tolerance (±3) too tight with 10 dims | Low | Test with real payloads; bump to ±4-5 if needed |

---

## Estimated Effort

| Work Package | Effort | Notes |
|---|---|---|
| WP1: Define rubric criteria (5 dims) | 2-4 hours | Domain design work — the hard part |
| WP2: Define specific weights (3 profiles) | 1 hour | Decision, not code |
| WP3: Update code + prompts | 2-3 hours | Mechanical once WP1/WP2 decided |
| WP4: Update tests | 2-3 hours | Recalculate composites, add sub-score tests |
| WP5: End-to-end validation | 1-2 hours | Live scoring test |
| **Total** | **~1-2 days** | Small epic / large story |

---

## Codex Review (2026-02-24)

**Status:** Approved with conditions (all deltas incorporated above)

| # | Severity | Finding | Resolution |
|---|---|---|---|
| 1 | Critical | `scoringPrompt.ts` composite formula only lists 2 capability dims, says "other dims do NOT contribute" — contradicts all-10-weighted goal | Added to Goal 3 as explicit code change |
| 2 | High | Test update scope larger than listed — 6 specific test files with hardcoded assumptions | Expanded Goal 4 with file-level detail |
| 3 | High | Version bump `guardian-v1.0` → `v1.1` ripples into prompt tests, export snapshots, repository fixtures | Added to Goal 4 under "Version bump ripple" |
| 4 | Medium | No contract test between prompt rubric text and validator rules — risk of silent drift | Added anti-drift contract test to Goal 3 and Goal 4 |
| 5 | Medium | SubScoreValidator skips validation when `findings.subScores` absent — presence not enforced | Added to Risk Assessment; consider presence check for weighted dims |
| 6 | Medium | Naming confusion risk since renames deferred | Added to Risk Assessment; document canonical mapping |
