# Story 38.3.1: PDF Dimension Table ISO Columns

## Description

Add confidence badge and ISO clause count columns to the PDF dimension scores table. Each dimension row currently shows: Dimension | Score | Rating | Visual. After this story: Dimension | Score | Rating | Confidence | ISO Clauses | Visual. Confidence renders as a colored badge (H=green, M=amber, L=red). ISO Clauses shows a count like "3 clauses" linking to the alignment section.

## Acceptance Criteria

- [ ] Dimension table header has 2 new columns: "Confidence" and "ISO Refs"
- [ ] Confidence column shows H/M/L badge with color coding
- [ ] ISO Refs column shows clause count (e.g., "3 clauses")
- [ ] Guardian-native dimensions show "--" in ISO Refs column
- [ ] Dimensions without confidence data show "--" in Confidence column
- [ ] Table layout remains clean and readable
- [ ] Under 300 LOC for ScoringPDFExporter.ts
- [ ] No TypeScript errors

## Technical Approach

### 1. Update scoring-report.html

**File:** `packages/backend/src/infrastructure/export/templates/scoring-report.html` (MODIFY)

Add CSS for confidence badges:

```css
/* ===== CONFIDENCE BADGES ===== */
.confidence-badge {
  padding: 2px 8px;
  border-radius: 8px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  display: inline-block;
}

.confidence-badge.high { background: #dcfce7; color: #166534; }
.confidence-badge.medium { background: #fef3c7; color: #92400e; }
.confidence-badge.low { background: #fee2e2; color: #991b1b; }

.iso-ref-count {
  font-size: 12px;
  color: #6b7280;
}

.no-data {
  color: #d1d5db;
  font-style: italic;
}
```

Update dimension table header:

```html
<thead>
  <tr>
    <th>Dimension</th>
    <th>Score</th>
    <th>Rating</th>
    <th>Confidence</th>
    <th>ISO Refs</th>
    <th>Visual</th>
  </tr>
</thead>
```

Update dimension row template:

```html
{{#dimensionScores}}
<tr>
  <td>{{label}}</td>
  <td>{{score}}/100</td>
  <td><span class="risk-badge {{riskRating}}">{{riskRating}}</span></td>
  <td>{{confidenceHtml}}</td>
  <td>{{isoRefHtml}}</td>
  <td>
    <div class="score-bar">
      <div class="score-bar-fill risk-{{riskRating}}" style="width: {{score}}%"></div>
    </div>
  </td>
</tr>
{{/dimensionScores}}
```

### 2. Update ScoringPDFExporter.renderTemplate()

**File:** `packages/backend/src/infrastructure/export/ScoringPDFExporter.ts` (MODIFY)

Enhance the dimension scores rendering to include confidence and ISO ref data:

```typescript
// In renderTemplate, update dimensionScoresWithLabels:
const dimensionScoresWithLabels = payload.dimensionScores.map((d) => {
  const isoData = data.dimensionISOData.find((iso) => iso.dimension === d.dimension);

  // Build confidence badge HTML
  let confidenceHtml = '<span class="no-data">--</span>';
  if (isoData?.confidence) {
    confidenceHtml = `<span class="confidence-badge ${isoData.confidence.level}">${isoData.confidence.level.toUpperCase()}</span>`;
  }

  // Build ISO ref count HTML
  let isoRefHtml = '<span class="no-data">--</span>';
  if (isoData && !isoData.isGuardianNative && isoData.isoClauseReferences.length > 0) {
    const count = isoData.isoClauseReferences.length;
    isoRefHtml = `<span class="iso-ref-count">${count} clause${count !== 1 ? 's' : ''}</span>`;
  }

  return {
    ...d,
    label: DIMENSION_CONFIG[d.dimension as keyof typeof DIMENSION_CONFIG]?.label || d.dimension,
    confidenceHtml,
    isoRefHtml,
  };
});
```

### 3. Key Rules

- **Template variable injection**: The PDF template uses programmatic HTML generation, NOT Mustache-style template replacement. The dimension table rows are built via `.map().join()` in TypeScript code within `renderTemplate()`, then injected as a single `{{#dimensionScores}}...{{/dimensionScores}}` block replacement. New confidence and ISO columns are added to the programmatic HTML builder, not as separate template variables. While `{{{confidenceHtml}}}` and `{{{isoRefHtml}}}` appear in the template block, they are properties on each object in the `dimensionScores` array passed to the Mustache block, not standalone template variables.
- **`dimensionISOData` lookup**: Match by `dimension` key to find the ISO data for each dimension score.
- **Guardian-native dimensions**: Show "--" for ISO refs (they have no ISO mapping).
- **LOC budget**: ScoringPDFExporter.ts is 143 LOC. Adding ~20 LOC for the enhanced rendering keeps it well under 300 LOC.

## Files Touched

- `packages/backend/src/infrastructure/export/templates/scoring-report.html` - MODIFY (add CSS + update table columns)
- `packages/backend/src/infrastructure/export/ScoringPDFExporter.ts` - MODIFY (enhance renderTemplate dimension data)

## Tests Affected

- `packages/backend/__tests__/unit/infrastructure/export/ScoringPDFExporter.test.ts` - Need fixture updates with `dimensionISOData`

## Agent Assignment

- [x] export-agent

## Tests Required

- [ ] `packages/backend/__tests__/unit/infrastructure/export/ScoringPDFExporter.test.ts` (extend)
  - Test dimension table includes confidence badge HTML for dimensions with confidence data
  - Test dimension table shows "--" for dimensions without confidence data
  - Test dimension table includes ISO clause count for mapped dimensions
  - Test dimension table shows "--" for Guardian-native dimensions in ISO Refs column
  - Test HTML output contains `confidence-badge` CSS class

## Definition of Done

- [ ] PDF dimension table has Confidence and ISO Refs columns
- [ ] Confidence badges render with correct colors
- [ ] ISO ref counts display correctly
- [ ] Guardian-native dimensions show "--" in ISO Refs
- [ ] All tests pass
- [ ] Under 300 LOC per file
- [ ] No TypeScript errors
