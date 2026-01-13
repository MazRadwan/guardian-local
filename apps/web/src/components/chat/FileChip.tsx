'use client';

/**
 * FileChip - Compact light-themed file upload indicator
 *
 * Epic 16.6.1: Replaces the full-width UploadProgress card with a compact
 * file chip positioned inside the composer (like Claude.ai/ChatGPT).
 *
 * Epic 16.6.8: Restyled to light theme to match app aesthetic.
 *
 * Epic 17.2: Multi-file support enhancements
 * - Story 17.2.1: `disabled` prop to hide X button during batch operations
 * - Story 17.2.2: `variant` prop with compact mode for multi-file layouts
 *
 * Epic 17 UX Fix: Added 'pending' stage for queued files (before upload starts)
 * - Shows Clock icon with "Queued" status text
 * - Allows removal while waiting
 *
 * Epic 18: Added 'attached' stage for instant file display
 * - Shows checkmark with "Attached" text when file is stored
 * - File ready for display while enrichment may continue
 *
 * Features:
 * - Light background with subtle border
 * - Truncated filename with progress bar
 * - X button (visible unless disabled, can cancel at any stage)
 * - State-specific icons (spinner, checkmark, alert)
 * - Compact variant: smaller padding/icons, hides progress/error text
 */

import { Loader2, CheckCircle, AlertCircle, Clock, X, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DetectedDocType } from '@/lib/websocket';

export interface FileChipProps {
  filename: string;
  stage: 'pending' | 'uploading' | 'storing' | 'attached' | 'parsing' | 'complete' | 'error'; // Epic 18: Added 'attached'
  progress: number; // 0-100
  error?: string;
  onRemove: () => void;
  disabled?: boolean; // Story 17.2.1: When true, X button is hidden
  variant?: 'default' | 'compact'; // Story 17.2.2: Compact mode for multi-file layouts
  /** Epic 18: Document type classification for wrong-mode warnings */
  detectedDocType?: DetectedDocType | null;
  /** Epic 18: Current mode - used to show warnings for wrong document types */
  mode?: 'consult' | 'assessment' | 'scoring';
}

