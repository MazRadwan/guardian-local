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
