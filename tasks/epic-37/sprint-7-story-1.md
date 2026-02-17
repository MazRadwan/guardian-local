# Story 37.7.1: Golden Sample Regression Baseline

## Description

Create a test framework that captures a scoring baseline and can detect regressions after ISO prompt changes. This validates SC-6: "Prompt regression: existing assessment quality does not degrade."

The test mocks the LLM client with deterministic responses and verifies that:
1. The scoring pipeline still produces valid payloads
2. Prompt content (system + user) has not unexpectedly changed
3. New ISO sections are additive (do not replace existing rubric content)

## Acceptance Criteria

- [ ] Regression test file created
- [ ] Test verifies system prompt still contains rubric criteria (all 5 scored dimensions)
- [ ] Test verifies system prompt still contains disqualifying factors
- [ ] Test verifies system prompt still contains recommendation logic
- [ ] Test verifies ISO catalog section is additive (rubric content preserved)
- [ ] Test verifies confidence instructions are present in system prompt
- [ ] Test verifies user prompt still contains vendor responses and weighting
- [ ] Test verifies ISO applicability section is additive in user prompt
- [ ] Snapshot test for prompt structure stability (detect unintended format changes)
- [ ] Test exercises full scoring pipeline with mocked LLM response

## Technical Approach

**File:** `packages/backend/__tests__/integration/golden-sample-regression.test.ts`

```typescript
import { buildScoringSystemPrompt, buildScoringUserPrompt } from '../../src/infrastructure/ai/prompts/scoringPrompt';
import { ALL_DIMENSIONS, DIMENSION_CONFIG } from '../../src/domain/scoring/rubric';

describe('Golden Sample Regression (SC-6)', () => {
  const sampleControls = [
    { clauseRef: 'A.6.2.6', domain: 'Data', title: 'Test', framework: 'ISO 42001',
      criteriaText: 'Test criteria', dimensions: ['regulatory_compliance'], relevanceWeight: 1.0 }
  ];

  describe('System Prompt Stability', () => {
    it('should contain all rubric dimension criteria', () => {
      const prompt = buildScoringSystemPrompt();
      // Verify all 5 scored dimensions have criteria
      expect(prompt).toContain('CLINICAL RISK');
      expect(prompt).toContain('PRIVACY RISK');
      expect(prompt).toContain('SECURITY RISK');
      expect(prompt).toContain('TECHNICAL CREDIBILITY');
      expect(prompt).toContain('OPERATIONAL EXCELLENCE');
    });

    it('should contain disqualifying factors', () => {
      const prompt = buildScoringSystemPrompt();
      expect(prompt).toContain('Disqualifying Factors');
    });

    it('should contain recommendation logic', () => {
      const prompt = buildScoringSystemPrompt();
      expect(prompt).toContain('APPROVE');
      expect(prompt).toContain('CONDITIONAL');
      expect(prompt).toContain('DECLINE');
      expect(prompt).toContain('MORE_INFO');
    });

    it('should contain output format instructions', () => {
      const prompt = buildScoringSystemPrompt();
      expect(prompt).toContain('scoring_complete');
    });

    it('should contain confidence instructions (Epic 37)', () => {
      const prompt = buildScoringSystemPrompt();
      expect(prompt).toContain('assessmentConfidence');
      expect(prompt).toContain('rationale');
    });

    it('should contain ISO messaging rules (Epic 37)', () => {
      const prompt = buildScoringSystemPrompt();
      expect(prompt).toContain('ISO-traceable');
      expect(prompt).not.toContain('"ISO-compliant"');
    });

    it('should match prompt structure snapshot', () => {
      const prompt = buildScoringSystemPrompt(sampleControls);
      // Use Jest .toMatchSnapshot() or inline snapshot for structure guard
      expect(prompt.length).toBeGreaterThan(0);
      expect(prompt).toMatchSnapshot();
    });

    it('should preserve rubric when ISO catalog is appended', () => {
      const basePrompt = buildScoringSystemPrompt();
      const enrichedPrompt = buildScoringSystemPrompt([
        { clauseRef: 'A.6.2.6', domain: 'Data', title: 'Test', framework: 'ISO 42001',
          criteriaText: 'Test criteria', dimensions: ['regulatory_compliance'], relevanceWeight: 1.0 }
      ]);
      // Enriched prompt should contain everything base has, plus ISO content
      expect(enrichedPrompt).toContain('CLINICAL RISK');
      expect(enrichedPrompt).toContain('A.6.2.6');
      expect(enrichedPrompt.length).toBeGreaterThan(basePrompt.length);
    });
  });

  describe('User Prompt Stability', () => {
    const baseParams = {
      vendorName: 'TestVendor',
      solutionName: 'TestSolution',
      solutionType: 'clinical_ai' as const,
      responses: [
        { sectionNumber: 1, questionNumber: 1, questionText: 'Q1', responseText: 'A1' },
      ],
    };

    it('should contain vendor info and responses', () => {
      const prompt = buildScoringUserPrompt(baseParams);
      expect(prompt).toContain('TestVendor');
      expect(prompt).toContain('TestSolution');
      expect(prompt).toContain('Q1');
      expect(prompt).toContain('A1');
    });

    it('should contain composite score weighting', () => {
      const prompt = buildScoringUserPrompt(baseParams);
      expect(prompt).toContain('COMPOSITE SCORE WEIGHTING');
    });

    it('should preserve content when ISO applicability is appended', () => {
      const enrichedPrompt = buildScoringUserPrompt({
        ...baseParams,
        isoControls: [
          { clauseRef: 'A.6.2.6', domain: 'Data', title: 'Test', framework: 'ISO 42001',
            criteriaText: 'Test', dimensions: ['regulatory_compliance'], relevanceWeight: 1.0 }
        ],
      });
      expect(enrichedPrompt).toContain('TestVendor');
      expect(enrichedPrompt).toContain('COMPOSITE SCORE WEIGHTING');
      expect(enrichedPrompt).toContain('A.6.2.6');
    });
  });

  describe('Pipeline-Level Regression', () => {
    it('should produce valid scoring output through pipeline with mocked LLM', async () => {
      // Create mock ScoringLLMService that returns a deterministic, valid payload
      // Run scoringService.score() with the mock
      // Verify the output payload structure matches expected format
      // Verify the narrative report contains expected ISO-traceable language
    });
  });
});
```

## Files Touched

- `packages/backend/__tests__/integration/golden-sample-regression.test.ts` - CREATE (~150+ LOC)

## Tests Affected

- None (new test file)

## Agent Assignment

- [x] backend-agent

## Tests Required

This IS the test story. Tests described above.
- Test full scoring pipeline with mocked LLM returns valid payload (pipeline-level regression)
- Test prompt structure via Jest snapshot assertion

## Definition of Done

- [ ] Regression test file created
- [ ] All prompt stability checks pass
- [ ] ISO additions are verified as additive (no rubric content lost)
- [ ] Snapshot captures prompt structure
- [ ] `pnpm test` passes
