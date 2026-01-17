# Story 20.1.2: Export Service Narrative Generation Integration

## Description
Modify `ScoringExportService` to detect when narrative is missing and generate it on-demand using Claude. The generated narrative should be persisted to the database so subsequent exports are instant. Include fallback behavior if LLM fails.

**GPT Review Requirement:** Must use clean architecture with `IExportNarrativeGenerator` port. Must implement concurrency-safe claim pattern to prevent double LLM calls.

## Acceptance Criteria
- [ ] Export service checks `narrative_status` before export
- [ ] If status is `complete`, uses cached narrative
- [ ] If status is `null`/`failed`, claims via atomic UPDATE and generates
- [ ] If claim fails (another request is generating), waits briefly or returns fallback
- [ ] Generated narrative is persisted atomically with status update
- [ ] If LLM fails, export succeeds with fallback content (executiveSummary + keyFindings)
- [ ] Fallback includes warning text in the narrative section
- [ ] Proper error logging for debugging
- [ ] **Clean Architecture:** Uses `IExportNarrativeGenerator` port, not infrastructure directly
- [ ] **Evidence Selection:** Uses tiered fallback (findings refs → section mapping → even distribution)

## Technical Approach

### 1. Create Application-Layer Port (Clean Architecture)

```typescript
// packages/backend/src/application/interfaces/IExportNarrativeGenerator.ts
export interface IExportNarrativeGenerator {
  generateNarrative(params: {
    vendorName: string;
    solutionName: string;
    solutionType: SolutionType;
    result: AssessmentResultDTO;
    dimensionScores: DimensionScoreData[];
    responses: ResponseDTO[];
  }): Promise<string>;
}
```

### 2. Add Dependencies to ScoringExportService

```typescript
constructor(
  private readonly assessmentRepository: IAssessmentRepository,
  private readonly assessmentResultRepository: IAssessmentResultRepository,
  private readonly dimensionScoreRepository: IDimensionScoreRepository,
  private readonly responseRepository: IResponseRepository,
  private readonly pdfExporter: IScoringPDFExporter,
  private readonly wordExporter: IScoringWordExporter,
  private readonly narrativeGenerator: IExportNarrativeGenerator  // Port, not infrastructure
) {}
```

### 3. Implement Concurrency-Safe Narrative Generation (GPT Required)

```typescript
private async ensureNarrative(
  result: AssessmentResultDTO,
  dimensionScores: DimensionScoreData[],
  vendorName: string,
  solutionName: string,
  solutionType: SolutionType
): Promise<string> {
  // 1. Check if narrative already complete
  if (result.narrativeStatus === 'complete' && result.narrativeReport) {
    return result.narrativeReport;
  }

  // 2. Try to claim the generation (atomic UPDATE)
  const claimed = await this.assessmentResultRepository.claimNarrativeGeneration(
    result.assessmentId,
    result.batchId,
    300000 // 5 min TTL for stuck claims
  );

  if (!claimed) {
    // Another request is generating - wait briefly or return fallback
    const refreshed = await this.waitForNarrative(result.assessmentId, result.batchId, 5000);
    if (refreshed?.narrativeReport) {
      return refreshed.narrativeReport;
    }
    return this.buildFallbackNarrative(result);
  }

  // 3. We have the claim - generate narrative
  try {
    const responses = await this.responseRepository.findByBatchId(
      result.assessmentId,
      result.batchId
    );
    const topResponses = this.selectTopResponses(responses, dimensionScores);

    const narrative = await this.narrativeGenerator.generateNarrative({
      vendorName,
      solutionName,
      solutionType,
      result,
      dimensionScores,
      responses: topResponses
    });

    // 4. Finalize - update status to 'complete' with narrative
    await this.assessmentResultRepository.finalizeNarrativeGeneration(
      result.assessmentId,
      result.batchId,
      narrative
    );

    return narrative;
  } catch (error) {
    console.error('[ScoringExportService] Narrative generation failed:', error);
    // Mark as failed so next attempt can retry
    await this.assessmentResultRepository.failNarrativeGeneration(
      result.assessmentId,
      result.batchId,
      error instanceof Error ? error.message : 'Unknown error'
    );
    return this.buildFallbackNarrative(result);
  }
}
```

### 4. Fallback Behavior

```typescript
private buildFallbackNarrative(result: AssessmentResultDTO): string {
  return `
## Executive Summary

${result.executiveSummary || 'No executive summary available.'}

## Key Findings

${(result.keyFindings || []).map(f => `- ${f}`).join('\n') || 'No key findings available.'}

---
*Note: Detailed analysis was not available for this export. Please contact support if this issue persists.*
`;
}
```

### 5. Evidence Selection with Fallback (GPT Review Requirement)

**Problem**: The `findings` object in `dimensionScores` doesn't enforce evidence references in the tool schema. We cannot rely on `findings` containing specific question/response references.

**Solution**: Implement tiered evidence selection with fallback:

