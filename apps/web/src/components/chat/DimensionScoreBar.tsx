'use client';

import React from 'react';
import { RiskRating } from '@/types/scoring';

interface DimensionScoreBarProps {
  label: string;
  score: number;
  riskRating: RiskRating;
  type: 'risk' | 'capability';
}

const RISK_RATING_COLORS: Record<RiskRating, string> = {
  low: 'bg-green-500',
  medium: 'bg-amber-500',
  high: 'bg-orange-500',
  critical: 'bg-red-500',
};

const RISK_RATING_BG: Record<RiskRating, string> = {
  low: 'bg-green-100',
  medium: 'bg-amber-100',
  high: 'bg-orange-100',
  critical: 'bg-red-100',
};

export function DimensionScoreBar({ label, score, riskRating, type }: DimensionScoreBarProps) {
  // For risk dimensions, lower is better; for capability, higher is better
  // We display the bar based on the score either way
  const displayScore = score;

  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span className="font-medium text-gray-700">{label}</span>
        <span className="text-gray-500">
          {score}/100
          <span className={`ml-2 text-xs px-1.5 py-0.5 rounded ${RISK_RATING_BG[riskRating]} capitalize`}>
            {riskRating}
          </span>
        </span>
      </div>
      <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${RISK_RATING_COLORS[riskRating]}`}
          style={{ width: `${displayScore}%` }}
        />
      </div>
    </div>
  );
}
