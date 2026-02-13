/**
 * ISOControlRetrievalService
 *
 * Application service that queries ISO controls from the database
 * and prepares them for injection into scoring prompts.
 *
 * Bridge between the repository layer and the prompt layer.
 * Returns ISOControlForPrompt[] — the format consumed by prompt builders.
 */

import type {
  IDimensionControlMappingRepository,
  MappingWithControlDTO,
} from '../interfaces/IDimensionControlMappingRepository.js'
import type { IInterpretiveCriteriaRepository } from '../interfaces/IInterpretiveCriteriaRepository.js'
import type { ISOControlForPrompt } from '../../domain/compliance/types.js'
import type { RiskDimension } from '../../domain/types/QuestionnaireSchema.js'

export type { ISOControlForPrompt } from '../../domain/compliance/types.js'

export class ISOControlRetrievalService {
  constructor(
    private readonly mappingRepo: IDimensionControlMappingRepository,
    private readonly criteriaRepo: IInterpretiveCriteriaRepository,
    private readonly criteriaVersion: string = 'guardian-iso42001-v1.0'
  ) {}

  /**
   * Get all mapped controls for the static ISO catalog (system prompt).
   * Returns deduped controls across all dimensions.
   */
  async getFullCatalog(): Promise<ISOControlForPrompt[]> {
    const allMappings = await this.mappingRepo.findAllMappings()
    return this.buildControlList(allMappings)
  }

  /**
   * Get controls applicable to specific dimensions (user prompt).
   * Returns deduped controls that map to any of the given dimensions.
   */
  async getApplicableControls(dimensions: string[]): Promise<ISOControlForPrompt[]> {
    const allMappings: MappingWithControlDTO[] = []
    for (const dim of dimensions) {
      const dimMappings = await this.mappingRepo.findByDimension(dim)
      allMappings.push(...dimMappings)
    }
    return this.buildControlList(allMappings)
  }

  /**
   * Get controls for a single dimension.
   */
  async getControlsForDimension(dimension: string): Promise<ISOControlForPrompt[]> {
    const mappings = await this.mappingRepo.findByDimension(dimension)
    return this.buildControlList(mappings)
  }

  /**
   * Build deduped control list with interpretive criteria attached.
   */
  private async buildControlList(
    mappings: MappingWithControlDTO[]
  ): Promise<ISOControlForPrompt[]> {
    // Dedupe by control ID
    const controlMap = new Map<
      string,
      {
        control: MappingWithControlDTO['control']
        dimensions: string[]
        weight: number
      }
    >()

    for (const m of mappings) {
      const existing = controlMap.get(m.controlId)
      if (existing) {
        if (!existing.dimensions.includes(m.dimension)) {
          existing.dimensions.push(m.dimension)
        }
      } else {
        controlMap.set(m.controlId, {
          control: m.control,
          dimensions: [m.dimension],
          weight: m.relevanceWeight,
        })
      }
    }

    // Fetch approved criteria for each control
    const approvedCriteria = await this.criteriaRepo.findApprovedByVersion(
      this.criteriaVersion
    )
    const criteriaByControl = new Map(approvedCriteria.map((c) => [c.controlId, c]))

    const results: ISOControlForPrompt[] = []
    for (const [controlId, entry] of controlMap) {
      const criteria = criteriaByControl.get(controlId)
      results.push({
        clauseRef: entry.control.clauseRef,
        domain: entry.control.domain,
        title: entry.control.title,
        framework: this.inferFramework(entry.control.clauseRef),
        criteriaText: criteria?.criteriaText ?? '',
        assessmentGuidance: criteria?.assessmentGuidance,
        dimensions: entry.dimensions as RiskDimension[],
        relevanceWeight: entry.weight,
      })
    }

    return results
  }

  /**
   * Infer framework name from clause ref pattern.
   * ISO 42001 Annex A controls start with "A."
   * ISO 23894 controls are numeric (e.g., "6.3")
   */
  private inferFramework(clauseRef: string): string {
    return clauseRef.startsWith('A.') ? 'ISO/IEC 42001' : 'ISO/IEC 23894'
  }
}
