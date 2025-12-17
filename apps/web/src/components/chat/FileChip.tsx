'use client';

/**
 * FileChip - Compact light-themed file upload indicator
 *
 * Epic 16.6.1: Replaces the full-width UploadProgress card with a compact
 * file chip positioned inside the composer (like Claude.ai/ChatGPT).
 *
 * Epic 16.6.8: Restyled to light theme to match app aesthetic.
 *
 * Features:
 * - Light background with subtle border
 * - Truncated filename with progress bar
 * - X button ALWAYS visible (can cancel at any stage)
 * - State-specific icons (spinner, checkmark, alert)
 */

import { Loader2, CheckCircle, AlertCircle, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface FileChipProps {
  filename: string;
  stage: 'uploading' | 'storing' | 'parsing' | 'complete' | 'error';
  progress: number; // 0-100
  error?: string;
  onRemove: () => void;
}

export function FileChip({ filename, stage, progress, error, onRemove }: FileChipProps) {
  const isActive = ['uploading', 'storing', 'parsing'].includes(stage);
  const isError = stage === 'error';
  const isComplete = stage === 'complete';

  // Get status text based on stage
  const getStatusText = () => {
    switch (stage) {
      case 'uploading':
        return `${progress}%`;
      case 'storing':
        return 'Storing...';
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
        'inline-flex flex-col gap-1 px-3 py-2 rounded-lg max-w-xs border',
        isError ? 'bg-red-50 border-red-200' : 'bg-gray-100 border-gray-200'
      )}
      role="status"
      aria-label={`File ${filename}: ${getStatusText()}`}
    >
      {/* Top row: Icon + Filename + X button */}
      <div className="flex items-center gap-2">
        {/* Icon based on state */}
        {isActive && (
          <Loader2
            className="h-4 w-4 text-blue-500 animate-spin flex-shrink-0"
            aria-hidden="true"
          />
        )}
        {isComplete && (
          <CheckCircle
            className="h-4 w-4 text-green-600 flex-shrink-0"
            aria-hidden="true"
          />
        )}
        {isError && (
          <AlertCircle
            className="h-4 w-4 text-red-500 flex-shrink-0"
            aria-hidden="true"
          />
        )}

        {/* Filename (truncated) */}
        <span className="text-sm text-gray-900 truncate max-w-[180px]" title={filename}>
          {filename}
        </span>

        {/* X button - ALWAYS visible */}
        <button
          type="button"
          onClick={onRemove}
          className="p-0.5 text-gray-400 hover:text-gray-600 rounded flex-shrink-0 transition-colors"
          aria-label="Remove file"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Progress bar - only during active stages */}
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
          <span className="text-xs text-gray-500 min-w-[60px] text-right">
            {getStatusText()}
          </span>
        </div>
      )}

      {/* Error message - only in error state */}
      {isError && error && (
        <span className="text-xs text-red-600 truncate" title={error}>
          {error}
        </span>
      )}

      {/* Success indicator - only when complete */}
      {isComplete && (
        <span className="text-xs text-green-600">Ready</span>
      )}
    </div>
  );
}
