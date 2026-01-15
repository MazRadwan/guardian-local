# Story 20.4.2: Per-Response Truncation for Token Budgeting

## Description
Replace the document-level truncation (`DEFAULT_MAX_EXTRACTED_TEXT_CHARS = 100k`) with per-response truncation after extraction. This bounds worst-case token usage while preserving evidence across all responses instead of losing entire sections.

## Acceptance Criteria
- [ ] Individual responses truncated to max 2,000 characters
- [ ] Truncation happens after Claude extraction (in post-processing)
- [ ] Truncated responses include `[truncated]` indicator
- [ ] Document-level truncation still applies as a safety net
- [ ] Truncation limit configurable via constant
- [ ] Total token budget more predictable

## Technical Approach

### 1. Define Per-Response Limit

```typescript
// DocumentParserService.ts
const DEFAULT_MAX_RESPONSE_CHARS = 2000;
const RESPONSE_TRUNCATION_NOTICE = ' [truncated]';
```

### 2. Add Response Truncation Method

```typescript
// DocumentParserService.ts
private truncateResponses(
  responses: ScoringExtractionResponse['responses'],
  maxChars: number = DEFAULT_MAX_RESPONSE_CHARS
): ScoringExtractionResponse['responses'] {
  return responses.map(response => {
    if (response.responseText.length <= maxChars) {
      return response;
    }

    return {
      ...response,
      responseText: response.responseText.slice(0, maxChars - RESPONSE_TRUNCATION_NOTICE.length) + RESPONSE_TRUNCATION_NOTICE,
    };
  });
}
```

### 3. Apply in parseForResponses

```typescript
// DocumentParserService.ts - after parsing JSON response
const extracted = applyScoringDefaults(rawJson);

// NEW: Truncate individual responses
extracted.responses = this.truncateResponses(extracted.responses);

// Continue with validation...
```

### 4. Token Budget Analysis

With per-response truncation:
- Max 100 questions * 2,000 chars = 200,000 chars worst case
- More realistically: 80 questions * avg 500 chars = 40,000 chars
- Roughly 10,000-50,000 tokens for responses (within limits)

Current document-level truncation (100k chars) can still clip important sections if one response is very long. Per-response truncation ensures all questions get representation.

### 5. Add to ScoringParseOptions (Optional)

Allow caller to configure truncation:

```typescript
// IScoringDocumentParser.ts
export interface ScoringParseOptions extends ParseOptions {
  expectedAssessmentId?: string;
  minConfidence?: number;
  includeLowConfidence?: boolean;
  abortSignal?: AbortSignal;
  maxResponseChars?: number;  // NEW: Per-response truncation limit
}
```

### 6. Logging

Log when truncation occurs:

```typescript
private truncateResponses(responses, maxChars) {
  let truncatedCount = 0;

  const result = responses.map(response => {
    if (response.responseText.length > maxChars) {
      truncatedCount++;
      return { ...response, responseText: /* truncated */ };
    }
    return response;
  });

  if (truncatedCount > 0) {
    console.log(`[DocumentParserService] Truncated ${truncatedCount} responses to ${maxChars} chars`);
  }

  return result;
}
```

## Files Touched
- `packages/backend/src/infrastructure/ai/DocumentParserService.ts` - Add response truncation
- `packages/backend/src/application/interfaces/IScoringDocumentParser.ts` - Optional: add maxResponseChars option

## Agent Assignment
- [x] backend-agent

## Tests Required
- [ ] Unit test: Short responses unchanged
- [ ] Unit test: Long responses truncated to limit
- [ ] Unit test: Truncation notice appended
- [ ] Unit test: All responses processed (none dropped)
- [ ] Unit test: Truncation logged
- [ ] Unit test: Custom maxResponseChars respected

## Definition of Done
- [ ] All acceptance criteria met
- [ ] Tests written and passing
- [ ] No TypeScript errors
- [ ] No lint errors
- [ ] Token usage more predictable
