# Story 38.6.3: DimensionScoreBar ISO Enrichment

## Description

Enrich `DimensionScoreBar` to display the confidence badge and ISO clause count next to each dimension score. Currently the bar shows: label, score/100, risk rating badge, and a progress bar. After this story, it also shows a `ConfidenceBadge` and an ISO clause indicator.

## Acceptance Criteria

- [ ] `DimensionScoreBar` accepts `findings` prop (optional)
- [ ] Confidence badge renders next to the risk rating badge
- [ ] ISO clause count shows as small text (e.g., "3 ISO clauses") when clauses exist
- [ ] Guardian-native dimensions show no ISO clause indicator
- [ ] Dimensions without findings show no confidence badge or ISO indicator
- [ ] Layout remains clean and does not overflow on mobile
- [ ] Has `data-testid="iso-clause-count"` for the clause indicator
- [ ] Under 300 LOC

## Technical Approach

### 1. Update DimensionScoreBar.tsx

**File:** `apps/web/src/components/chat/DimensionScoreBar.tsx` (MODIFY)

```tsx
'use client';

import React from 'react';
import { RiskRating, DimensionScoreData } from '@/types/scoring';
import { ConfidenceBadge } from './ConfidenceBadge';

const GUARDIAN_NATIVE_DIMENSIONS = [
  'clinical_risk',
  'vendor_capability',
  'ethical_considerations',
  'sustainability',
];

interface DimensionScoreBarProps {
  label: string;
  score: number;
  riskRating: RiskRating;
  type: 'risk' | 'capability';
  dimension?: string;  // NEW: dimension key for Guardian-native check
  findings?: DimensionScoreData['findings'];  // NEW: findings with ISO data
}

// ... existing RISK_RATING_COLORS and RISK_RATING_BG ...

export function DimensionScoreBar({
  label,
  score,
  riskRating,
  type,
  dimension,
  findings,
}: DimensionScoreBarProps) {
  const isGuardianNative = dimension ? GUARDIAN_NATIVE_DIMENSIONS.includes(dimension) : false;
  const isoClauseCount = findings?.isoClauseReferences?.length ?? 0;

  return (
    <div className="space-y-1">
      <div className="flex justify-between items-center text-sm">
        <span className="font-medium text-gray-700">{label}</span>
        <div className="flex items-center gap-2">
          {/* Confidence badge */}
          <ConfidenceBadge confidence={findings?.assessmentConfidence ?? null} />

          {/* ISO clause count (non-Guardian-native only) */}
          {!isGuardianNative && isoClauseCount > 0 && (
            <span
              className="text-xs text-gray-400"
              data-testid="iso-clause-count"
            >
              {isoClauseCount} ISO
            </span>
          )}

          {/* Existing: score and risk rating */}
          <span className="text-gray-500">
            {score}/100
            <span className={`ml-2 text-xs px-1.5 py-0.5 rounded ${RISK_RATING_BG[riskRating]} capitalize`}>
              {riskRating}
            </span>
          </span>
        </div>
      </div>
      <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${RISK_RATING_COLORS[riskRating]}`}
          style={{ width: `${score}%` }}
        />
      </div>
    </div>
  );
}
```

### 2. Add data-testid to ScoreDashboard

**File:** `apps/web/src/components/chat/ScoreDashboard.tsx` (MODIFY)

Add `data-testid="score-dashboard"` to the root `<div>` of `ScoreDashboard.tsx`. This attribute does not currently exist and is needed for QA verification.

### 3. Update ScoreDashboard to pass findings

**File:** `apps/web/src/components/chat/ScoreDashboard.tsx` (MODIFY)

Pass `dimension` and `findings` props:

```tsx
<DimensionScoreBar
  key={d.dimension}
  label={DIMENSION_CONFIG[d.dimension]?.label || d.dimension}
  score={d.score}
  riskRating={d.riskRating}
  type="risk"
  dimension={d.dimension}       // NEW
  findings={d.findings}         // NEW
/>
```

### 4. Key Rules

- **Optional props**: `dimension` and `findings` are optional for backward compatibility. Components that don't pass them still work.
- **Guardian-native check**: Use the `dimension` key to check against `GUARDIAN_NATIVE_DIMENSIONS`. These dimensions have no ISO mapping.
- **Compact display**: The ISO clause count is displayed as "3 ISO" (short) to save horizontal space. The confidence badge is already compact.
- **LOC check**: DimensionScoreBar.tsx is 51 LOC. Adding ~20 LOC keeps it under 80 LOC.
- **ScoreDashboard change**: Only 2 lines added per dimension (passing dimension and findings). ScoreDashboard stays under 100 LOC.

## Files Touched

- `apps/web/src/components/chat/DimensionScoreBar.tsx` - MODIFY (add findings/dimension props, render confidence + ISO count)
- `apps/web/src/components/chat/ScoreDashboard.tsx` - MODIFY (pass dimension + findings props)

## Tests Affected

- `apps/web/src/components/chat/__tests__/DimensionScoreBar.test.tsx` - Does not exist, CREATE new test file
- `apps/web/src/components/chat/__tests__/ScoreDashboard.test.tsx` - Does not exist, CREATE new test file

## Agent Assignment

- [x] frontend-agent

## Tests Required

- [ ] `apps/web/src/components/chat/__tests__/DimensionScoreBar.test.tsx`
  - Test renders without findings prop (backward compatible)
  - Test renders confidence badge when findings.assessmentConfidence exists
  - Test does not render confidence badge when findings is undefined
  - Test renders ISO clause count for non-Guardian-native dimension
  - Test does not render ISO clause count for Guardian-native dimension
  - Test does not render ISO clause count when no clauses exist
  - Test ISO count has correct data-testid

## QA Verification (Frontend Story)

**Route:** `/chat` (need a scored assessment with ISO data)
**Wait For:** `[data-testid="score-dashboard"]`

**Steps:**
1. action: verify_exists, selector: `[data-testid="confidence-badge"]`
2. action: verify_exists, selector: `[data-testid="iso-clause-count"]`
3. action: verify_text, selector: `[data-testid="iso-clause-count"]`, expected: "ISO"
4. action: hover, selector: `[data-testid="confidence-badge"]`
5. action: verify_exists, selector: `[data-testid="confidence-tooltip"]`

**Screenshot:** `qa-38.6.3.png`

## Definition of Done

- [ ] DimensionScoreBar shows confidence badge and ISO clause count
- [ ] Guardian-native dimensions have no ISO indicator
- [ ] Backward compatible (optional props)
- [ ] Tests written and passing
- [ ] No TypeScript errors
- [ ] Browser QA passed
