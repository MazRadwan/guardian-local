'use client';

import React, { useState } from 'react';
import { ChevronDown, ChevronUp, BarChart3 } from 'lucide-react';
import { RecommendationBadge } from './RecommendationBadge';
import { ScoreDashboard } from './ScoreDashboard';
import { DownloadButton } from './DownloadButton';
import { ScoringResultData, RiskRating } from '@/types/scoring';

interface ScoringResultCardProps {
  result: ScoringResultData;
}

const RISK_RATING_COLORS: Record<RiskRating, string> = {
  low: 'text-green-600',
  medium: 'text-amber-600',
  high: 'text-orange-600',
  critical: 'text-red-600',
};

export function ScoringResultCard({
  result,
}: ScoringResultCardProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 bg-gradient-to-r from-purple-50 to-indigo-50 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-100 rounded-lg">
              <BarChart3 className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">Risk Assessment Complete</h3>
              <p className="text-sm text-gray-500">10 dimensions analyzed</p>
            </div>
          </div>
          <RecommendationBadge recommendation={result.recommendation} size="lg" />
        </div>
      </div>

      {/* Composite Score */}
      <div className="px-6 py-4 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-500">Composite Score</p>
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-bold text-gray-900">{result.compositeScore}</span>
              <span className="text-lg text-gray-400">/100</span>
            </div>
          </div>
          <div className="text-right">
            <p className="text-sm text-gray-500">Overall Risk</p>
            <p className={`text-lg font-semibold capitalize ${RISK_RATING_COLORS[result.overallRiskRating]}`}>
              {result.overallRiskRating}
            </p>
          </div>
        </div>
      </div>

      {/* Executive Summary */}
      <div className="px-6 py-4 border-b border-gray-100">
        <h4 className="text-sm font-semibold text-gray-900 mb-2">Executive Summary</h4>
        <p className="text-gray-700 text-sm leading-relaxed">{result.executiveSummary}</p>
      </div>

      {/* Key Findings */}
      {result.keyFindings.length > 0 && (
        <div className="px-6 py-4 border-b border-gray-100">
          <h4 className="text-sm font-semibold text-gray-900 mb-2">Key Findings</h4>
          <ul className="space-y-1">
            {result.keyFindings.map((finding, i) => (
              <li key={i} className="flex gap-2 text-sm text-gray-700">
                <span className="text-purple-500">•</span>
                {finding}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Dimension Scores (Collapsible) */}
      <div className="border-b border-gray-100">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full px-6 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors"
        >
          <span className="text-sm font-semibold text-gray-900">Dimension Scores</span>
          {isExpanded ? (
            <ChevronUp className="h-4 w-4 text-gray-500" />
          ) : (
            <ChevronDown className="h-4 w-4 text-gray-500" />
          )}
        </button>
        {isExpanded && (
          <div className="px-6 pb-4">
            <ScoreDashboard dimensionScores={result.dimensionScores} />
          </div>
        )}
      </div>

      {/* Export Actions */}
      <div className="px-6 py-4 bg-gray-50 flex gap-3">
        <DownloadButton
          assessmentId={result.assessmentId}
          format="pdf"
          exportType="scoring"
          label="Export PDF"
        />
        <DownloadButton
          assessmentId={result.assessmentId}
          format="word"
          exportType="scoring"
          label="Export Word"
        />
      </div>
    </div>
  );
}
