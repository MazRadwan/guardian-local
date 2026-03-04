# Story 40.1.2: Update Dimension Weights to v1.1

## Description

Update `DIMENSION_WEIGHTS` in `rubric.ts` so all 10 dimensions have non-zero weights
for all 3 solution types, and bump `RUBRIC_VERSION` from `guardian-v1.0` to `guardian-v1.1`.

The weight redistribution follows a "minimized deviation" approach: each profile stays
within v1.2 spec ranges wherever possible, deviating only where strict compliance would
destroy profile differentiation. All deviations are documented with rationale.

## Acceptance Criteria

- [ ] All 10 dimensions have weight > 0 for all 3 solution types
- [ ] Weights sum to exactly 100 for each solution type
- [ ] Original 5 dimensions retain relative ordering per solution type WHERE FEASIBLE (see patient_facing exception below)
- [ ] Each solution profile has clear differentiation (dominant dims differ)
- [ ] `RUBRIC_VERSION` updated to `'guardian-v1.1'`
- [ ] Governance notes document all spec range deviations with rationale
- [ ] No TypeScript errors

## Technical Approach

### 1. Governance Context: v1.2 Spec Range Constraint

The v1.2 spec defines weight ranges per dimension (Section 1.3). However, the **minimum
weights sum to 90%**, leaving only 10% total flexibility across all profiles. Strict
compliance makes meaningful profile differentiation nearly impossible — e.g., clinical_risk
can only reach 15% in a strictly-compliant clinical_ai profile, barely above privacy_risk
(15%) and security_risk (15%).

**Decision: Treat ranges as guidance (Option 3).**

Hard invariants:
- All weights > 0 (no dimension ignored)
- All weights sum to exactly 100
- Profile priorities preserved (clinical_risk dominant for clinical_ai, etc.)

Soft goal:
- Stay within spec ranges wherever possible
- Minimize number and magnitude of deviations
- Document every deviation with rationale

### 2. New Weight Matrix

**clinical_ai (clinical risk dominant) — 2 deviations:**

| Dimension | v1.0 | v1.1 | Spec Range | Status |
|-----------|------|------|------------|--------|
| clinical_risk | 40 | 25 | 5-60% | IN RANGE |
| privacy_risk | 20 | 15 | 15-40% | IN RANGE (at min) |
| security_risk | 15 | 15 | 15-30% | IN RANGE (at min) |
| technical_credibility | 15 | 10 | 10-25% | IN RANGE (at min) |
| operational_excellence | 10 | 10 | 10-20% | IN RANGE (at min) |
| vendor_capability | 0 | 5 | 10-15% | BELOW MIN (-5) |
| ai_transparency | 0 | 5 | 5-20% | IN RANGE (at min) |
| ethical_considerations | 0 | 5 | 5-15% | IN RANGE (at min) |
| regulatory_compliance | 0 | 5 | 10-20% | BELOW MIN (-5) |
| sustainability | 0 | 5 | 5-15% | IN RANGE (at min) |
| **Total** | **100** | **100** | | **2 deviations** |

**administrative_ai (privacy/security dominant) — 1 deviation:**

| Dimension | v1.0 | v1.1 | Spec Range | Status |
|-----------|------|------|------------|--------|
| clinical_risk | 10 | 5 | 5-60% | IN RANGE (at min) |
| privacy_risk | 30 | 20 | 15-40% | IN RANGE |
| security_risk | 25 | 18 | 15-30% | IN RANGE |
| technical_credibility | 15 | 10 | 10-25% | IN RANGE (at min) |
| operational_excellence | 20 | 12 | 10-20% | IN RANGE |
| vendor_capability | 0 | 8 | 10-15% | BELOW MIN (-2) |
| ai_transparency | 0 | 5 | 5-20% | IN RANGE (at min) |
| ethical_considerations | 0 | 5 | 5-15% | IN RANGE (at min) |
| regulatory_compliance | 0 | 10 | 10-20% | IN RANGE (at min) |
| sustainability | 0 | 7 | 5-15% | IN RANGE |
| **Total** | **100** | **100** | | **1 deviation** |

**patient_facing (privacy dominant, ethics/transparency elevated) — 2 deviations:**

