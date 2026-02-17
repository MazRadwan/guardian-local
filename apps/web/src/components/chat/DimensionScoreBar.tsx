'use client';

import React from 'react';
import { RiskRating, DimensionScoreData } from '@/types/scoring';
import { ConfidenceBadge } from './ConfidenceBadge';

const GUARDIAN_NATIVE_DIMENSIONS = [
  'clinical_risk',
  'vendor_capability',
  'ethical_considerations',
  'sustainability',
];

interface DimensionScoreBarProps {
  label: string;
  score: number;
  riskRating: RiskRating;
  type: 'risk' | 'capability';
  dimension?: string;
  findings?: DimensionScoreData['findings'];
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

export function DimensionScoreBar({
  label,
  score,
  riskRating,
  type,
  dimension,
  findings,
}: DimensionScoreBarProps) {
  const isGuardianNative = dimension ? GUARDIAN_NATIVE_DIMENSIONS.includes(dimension) : false;
  const isoClauseCount = findings?.isoClauseReferences?.length ?? 0;

  return (
    <div className="space-y-1">
      <div className="flex justify-between items-center text-sm">
        <span className="font-medium text-gray-700">{label}</span>
        <div className="flex items-center gap-2">
          {/* Confidence badge */}
          <ConfidenceBadge confidence={findings?.assessmentConfidence ?? null} />

          {/* ISO clause count (non-Guardian-native only) */}
          {!isGuardianNative && isoClauseCount > 0 && (
            <span
              className="text-xs text-gray-400"
              data-testid="iso-clause-count"
            >
              {isoClauseCount} ISO
            </span>
          )}

          {/* Existing: score and risk rating */}
          <span className="text-gray-500">
            {score}/100
            <span className={`ml-2 text-xs px-1.5 py-0.5 rounded ${RISK_RATING_BG[riskRating]} capitalize`}>
              {riskRating}
            </span>
          </span>
        </div>
      </div>
      <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${RISK_RATING_COLORS[riskRating]}`}
          style={{ width: `${score}%` }}
        />
      </div>
    </div>
  );
}
