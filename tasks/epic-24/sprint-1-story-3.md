# Story 24.3: "This Will Take a Minute" Animation

## Description

Add an animated indicator that alternates with progress messages during long-running scoring operations. After 5 seconds of the same status, display "This may take a minute..." with a shimmer animation.

**Why:** Long-running operations (30-60 seconds for scoring) can make users think the system is frozen. An animated "please wait" message provides reassurance.

## Acceptance Criteria

- [ ] After 5 seconds of same status, show "This may take a minute..." with shimmer animation
- [ ] Animation alternates: progress message <-> "please wait" message (every 3 seconds)
- [ ] Uses sky color palette (consistent with app theme)
- [ ] Animation stops when status changes or completes
- [ ] Respects `prefers-reduced-motion` media query
- [ ] **Browser QA:** Trigger scoring, wait 10+ seconds, verify animation appears

## Technical Approach

### Frontend Changes

**1. Add alternating state logic (`apps/web/src/components/chat/ProgressMessage.tsx`):**

```typescript
'use client';

import { useState, useEffect, useRef } from 'react';
import { CheckCircle, Loader2, Clock } from 'lucide-react';
import type { ScoringStatus } from '@/types/scoring';

export interface ProgressMessageProps {
  status: ScoringStatus;
  progress?: number;
  message: string;
}

export function ProgressMessage({ status, progress, message }: ProgressMessageProps) {
  const isComplete = status === 'complete';
  const isError = status === 'error';

  // Track if we should show the "please wait" message
  const [showWaitMessage, setShowWaitMessage] = useState(false);
  const [isAlternating, setIsAlternating] = useState(false);
  const statusStartTime = useRef<number>(Date.now());
  const lastStatus = useRef<ScoringStatus>(status);

  // Respect reduced motion preference
  const prefersReducedMotion = typeof window !== 'undefined'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  useEffect(() => {
    // Reset timer when status changes
    if (status !== lastStatus.current) {
      lastStatus.current = status;
      statusStartTime.current = Date.now();
      setShowWaitMessage(false);
      setIsAlternating(false);
    }

    // Don't show wait message for complete/error states
    if (isComplete || isError) {
      setShowWaitMessage(false);
      return;
    }

    // Start showing wait message after 5 seconds
    const waitTimer = setTimeout(() => {
      setShowWaitMessage(true);
      setIsAlternating(true);
    }, 5000);

    return () => clearTimeout(waitTimer);
  }, [status, isComplete, isError]);

  // Alternate between messages every 3 seconds
  useEffect(() => {
    if (!isAlternating || isComplete || isError) return;

    const alternateTimer = setInterval(() => {
      setShowWaitMessage(prev => !prev);
    }, 3000);

    return () => clearInterval(alternateTimer);
  }, [isAlternating, isComplete, isError]);

  const displayMessage = showWaitMessage ? 'This may take a minute...' : message;

  return (
    <div
      className="flex items-start gap-3 py-3 px-4 bg-muted/50 rounded-lg animate-pulse-subtle"
      role="status"
      aria-live="polite"
      aria-label={`${displayMessage} ${progress !== undefined ? `${progress}% complete` : ''}`}
    >
      {/* Icon */}
      <div className="flex-shrink-0">
        {isComplete ? (
          <CheckCircle className="w-5 h-5 text-green-500" aria-hidden="true" />
        ) : showWaitMessage ? (
          <Clock className="w-5 h-5 text-sky-500" aria-hidden="true" />
        ) : (
          <Loader2 className="w-5 h-5 animate-spin text-primary" aria-hidden="true" />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium transition-all duration-300 ${
          showWaitMessage && !prefersReducedMotion
            ? 'text-sky-600 bg-gradient-to-r from-sky-600 via-sky-400 to-sky-600 bg-clip-text text-transparent bg-[length:200%_100%] animate-shimmer'
            : 'text-gray-900'
        }`}>
          {displayMessage}
        </p>

        {/* Progress bar */}
        {!isComplete && progress !== undefined && (
          <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-300 ease-out"
              style={{ width: `${progress}%` }}
              role="progressbar"
              aria-valuenow={progress}
              aria-valuemin={0}
              aria-valuemax={100}
            />
          </div>
        )}
      </div>
    </div>
  );
}
```

**2. Ensure shimmer animation exists (`apps/web/src/app/globals.css:68-75`):**

Already exists:
```css
@keyframes shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

.animate-shimmer {
  animation: shimmer 2s linear infinite;
}
```

## Files Touched

- `apps/web/src/components/chat/ProgressMessage.tsx` - Add alternating logic and shimmer text
- `apps/web/src/app/globals.css` - Verify shimmer animation exists (no changes needed)

## Agent Assignment

**frontend-agent**

## Tests Required

### Unit Tests

**`apps/web/src/components/chat/__tests__/ProgressMessage.test.tsx`:**
```typescript
describe('ProgressMessage wait animation', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should show original message initially', () => {
    render(<ProgressMessage status="scoring" message="Analyzing..." />);
    expect(screen.getByText('Analyzing...')).toBeInTheDocument();
  });

  it('should show wait message after 5 seconds', () => {
    render(<ProgressMessage status="scoring" message="Analyzing..." />);

    jest.advanceTimersByTime(5000);

    expect(screen.getByText('This may take a minute...')).toBeInTheDocument();
  });

  it('should alternate between messages every 3 seconds', () => {
    render(<ProgressMessage status="scoring" message="Analyzing..." />);

    jest.advanceTimersByTime(5000); // Show wait message
    expect(screen.getByText('This may take a minute...')).toBeInTheDocument();

    jest.advanceTimersByTime(3000); // Alternate back
    expect(screen.getByText('Analyzing...')).toBeInTheDocument();

    jest.advanceTimersByTime(3000); // Alternate again
    expect(screen.getByText('This may take a minute...')).toBeInTheDocument();
  });

  it('should reset timer when status changes', () => {
    const { rerender } = render(<ProgressMessage status="parsing" message="Parsing..." />);

    jest.advanceTimersByTime(4000); // Almost 5 seconds

    rerender(<ProgressMessage status="scoring" message="Scoring..." />);

    jest.advanceTimersByTime(2000); // Only 2 seconds in new status
    expect(screen.getByText('Scoring...')).toBeInTheDocument();
    expect(screen.queryByText('This may take a minute...')).not.toBeInTheDocument();
  });

  it('should not show wait message when complete', () => {
    render(<ProgressMessage status="complete" message="Done!" />);

    jest.advanceTimersByTime(10000);

    expect(screen.getByText('Done!')).toBeInTheDocument();
    expect(screen.queryByText('This may take a minute...')).not.toBeInTheDocument();
  });
});
```

## Browser QA Required

**Steps for Playwright MCP verification:**

1. Navigate to chat interface
2. Switch to Scoring mode
3. Upload a completed Guardian questionnaire
4. Wait for 5+ seconds during "Analyzing scoring..." phase
5. Take screenshot showing "This may take a minute..." message
6. Wait 3 more seconds
7. Take screenshot showing alternation back to progress message
8. Verify shimmer animation is visible (if motion enabled)

**Screenshot naming:**
- `24.3-progress-normal.png` (before 5 seconds)
- `24.3-wait-message-shimmer.png` (after 5 seconds)
- `24.3-alternating-back.png` (after 8 seconds)

**Success criteria:** "This may take a minute..." MUST appear with shimmer animation after 5 seconds.
