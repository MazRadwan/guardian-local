'use client';

/**
 * ProgressMessage - In-chat progress indicator
 *
 * Epic 18 Story 18.2.5: Shows parsing/scoring progress in the chat stream
 * (not stuck in composer). Provides real-time feedback during trigger-on-send flow.
 *
 * Story 24.3: Added alternating "This may take a minute..." message with shimmer
 * animation after 5 seconds of same status. Respects prefers-reduced-motion.
 *
 * Features:
 * - Status-based icon (loading spinner, clock, or checkmark)
 * - Progress bar for intermediate states
 * - Accessible with ARIA labels
 * - Smooth animations and transitions
 * - Alternating wait message for long operations
 * - Ephemeral (removed when status is 'complete' or 'idle')
 *
 * Usage:
 * - Renders when scoringProgress.status is 'parsing' or 'scoring'
 * - Updates progress bar in real-time
 * - After 5 seconds, alternates with "This may take a minute..." every 3 seconds
 * - Disappears when status becomes 'complete'
 */

import { useState, useEffect, useRef } from 'react';
import { CheckCircle, Loader2, Clock } from 'lucide-react';
import type { ScoringStatus } from '@/types/scoring';

export interface ProgressMessageProps {
  status: ScoringStatus;
  progress?: number; // 0-100
  message: string;
}

export function ProgressMessage({ status, progress, message }: ProgressMessageProps) {
  const isComplete = status === 'complete';
  const isError = status === 'error';

  // Story 24.3: Track if we should show the "please wait" message
  const [showWaitMessage, setShowWaitMessage] = useState(false);
  const [isAlternating, setIsAlternating] = useState(false);
  const lastStatus = useRef<ScoringStatus>(status);

  // Respect reduced motion preference
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    // Check for reduced motion preference on mount
    if (typeof window !== 'undefined') {
      const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
      setPrefersReducedMotion(mediaQuery.matches);

      const handler = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
      mediaQuery.addEventListener('change', handler);
      return () => mediaQuery.removeEventListener('change', handler);
    }
  }, []);

  useEffect(() => {
    // Reset timer when status changes
    if (status !== lastStatus.current) {
      lastStatus.current = status;
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
      {/* Icon - spinner for active, clock for waiting, checkmark for complete */}
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
        {/* Status message - Story 24.2: Add transition for smooth message changes */}
        {/* Story 24.3: Add shimmer animation for wait message */}
        <p
          className={`text-sm font-medium transition-all duration-300 ${
            showWaitMessage && !prefersReducedMotion
              ? 'text-sky-600 bg-gradient-to-r from-sky-600 via-sky-400 to-sky-600 bg-clip-text text-transparent bg-[length:200%_100%] animate-shimmer'
              : 'text-gray-900'
          }`}
        >
          {displayMessage}
        </p>

        {/* Progress bar - only show when not complete and progress is defined */}
        {!isComplete && progress !== undefined && (
          <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-300 ease-out"
              style={{ width: `${progress}%` }}
              role="progressbar"
              aria-valuenow={progress}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`Progress: ${progress}%`}
            />
          </div>
        )}
      </div>
    </div>
  );
}
