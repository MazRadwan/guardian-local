# Story 40.1.1: Define Rubric Criteria for 5 New Dimensions

## Description

Design and implement sub-score rubric criteria for the 5 dimensions that currently have
zero weight and no scoring guidance: Vendor Capability, AI Transparency, Ethical
Considerations, Regulatory Compliance, and Sustainability.

Each dimension needs 4-6 sub-scores with discrete allowed point values summing to 100,
matching the pattern of the existing 5 dimensions. These criteria tell Claude exactly how
to score each dimension and enable SubScoreValidator enforcement.

This is the core design work of Epic 40 — the hardest and most important story.

## Acceptance Criteria

- [ ] 5 new dimension entries added to `SUB_SCORE_RULES` in `subScoreRules.ts`
- [ ] Each dimension has 4-6 sub-scores with discrete `allowedValues`
- [ ] Each dimension's sub-score `maxPoints` sum to 100
- [ ] 5 new rubric criteria sections added to `rubricCriteriaNew.ts` (via `buildNewDimensionCriteria()`)
- [ ] Rubric text includes sub-score names, point values, and rating scale
- [ ] Capability dimensions scored higher = better (matching existing pattern)
- [ ] Sub-score names derived from v1.2 spec factor lists
- [ ] No TypeScript errors

## Technical Approach

### 1. Sub-Score Rules (subScoreRules.ts)

Add entries for each dimension to `SUB_SCORE_RULES`. Source factors from
`docs/guardian_v1.2_specification.md` Section 1.3.

**Vendor Capability (capability, higher = better, 5 sub-scores):**

| Sub-Score | Max | Allowed Values | Rationale |
|-----------|-----|----------------|-----------|
| company_stability_score | 25 | [0, 8, 15, 25] | Funding, revenue, years in market |
| healthcare_experience_score | 25 | [0, 8, 15, 25] | Healthcare-specific deployments |
| customer_references_score | 20 | [0, 6, 12, 20] | Verifiable healthcare references |
| support_capability_score | 15 | [0, 5, 10, 15] | Support model, SLA, responsiveness |
| roadmap_credibility_score | 15 | [0, 5, 10, 15] | Product roadmap, R&D investment |

**AI Transparency (capability, higher = better, 5 sub-scores):**

| Sub-Score | Max | Allowed Values | Rationale |
|-----------|-----|----------------|-----------|
| model_explainability_score | 25 | [0, 8, 15, 25] | Can outputs be explained to clinicians? |
| audit_trail_score | 25 | [0, 8, 15, 25] | Decision logging, reproducibility |
| confidence_scoring_score | 20 | [0, 6, 12, 20] | Model reports confidence/uncertainty |
| limitations_documentation_score | 15 | [0, 5, 10, 15] | Known limitations documented |
| interpretability_score | 15 | [0, 5, 10, 15] | Black box vs interpretable model |

**Ethical Considerations (capability, higher = better, 5 sub-scores):**

| Sub-Score | Max | Allowed Values | Rationale |
|-----------|-----|----------------|-----------|
| bias_testing_score | 25 | [0, 8, 15, 25] | Systematic bias testing and mitigation |
| population_fairness_score | 25 | [0, 8, 15, 25] | Fairness across demographics |
| equity_impact_score | 20 | [0, 6, 12, 20] | Impact on health equity |
| indigenous_rural_health_score | 15 | [0, 5, 10, 15] | Rural/Indigenous population consideration |
| algorithmic_justice_score | 15 | [0, 5, 10, 15] | Algorithmic accountability framework |

**Regulatory Compliance (capability, higher = better, 5 sub-scores):**

| Sub-Score | Max | Allowed Values | Rationale |
|-----------|-----|----------------|-----------|
| health_canada_status_score | 25 | [0, 8, 15, 25] | Approval/review/submission status |
| qms_maturity_score | 25 | [0, 8, 15, 25] | ISO 13485 or equivalent QMS |
| clinical_evidence_score | 20 | [0, 6, 12, 20] | Evidence standards and rigor |
| post_market_surveillance_score | 15 | [0, 5, 10, 15] | Ongoing monitoring program |
| regulatory_roadmap_score | 15 | [0, 5, 10, 15] | Planned regulatory milestones |

**Sustainability (capability, higher = better, 5 sub-scores):**

