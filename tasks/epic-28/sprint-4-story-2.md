# Story 28.7.2: Extract ScoringHandler.ts (buildScoringFollowUpContext)

**Sprint:** 4 - Business Logic Handlers
**Agent:** backend-agent
**Estimation:** Small (1-2 files)

---

## Description

Add `buildScoringFollowUpContext()` method to ScoringHandler. This builds context for follow-up questions during scoring, including previous scores and remaining areas to assess.

---

## Acceptance Criteria

- [ ] `buildScoringFollowUpContext()` implemented
- [ ] Includes previous scoring results
- [ ] Includes areas not yet fully assessed
- [ ] Formats context for Claude prompt injection
- [ ] Unit tests cover context building

---

## Technical Approach

```typescript
// Add to ScoringHandler.ts

interface ScoringFollowUpContext {
  previousScores: Array<{
    dimension: string;
    score: number;
    rationale: string;
  }>;
  unassessedAreas: string[];
  totalDimensions: number;
  completedDimensions: number;
}

/**
 * Build context for follow-up questions during scoring
 */
async buildScoringFollowUpContext(conversationId: string): Promise<string> {
  const scoringState = await this.scoringService.getScoringState(conversationId);

  if (!scoringState || scoringState.scores.length === 0) {
    return '';
  }

  const context: ScoringFollowUpContext = {
    previousScores: scoringState.scores.map(s => ({
      dimension: s.dimension,
      score: s.score,
      rationale: s.rationale,
    })),
    unassessedAreas: scoringState.unassessedDimensions,
    totalDimensions: 10,
    completedDimensions: scoringState.scores.length,
  };

  return `
## Previous Scoring Progress

Completed ${context.completedDimensions} of ${context.totalDimensions} dimensions.

### Scores Assigned:
${context.previousScores.map(s => `- **${s.dimension}**: ${s.score}/5 - ${s.rationale}`).join('\n')}

### Areas Still Needing Assessment:
${context.unassessedAreas.map(a => `- ${a}`).join('\n')}

Please continue the assessment focusing on the unassessed areas.
`.trim();
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
  it('should return empty string when no scoring state', async () => {
    mockScoringService.getScoringState.mockResolvedValue(null);

    const result = await handler.buildScoringFollowUpContext('conv-1');

    expect(result).toBe('');
  });

  it('should format previous scores', async () => {
    mockScoringService.getScoringState.mockResolvedValue({
      scores: [
        { dimension: 'Data Security', score: 4, rationale: 'Strong encryption' },
        { dimension: 'Privacy', score: 3, rationale: 'Adequate policies' },
      ],
      unassessedDimensions: ['Bias', 'Transparency'],
    });

    const result = await handler.buildScoringFollowUpContext('conv-1');

    expect(result).toContain('Data Security');
    expect(result).toContain('4/5');
    expect(result).toContain('Bias');
    expect(result).toContain('Transparency');
  });
});
```

---

## Definition of Done

- [ ] buildScoringFollowUpContext implemented
- [ ] Unit tests passing
