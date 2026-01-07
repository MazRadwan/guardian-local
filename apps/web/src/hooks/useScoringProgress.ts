'use client';

import { useState, useCallback } from 'react';
import { ScoringStatus, ScoringProgressEvent, DocumentWarning } from '@/types/scoring';

interface UseScoringProgressReturn {
  status: ScoringStatus;
  message: string;
  progress: number | undefined;
  error: string | undefined;
  warnings: DocumentWarning[];
  updateProgress: (event: ScoringProgressEvent) => void;
  addWarning: (warning: DocumentWarning) => void;
  dismissWarning: (warning: DocumentWarning) => void;
  reset: () => void;
}

export function useScoringProgress(): UseScoringProgressReturn {
  const [status, setStatus] = useState<ScoringStatus>('idle');
  const [message, setMessage] = useState('');
  const [progress, setProgress] = useState<number | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [warnings, setWarnings] = useState<DocumentWarning[]>([]);

  const updateProgress = useCallback((event: ScoringProgressEvent) => {
    setStatus(event.status);
    setMessage(event.message);
    setProgress(event.progress);
    setError(event.error);
  }, []);

  const addWarning = useCallback((warning: DocumentWarning) => {
    setWarnings((prev) => (prev.includes(warning) ? prev : [...prev, warning]));
  }, []);

  const dismissWarning = useCallback((warning: DocumentWarning) => {
    setWarnings((prev) => prev.filter((w) => w !== warning));
  }, []);

  const reset = useCallback(() => {
    setStatus('idle');
    setMessage('');
    setProgress(undefined);
    setError(undefined);
    setWarnings([]);
  }, []);

  return {
    status,
    message,
    progress,
    error,
    warnings,
    updateProgress,
    addWarning,
    dismissWarning,
    reset,
  };
}
