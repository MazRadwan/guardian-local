# Story 38.2.3: Narrative Prompt ISO Injection

## Description

Inject ISO control context and confidence data into the export narrative prompts so that generated narratives reference ISO clause alignments and assessment confidence per dimension. The system prompt gets ISO-aware instructions; the user prompt gets per-dimension ISO data from `DimensionScoreData.findings`. This enables narratives like "Regulatory Compliance (High Confidence) - ISO 42001 A.6.2.6 alignment demonstrated through documented data quality processes."

## Acceptance Criteria

- [ ] System prompt includes ISO narrative generation instructions
- [ ] System prompt includes prohibited terms warning ("compliant"/"certified")
- [ ] System prompt instructs Claude to use "ISO-traceable"/"ISO-informed" language
- [ ] User prompt includes per-dimension ISO clause references from findings
- [ ] User prompt includes per-dimension confidence level and rationale
- [ ] User prompt marks Guardian-native dimensions (no ISO mapping)
- [ ] Under 300 LOC per file after changes
- [ ] No TypeScript errors

## Technical Approach

### 1. Update exportNarrativeSystemPrompt.ts

**File:** `packages/backend/src/infrastructure/ai/prompts/exportNarrativeSystemPrompt.ts` (MODIFY)

Add ISO-aware section to the system prompt after the existing "Report Structure" section:

```typescript
// Add to the end of the system prompt string, before the closing backtick
export function buildExportNarrativeSystemPrompt(): string {
  // ... existing dimension list and structure ...

  return `... existing prompt ...

## ISO Standards Context

When ISO clause references are provided in the scoring data:
- Reference specific clause numbers naturally: "demonstrates alignment with ISO 42001 A.6.2.6 (Data quality management)"
- Group related clauses when discussing dimension findings
- Note alignment status: aligned, partial, or not_evidenced

**CRITICAL MESSAGING RULES:**
- NEVER use: "ISO compliant", "ISO certified", "meets ISO requirements", "ISO conformant"
- ALWAYS use: "ISO-traceable", "ISO-informed", "aligned with", "referenced against"
- Guardian provides assessment informed by ISO standards, NOT ISO certification

**Assessment Confidence:**
When confidence data is provided (High/Medium/Low):
- Mention confidence level in dimension analysis headers
- High confidence: Strong evidence base, clear alignment
- Medium confidence: Some evidence gaps, partial documentation
- Low confidence: Significant evidence gaps, limited documentation

**Guardian-Native Dimensions:**
Some dimensions (Clinical Risk, Vendor Capability, Ethical Considerations, Sustainability) use Guardian healthcare-specific criteria without ISO mapping. When these appear, note: "Assessed using Guardian healthcare-specific criteria."
`;
}
```

### 2. Update exportNarrativeUserPrompt.ts

**File:** `packages/backend/src/infrastructure/ai/prompts/exportNarrativeUserPrompt.ts` (MODIFY)

Enhance the `formatDimensionScore` function to include ISO data from findings:

```typescript
function formatDimensionScore(dimScore: DimensionScoreData): string {
  const config = DIMENSION_CONFIG[dimScore.dimension];
  const label = config?.label || dimScore.dimension.replace(/_/g, ' ');
  const type = config?.type || 'unknown';

  let output = `### ${label}\n`;
  output += `- **Score:** ${dimScore.score}/100\n`;
  output += `- **Rating:** ${dimScore.riskRating.toUpperCase()}\n`;
  output += `- **Type:** ${type === 'risk' ? 'Risk (lower is better)' : 'Capability (higher is better)'}\n`;

  // ISO enrichment from findings (Epic 38)
  if (dimScore.findings?.assessmentConfidence) {
    const conf = dimScore.findings.assessmentConfidence;
    output += `- **Assessment Confidence:** ${conf.level.toUpperCase()} - ${conf.rationale}\n`;
  }

  if (dimScore.findings?.isoClauseReferences && dimScore.findings.isoClauseReferences.length > 0) {
    output += '\n**ISO Clause Alignment:**\n';
    for (const ref of dimScore.findings.isoClauseReferences) {
      output += `- ${ref.clauseRef} (${ref.framework}): ${ref.title} - **${ref.status.toUpperCase()}**\n`;
    }
  }

  // Existing findings sections (subScores, keyRisks, mitigations, evidenceRefs)
  // ... keep existing code ...

  return output;
}
```

Also add a Guardian-native dimensions note to the user prompt:

```typescript
// In buildExportNarrativeUserPrompt, after dimension scores section
const guardianNativeDims = dimensionScores
  .filter(ds => ['clinical_risk', 'vendor_capability', 'ethical_considerations', 'sustainability'].includes(ds.dimension))
  .map(ds => DIMENSION_CONFIG[ds.dimension]?.label || ds.dimension);

if (guardianNativeDims.length > 0) {
  // Append note about Guardian-native dimensions
}
```

### 3. Key Rules

- **Do NOT reproduce ISO text**: Reference clause numbers only, with Guardian's interpretive criteria wording.
- **Prohibited terms enforcement**: System prompt must explicitly list prohibited terms and their compliant alternatives.
- **Null safety**: `findings?.assessmentConfidence` may be undefined for pre-Epic-37 assessments. Only add ISO sections when data exists.
- **LOC budget**: System prompt file is ~160 LOC now. Adding ~40 LOC keeps it under 200 LOC.

## Files Touched

- `packages/backend/src/infrastructure/ai/prompts/exportNarrativeSystemPrompt.ts` - MODIFY (add ~40 LOC ISO instructions)
- `packages/backend/src/infrastructure/ai/prompts/exportNarrativeUserPrompt.ts` - MODIFY (enhance `formatDimensionScore`, add ~25 LOC)

## Tests Affected

- `packages/backend/__tests__/unit/infrastructure/ai/ExportNarrativeGenerator.test.ts` - Mocks prompt builder, may need fixture updates
- `packages/backend/__tests__/unit/infrastructure/ai/prompts/exportNarrativeSystemPrompt.test.ts` - From Sprint 1, needs ISO assertion additions

## Agent Assignment

- [x] backend-agent

## Tests Required

- [ ] `packages/backend/__tests__/unit/infrastructure/ai/prompts/exportNarrativeSystemPrompt.test.ts` (extend)
  - Test system prompt includes "ISO-traceable" guidance
  - Test system prompt includes prohibited terms list
  - Test system prompt includes "NEVER use" messaging rules
  - Test system prompt includes confidence level interpretation
  - Test system prompt mentions Guardian-native dimensions
- [ ] `packages/backend/__tests__/unit/infrastructure/ai/prompts/exportNarrativeUserPrompt.test.ts` (extend)
  - Test `formatDimensionScore` includes confidence when present in findings
  - Test `formatDimensionScore` includes ISO clause references when present
  - Test `formatDimensionScore` omits ISO sections when findings are empty
  - Test `formatDimensionScore` shows clause status (ALIGNED/PARTIAL/NOT_EVIDENCED)
  - Test user prompt includes Guardian-native dimension note

## Definition of Done

- [ ] System prompt has ISO context instructions
- [ ] System prompt has prohibited terms list
- [ ] User prompt includes per-dimension ISO data from findings
- [ ] User prompt handles missing ISO data gracefully
- [ ] All tests pass
- [ ] Under 300 LOC per file
- [ ] No TypeScript errors
