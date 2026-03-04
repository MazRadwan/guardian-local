# Story 40.1.3: Fix Scoring Prompt Composite Formula

## Description

Fix the composite formula instructions in `scoringPrompt.ts` (lines 162-167) that
currently hardcode only 2 capability dimensions and state "All other dimensions are
scored but do NOT contribute to the composite score." After Epic 40, all 10 dimensions
contribute — this text becomes dangerously misleading.

This was flagged as **Critical** by the Codex review.

## Acceptance Criteria

- [ ] Dimension lists generated dynamically from DIMENSION_CONFIG (MANDATORY — no hardcoded lists)
- [ ] Composite formula text lists all RISK dimensions (3: clinical_risk, privacy_risk, security_risk)
- [ ] Composite formula text lists all CAPABILITY dimensions (7: technical_credibility, operational_excellence, vendor_capability, ai_transparency, ethical_considerations, regulatory_compliance, sustainability)
- [ ] "All other dimensions are scored but do NOT contribute" line removed
- [ ] Example calculation updated to reflect new weight values
- [ ] No TypeScript errors

## Technical Approach

### 1. Update buildVendorSection() in scoringPrompt.ts

Replace the hardcoded composite formula text (lines 161-167):

**Before:**
```
**Composite Formula:**
- For RISK dimensions (clinical_risk, privacy_risk, security_risk): use score directly (lower = less risk)
- For CAPABILITY dimensions (technical_credibility, operational_excellence): convert to risk-equivalent = (100 - score)
- Composite = sum of (weight% x risk_equivalent_score) for all weighted dimensions
- Example: if clinical_risk=20 (weight 40%) and technical_credibility=80 (weight 15%): contribution = 20x0.40 + (100-80)x0.15 = 8 + 3 = 11

All other dimensions are scored but do NOT contribute to the composite score.
```

**After:**
```
**Composite Formula:**
- For RISK dimensions (clinical_risk, privacy_risk, security_risk): use score directly (lower = less risk)
- For CAPABILITY dimensions (all others): convert to risk-equivalent = (100 - score)
- Composite = sum of (weight% x risk_equivalent_score) for ALL dimensions listed above
- All 10 dimensions contribute to the composite score
- Example: if clinical_risk=20 (weight 25%) and vendor_capability=80 (weight 5%): contribution = 20x0.25 + (100-80)x0.05 = 5.0 + 1.0 = 6.0
```

### 2. Dynamic Generation from DIMENSION_CONFIG (MANDATORY)

Dimension lists in the prompt text MUST be generated dynamically from
`DIMENSION_CONFIG`. Hardcoding dimension names in the composite formula text is
the exact problem this story fixes — do not reintroduce it:

```typescript
const riskDims = ALL_DIMENSIONS
  .filter(d => DIMENSION_CONFIG[d].type === 'risk')
  .join(', ');
const capabilityDims = ALL_DIMENSIONS
  .filter(d => DIMENSION_CONFIG[d].type === 'capability')
  .join(', ');
```

This ensures the prompt text always matches the source of truth in rubric.ts.

## Files Touched

- `packages/backend/src/infrastructure/ai/prompts/scoringPrompt.ts` - MODIFY (update composite formula text, ~5 lines changed)

## Agent Assignment

- [x] backend-agent

## Tests Required

- [ ] Verify scoring prompt contains all risk dimension names
- [ ] Verify scoring prompt contains all capability dimension names
- [ ] Verify "do NOT contribute" line is absent
- [ ] (Prompt snapshot updates in Story 40.1.7)

## Definition of Done

- [ ] Composite formula lists correct risk and capability dimensions
- [ ] Dimension lists generated dynamically from DIMENSION_CONFIG (no hardcoded dimension names in formula text)
- [ ] "All other dimensions do NOT contribute" line removed
- [ ] Example uses v1.1 weight values
- [ ] No TypeScript errors
- [ ] No lint errors
