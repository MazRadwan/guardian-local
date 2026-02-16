# Story 38.7.2: Guardian-Native Dimension Labels in ScoreDashboard

## Description

Add a subtle "Guardian Healthcare-Specific" label to Guardian-native dimensions (Clinical Risk, Vendor Capability, Ethical Considerations, Sustainability) in the `ScoreDashboard` component. These dimensions have no ISO mapping, so the label clarifies they are assessed using Guardian's proprietary healthcare criteria.

## Acceptance Criteria

- [ ] Guardian-native dimensions show "Guardian Healthcare-Specific" sublabel
- [ ] Sublabel is small, italic, purple text (subtle, not distracting)
- [ ] Non-Guardian-native dimensions show no sublabel
- [ ] Sublabel appears beneath the dimension group header, not per dimension
- [ ] Has `data-testid="guardian-native-label"`
- [ ] Under 300 LOC

## Technical Approach

### 1. Update ScoreDashboard.tsx

**File:** `apps/web/src/components/chat/ScoreDashboard.tsx` (MODIFY)

Add Guardian-native labels to the dimension groups. Since Guardian-native dimensions appear in both Risk (clinical_risk) and Capability (vendor_capability, ethical_considerations, sustainability) groups, add a check per group:

```tsx
const GUARDIAN_NATIVE_DIMENSIONS = [
  'clinical_risk',
  'vendor_capability',
  'ethical_considerations',
  'sustainability',
];

export function ScoreDashboard({ dimensionScores }: ScoreDashboardProps) {
  // ... existing grouping logic ...

  // Check if any dimensions in a group are Guardian-native
  const hasGuardianNativeRisk = riskDimensions.some(
    (d) => GUARDIAN_NATIVE_DIMENSIONS.includes(d.dimension)
  );
  const hasGuardianNativeCapability = capabilityDimensions.some(
    (d) => GUARDIAN_NATIVE_DIMENSIONS.includes(d.dimension)
  );

  return (
    <div className="space-y-6" data-testid="score-dashboard">
      {/* Risk Dimensions */}
      <div>
        <h4 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
          <span className="w-2 h-2 bg-red-500 rounded-full" />
          Risk Dimensions
          <span className="text-xs text-gray-500 font-normal">(lower is better)</span>
        </h4>
        {hasGuardianNativeRisk && (
          <p
            className="text-xs text-purple-500 italic mb-2 ml-4"
            data-testid="guardian-native-label"
          >
            * Some dimensions assessed using Guardian healthcare-specific criteria
          </p>
        )}
        <div className="space-y-3">
          {riskDimensions.map((d) => (
            <DimensionScoreBar
              key={d.dimension}
              label={DIMENSION_CONFIG[d.dimension]?.label || d.dimension}
              score={d.score}
              riskRating={d.riskRating}
              type="risk"
              dimension={d.dimension}
              findings={d.findings}
            />
          ))}
        </div>
      </div>

      {/* Capability Dimensions */}
      <div>
        <h4 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
          <span className="w-2 h-2 bg-green-500 rounded-full" />
          Capability Dimensions
          <span className="text-xs text-gray-500 font-normal">(higher is better)</span>
        </h4>
        {hasGuardianNativeCapability && (
          <p
            className="text-xs text-purple-500 italic mb-2 ml-4"
            data-testid="guardian-native-label"
          >
            * Some dimensions assessed using Guardian healthcare-specific criteria
          </p>
        )}
        <div className="space-y-3">
          {capabilityDimensions.map((d) => (
            <DimensionScoreBar
              key={d.dimension}
              label={DIMENSION_CONFIG[d.dimension]?.label || d.dimension}
              score={d.score}
              riskRating={d.riskRating}
              type="capability"
              dimension={d.dimension}
              findings={d.findings}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
```

### 2. Key Rules

- **Group-level label, not per-dimension**: A per-dimension label would be too noisy. Instead, one note per group explains that some dimensions use Guardian-specific criteria.
- **Purple italic**: Matches the brand color and is subtle enough not to dominate the score display.
- **LOC check**: ScoreDashboard is 85 LOC. Adding ~15 LOC for the labels keeps it under 100 LOC.

## Files Touched

- `apps/web/src/components/chat/ScoreDashboard.tsx` - MODIFY (add Guardian-native labels + pass findings/dimension to DimensionScoreBar)

## Tests Affected

- `apps/web/src/components/chat/__tests__/ScoreDashboard.test.tsx` - Does not exist, CREATE new test file

## Agent Assignment

- [x] frontend-agent

## Tests Required

- [ ] `apps/web/src/components/chat/__tests__/ScoreDashboard.test.tsx`
  - Test Guardian-native label appears in Risk Dimensions group
  - Test Guardian-native label appears in Capability Dimensions group
  - Test label has correct data-testid
  - Test label text mentions "Guardian healthcare-specific criteria"

## QA Verification (Frontend Story)

**Route:** `/chat` (need a scored assessment)
**Wait For:** `[data-testid="score-dashboard"]`

**Steps:**
1. action: verify_exists, selector: `[data-testid="guardian-native-label"]`
2. action: verify_text, selector: `[data-testid="guardian-native-label"]`, expected: "Guardian healthcare-specific"

**Screenshot:** `qa-38.7.2.png`

## Definition of Done

- [ ] Guardian-native label appears in dimension groups
- [ ] Subtle visual treatment (purple italic)
- [ ] Tests written and passing
- [ ] No TypeScript errors
- [ ] Browser QA passed
