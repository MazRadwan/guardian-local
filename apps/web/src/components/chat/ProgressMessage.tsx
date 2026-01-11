'use client';

/**
 * ProgressMessage - In-chat progress indicator
 *
 * Epic 18 Story 18.2.5: Shows parsing/scoring progress in the chat stream
 * (not stuck in composer). Provides real-time feedback during trigger-on-send flow.
 *
 * Features:
 * - Status-based icon (loading spinner or checkmark)
 * - Progress bar for intermediate states
 * - Accessible with ARIA labels
 * - Smooth animations
 * - Ephemeral (removed when status is 'complete' or 'idle')
 *
 * Usage:
 * - Renders when scoringProgress.status is 'parsing' or 'scoring'
 * - Updates progress bar in real-time
 * - Disappears when status becomes 'complete'
 */

import { CheckCircle, Loader2 } from 'lucide-react';
import type { ScoringStatus } from '@/types/scoring';

export interface ProgressMessageProps {
  status: ScoringStatus;
  progress?: number; // 0-100
  message: string;
}

export function ProgressMessage({ status, progress, message }: ProgressMessageProps) {
  const isComplete = status === 'complete';
  const isError = status === 'error';

  return (
    <div
      className="flex items-start gap-3 py-3 px-4 bg-muted/50 rounded-lg animate-pulse-subtle"
      role="status"
      aria-live="polite"
      aria-label={`${message} ${progress !== undefined ? `${progress}% complete` : ''}`}
    >
      {/* Icon - spinner for active, checkmark for complete */}
      <div className="flex-shrink-0">
        {isComplete ? (
          <CheckCircle className="w-5 h-5 text-green-500" aria-hidden="true" />
        ) : (
          <Loader2 className="w-5 h-5 animate-spin text-primary" aria-hidden="true" />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Status message */}
        <p className="text-sm font-medium text-gray-900">{message}</p>

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
