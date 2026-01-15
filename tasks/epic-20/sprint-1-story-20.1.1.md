# Story 20.1.1: On-Demand Narrative Prompt Builder

## Description
Create a new prompt builder for generating detailed narrative analysis at export time. This prompt will take scoring results (dimension scores, findings, key findings) and vendor responses to generate a rich markdown narrative suitable for PDF/Word export.

## Acceptance Criteria
- [ ] New `exportNarrativePrompt.ts` file with system and user prompt builders
- [ ] New `ExportNarrativePromptBuilder.ts` implementing IPromptBuilder pattern
- [ ] Prompt includes instructions for evidence-based citations from responses
- [ ] Prompt generates structured markdown with sections for each dimension
- [ ] Token budget: Input ~4,000-6,000 tokens, Output ~2,000-3,000 tokens
- [ ] System prompt is cacheable (static rubric context)

## Technical Approach

### 1. Create Export Narrative Prompt Template (`exportNarrativePrompt.ts`)

The prompt should instruct Claude to:
- Generate a detailed narrative report in markdown format
- Reference specific vendor responses as evidence
- Structure output with sections matching the PDF template
- Include risk mitigation recommendations per dimension
- Keep output within token budget (~2,500 tokens)

```typescript
// Structure of the prompt
export const EXPORT_NARRATIVE_SYSTEM_PROMPT = `
You are a healthcare AI risk analyst generating a detailed narrative report...
[Include rubric context for interpretation]
`;

export function buildExportNarrativeUserPrompt(params: {
  vendorName: string;
  solutionName: string;
  solutionType: SolutionType;
  compositeScore: number;
  overallRiskRating: RiskRating;
  recommendation: Recommendation;
  dimensionScores: DimensionScoreData[];
  keyFindings: string[];
  executiveSummary: string;
  topResponses: Array<{
    sectionNumber: number;
    questionNumber: number;
    questionText: string;
    responseText: string;
  }>;
}): string;
```

### 2. Create ExportNarrativePromptBuilder Class

Follow the existing `ScoringPromptBuilder` pattern:

```typescript
export class ExportNarrativePromptBuilder {
  buildNarrativeSystemPrompt(): string;
  buildNarrativeUserPrompt(params: NarrativePromptParams): string;
}
```

### 3. Token Budgeting Strategy

- Select top 2-3 responses per dimension based on findings references
- Truncate individual responses to 500 chars max
- Total input target: ~5,000 tokens
- Output target: ~2,500 tokens

## Files Touched
- `packages/backend/src/infrastructure/ai/prompts/exportNarrativePrompt.ts` - **NEW**: Prompt template
- `packages/backend/src/infrastructure/ai/ExportNarrativePromptBuilder.ts` - **NEW**: Builder class
- `packages/backend/src/application/interfaces/IExportNarrativePromptBuilder.ts` - **NEW**: Interface (port)

## Agent Assignment
- [x] backend-agent

## Tests Required
- [ ] Unit test: `buildExportNarrativeUserPrompt` generates valid prompt string
- [ ] Unit test: Prompt includes all dimension scores
- [ ] Unit test: Prompt includes top responses with truncation
- [ ] Unit test: Token estimation stays within budget
- [ ] Unit test: Missing optional fields handled gracefully

## Definition of Done
- [ ] All acceptance criteria met
- [ ] Tests written and passing
- [ ] No TypeScript errors
- [ ] No lint errors
- [ ] Code follows existing prompt builder patterns
