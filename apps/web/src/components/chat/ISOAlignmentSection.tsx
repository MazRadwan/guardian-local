'use client';

import React from 'react';
import { DimensionScoreData, ISOClauseReference } from '@/types/scoring';

interface ISOAlignmentSectionProps {
  dimensionScores: DimensionScoreData[];
}

const STATUS_STYLES: Record<string, { badge: string; label: string }> = {
  aligned: { badge: 'bg-green-100 text-green-700', label: 'Aligned' },
  partial: { badge: 'bg-amber-100 text-amber-700', label: 'Partial' },
  not_evidenced: { badge: 'bg-red-100 text-red-700', label: 'Not Evidenced' },
  not_applicable: { badge: 'bg-gray-100 text-gray-500', label: 'N/A' },
};

const DIMENSION_LABELS: Record<string, string> = {
  clinical_risk: 'Clinical Risk',
  privacy_risk: 'Privacy Risk',
  security_risk: 'Security Risk',
  technical_credibility: 'Technical Credibility',
  vendor_capability: 'Vendor Capability',
  ai_transparency: 'AI Transparency',
  ethical_considerations: 'Ethical Considerations',
  regulatory_compliance: 'Regulatory Compliance',
  operational_excellence: 'Operational Excellence',
  sustainability: 'Sustainability',
};

interface UniqueClause {
  clauseRef: string;
  title: string;
  framework: string;
  status: ISOClauseReference['status'];
  dimensions: string[];
}

export function ISOAlignmentSection({ dimensionScores }: ISOAlignmentSectionProps) {
  const clauseMap = new Map<string, UniqueClause>();

  for (const ds of dimensionScores) {
    const refs = ds.findings?.isoClauseReferences ?? [];
    const dimLabel = DIMENSION_LABELS[ds.dimension] || ds.dimension;

    for (const ref of refs) {
      const dedupKey = `${ref.framework}::${ref.clauseRef}`;
      const existing = clauseMap.get(dedupKey);
      if (existing) {
        if (!existing.dimensions.includes(dimLabel)) {
          existing.dimensions.push(dimLabel);
        }
      } else {
        clauseMap.set(dedupKey, {
          clauseRef: ref.clauseRef,
          title: ref.title,
          framework: ref.framework,
          status: ref.status,
          dimensions: [dimLabel],
        });
      }
    }
  }

  if (clauseMap.size === 0) return null;

  const byFramework = new Map<string, UniqueClause[]>();
  for (const clause of clauseMap.values()) {
    const list = byFramework.get(clause.framework) ?? [];
    list.push(clause);
    byFramework.set(clause.framework, list);
  }

  return (
    <div data-testid="iso-alignment-section" className="space-y-3">
      {Array.from(byFramework.entries()).map(([framework, clauses]) => (
        <div key={framework}>
          <p className="text-xs font-medium text-gray-500 mb-2">{framework}</p>
          <div className="space-y-1.5">
            {clauses
              .sort((a, b) => a.clauseRef.localeCompare(b.clauseRef))
              .map((clause) => {
                const statusStyle = STATUS_STYLES[clause.status] || STATUS_STYLES.not_applicable;
                return (
                  <div
                    key={`${clause.framework}::${clause.clauseRef}`}
                    className="flex flex-col gap-1 text-sm py-1.5 px-2 rounded hover:bg-gray-50"
                  >
                    <div className="flex items-start gap-3">
                      <span className="font-mono text-xs text-gray-600 min-w-[60px]">
                        {clause.clauseRef}
                      </span>
                      <span className="flex-1 text-gray-700">{clause.title}</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded ${statusStyle.badge}`}>
                        {statusStyle.label}
                      </span>
                    </div>
                    {clause.dimensions.length > 0 && (
                      <div className="ml-[72px] flex flex-wrap gap-1">
                        {clause.dimensions.map((dim) => (
                          <span
                            key={dim}
                            className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded"
                          >
                            {dim}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        </div>
      ))}
    </div>
  );
}