```typescript
private selectTopResponses(
  responses: ResponseDTO[],
  dimensionScores: DimensionScoreData[]
): ResponseDTO[] {
  const selected: ResponseDTO[] = [];
  const usedIds = new Set<string>();

  // Strategy 1: Try to use findings references if available
  for (const ds of dimensionScores) {
    if (ds.findings?.evidenceRefs && Array.isArray(ds.findings.evidenceRefs)) {
      for (const ref of ds.findings.evidenceRefs.slice(0, 2)) {
        const match = responses.find(r =>
          r.questionNumber === ref.questionNumber &&
          r.sectionNumber === ref.sectionNumber &&
          !usedIds.has(`${r.sectionNumber}-${r.questionNumber}`)
        );
        if (match) {
          selected.push(match);
          usedIds.add(`${match.sectionNumber}-${match.questionNumber}`);
        }
      }
    }
  }

  // Strategy 2: Fallback - select by dimension/section mapping
  if (selected.length < 20) {
    const sectionToDimension = this.getSectionDimensionMapping();

    for (const ds of dimensionScores) {
      const relevantSections = sectionToDimension[ds.dimension] || [];
      for (const section of relevantSections) {
        const sectionResponses = responses.filter(r =>
          r.sectionNumber === section &&
          !usedIds.has(`${r.sectionNumber}-${r.questionNumber}`)
        );
        // Take up to 2 per section
        for (const r of sectionResponses.slice(0, 2)) {
          if (selected.length >= 30) break;
          selected.push(r);
          usedIds.add(`${r.sectionNumber}-${r.questionNumber}`);
        }
      }
    }
  }

  // Strategy 3: Ultimate fallback - distribute evenly across all sections
  if (selected.length < 10) {
    const remaining = responses.filter(r =>
      !usedIds.has(`${r.sectionNumber}-${r.questionNumber}`)
    );
    const perSection = Math.ceil(20 / 10); // ~2 per section
    const bySectionMap = new Map<number, ResponseDTO[]>();

    for (const r of remaining) {
      if (!bySectionMap.has(r.sectionNumber)) {
        bySectionMap.set(r.sectionNumber, []);
      }
      bySectionMap.get(r.sectionNumber)!.push(r);
    }

    for (const [_, sectionResps] of bySectionMap) {
      for (const r of sectionResps.slice(0, perSection)) {
        if (selected.length >= 30) break;
        selected.push(r);
      }
    }
  }

  // Truncate each response for token budgeting
  return selected.map(r => ({
    ...r,
    responseText: r.responseText.slice(0, 500) + (r.responseText.length > 500 ? '...' : '')
  }));
}

/**
 * Maps dimensions to questionnaire sections.
 * Based on Guardian questionnaire structure.
 */
private getSectionDimensionMapping(): Record<string, number[]> {
  return {
    'clinical_risk': [1, 2],
    'privacy_risk': [3],
    'security_risk': [4],
    'technical_credibility': [5, 6],
    'operational_excellence': [7],
    'vendor_stability': [8],
    'integration_complexity': [9],
    'total_cost': [10],
    // Add other dimension mappings as needed
  };
}
```

### 6. Token Budgeting Summary

- Select 20-30 responses total (2-3 per dimension)
- **Primary**: Use `findings.evidenceRefs` if available
- **Fallback 1**: Use section-to-dimension mapping
- **Fallback 2**: Distribute evenly across sections
- Truncate each response to 500 characters

## Files Touched
- `packages/backend/src/application/interfaces/IExportNarrativeGenerator.ts` - **New**: Application port
- `packages/backend/src/infrastructure/ai/ExportNarrativeGenerator.ts` - **New**: Infrastructure implementation
- `packages/backend/src/application/services/ScoringExportService.ts` - Add narrative generation logic with claim pattern
- `packages/backend/src/application/interfaces/IResponseRepository.ts` - Verify `findByBatchId` exists

## Dependencies
- Depends on: 20.1.1 (prompt builder), 20.1.3 (repository methods with claim pattern)

## Agent Assignment
- [x] backend-agent

## Tests Required
- [ ] Unit test: Generate narrative when `narrative_report` is null
- [ ] Unit test: Generate narrative when `narrative_report` is empty string
- [ ] Unit test: Skip LLM when narrative already exists
- [ ] Unit test: Persist generated narrative to repository
- [ ] Unit test: Fallback on LLM error - export succeeds
- [ ] Unit test: Fallback includes warning message
- [ ] Unit test: Evidence selection - uses findings.evidenceRefs when available
- [ ] Unit test: Evidence selection - falls back to section mapping when no evidenceRefs
- [ ] Unit test: Evidence selection - falls back to even distribution when section mapping insufficient
- [ ] Unit test: Evidence selection - truncates responses to 500 chars
- [ ] Unit test: Evidence selection - limits to 30 responses max
- [ ] Integration test: Full export with narrative generation

## Definition of Done
- [ ] All acceptance criteria met
- [ ] Tests written and passing
- [ ] No TypeScript errors
- [ ] No lint errors
- [ ] Export reliability maintained (failures don't block export)
