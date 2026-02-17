# Story 38.6.2: ConfidenceBadge Component

## Description

Create a reusable `ConfidenceBadge` component that displays the assessment confidence level (High/Medium/Low) as a colored badge with a tooltip showing the rationale. Used by `DimensionScoreBar` (Story 38.6.3) and potentially other components.

## Acceptance Criteria

- [ ] `ConfidenceBadge` component renders H/M/L text with color coding
- [ ] High = green badge, Medium = amber badge, Low = red badge
- [ ] Tooltip on hover shows the confidence rationale text
- [ ] Component handles `null`/`undefined` confidence gracefully (renders nothing)
- [ ] Has `data-testid="confidence-badge"` for testing
- [ ] Has `data-testid="confidence-tooltip"` for tooltip testing
- [ ] Under 300 LOC
- [ ] No TypeScript errors

## Technical Approach

### 1. Create ConfidenceBadge.tsx

**File:** `apps/web/src/components/chat/ConfidenceBadge.tsx` (CREATE)

```tsx
'use client';

import React, { useState } from 'react';
import type { AssessmentConfidence } from '@/types/scoring';

interface ConfidenceBadgeProps {
  confidence: AssessmentConfidence | null | undefined;
  size?: 'sm' | 'md';
}

const LEVEL_STYLES = {
  high: {
    badge: 'bg-green-100 text-green-700 border-green-200',
    dot: 'bg-green-500',
    label: 'High',
  },
  medium: {
    badge: 'bg-amber-100 text-amber-700 border-amber-200',
    dot: 'bg-amber-500',
    label: 'Med',
  },
  low: {
    badge: 'bg-red-100 text-red-700 border-red-200',
    dot: 'bg-red-500',
    label: 'Low',
  },
};

export function ConfidenceBadge({ confidence, size = 'sm' }: ConfidenceBadgeProps) {
  const [showTooltip, setShowTooltip] = useState(false);

  if (!confidence) return null;

  const styles = LEVEL_STYLES[confidence.level];
  const sizeClasses = size === 'sm' ? 'text-xs px-1.5 py-0.5' : 'text-sm px-2 py-1';

  return (
    <div className="relative inline-block">
      <span
        className={`inline-flex items-center gap-1 rounded border font-medium cursor-help ${styles.badge} ${sizeClasses}`}
        data-testid="confidence-badge"
        data-confidence-level={confidence.level}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${styles.dot}`} />
        {styles.label}
      </span>

      {showTooltip && confidence.rationale && (
        <div
          className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-2 bg-gray-900 text-white text-xs rounded-lg shadow-lg"
          data-testid="confidence-tooltip"
        >
          <p className="font-medium mb-1">
            Assessment Confidence: {confidence.level.toUpperCase()}
          </p>
          <p className="text-gray-300">{confidence.rationale}</p>
          <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 w-2 h-2 bg-gray-900 rotate-45" />
        </div>
      )}
    </div>
  );
}
```

### 2. Key Rules

- **Null handling**: Return `null` when `confidence` is `null` or `undefined`. Components using this badge should not need conditional rendering.
- **Tooltip positioning**: Uses absolute positioning relative to the badge. `bottom-full` places it above.
- **Cursor**: `cursor-help` indicates hoverable content.
- **Data attributes**: `data-testid` for testing, `data-confidence-level` for assertions.
- **No Shadcn Tooltip**: Use a simple custom tooltip to avoid adding a Shadcn dependency for a simple hover effect. The tooltip is 5 lines of JSX.

## Files Touched

- `apps/web/src/components/chat/ConfidenceBadge.tsx` - CREATE (~70 LOC)

## Tests Affected

- None (new component)

## Agent Assignment

- [x] frontend-agent

## Tests Required

- [ ] `apps/web/src/components/chat/__tests__/ConfidenceBadge.test.tsx`
  - Test renders "High" badge for high confidence
  - Test renders "Med" badge for medium confidence
  - Test renders "Low" badge for low confidence
  - Test renders nothing when confidence is null
  - Test renders nothing when confidence is undefined
  - Test badge has correct data-testid
  - Test badge has correct data-confidence-level attribute
  - Test tooltip appears on hover (mouseEnter event)
  - Test tooltip shows rationale text
  - Test tooltip disappears on mouse leave

## QA Verification (Frontend Story)

**Route:** `/chat` (need a scored assessment)
**Wait For:** `[data-testid="scoring-result-card"]`

**Steps:**
1. action: verify_exists, selector: `[data-testid="confidence-badge"]`
2. action: hover, selector: `[data-testid="confidence-badge"]`
3. action: verify_exists, selector: `[data-testid="confidence-tooltip"]`
4. action: verify_text, selector: `[data-testid="confidence-tooltip"]`, expected: "Confidence"

**Screenshot:** `qa-38.6.2.png`

## Definition of Done

- [ ] ConfidenceBadge renders H/M/L with colors
- [ ] Tooltip shows rationale on hover
- [ ] Null/undefined handled gracefully
- [ ] Tests written and passing
- [ ] No TypeScript errors
- [ ] Browser QA passed
