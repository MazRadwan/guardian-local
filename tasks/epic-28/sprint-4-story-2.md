# Story 28.7.2: Extract ScoringHandler.ts (buildScoringFollowUpContext)

**Sprint:** 4 - Business Logic Handlers
**Agent:** backend-agent
**Estimation:** Small (1-2 files)

---

## Description

Add `buildScoringFollowUpContext()` method to ScoringHandler. This is a **synchronous formatting function** that takes a completed scoring report and formats it for Claude context injection when the user has a follow-up query after scoring.

**CRITICAL:** This method is ONLY used when `userQuery` exists after scoring completes. It does NOT fetch scoring state - it receives the report directly.

---

## Acceptance Criteria

- [ ] `buildScoringFollowUpContext(report)` implemented as **synchronous pure function**
- [ ] **Takes report parameter directly** (NOT conversationId - no service call)
- [ ] Formats composite score, risk rating, recommendation
- [ ] Formats dimension scores with name, score out of 10, and risk rating
- [ ] Formats key findings and executive summary
- [ ] Unit tests verify formatting output

---

## Technical Approach

```typescript
// Add to ScoringHandler.ts

interface ScoringReportPayload {
  compositeScore: number;
  overallRiskRating: string;
  recommendation: string;
  executiveSummary: string;
  keyFindings: string[];
  dimensionScores: Array<{
    dimension: string;
    score: number;
    riskRating: string;
  }>;
}

/**
 * Epic 18.4.3: Build scoring context for follow-up questions
 *
 * CRITICAL: This is a synchronous formatting function that takes the report
 * directly - it does NOT call any service to fetch scoring state.
 *
 * Only called when userQuery exists after scoring completes.
 * Formats the scoring results as context for Claude to reference
 * when answering user questions about the assessment.
 */
buildScoringFollowUpContext(report: { payload: ScoringReportPayload }): string {
  const { payload } = report;

  // Format dimension scores for context (score out of 10, not 5)
  const dimensionSummary = payload.dimensionScores
    .map(ds => `- ${ds.dimension}: ${ds.score}/10 (${ds.riskRating})`)
    .join('\n');

  return `
## Scoring Results Context

**Composite Score:** ${payload.compositeScore}/100
**Overall Risk Rating:** ${payload.overallRiskRating}
**Recommendation:** ${payload.recommendation}

### Dimension Scores:
${dimensionSummary}

### Key Findings:
${payload.keyFindings.map(f => `- ${f}`).join('\n')}

### Executive Summary:
${payload.executiveSummary}
`;
}
```

---

## Files Touched

- `packages/backend/src/infrastructure/websocket/handlers/ScoringHandler.ts` - Add method
- `packages/backend/__tests__/unit/infrastructure/websocket/handlers/ScoringHandler.test.ts` - Add tests

---

## Tests Required

```typescript
describe('buildScoringFollowUpContext', () => {
  it('should format composite score and risk rating', () => {
    const report = {
      payload: {
        compositeScore: 72,
        overallRiskRating: 'Moderate',
        recommendation: 'Proceed with conditions',
        executiveSummary: 'Vendor shows adequate security controls.',
        keyFindings: ['Strong encryption', 'Missing audit logs'],
        dimensionScores: [
          { dimension: 'Data Security', score: 8, riskRating: 'Low' },
          { dimension: 'Privacy', score: 6, riskRating: 'Moderate' },
        ],
      },
    };

    const result = handler.buildScoringFollowUpContext(report);

    expect(result).toContain('**Composite Score:** 72/100');
    expect(result).toContain('**Overall Risk Rating:** Moderate');
    expect(result).toContain('**Recommendation:** Proceed with conditions');
  });

  it('should format dimension scores with /10 scale', () => {
    const report = {
      payload: {
        compositeScore: 72,
        overallRiskRating: 'Moderate',
        recommendation: 'Proceed',
        executiveSummary: 'Summary',
        keyFindings: [],
        dimensionScores: [
          { dimension: 'Data Security', score: 8, riskRating: 'Low' },
          { dimension: 'Bias Mitigation', score: 5, riskRating: 'High' },
        ],
      },
    };

    const result = handler.buildScoringFollowUpContext(report);

    expect(result).toContain('- Data Security: 8/10 (Low)');
    expect(result).toContain('- Bias Mitigation: 5/10 (High)');
  });

  it('should format key findings as bullet points', () => {
    const report = {
      payload: {
        compositeScore: 60,
        overallRiskRating: 'High',
        recommendation: 'Caution',
        executiveSummary: 'Summary',
        keyFindings: ['Finding one', 'Finding two', 'Finding three'],
        dimensionScores: [],
      },
    };

    const result = handler.buildScoringFollowUpContext(report);

    expect(result).toContain('- Finding one');
    expect(result).toContain('- Finding two');
    expect(result).toContain('- Finding three');
  });

  it('should include executive summary', () => {
    const report = {
      payload: {
        compositeScore: 80,
        overallRiskRating: 'Low',
        recommendation: 'Approved',
        executiveSummary: 'This vendor demonstrates excellent security practices.',
        keyFindings: [],
        dimensionScores: [],
      },
    };

    const result = handler.buildScoringFollowUpContext(report);

    expect(result).toContain('This vendor demonstrates excellent security practices.');
  });
});
```

---

## Definition of Done

- [ ] buildScoringFollowUpContext implemented as synchronous pure function
- [ ] Takes report parameter directly (not conversationId)
- [ ] Unit tests passing