| Sub-Score | Max | Allowed Values | Rationale |
|-----------|-----|----------------|-----------|
| itil4_service_maturity_score | 25 | [0, 8, 15, 25] | Service management maturity |
| nist_csf_alignment_score | 20 | [0, 6, 12, 20] | Cybersecurity framework tier |
| support_model_sustainability_score | 20 | [0, 6, 12, 20] | Long-term support viability |
| bcp_disaster_recovery_score | 20 | [0, 6, 12, 20] | Business continuity planning |
| total_cost_of_ownership_score | 15 | [0, 5, 10, 15] | TCO reasonableness |

### 2. Rubric Criteria Text (rubricCriteriaNew.ts)

Add 5 new dimension sections to `buildNewDimensionCriteria()` in `rubricCriteriaNew.ts`
(created by Story 40.1.4). Follow the existing pattern. Each section includes:
- Dimension name and scale direction (0-100, higher is better)
- Sub-score list with point values and descriptive labels
- Rating scale (80-100 Excellent, 60-79 Good, 40-59 Adequate, 0-39 Poor)

**Pattern to follow** (from existing Technical Credibility section):
```
### VENDOR CAPABILITY (0-100, higher is better)

**Sub-scores:**
- company_stability_score (25 points max):
  - established_funded_stable: 25 points (excellent)
  - growing_adequately_funded: 15 points (good)
  - early_stage_funded: 8 points (moderate)
  - unstable_or_unfunded: 0 points (poor)

... (remaining sub-scores)

**Vendor Capability Rating:**
- 80-100: Excellent
- 60-79: Good
- 40-59: Adequate
- 0-39: Poor
```

### 3. Change SUB_SCORE_RULES Type to Full Record

After all 10 dimensions have rules, change the type from `Partial<Record<RiskDimension, ...>>`
to `Record<RiskDimension, ...>` to enforce compile-time completeness.

**[Architect review finding]:** This prevents future regressions where someone adds a
dimension but forgets sub-score rules.

**IMPORTANT: Keep runtime `if (!rules)` guard in SubScoreValidator (line 71).**
Even though the type change makes the guard appear as dead code, retain it as a
defensive runtime safety net. The type system enforces completeness at compile time,
but the runtime guard protects against edge cases (e.g., dynamic dimension values,
deserialized data). Do NOT remove the guard — only change the type signature.

### 4. Helper Function Updates

After adding 5 new entries, verify:
- `getExpectedMaxTotal()` returns 100 for each new dimension
- `getValidSubScoreNames()` returns correct Set for each new dimension

### 5. Implementation Sequencing with Story 40.1.4

**CRITICAL: The file split (40.1.4) MUST happen before or alongside adding rubric criteria.**
`scoringPrompt.helpers.ts` is currently 296 LOC. Adding 5 new rubric sections would inflate
it to ~590 LOC, violating the 300 LOC hard rule. The helpers.ts file must NEVER balloon
to 500+ LOC during execution, even temporarily.

**Required execution order:**
1. Extract existing `buildRubricCriteria()` into the 3-file split (40.1.4 structure)
2. Add new rubric criteria directly to `rubricCriteriaNew.ts` (never touches helpers.ts)
3. Add new SUB_SCORE_RULES entries to `subScoreRules.ts`

The implementer should execute 40.1.4's file split FIRST, then add 40.1.1's content
into the already-split structure. This is a sequencing constraint, not a dependency change —
both stories are still logically separate but must be implemented in this order.

## Files Touched

- `packages/backend/src/domain/scoring/subScoreRules.ts` - MODIFY (add 5 dimension entries, change type to full Record, ~86 → ~130 LOC)
- `packages/backend/src/domain/scoring/SubScoreValidator.ts` - MODIFY (keep `if (!rules)` guard, only change type annotation if needed)
- `packages/backend/src/infrastructure/ai/prompts/rubricCriteriaNew.ts` - MODIFY (add 5 rubric sections here, NOT in helpers.ts — created by 40.1.4)

## Agent Assignment

- [x] backend-agent

## Tests Required

- [ ] `packages/backend/__tests__/unit/domain/scoring/subScoreRules.test.ts`
  - Test each new dimension has rules defined
  - Test `getExpectedMaxTotal()` returns 100 for each new dimension
  - Test `getValidSubScoreNames()` returns correct names for each new dimension
  - Test all allowed values are valid numbers

## Definition of Done

- [ ] 5 new dimension entries in SUB_SCORE_RULES
- [ ] Each dimension has 5 sub-scores summing to 100
- [ ] 5 new rubric criteria sections in rubricCriteriaNew.ts
- [ ] Sub-score names match between subScoreRules.ts and rubric criteria text
- [ ] Helper functions work for all 10 dimensions
- [ ] No TypeScript errors
- [ ] No lint errors
