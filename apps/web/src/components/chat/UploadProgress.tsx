/**
 * UploadProgress - Shows file upload and parsing progress
 *
 * Part of Epic 16: Document Parser Infrastructure
 */

'use client';

import React from 'react';
import { FileText, Loader2, CheckCircle, AlertCircle, Upload, X } from 'lucide-react';
import type { UploadProgress as UploadProgressType } from '@/hooks/useFileUpload';

interface UploadProgressProps {
  progress: UploadProgressType;
  filename?: string;
  onDismiss?: () => void;
}

export function UploadProgress({ progress, filename, onDismiss }: UploadProgressProps) {
  const { stage, progress: percent, message, error } = progress;

  // Don't show if idle
  if (stage === 'idle') return null;

  const getIcon = () => {
    switch (stage) {
      case 'selecting':
        return <Upload className="h-5 w-5 text-gray-500" />;
      case 'uploading':
      case 'storing':
      case 'parsing':
        return <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />;
      case 'complete':
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'error':
        return <AlertCircle className="h-5 w-5 text-red-500" />;
      default:
        return <FileText className="h-5 w-5 text-gray-500" />;
    }
  };

  const getStageLabel = () => {
    switch (stage) {
      case 'selecting':
        return 'Selecting file';
      case 'uploading':
        return 'Uploading';
      case 'storing':
        return 'Storing';
      case 'parsing':
        return 'Analyzing document';
      case 'complete':
        return 'Complete';
      case 'error':
        return 'Error';
      default:
        return stage;
    }
  };

  const getStatusColor = () => {
    switch (stage) {
      case 'error':
        return 'bg-red-50 border-red-200';
      case 'complete':
        return 'bg-green-50 border-green-200';
      default:
        return 'bg-gray-50 border-gray-200';
    }
  };

  return (
    <div className={`flex items-center gap-3 p-3 rounded-lg border ${getStatusColor()}`}>
      {/* Icon */}
      <div className="flex-shrink-0">{getIcon()}</div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Filename */}
        {filename && (
          <p className="text-sm font-medium text-gray-900 truncate">{filename}</p>
        )}

        {/* Status */}
        <p className={`text-sm ${stage === 'error' ? 'text-red-600' : 'text-gray-600'}`}>
          {error || message || getStageLabel()}
        </p>

        {/* Progress bar - only shown during uploading, storing, parsing */}
        {stage !== 'error' && stage !== 'complete' && stage !== 'selecting' && (
          <div className="mt-2 h-1.5 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 transition-all duration-300"
              style={{ width: `${percent}%` }}
            />
          </div>
        )}
      </div>

      {/* Dismiss button for complete/error states */}
      {(stage === 'complete' || stage === 'error') && onDismiss && (
        <button
          onClick={onDismiss}
          className="flex-shrink-0 p-1 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-200 transition-colors"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

/**
 * Inline progress indicator for composer
 */
export function UploadProgressInline({ progress }: { progress: UploadProgressType }) {
  const { stage, progress: percent } = progress;

  if (stage === 'idle') return null;

  return (
    <div className="flex items-center gap-2 text-sm text-gray-500">
      {stage === 'error' ? (
        <AlertCircle className="h-4 w-4 text-red-500" />
      ) : stage === 'complete' ? (
        <CheckCircle className="h-4 w-4 text-green-500" />
      ) : (
        <Loader2 className="h-4 w-4 animate-spin" />
      )}
      <span>
        {stage === 'uploading' && `Uploading ${percent}%`}
        {stage === 'storing' && 'Storing...'}
        {stage === 'parsing' && 'Analyzing...'}
        {stage === 'complete' && 'Ready'}
        {stage === 'error' && 'Failed'}
      </span>
    </div>
  );
}