export function FileChip({
  filename,
  stage,
  progress,
  error,
  onRemove,
  disabled = false,
  variant = 'default',
  detectedDocType,
  mode,
}: FileChipProps) {
  const isPending = stage === 'pending';
  const isActive = ['uploading', 'storing', 'parsing'].includes(stage); // Epic 18: 'attached' is NOT active (shows as complete)
  const isError = stage === 'error';
  const isComplete = stage === 'complete';
  const isAttached = stage === 'attached'; // Epic 18: New stage
  const isCompact = variant === 'compact';

  // Epic 18: Check if document type doesn't match the mode
  // Show warning when: in Scoring mode but document is NOT a questionnaire
  const hasDocTypeMismatch = mode === 'scoring' &&
    detectedDocType === 'document' &&
    (isAttached || isComplete);

  // Get status text based on stage
  const getStatusText = () => {
    switch (stage) {
      case 'pending':
        return 'Queued';
      case 'uploading':
        return `${progress}%`;
      case 'storing':
        return 'Storing...';
      case 'attached': // Epic 18: Show "Attached" status
        return 'Attached';
      case 'parsing':
        return 'Analyzing...';
      case 'complete':
        return 'Ready';
      case 'error':
        return 'Error';
      default:
        return '';
    }
  };

  return (
    <div
      className={cn(
        'inline-flex flex-col gap-1 rounded-lg max-w-xs border',
        isCompact ? 'px-2 py-1' : 'px-3 py-2',
        isError
          ? 'bg-red-50 border-red-200'
          : hasDocTypeMismatch
            ? 'bg-amber-50 border-amber-300'
            : 'bg-gray-100 border-gray-200'
      )}
      role="status"
      aria-label={`File ${filename}: ${getStatusText()}${hasDocTypeMismatch ? ' - Warning: may not be a questionnaire' : ''}`}
    >
      {/* Top row: Icon + Filename + X button */}
      <div className="flex items-center gap-2">
        {/* Icon based on state - smaller in compact */}
        {isPending && (
          <Clock
            className={cn(
              'text-gray-400 flex-shrink-0',
              isCompact ? 'h-3 w-3' : 'h-4 w-4'
            )}
            aria-hidden="true"
          />
        )}
        {isActive && (
          <Loader2
            className={cn(
              'text-blue-500 animate-spin flex-shrink-0',
              isCompact ? 'h-3 w-3' : 'h-4 w-4'
            )}
            aria-hidden="true"
          />
        )}
        {/* Epic 18: Show checkmark for 'attached'/'complete', OR warning if doc type mismatch */}
        {(isComplete || isAttached) && !hasDocTypeMismatch && (
          <CheckCircle
            className={cn(
              'text-green-600 flex-shrink-0',
              isCompact ? 'h-3 w-3' : 'h-4 w-4'
            )}
            aria-hidden="true"
          />
        )}
        {/* Epic 18: Warning icon for document type mismatch */}
        {hasDocTypeMismatch && (
          <AlertTriangle
            className={cn(
              'text-amber-500 flex-shrink-0',
              isCompact ? 'h-3 w-3' : 'h-4 w-4'
            )}
            aria-hidden="true"
          />
        )}
        {isError && (
          <AlertCircle
            className={cn(
              'text-red-500 flex-shrink-0',
              isCompact ? 'h-3 w-3' : 'h-4 w-4'
            )}
            aria-hidden="true"
          />
        )}

        {/* Filename (truncated) - narrower in compact */}
        <span
          className={cn(
            'text-gray-900 truncate',
            isCompact ? 'text-xs max-w-[120px]' : 'text-sm max-w-[180px]'
          )}
          title={filename}
        >
          {filename}
        </span>

        {/* X button - only show if not disabled, smaller in compact */}
        {!disabled && (
          <button
            type="button"
            onClick={onRemove}
            className={cn(
              'text-gray-400 hover:text-gray-600 rounded flex-shrink-0 transition-colors',
              isCompact ? 'p-0' : 'p-0.5'
            )}
            aria-label="Remove file"
          >
            <X className={isCompact ? 'h-3 w-3' : 'h-4 w-4'} />
          </button>
        )}
      </div>

      {/* Progress bar - only during active stages, hide percentage text in compact */}
      {isActive && (
        <div className="flex items-center gap-2">
          <div className="flex-1 h-0.5 bg-gray-300 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 transition-all duration-300"
              style={{ width: `${progress}%` }}
              role="progressbar"
              aria-valuenow={progress}
              aria-valuemin={0}
              aria-valuemax={100}
            />
          </div>
          {/* Hide progress text in compact mode */}
          {!isCompact && (
            <span className="text-xs text-gray-500 min-w-[60px] text-right">
              {getStatusText()}
            </span>
          )}
        </div>
      )}

      {/* Error message - only in error state, hidden in compact (icon remains) */}
      {isError && error && !isCompact && (
        <span className="text-xs text-red-600 truncate" title={error}>
          {error}
        </span>
      )}

      {/* Pending indicator - only when queued, hidden in compact (icon remains) */}
      {isPending && !isCompact && (
        <span className="text-xs text-gray-500">Queued</span>
      )}

      {/* Epic 18: Attached indicator - file is stored and ready */}
      {isAttached && !isCompact && !hasDocTypeMismatch && (
        <span className="text-xs text-green-600">Attached</span>
      )}

      {/* Success indicator - only when complete, hidden in compact (icon remains) */}
      {isComplete && !isCompact && !hasDocTypeMismatch && (
        <span className="text-xs text-green-600">Ready</span>
      )}

      {/* Epic 18: Warning for document type mismatch in Scoring mode */}
      {hasDocTypeMismatch && !isCompact && (
        <span className="text-xs text-amber-600" title="This doesn't look like a questionnaire. Consider using Consult or Assessment mode.">
          Not a questionnaire?
        </span>
      )}
    </div>
  );
}
