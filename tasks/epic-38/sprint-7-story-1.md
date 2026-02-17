# Story 38.7.1: ISO Alignment Section in ScoringResultCard

## Description

Add a collapsible "ISO Standards Alignment" section to `ScoringResultCard` that lists all ISO clause references across dimensions with their alignment status. This provides assessors a quick summary of ISO traceability directly in the chat UI, without needing to export a report.

## Acceptance Criteria

- [ ] New `ISOAlignmentSection` component created as a separate file
- [ ] Section renders as a collapsible panel (like the existing Dimension Scores section)
- [ ] Lists unique ISO clauses with: clauseRef, title, framework, status badge, dimensions
- [ ] Status badges: Aligned (green), Partial (amber), Not Evidenced (red), Not Applicable (gray)
- [ ] Clauses grouped by framework
- [ ] Section only appears if at least 1 ISO clause reference exists
- [ ] Section starts collapsed (unlike dimension scores which start expanded)
- [ ] Has `data-testid="iso-alignment-section"`
- [ ] Under 300 LOC for each file

## Technical Approach

### 1. Create ISOAlignmentSection.tsx

**File:** `apps/web/src/components/chat/ISOAlignmentSection.tsx` (CREATE)

```tsx
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
  // Collect unique clauses across all dimensions
  const clauseMap = new Map<string, UniqueClause>();

  for (const ds of dimensionScores) {
    const refs = ds.findings?.isoClauseReferences ?? [];
    const dimLabel = DIMENSION_LABELS[ds.dimension] || ds.dimension;

    for (const ref of refs) {
      // IMPORTANT: Key by framework+clauseRef, not just clauseRef alone.
      // Different frameworks (e.g., ISO 42001 vs ISO 27001) can share the same
      // clause number with different meanings (e.g., "A.4.2" in both frameworks).
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

  // Group by framework
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
```

### 2. Update ScoringResultCard.tsx

**File:** `apps/web/src/components/chat/ScoringResultCard.tsx` (MODIFY)

Add the ISO section as a collapsible panel, after the dimension scores section:

```tsx
import { ISOAlignmentSection } from './ISOAlignmentSection';

// In the component, add state for ISO section:
const [isISOExpanded, setIsISOExpanded] = useState(false);

// Check if any ISO data exists
const hasISOData = result.dimensionScores.some(
  (d) => d.findings?.isoClauseReferences && d.findings.isoClauseReferences.length > 0
);

// Render after dimension scores section, before export actions:
{hasISOData && (
  <div className="border-b border-gray-100">
    <button
      onClick={() => setIsISOExpanded(!isISOExpanded)}
      className="w-full px-6 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors"
      data-testid="iso-alignment-toggle"
    >
      <span className="text-sm font-semibold text-gray-900">ISO Standards Alignment</span>
      {isISOExpanded ? (
        <ChevronUp className="h-4 w-4 text-gray-500" />
      ) : (
        <ChevronDown className="h-4 w-4 text-gray-500" />
      )}
    </button>
    {isISOExpanded && (
      <div className="px-6 pb-4">
        <ISOAlignmentSection dimensionScores={result.dimensionScores} />
      </div>
    )}
  </div>
)}
```

### 3. Key Rules

- **Separate component**: `ISOAlignmentSection` is a separate file to keep `ScoringResultCard.tsx` under 300 LOC (currently 242 LOC, adding ~15 LOC for the collapsible wrapper).
- **Conditional rendering**: Only render the section if any dimension has ISO clause references.
- **Starts collapsed**: Unlike dimension scores (which start expanded), ISO section starts collapsed to reduce visual noise.
- **Deduplication**: Same clause from multiple dimensions shown once with all dimension names (consistent with PDF/Word). The dedup key MUST be `${ref.framework}::${ref.clauseRef}` (not just `ref.clauseRef`), because different frameworks (e.g., ISO 42001 vs ISO 27001) can share the same clause number with different meanings.

## Files Touched

- `apps/web/src/components/chat/ISOAlignmentSection.tsx` - CREATE (~100 LOC)
- `apps/web/src/components/chat/ScoringResultCard.tsx` - MODIFY (add import + ~15 LOC collapsible section)

## Tests Affected

- `apps/web/src/components/chat/__tests__/ScoringResultCard.test.tsx` - Does not exist, CREATE new test file

## Agent Assignment

- [x] frontend-agent

## Tests Required

- [ ] `apps/web/src/components/chat/__tests__/ISOAlignmentSection.test.tsx`
  - Test renders nothing when no ISO clauses exist
  - Test renders clauses grouped by framework
  - Test deduplication: same clause from multiple dimensions shown once
  - Test status badges have correct text (Aligned/Partial/Not Evidenced)
  - Test each clause displays its associated dimension labels as badges
  - Test has correct data-testid
- [ ] `apps/web/src/components/chat/__tests__/ScoringResultCard.test.tsx` (extend)
  - Test ISO section toggle button appears when ISO data exists
  - Test ISO section toggle button does NOT appear when no ISO data
  - Test ISO section starts collapsed

## QA Verification (Frontend Story)

**Route:** `/chat` (need a scored assessment with ISO data)
**Wait For:** `[data-testid="scoring-result-card"]`

**Steps:**
1. action: verify_exists, selector: `[data-testid="iso-alignment-toggle"]`
2. action: click, selector: `[data-testid="iso-alignment-toggle"]`
3. action: verify_exists, selector: `[data-testid="iso-alignment-section"]`
4. action: verify_text, selector: `[data-testid="iso-alignment-section"]`, expected: "ISO"

**Screenshot:** `qa-38.7.1.png`

## Definition of Done

- [ ] ISOAlignmentSection renders clauses with status badges
- [ ] Collapsible section in ScoringResultCard
- [ ] Only appears when ISO data exists
- [ ] Tests written and passing
- [ ] No TypeScript errors
- [ ] Browser QA passed
