# Story 39.1.3: Docx Image Detection

## Description

Create `DocxImageDetector` that detects images embedded in docx questionnaire responses. Uses dual mammoth extraction: `extractRawText()` for text content and `convertToHtml()` for image detection. Per the goals doc, Sprint 1 detects and flags images only (`hasVisualContent: true`). Vision API orchestration is future scope.

This is critical because when a vendor embeds an infrastructure diagram as their answer, mammoth `extractRawText()` strips the image completely, making the response appear empty. The detector identifies this case and sets appropriate confidence (0.3 for image-only responses).

## Acceptance Criteria

- [ ] `DocxImageDetector.detect()` accepts a Buffer (docx file) and returns image flags per question
- [ ] Runs `mammoth.convertToHtml()` on the buffer to get HTML with `<img>` tags
- [ ] For each `Question X.Y` block in HTML, checks for `<img` tags
- [ ] Returns a Map of `"sectionNumber.questionNumber"` -> `{ hasVisualContent: boolean }`
- [ ] Image-only responses (empty text + image) get flagged with confidence adjustment to 0.3
- [ ] Image + text responses get flagged but keep confidence at 1.0
- [ ] Only applies to docx files (PDF image detection is future scope -- pdf-parse does not expose images)
- [ ] Under 300 LOC
- [ ] No TypeScript errors

## Technical Approach

### 1. Create DocxImageDetector

**File:** `packages/backend/src/infrastructure/extraction/DocxImageDetector.ts`

```typescript
export interface ImageDetectionResult {
  /** Map of "sectionNumber.questionNumber" -> image flags */
  questionImages: Map<string, { hasVisualContent: boolean }>;
  /** Total images detected across all responses */
  totalImagesDetected: number;
}

export class DocxImageDetector {
  /**
   * Detect images in docx responses using mammoth HTML extraction.
   * Only works for docx files -- PDF image detection requires Vision API.
   *
   * @param buffer - docx file buffer
   * @returns Image detection results per question
   */
  async detect(buffer: Buffer): Promise<ImageDetectionResult> {
    // 1. Convert docx to HTML (preserves <img> tags with base64 data)
    const htmlResult = await mammoth.convertToHtml({ buffer });
    const html = htmlResult.value;

    // 2. Split HTML by Question markers
    // mammoth HTML preserves "Question X.Y" as text nodes
    // Use regex to find question blocks in HTML

    // 3. For each question block, check for <img tags
    // Return map of question keys -> hasVisualContent

    return { questionImages, totalImagesDetected };
  }
}
```

### 2. Integration Point

The `DocxImageDetector` output is merged with `RegexResponseExtractor` results in Story 39.1.4:
- For each response from regex extractor, check if the image detector flagged that question
- If `hasVisualContent: true` and `responseText === ''`, set confidence to 0.3
- If `hasVisualContent: true` and `responseText !== ''`, keep confidence at 1.0

### 3. HTML Parsing Strategy

mammoth HTML output preserves question markers as text. The detector:
1. Finds `Question X.Y` patterns in the HTML text
2. Extracts the HTML block between consecutive question markers
3. Checks each block for `<img` tags using regex (not full DOM parsing -- keeps it lightweight)

## Files Touched

- `packages/backend/src/infrastructure/extraction/DocxImageDetector.ts` - CREATE (~120 LOC)

## Tests Affected

- None -- this is a pure creation story. No existing files are modified.

## Agent Assignment

- [x] backend-agent

## Tests Required

- [ ] `packages/backend/__tests__/unit/infrastructure/extraction/DocxImageDetector.test.ts`
  - Test detects image in response (mock mammoth.convertToHtml returning HTML with `<img>` tag)
  - Test no images detected returns empty map / all false
  - Test image-only response (text is empty, image present) flagged correctly
  - Test image+text response (both present) flagged correctly
  - Test multiple questions with mixed image/no-image responses
  - Test handles mammoth conversion failure gracefully (returns empty result)
  - Test returns correct totalImagesDetected count

## Definition of Done

- [ ] File created and compiles
- [ ] Detects `<img>` tags in mammoth HTML output per question block
- [ ] Unit tests written and passing (mammoth mocked)
- [ ] Under 300 LOC
- [ ] No TypeScript errors
- [ ] No lint errors
