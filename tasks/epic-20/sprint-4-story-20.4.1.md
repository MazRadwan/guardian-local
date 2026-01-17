# Story 20.4.1: Pre-check Guardian Document Signature

## Description
Add a fast pre-check before the parsing LLM call to detect obviously non-Guardian documents. For PDF/DOCX documents, search for Guardian markers (e.g., `Assessment ID:`, `GUARDIAN`, specific section headers) using regex. This is a best-effort optimization to avoid expensive LLM calls on random documents.

## Acceptance Criteria
- [ ] Pre-check runs before LLM extraction call
- [ ] Searches extracted text for Guardian markers
- [ ] If markers not found, returns early with descriptive error
- [ ] Only applies to PDF/DOCX (images require Vision to read anything)
- [ ] Best-effort: low false-positive rate, accepts some false negatives
- [ ] Pre-check is fast (regex on already-extracted text)
- [ ] Logging indicates when pre-check rejects document

## Technical Approach

### 1. Define Guardian Markers

The exported questionnaires contain specific markers:

```typescript
// DocumentParserService.ts
const GUARDIAN_MARKERS = [
  /Assessment\s+ID:\s*[a-f0-9-]{36}/i,      // UUID format assessment ID
  /GUARDIAN.*Assessment/i,                   // Header text
  /Section\s+\d+:/i,                         // Section headers
  /Question\s+\d+\.\d+/i,                    // Question numbering format
];

const MIN_MARKERS_REQUIRED = 2;  // Require at least 2 markers to pass
```

### 2. Add Pre-check Method

```typescript
// DocumentParserService.ts
private isLikelyGuardianDocument(text: string): { likely: boolean; foundMarkers: string[] } {
  if (!text || text.length < 100) {
    return { likely: false, foundMarkers: [] };
  }

  const foundMarkers: string[] = [];

  for (const marker of GUARDIAN_MARKERS) {
    if (marker.test(text)) {
      foundMarkers.push(marker.source);
    }
  }

  return {
    likely: foundMarkers.length >= MIN_MARKERS_REQUIRED,
    foundMarkers,
  };
}
```

### 3. Integrate into parseForResponses

```typescript
// DocumentParserService.ts - parseForResponses method
async parseForResponses(
  file: Buffer,
  metadata: DocumentMetadata,
  options?: ScoringParseOptions
): Promise<ScoringParseResult> {
  const startTime = Date.now();

  try {
    // 1. Extract content
    const { text: rawDocumentText, visionContent } = await this.extractContent(
      file,
      metadata.documentType,
      metadata.mimeType
    );

    // 2. PRE-CHECK: Only for text-based documents (PDF/DOCX)
    if (metadata.documentType !== 'image') {
      const preCheck = this.isLikelyGuardianDocument(rawDocumentText);

      if (!preCheck.likely) {
        console.log('[DocumentParserService] Pre-check failed, markers found:', preCheck.foundMarkers);

        return this.createFailedScoringResult(
          metadata,
          startTime,
          'Document does not appear to be a Guardian questionnaire. Please upload an exported questionnaire PDF or Word document.'
        );
      }

      console.log('[DocumentParserService] Pre-check passed, markers found:', preCheck.foundMarkers);
    }

    // 3. Continue with LLM extraction...
    // ... rest of existing code
  } catch (error) {
    // ... error handling
  }
}
```

### 4. Handling False Negatives

The pre-check is designed to be lenient:
- Only requires 2 of 4 markers
- Markers are broad patterns
- Images bypass pre-check entirely (can't read without Vision)
- Error message guides user to upload correct document

### 5. Configuration (Optional)

Allow disabling pre-check via environment variable:

```typescript
const ENABLE_GUARDIAN_PRECHECK = process.env.GUARDIAN_PRECHECK !== 'false';
```

## Files Touched
- `packages/backend/src/infrastructure/ai/DocumentParserService.ts` - Add pre-check logic

## Agent Assignment
- [x] backend-agent

## Tests Required
- [ ] Unit test: Valid Guardian document passes pre-check
- [ ] Unit test: Random PDF fails pre-check
- [ ] Unit test: Image documents bypass pre-check
- [ ] Unit test: Error message is descriptive
- [ ] Unit test: Pre-check logs markers found
- [ ] Unit test: Empty/short text fails pre-check

## Definition of Done
- [ ] All acceptance criteria met
- [ ] Tests written and passing
- [ ] No TypeScript errors
- [ ] No lint errors
- [ ] LLM calls avoided for obvious non-Guardian documents
