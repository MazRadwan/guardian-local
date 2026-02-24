# Story 39.1.2: Composite Confidence Scoring

## Description

Create the `ExtractionConfidenceCalculator` that evaluates regex extraction quality using 4 composite checks (not just count ratio). This calculator determines whether the regex result is trustworthy enough to skip the Claude fallback. If any check fails, the pipeline falls through to Claude extraction.

This addresses the Codex finding that a simple `found / expected >= 0.9` threshold is insufficient. The composite approach adds assessmentId validation, duplicate detection, and DB key mapping verification.

## Acceptance Criteria

- [ ] `ExtractionConfidenceCalculator.evaluate()` runs 4 checks and returns composite result
- [ ] Check 1: assessmentId extracted and matches a valid UUID format
- [ ] Check 2: No duplicate question markers detected (e.g., two `Question 1.1` entries)
- [ ] Check 3: Expected-vs-parsed question ratio >= 0.9
- [ ] Check 4: All extracted `(sectionNumber, questionNumber)` keys exist in the DB questions for that assessmentId
- [ ] Returns `{ confident: boolean, overallScore: number, checks: CheckResult[] }`
- [ ] If any check fails, `confident` is false (AND logic, not averaging)
- [ ] Accepts `IQuestionRepository` for DB key validation
- [ ] Under 300 LOC
- [ ] No TypeScript errors

## Technical Approach

### 1. Create ExtractionConfidenceCalculator

**File:** `packages/backend/src/infrastructure/extraction/ExtractionConfidenceCalculator.ts`

```typescript
export interface ConfidenceCheck {
  name: string;
  passed: boolean;
  score: number;    // 0-1
  detail: string;
}

export interface ConfidenceResult {
  confident: boolean;       // true only if ALL checks pass
  overallScore: number;     // weighted average for logging
  checks: ConfidenceCheck[];
}

export class ExtractionConfidenceCalculator {
  constructor(private questionRepo: IQuestionRepository) {}

  async evaluate(
    extraction: RegexExtractionResult,
    expectedAssessmentId?: string
  ): Promise<ConfidenceResult> {
    const checks: ConfidenceCheck[] = [];

    // Check 1: AssessmentId validity -- compare extracted ID against the AUTHORIZED
    // expectedAssessmentId passed from ScoringService (which has already verified ownership).
    // IMPORTANT (Codex security finding): Do NOT query DB using the extracted assessmentId
    // directly -- that would bypass the authorization gate. Always use expectedAssessmentId
    // for DB lookups.
    checks.push(this.checkAssessmentId(extraction.assessmentId, expectedAssessmentId));

    // Check 2: No duplicate markers
    checks.push(this.checkDuplicates(extraction.responses));

    // Check 3: Count ratio (requires DB lookup for expected count)
    // Uses expectedAssessmentId (authorized) for DB query, NOT extraction.assessmentId
    const dbQuestions = expectedAssessmentId
      ? await this.questionRepo.findByAssessmentId(expectedAssessmentId)
      : [];
    checks.push(this.checkCountRatio(extraction.responses.length, dbQuestions.length));

    // Check 4: DB key mapping
    checks.push(this.checkDBKeyMapping(extraction.responses, dbQuestions));

    const confident = checks.every(c => c.passed);
    const overallScore = checks.reduce((sum, c) => sum + c.score, 0) / checks.length;

    return { confident, overallScore, checks };
  }
}
```

### 2. Check Details

**Check 1 -- AssessmentId:** Extracted ID must be a valid UUID. If `expectedAssessmentId` is provided, must match.

**Check 2 -- Duplicates:** Build a Set of `"sectionNumber.questionNumber"` keys. If set size !== array length, duplicates exist.

**Check 3 -- Count ratio:** `parsedCount / expectedCount >= 0.9`. If no DB questions found (assessmentId invalid), score is 0.

**Check 4 -- DB key mapping:** Every extracted `(sectionNumber, questionNumber)` pair must exist in the DB questions table. Uses the unique index on `(assessmentId, sectionNumber, questionNumber)`.

## Files Touched

- `packages/backend/src/infrastructure/extraction/ExtractionConfidenceCalculator.ts` - CREATE (~150 LOC)

## Tests Affected

- None -- this is a pure creation story. No existing files are modified.

## Agent Assignment

- [x] backend-agent

## Tests Required

- [ ] `packages/backend/__tests__/unit/infrastructure/extraction/ExtractionConfidenceCalculator.test.ts`
  - Test all 4 checks pass -> confident: true
  - Test assessmentId missing -> confident: false
  - Test assessmentId mismatch with expected -> confident: false
  - Test duplicate question markers detected -> confident: false
  - Test count ratio below 0.9 -> confident: false
  - Test extracted key not in DB -> confident: false (DB key mapping fails)
  - Test empty responses array -> confident: false (count ratio = 0)
  - Test all checks pass with valid data -> overallScore near 1.0
  - Test partial failures produce meaningful detail messages
  - Mock `IQuestionRepository.findByAssessmentId()` for DB interactions

## Definition of Done

- [ ] File created and compiles
- [ ] All 4 composite checks implemented
- [ ] AND logic: any single failure -> confident: false
- [ ] Unit tests written and passing with mocked repository
- [ ] Under 300 LOC
- [ ] No TypeScript errors
- [ ] No lint errors