| Dimension | v1.0 | v1.1 | Spec Range | Status |
|-----------|------|------|------------|--------|
| clinical_risk | 25 | 10 | 5-60% | IN RANGE |
| privacy_risk | 35 | 20 | 15-40% | IN RANGE |
| security_risk | 20 | 15 | 15-30% | IN RANGE (at min) |
| technical_credibility | 12 | 10 | 10-25% | IN RANGE (at min) |
| operational_excellence | 8 | 5 | 10-20% | BELOW MIN (-5) |
| vendor_capability | 0 | 5 | 10-15% | BELOW MIN (-5) |
| ai_transparency | 0 | 10 | 5-20% | IN RANGE |
| ethical_considerations | 0 | 10 | 5-15% | IN RANGE |
| regulatory_compliance | 0 | 10 | 10-20% | IN RANGE (at min) |
| sustainability | 0 | 5 | 5-15% | IN RANGE (at min) |
| **Total** | **100** | **100** | | **2 deviations** |

### 3. Deviation Summary and Rationale

| Deviation | Profile | Spec Min | Actual | Gap | Rationale |
|-----------|---------|----------|--------|-----|-----------|
| vendor_capability | clinical_ai | 10% | 5% | -5 | Clinical profile prioritizes clinical_risk (25%) — vendor maturity is secondary for clinical safety |
| regulatory_compliance | clinical_ai | 10% | 5% | -5 | Regulatory compliance is distinct from clinical risk (already 25%); 5% still contributes meaningfully |
| vendor_capability | administrative_ai | 10% | 8% | -2 | Minor deviation; operational_excellence (12%) covers similar vendor operational concerns |
| operational_excellence | patient_facing | 10% | 5% | -5 | Patient-facing profile elevates ethics (10%) and transparency (10%) over operational metrics |
| vendor_capability | patient_facing | 10% | 5% | -5 | Same rationale: patient-facing prioritizes transparency and equity over vendor maturity |

**Key design choice:** vendor_capability has the most deviations (3 profiles) because it
overlaps conceptually with operational_excellence and technical_credibility. Its minimum
(10%) is disproportionately high for a general vendor assessment dimension when compared
to patient-safety-critical dimensions.

### Ordering Exception: patient_facing

The v1.0 `patient_facing` profile had clinical_risk (25) > security_risk (20). In v1.1,
this ordering reverses: security_risk (15) > clinical_risk (10).

**Why this is intentional:** In v1.0, clinical_risk carried proxy weight for concerns
that now have their own dedicated dimensions — ethical_considerations (10%) and
ai_transparency (10%) capture patient-safety concerns (bias, fairness, explainability)
that were previously invisible. With those concerns now explicitly weighted, clinical_risk
can be reduced without losing patient-safety coverage. Forcing the old ordering would
require clinical_risk >= 16% (above security at 15%), consuming 6% from the very
ethics/transparency dims that define the patient_facing profile's differentiation.

The `clinical_ai` and `administrative_ai` profiles retain their original ordering.

### 4. Version Bump

```typescript
// Before:
export const RUBRIC_VERSION = 'guardian-v1.0';

// After:
export const RUBRIC_VERSION = 'guardian-v1.1';
```

### 5. Profile Differentiation Verification

Each profile has clearly distinct priorities:
- **clinical_ai:** clinical_risk (25%) >> privacy/security (15%) >> new dims (5%)
- **administrative_ai:** privacy (20%) > security (18%) > ops (12%) > regulatory (10%)
- **patient_facing:** privacy (20%) > security (15%) > ethics + transparency + regulatory (10% each)

### 6. Composite Score Impact (all-scores-75 test case)

```
Risk dims: 75 × sum(risk_weights) = 75 × 0.55 = 41.25  [clinical_ai]
Cap dims (inverted=25): 25 × sum(cap_weights) = 25 × 0.45 = 11.25
Total = 52.5 → rounds to 53
```

Note: The v1.1 clinical_ai risk/capability split is 55/45. This differs from v1.0
(which was 75/25 with only 5 dims weighted). The all-scores-75 composite changes
from 63 (v1.0) to 53 (v1.1) because the inverted capability contribution is larger
with 7 capability dims at 45% total vs 2 at 25%.

## Files Touched

- `packages/backend/src/domain/scoring/rubric.ts` - MODIFY (update 30 weight values + version string)

## Agent Assignment

- [x] backend-agent

## Tests Required

- [ ] Verify all 3 solution types sum to 100
- [ ] Verify all weights > 0
- [ ] Verify RUBRIC_VERSION is 'guardian-v1.1'
- [ ] (Composite recalculation tests are in Story 40.1.5)

## Definition of Done

- [ ] All 30 weight values updated (10 dims x 3 solution types)
- [ ] All weights sum to 100 per solution type
- [ ] All weights > 0
- [ ] Profile differentiation preserved (dominant dims differ)
- [ ] RUBRIC_VERSION = 'guardian-v1.1'
- [ ] No TypeScript errors
- [ ] No lint errors
