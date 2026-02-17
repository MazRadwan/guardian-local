# Story 39.1.5: Contract Test and Integration Verification

## Description

Create contract tests that verify regex extraction output matches the `ScoringParseResult` interface exactly, and integration tests that verify the full extraction path with real docx/pdf files. These tests are the safety net ensuring the regex path cannot silently produce incompatible output that breaks downstream scoring.

## Acceptance Criteria

- [ ] Contract test verifies regex output satisfies `ScoringParseResult` interface
- [ ] Contract test checks all required fields are present (assessmentId, vendorName, responses, etc.)
- [ ] Contract test checks each `ExtractedResponse` has all required fields
- [ ] Integration test with real Guardian docx file (from `scripts/test-regex-extraction.ts` fixtures)
- [ ] Integration test with real Guardian PDF file
- [ ] All 3 pipeline paths tested: regex-pass, regex-fail-to-claude, non-guardian-reject
- [ ] Tests verify downstream compatibility: `ScoringParseResult` -> `ScoringService.score()` expects same shape
- [ ] No TypeScript errors

## Technical Approach

### 1. Contract Test

**File:** `packages/backend/__tests__/unit/infrastructure/extraction/RegexExtractor.contract.test.ts`

Verify the `ScoringParseResult` shape contract:

```typescript
describe('RegexExtractor Contract', () => {
  it('produces valid ScoringParseResult shape', () => {
    const result = buildRegexScoringParseResult(regexOutput, metadata);

    // Required fields from ScoringParseResult
    expect(result).toHaveProperty('success');
    expect(result).toHaveProperty('confidence');
    expect(result).toHaveProperty('metadata');
    expect(result).toHaveProperty('parseTimeMs');
    expect(result).toHaveProperty('assessmentId');
    expect(result).toHaveProperty('vendorName');
    expect(result).toHaveProperty('responses');
    expect(result).toHaveProperty('expectedQuestionCount');
    expect(result).toHaveProperty('parsedQuestionCount');
    expect(result).toHaveProperty('unparsedQuestions');
    expect(result).toHaveProperty('isComplete');

    // Each response must match ExtractedResponse
    for (const r of result.responses) {
      expect(r).toHaveProperty('sectionNumber');
      expect(r).toHaveProperty('questionNumber');
      expect(r).toHaveProperty('questionText');
      expect(r).toHaveProperty('responseText');
      expect(r).toHaveProperty('confidence');
      expect(r).toHaveProperty('hasVisualContent');
    }
  });

  it('fields consumed by ScoringLLMService are present', () => {
    // ScoringLLMService.scoreWithClaude maps: sectionNumber, questionNumber, questionText, responseText
    const result = buildRegexScoringParseResult(regexOutput, metadata);
    for (const r of result.responses) {
      expect(typeof r.sectionNumber).toBe('number');
      expect(typeof r.questionNumber).toBe('number');
      expect(typeof r.questionText).toBe('string');
      expect(typeof r.responseText).toBe('string');
    }
  });
});
```

### 2. Integration Test

**File:** `packages/backend/__tests__/integration/infrastructure/extraction/RegexExtractor.integration.test.ts`

Use fixture files to test the complete path:

```typescript
describe('RegexExtractor Integration', () => {
  it('extracts responses from real Guardian docx', async () => {
    const docxBuffer = fs.readFileSync(FIXTURE_PATH + '/test-questionnaire.docx');
    // Run full extraction pipeline
    // Verify response count matches expected
    // Verify assessmentId extracted
  });

  it('extracts responses from real Guardian PDF', async () => {
    const pdfBuffer = fs.readFileSync(FIXTURE_PATH + '/test-questionnaire.pdf');
    // Run full extraction pipeline
  });

  it('falls back to Claude when confidence is low', async () => {
    // Mock a corrupted/modified document that fails confidence
    // Verify Claude path is invoked
  });
});
```

### 3. Fixture Strategy

Create minimal test fixtures (or use existing test data from the feasibility script):
- A small Guardian-format docx with 3-5 questions
- A small Guardian-format PDF with 3-5 questions
- Both should have known assessmentId and expected response count

## Files Touched

- `packages/backend/__tests__/unit/infrastructure/extraction/RegexExtractor.contract.test.ts` - CREATE
- `packages/backend/__tests__/integration/infrastructure/extraction/RegexExtractor.integration.test.ts` - CREATE
- `packages/backend/__tests__/fixtures/test-questionnaire.docx` - CREATE (minimal fixture)
- `packages/backend/__tests__/fixtures/test-questionnaire.pdf` - CREATE (minimal fixture)

## Tests Affected

- None -- this story only creates new test files. No existing code or tests are modified.

## Agent Assignment

- [x] backend-agent

## Tests Required

- [ ] Contract test: ScoringParseResult shape verified (all required fields present and correct types)
- [ ] Contract test: ExtractedResponse shape verified (all 7 fields present)
- [ ] Contract test: Fields consumed by ScoringLLMService verified (4 fields with correct types)
- [ ] Integration test: Real Guardian docx extracts correct response count
- [ ] Integration test: Real Guardian PDF extracts correct response count
- [ ] Integration test: AssessmentId correctly extracted from document header
- [ ] Integration test: Confidence calculator runs on real extraction output

## Definition of Done

- [ ] Contract tests verify regex output matches ScoringParseResult interface
- [ ] Integration tests pass with real docx and PDF fixtures
- [ ] All tests passing
- [ ] No TypeScript errors
- [ ] No lint errors
