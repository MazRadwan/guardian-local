# Story 39.4.2: Split DocumentParserService -- Extract Shared Helpers

## Description

Extract the shared helper methods duplicated between `DocumentParserService.ts` and `IntakeDocumentParser.ts` (from Story 39.4.1) into a new `DocumentParserHelpers.ts`. These helpers include: `extractContent()`, `truncateText()`, `parseJsonResponse()`, `attemptJsonRepair()`, and the type helpers (`filterStrings`, `isObject`).

After this story, `DocumentParserService.ts` should be under 300 LOC (scoring path only, importing shared helpers).

## Acceptance Criteria

- [ ] `DocumentParserHelpers.ts` created with all shared helper methods
- [ ] `DocumentParserService.ts` imports helpers from `DocumentParserHelpers.ts`
- [ ] `IntakeDocumentParser.ts` imports helpers from `DocumentParserHelpers.ts`
- [ ] No duplicate code between the two parser files
- [ ] `DocumentParserService.ts` under 300 LOC
- [ ] `IntakeDocumentParser.ts` under 300 LOC (should already be, verify)
- [ ] `DocumentParserHelpers.ts` under 300 LOC
- [ ] All existing tests pass
- [ ] No TypeScript errors

## Technical Approach

### 1. Create DocumentParserHelpers

**File:** `packages/backend/src/infrastructure/ai/DocumentParserHelpers.ts`

Extract these methods/functions:

```typescript
// Exported functions (currently private methods or module-level functions):
export function filterStrings(arr: unknown[]): string[];
export function isObject(value: unknown): value is Record<string, unknown>;

// Class with shared instance methods (needs injected dependencies):
export class DocumentParserHelpers {
  constructor(
    private readonly claudeClient: IClaudeClient,
    private readonly visionClient: IVisionClient
  ) {}

  async extractContent(buffer: Buffer, documentType: DocumentType, mimeType: string): Promise<{ text: string; visionContent: VisionContent[] | null }>;
  async extractPdfText(buffer: Buffer): Promise<string>;
  async extractDocxText(buffer: Buffer): Promise<string>;
  truncateText(text: string, maxChars: number): string;
  parseJsonResponse(content: string): Record<string, unknown> | null;
  private attemptJsonRepair(jsonStr: string): string;
}
```

### 2. Update Both Parser Files

Both `DocumentParserService.ts` and `IntakeDocumentParser.ts` should:
- Import `DocumentParserHelpers` class
- Accept it in constructor (or create internally from injected dependencies)
- Delegate shared operations to the helpers instance
- Remove their own copies of these methods

### 3. Alternative: Composition vs Inheritance

Instead of a helper class, consider making the helpers standalone exported functions where possible:

```typescript
// Pure functions (no dependencies):
export function filterStrings(arr: unknown[]): string[];
export function isObject(value: unknown): value is Record<string, unknown>;
export function truncateText(text: string, maxChars: number, notice: string): string;
export function parseJsonResponse(content: string): Record<string, unknown> | null;

// Functions needing dependencies (take them as parameters):
export async function extractPdfText(buffer: Buffer): Promise<string>;
export async function extractDocxText(buffer: Buffer): Promise<string>;
```

This avoids adding another class and keeps the helpers simple.

## Files Touched

- `packages/backend/src/infrastructure/ai/DocumentParserHelpers.ts` - CREATE (~180 LOC)
- `packages/backend/src/infrastructure/ai/DocumentParserService.ts` - MODIFY (import helpers, remove duplicate methods)
- `packages/backend/src/infrastructure/ai/IntakeDocumentParser.ts` - MODIFY (import helpers, remove duplicate methods)

## Tests Affected

Existing tests that may need updates:
- `packages/backend/__tests__/unit/DocumentParserService.test.ts` - Internal method references may change if helpers are now imported. Test behavior should be unchanged.
- `packages/backend/__tests__/unit/infrastructure/ai/IntakeDocumentParser.test.ts` - Same as above.

## Agent Assignment

- [x] backend-agent

## Tests Required

- [ ] `packages/backend/__tests__/unit/infrastructure/ai/DocumentParserHelpers.test.ts`
  - Test parseJsonResponse handles markdown code blocks
  - Test parseJsonResponse handles bare JSON
  - Test attemptJsonRepair fixes trailing commas
  - Test attemptJsonRepair fixes missing closing braces
  - Test truncateText adds notice when truncated
  - Test truncateText returns original when under limit
  - Test extractPdfText returns text from PDF buffer
  - Test extractDocxText returns text from docx buffer
  - Test filterStrings filters non-strings from array
  - Test isObject rejects arrays, nulls, primitives

## Definition of Done

- [ ] DocumentParserHelpers created with all shared methods
- [ ] DocumentParserService.ts under 300 LOC
- [ ] IntakeDocumentParser.ts under 300 LOC
- [ ] No duplicate code between parser files
- [ ] All existing tests pass
- [ ] No TypeScript errors
- [ ] No lint errors
