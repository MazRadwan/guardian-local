'use client';

import React from 'react';
import { AlertTriangle, X, Info } from 'lucide-react';
import { DocumentWarning, WARNING_MESSAGES } from '@/types/scoring';

interface ScoringWarningProps {
  warning: DocumentWarning;
  onDismiss: () => void;
}

export function ScoringWarning({ warning, onDismiss }: ScoringWarningProps) {
  const message = WARNING_MESSAGES[warning];
  const isError = warning === 'no_assessment_id' || warning === 'legacy_export' || warning === 'scanned_pdf';

  return (
    <div
      className={`flex items-start gap-3 p-4 rounded-lg border ${
        isError
          ? 'bg-red-50 border-red-200'
          : 'bg-amber-50 border-amber-200'
      }`}
      role="alert"
    >
      {isError ? (
        <AlertTriangle className="h-5 w-5 text-red-600 flex-shrink-0" />
      ) : (
        <Info className="h-5 w-5 text-amber-600 flex-shrink-0" />
      )}
      <p className={`flex-1 text-sm ${isError ? 'text-red-800' : 'text-amber-800'}`}>
        {message}
      </p>
      <button
        onClick={onDismiss}
        className={`p-1 rounded hover:bg-opacity-20 ${
          isError ? 'hover:bg-red-600' : 'hover:bg-amber-600'
        }`}
        aria-label="Dismiss warning"
      >
        <X className={`h-4 w-4 ${isError ? 'text-red-600' : 'text-amber-600'}`} />
      </button>
    </div>
  );
}

interface ScoringWarningsListProps {
  warnings: DocumentWarning[];
  onDismiss: (warning: DocumentWarning) => void;
}

export function ScoringWarningsList({ warnings, onDismiss }: ScoringWarningsListProps) {
  if (warnings.length === 0) return null;

  return (
    <div className="space-y-2">
      {warnings.map((warning) => (
        <ScoringWarning
          key={warning}
          warning={warning}
          onDismiss={() => onDismiss(warning)}
        />
      ))}
    </div>
  );
}
