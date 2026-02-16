# Story 38.3.2: PDF ISO Alignment Section

## Description

Add a new "ISO Standards Alignment" section to the PDF report after the dimension scores table. This section lists each ISO clause referenced across all dimensions, its alignment status (Aligned/Partial/Not Evidenced), and which dimensions reference it. Provides a consolidated view of ISO traceability for assessors.

## Acceptance Criteria

- [ ] New "ISO Standards Alignment" section appears after dimension scores table
- [ ] Section lists unique ISO clauses across all dimensions
- [ ] Each clause shows: clauseRef, title, framework, status badge, dimension(s)
- [ ] Status badges: Aligned (green), Partial (amber), Not Evidenced (red), Not Applicable (gray)
- [ ] Clauses grouped by framework (ISO 42001, ISO 23894)
- [ ] Section only renders if at least 1 ISO clause reference exists
- [ ] Page break before the section for clean PDF layout
- [ ] Under 300 LOC for ScoringPDFExporter.ts

## Technical Approach

### 1. Update scoring-report.html

**File:** `packages/backend/src/infrastructure/export/templates/scoring-report.html` (MODIFY)

Add CSS for ISO alignment section:

```css
/* ===== ISO ALIGNMENT SECTION ===== */
.iso-alignment-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
  page-break-inside: avoid;
}

.iso-alignment-table th {
  text-align: left;
  padding: 10px 12px;
  background: #374151;
  color: white;
  font-weight: 600;
}

.iso-alignment-table td {
  padding: 10px 12px;
  border-bottom: 1px solid #e5e7eb;
}

.iso-status {
  padding: 2px 8px;
  border-radius: 8px;
  font-size: 11px;
  font-weight: 600;
  display: inline-block;
}

.iso-status.aligned { background: #dcfce7; color: #166534; }
.iso-status.partial { background: #fef3c7; color: #92400e; }
.iso-status.not_evidenced { background: #fee2e2; color: #991b1b; }
.iso-status.not_applicable { background: #f3f4f6; color: #6b7280; }

.framework-label {
  font-size: 11px;
  color: #6b7280;
  font-style: italic;
}
```

Add HTML section (inserted after dimension scores, before narrative):

```html
<!-- ISO Standards Alignment (rendered conditionally) -->
{{{isoAlignmentSection}}}
```

### 2. Update ScoringPDFExporter.renderTemplate()

**File:** `packages/backend/src/infrastructure/export/ScoringPDFExporter.ts` (MODIFY)

Build the ISO alignment section HTML from `dimensionISOData`:

```typescript
// Build ISO alignment section
const isoAlignmentHtml = this.buildISOAlignmentSection(data.dimensionISOData);
html = html.replace('{{{isoAlignmentSection}}}', isoAlignmentHtml);
```

Add a private method (or extract to a helper if LOC is tight):

```typescript
private buildISOAlignmentSection(isoData: DimensionExportISOData[]): string {
  // Collect all unique clauses across dimensions
  const clauseMap = new Map<string, {
    clauseRef: string;
    title: string;
    framework: string;
    status: string;
    dimensions: string[];
  }>();

  for (const dim of isoData) {
    for (const ref of dim.isoClauseReferences) {
      // IMPORTANT: Key by framework+clauseRef, not just clauseRef alone.
      // Different frameworks (e.g., ISO 42001 vs ISO 27001) can share the same
      // clause number with different meanings (e.g., "A.4.2" in both frameworks).
      const dedupKey = `${ref.framework}::${ref.clauseRef}`;
      const existing = clauseMap.get(dedupKey);
      if (existing) {
        if (!existing.dimensions.includes(dim.label)) {
          existing.dimensions.push(dim.label);
        }
      } else {
        clauseMap.set(dedupKey, {
          clauseRef: ref.clauseRef,
          title: ref.title,
          framework: ref.framework,
          status: ref.status,
          dimensions: [dim.label],
        });
      }
    }
  }

  if (clauseMap.size === 0) return '';

  // Group by framework
  const byFramework = new Map<string, typeof clauseMap extends Map<string, infer V> ? V[] : never>();
  for (const [, clause] of clauseMap) {
    const list = byFramework.get(clause.framework) ?? [];
    list.push(clause);
    byFramework.set(clause.framework, list);
  }

  let html = '<div class="section page-break">\n';
  html += '<h2>ISO Standards Alignment</h2>\n';

  for (const [framework, clauses] of byFramework) {
    html += `<p class="framework-label">${this.escapeHtml(framework)}</p>\n`;
    html += '<table class="iso-alignment-table">\n';
    html += '<thead><tr><th>Clause</th><th>Title</th><th>Status</th><th>Dimensions</th></tr></thead>\n';
    html += '<tbody>\n';

    for (const clause of clauses.sort((a, b) => a.clauseRef.localeCompare(b.clauseRef))) {
      const statusClass = clause.status.replace(/ /g, '_');
      const statusLabel = clause.status.replace(/_/g, ' ').toUpperCase();
      html += `<tr>`;
      html += `<td><strong>${this.escapeHtml(clause.clauseRef)}</strong></td>`;
      html += `<td>${this.escapeHtml(clause.title)}</td>`;
      html += `<td><span class="iso-status ${statusClass}">${statusLabel}</span></td>`;
      html += `<td>${clause.dimensions.map(d => this.escapeHtml(d)).join(', ')}</td>`;
      html += `</tr>\n`;
    }

    html += '</tbody></table>\n';
  }

  html += '</div>\n';
  return html;
}
```

### 3. Key Rules

- **Conditional rendering**: If no ISO clause references exist across any dimension, render empty string (no empty section).
- **Deduplication**: Same clause may appear in multiple dimensions. Show it once with all dimension names. The dedup key MUST be `${framework}::${clauseRef}` (not just `clauseRef`), because different frameworks (e.g., ISO 42001 vs ISO 27001) can share the same clause number with different meanings.
- **Status classes**: Use CSS classes matching the status values from `ISOClauseReference.status`.
- **LOC budget**: `buildISOAlignmentSection` is ~50 LOC. Consider extracting to a helper file if ScoringPDFExporter.ts exceeds 250 LOC. Target keeping it in the exporter since it is template-specific.

## Files Touched

- `packages/backend/src/infrastructure/export/templates/scoring-report.html` - MODIFY (add CSS + placeholder)
- `packages/backend/src/infrastructure/export/ScoringPDFExporter.ts` - MODIFY (add buildISOAlignmentSection method)

## Tests Affected

- `packages/backend/__tests__/unit/infrastructure/export/ScoringPDFExporter.test.ts` - Need assertions for ISO section

## Agent Assignment

- [x] export-agent

## Tests Required

- [ ] `packages/backend/__tests__/unit/infrastructure/export/ScoringPDFExporter.test.ts` (extend)
  - Test ISO alignment section renders when ISO clauses exist
  - Test ISO alignment section is empty when no ISO clauses exist
  - Test clauses grouped by framework
  - Test clause status badges have correct CSS classes
  - Test deduplication: same clause from multiple dimensions listed once
  - Test dimensions column lists all referencing dimensions

## Definition of Done

- [ ] PDF has ISO Standards Alignment section after dimension table
- [ ] Clauses listed with status badges and dimension mappings
- [ ] Section only appears when ISO data exists
- [ ] All tests pass
- [ ] Under 300 LOC per file
- [ ] No TypeScript errors
