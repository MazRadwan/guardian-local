'use client';

import React from 'react';
import { DimensionScoreBar } from './DimensionScoreBar';
import { DimensionScoreData } from '@/types/scoring';

interface ScoreDashboardProps {
  dimensionScores: DimensionScoreData[];
}

/**
 * Dimension config matching backend
 *
 * TODO (post-MVP): Consider sharing this config with backend to prevent drift.
 * For MVP, this is acceptable as the 10 dimensions are stable.
 * If dimensions change, update both:
 * - packages/backend/src/domain/scoring/rubric.ts
 * - apps/web/src/components/chat/ScoreDashboard.tsx (this file)
 */
const DIMENSION_CONFIG: Record<string, { label: string; type: 'risk' | 'capability' }> = {
  clinical_risk: { label: 'Clinical Risk', type: 'risk' },
  privacy_risk: { label: 'Privacy Risk', type: 'risk' },
  security_risk: { label: 'Security Risk', type: 'risk' },
  technical_credibility: { label: 'Technical Credibility', type: 'capability' },
  vendor_capability: { label: 'Vendor Capability', type: 'capability' },
  ai_transparency: { label: 'AI Transparency', type: 'capability' },
  ethical_considerations: { label: 'Ethical Considerations', type: 'capability' },
  regulatory_compliance: { label: 'Regulatory Compliance', type: 'capability' },
  operational_excellence: { label: 'Operational Excellence', type: 'capability' },
  sustainability: { label: 'Sustainability', type: 'capability' },
};

export function ScoreDashboard({ dimensionScores }: ScoreDashboardProps) {
  // Group by type
  const riskDimensions = dimensionScores.filter(
    (d) => DIMENSION_CONFIG[d.dimension]?.type === 'risk'
  );
  const capabilityDimensions = dimensionScores.filter(
    (d) => DIMENSION_CONFIG[d.dimension]?.type === 'capability'
  );

  return (
    <div className="space-y-6" data-testid="score-dashboard">
      {/* Risk Dimensions */}
      <div>
        <h4 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
          <span className="w-2 h-2 bg-red-500 rounded-full" />
          Risk Dimensions
          <span className="text-xs text-gray-500 font-normal">(lower is better)</span>
        </h4>
        <div className="space-y-3">
          {riskDimensions.map((d) => (
            <DimensionScoreBar
              key={d.dimension}
              label={DIMENSION_CONFIG[d.dimension]?.label || d.dimension}
              score={d.score}
              riskRating={d.riskRating}
              type="risk"
              dimension={d.dimension}
              findings={d.findings}
            />
          ))}
        </div>
      </div>

      {/* Capability Dimensions */}
      <div>
        <h4 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
          <span className="w-2 h-2 bg-green-500 rounded-full" />
          Capability Dimensions
          <span className="text-xs text-gray-500 font-normal">(higher is better)</span>
        </h4>
        <div className="space-y-3">
          {capabilityDimensions.map((d) => (
            <DimensionScoreBar
              key={d.dimension}
              label={DIMENSION_CONFIG[d.dimension]?.label || d.dimension}
              score={d.score}
              riskRating={d.riskRating}
              type="capability"
              dimension={d.dimension}
              findings={d.findings}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
