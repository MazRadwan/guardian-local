'use client';

import React, { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { ScoringStatus } from '@/types/scoring';

interface RotatingStatusProps {
  status: ScoringStatus;
  currentMessage?: string;
}

const STATUS_MESSAGES: Record<ScoringStatus, string[]> = {
  idle: [],
  uploading: ['Uploading document...', 'Processing file...'],
  parsing: [
    'Extracting responses from document...',
    'Reading questionnaire content...',
    'Identifying answered questions...',
  ],
  scoring: [
    'Analyzing scoring...',
    'Evaluating risk dimensions...',
    'This may take a minute...',
    'Generating detailed findings...',
    'Almost there...',
  ],
  validating: ['Validating results...', 'Finalizing assessment...'],
  complete: ['Scoring complete!'],
  error: ['An error occurred'],
};

const ROTATION_INTERVAL = 8000; // 8 seconds

export function RotatingStatus({ status, currentMessage }: RotatingStatusProps) {
  const [messageIndex, setMessageIndex] = useState(0);

  useEffect(() => {
    // Reset index when status changes
    setMessageIndex(0);
  }, [status]);

  useEffect(() => {
    if (status === 'idle' || status === 'complete' || status === 'error') {
      return;
    }

    const messages = STATUS_MESSAGES[status];
    if (messages.length <= 1) return;

    const interval = setInterval(() => {
      setMessageIndex((prev) => (prev + 1) % messages.length);
    }, ROTATION_INTERVAL);

    return () => clearInterval(interval);
  }, [status]);

  if (status === 'idle') return null;

  const messages = STATUS_MESSAGES[status];
  const displayMessage = currentMessage || messages[messageIndex] || messages[0];
  const isLoading = status !== 'complete' && status !== 'error';

  return (
    <div className="flex items-center gap-3 p-4 bg-sky-50 rounded-xl">
      {isLoading && (
        <Loader2 className="h-5 w-5 text-sky-600 animate-spin flex-shrink-0" />
      )}
      <span className="text-gray-700">{displayMessage}</span>
    </div>
  );
}
