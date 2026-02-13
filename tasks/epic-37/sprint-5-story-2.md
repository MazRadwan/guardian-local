# Story 37.5.2: Create ISOControlRetrievalService

## Description

Create the `ISOControlRetrievalService` -- the application service that queries ISO controls from the database and prepares them for injection into scoring prompts. This service is the bridge between the repository layer and the prompt layer.

## Acceptance Criteria

- [ ] `ISOControlRetrievalService.ts` created in `application/services/`
- [ ] `getControlsForDimension(dimension)` returns controls mapped to a specific dimension with their interpretive criteria
- [ ] `getApplicableControls(dimensions)` returns all controls applicable to a set of dimensions (deduped)
- [ ] `getFullCatalog()` returns all mapped controls for the static system prompt catalog
- [ ] Returns empty results for Guardian-native dimensions (clinical_risk, vendor_capability, ethical_considerations, sustainability) -- no ISO mappings exist
- [ ] Includes interpretive criteria text (only approved criteria)
- [ ] Under 150 LOC
- [ ] No TypeScript errors

## Technical Approach

**File:** `packages/backend/src/application/services/ISOControlRetrievalService.ts`

```typescript
import { IDimensionControlMappingRepository, MappingWithControlDTO }
  from '../interfaces/IDimensionControlMappingRepository.js';
import { IInterpretiveCriteriaRepository } from '../interfaces/IInterpretiveCriteriaRepository.js';

import { ISOControlForPrompt } from '../../domain/compliance/types.js';

// Re-export for convenience (consumers can import from either location)
export type { ISOControlForPrompt } from '../../domain/compliance/types.js';

export class ISOControlRetrievalService {
  constructor(
    private mappingRepo: IDimensionControlMappingRepository,
    private criteriaRepo: IInterpretiveCriteriaRepository,
    private criteriaVersion: string = 'guardian-iso42001-v1.0'
  ) {}

  /**
   * Get all mapped controls for the static ISO catalog (system prompt).
   * Returns deduped controls across all dimensions.
   */
  async getFullCatalog(): Promise<ISOControlForPrompt[]> {
    const allMappings = await this.mappingRepo.findAllMappings();
    return this.buildControlList(allMappings);
  }

  /**
   * Get controls applicable to specific dimensions (user prompt).
   * Returns deduped controls that map to any of the given dimensions.
   */
  async getApplicableControls(dimensions: string[]): Promise<ISOControlForPrompt[]> {
    const allMappings: MappingWithControlDTO[] = [];
    for (const dim of dimensions) {
      const dimMappings = await this.mappingRepo.findByDimension(dim);
      allMappings.push(...dimMappings);
    }
    return this.buildControlList(allMappings);
  }

  /**
   * Get controls for a single dimension.
   */
  async getControlsForDimension(dimension: string): Promise<ISOControlForPrompt[]> {
    const mappings = await this.mappingRepo.findByDimension(dimension);
    return this.buildControlList(mappings);
  }

  /**
   * Build deduped control list with interpretive criteria attached.
   */
  private async buildControlList(mappings: MappingWithControlDTO[]): Promise<ISOControlForPrompt[]> {
    // Dedupe by control ID
    const controlMap = new Map<string, {
      control: MappingWithControlDTO['control'];
      dimensions: string[];
      weight: number;
    }>();

    for (const m of mappings) {
      const existing = controlMap.get(m.controlId);
      if (existing) {
        if (!existing.dimensions.includes(m.dimension)) {
          existing.dimensions.push(m.dimension);
        }
      } else {
        controlMap.set(m.controlId, {
          control: m.control,
          dimensions: [m.dimension],
          weight: m.relevanceWeight,
        });
      }
    }

    // Fetch approved criteria for each control
    const approvedCriteria = await this.criteriaRepo.findApprovedByVersion(this.criteriaVersion);
    const criteriaByControl = new Map(approvedCriteria.map(c => [c.controlId, c]));

    const results: ISOControlForPrompt[] = [];
    for (const [controlId, entry] of controlMap) {
      const criteria = criteriaByControl.get(controlId);
      results.push({
        clauseRef: entry.control.clauseRef,
        domain: entry.control.domain,
        title: entry.control.title,
        framework: this.inferFramework(entry.control.clauseRef),
        criteriaText: criteria?.criteriaText ?? '',
        assessmentGuidance: criteria?.assessmentGuidance,
        dimensions: entry.dimensions,
        relevanceWeight: entry.weight,
      });
    }

    return results;
  }

  /**
   * Infer framework name from clause ref pattern.
   * ISO 42001 Annex A controls start with "A."
   * ISO 23894 controls are numeric (e.g., "6.3")
   */
  private inferFramework(clauseRef: string): string {
    return clauseRef.startsWith('A.') ? 'ISO/IEC 42001' : 'ISO/IEC 23894';
  }
}
```

## Files Touched

- `packages/backend/src/application/services/ISOControlRetrievalService.ts` - CREATE (~120 LOC)

## Tests Affected

- None (pure creation)

## Agent Assignment

- [x] backend-agent

## Tests Required

- [ ] `packages/backend/__tests__/unit/application/services/ISOControlRetrievalService.test.ts`
  - Test `getFullCatalog()` returns all mapped controls (mock repos)
  - Test `getApplicableControls()` dedupes controls across dimensions
  - Test `getControlsForDimension('clinical_risk')` returns empty array (no mappings)
  - Test `getControlsForDimension('regulatory_compliance')` returns controls with criteria
  - Test criteria text is included when approved criteria exists
  - Test criteria text is empty string when no approved criteria
  - Test `inferFramework()` returns ISO 42001 for "A.x.x" refs and ISO 23894 for numeric refs
  - Test dimension list aggregation (one control mapping to multiple dimensions)

## Definition of Done

- [ ] Service created and compiles
- [ ] Returns empty for Guardian-native dimensions (clinical_risk, vendor_capability, ethical_considerations, sustainability)
- [ ] Deduplicates controls across dimensions
- [ ] Attaches interpretive criteria (approved only)
- [ ] Unit tests written and passing
- [ ] Under 150 LOC
- [ ] No TypeScript errors
