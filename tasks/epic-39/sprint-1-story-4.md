# Story 39.1.4: Extraction Routing in DocumentParserService

## Description

Wire the regex extractor, confidence calculator, and image detector into `DocumentParserService.parseForResponses()`. Add feature flag routing: when `ENABLE_REGEX_EXTRACTION` is true (default), Guardian docs attempt regex extraction first. If composite confidence passes, return the regex result. If confidence fails, fall through to existing Claude extraction. Non-Guardian docs continue to be rejected (product decision, unchanged).

This is the integration story that connects all Sprint 1 modules into the active scoring pipeline.

## Acceptance Criteria

- [ ] `DocumentParserService.parseForResponses()` checks feature flag `ENABLE_REGEX_EXTRACTION`
- [ ] When flag is true and GUARDIAN_MARKERS pass: attempt regex extraction
- [ ] Regex path: extract text -> regex parse -> confidence check -> return or fallback
- [ ] For docx files: run `DocxImageDetector` and merge `hasVisualContent` flags into responses
- [ ] If composite confidence passes (all 4 checks): return `ScoringParseResult` from regex
- [ ] If composite confidence fails: log reason, fall through to existing Claude `parseForResponses()` path
- [ ] When flag is false: skip regex entirely, use existing Claude path
- [ ] Non-Guardian documents: continue to be rejected (existing behavior, no change)
- [ ] Log extraction method ("regex" or "claude") and confidence on every call
- [ ] Constructor accepts `IQuestionRepository` for confidence calculator DB lookups
- [ ] `ScoringParseResult` shape is identical regardless of extraction method
- [ ] Container wiring updated in `container.ts`
- [ ] Under 300 LOC (DocumentParserService is 784 LOC -- this story adds routing to the scoring path only)
- [ ] No TypeScript errors

## Technical Approach

### 1. Modify parseForResponses() in DocumentParserService

**File:** `packages/backend/src/infrastructure/ai/DocumentParserService.ts`

Add a new private method `tryRegexExtraction()` that is called before the Claude path:

```typescript
// In parseForResponses():
// 1. Extract raw text (existing code -- mammoth/pdfparse)
// 2. Check GUARDIAN_MARKERS (existing code -- convert from reject gate to routing signal)
// 3. If Guardian + flag enabled:
//    a. Run RegexResponseExtractor.extract(rawText)
//    b. If docx: Run DocxImageDetector.detect(buffer), merge hasVisualContent
//    c. Run ExtractionConfidenceCalculator.evaluate(extraction)
//    d. If confident: build ScoringParseResult from regex, return
//    e. If not confident: log, fall through to Claude
// 4. If Guardian + flag disabled: use Claude (existing path)
// 5. If not Guardian: reject (existing behavior)
```

### 2. GUARDIAN_MARKERS Pre-Check Refactor

The existing GUARDIAN_MARKERS check (lines 60-72) currently acts as a pre-check before Claude extraction. It needs to become a **routing signal**:
- Guardian detected (>= 2 markers) -> try regex first, Claude fallback
- Guardian not detected -> reject (product decision)

This is NOT a behavioral change for non-Guardian docs. It only adds the regex fast path for Guardian docs.

### 3. Feature Flag

```typescript
const ENABLE_REGEX_EXTRACTION = process.env.ENABLE_REGEX_EXTRACTION !== 'false';
```

Default: `true` (regex enabled). Set to `'false'` to disable and use Claude-only extraction.

### 4. ScoringParseResult Construction

Build the same shape from regex results:
```typescript
const parseResult: ScoringParseResult = {
  success: true,
  confidence: confidenceResult.overallScore,
  metadata: documentMetadata,
  parseTimeMs: extraction.parseTimeMs,
  assessmentId: extraction.assessmentId,
  vendorName: extraction.vendorName,
  solutionName: null,  // Not extractable via regex (Claude gets this)
  responses: extraction.responses.map(r => ({
    sectionNumber: r.sectionNumber,
    sectionTitle: null,  // Not extracted by regex (non-critical)
    questionNumber: r.questionNumber,
    questionText: r.questionText,
    responseText: r.responseText,
    confidence: r.confidence,
    hasVisualContent: r.hasVisualContent,
    visualContentDescription: null,
  })),
  expectedQuestionCount: dbQuestionCount,
  parsedQuestionCount: extraction.responses.length,
  unparsedQuestions: [], // Computed from DB diff
  isComplete: extraction.responses.length === dbQuestionCount,
};
```

### 5. Container Wiring

**File:** `packages/backend/src/container.ts`

Update `DocumentParserService` constructor to inject `IQuestionRepository`:
```typescript
export const documentParserService = new DocumentParserService(
  claudeClient,     // IClaudeClient
  claudeClient,     // IVisionClient
  questionRepo      // IQuestionRepository (NEW -- for confidence calculator)
);
```

### 6. Logging

Every extraction call logs:
```
[DocumentParserService] Extraction method: regex | claude
[DocumentParserService] Confidence: { confident: true/false, overallScore: 0.95, checks: [...] }
[DocumentParserService] Parse time: 0.5ms (regex) | 300000ms (claude)
```

## Files Touched

- `packages/backend/src/infrastructure/ai/DocumentParserService.ts` - MODIFY (add regex routing in parseForResponses)
- `packages/backend/src/container.ts` - MODIFY (add questionRepo to DocumentParserService constructor)

## Tests Affected

Existing tests that may need updates:
- `packages/backend/__tests__/unit/DocumentParserService.test.ts` - Constructor signature change (new parameter). Mock IQuestionRepository needed. Existing test cases must still pass (Claude path unchanged).
- `packages/backend/__tests__/unit/application/services/ScoringService.test.ts` - Indirectly affected if DocumentParserService mock interface changes. Verify mock still satisfies IScoringDocumentParser.

## Agent Assignment

- [x] backend-agent

## Tests Required

- [ ] `packages/backend/__tests__/unit/infrastructure/extraction/ExtractionRouting.test.ts`
  - Test regex path taken when Guardian markers detected + flag enabled + confidence passes
  - Test Claude fallback when regex confidence fails
  - Test Claude path taken when flag disabled (ENABLE_REGEX_EXTRACTION=false)
  - Test non-Guardian document rejected (existing behavior preserved)
  - Test ScoringParseResult shape identical from regex vs expected interface
  - Test image detection runs for docx, skipped for PDF
  - Test logging includes extraction method and confidence
  - Test container wiring compiles with new parameter

## Definition of Done

- [ ] Feature flag controls regex vs Claude path
- [ ] Guardian docs use regex first, Claude fallback
- [ ] Non-Guardian docs still rejected
- [ ] ScoringParseResult shape identical from both paths
- [ ] Extraction method + confidence logged on every call
- [ ] Container wiring updated
- [ ] Existing DocumentParserService tests still pass
- [ ] New routing tests written and passing
- [ ] No TypeScript errors
- [ ] No lint errors
