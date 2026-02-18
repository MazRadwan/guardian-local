/**
 * ISOControlRetrievalService
 *
 * Application service that queries ISO controls from the database
 * and prepares them for injection into scoring prompts.
 *
 * Bridge between the repository layer and the prompt layer.
 * Returns ISOControlForPrompt[] — the format consumed by prompt builders.
 *
 * Includes in-memory caching with configurable TTL (default 5 min).
 * ISO catalog changes rarely, so caching eliminates repeated DB queries
 * during scoring runs.
 */

import type {
  IDimensionControlMappingRepository,
  MappingWithControlDTO,
} from '../interfaces/IDimensionControlMappingRepository.js'
import type { IInterpretiveCriteriaRepository } from '../interfaces/IInterpretiveCriteriaRepository.js'
import type { ISOControlForPrompt } from '../../domain/compliance/types.js'
import type { RiskDimension } from '../../domain/types/QuestionnaireSchema.js'

export type { ISOControlForPrompt } from '../../domain/compliance/types.js'

const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

interface CacheEntry<T> {
  data: T
  timestamp: number
}

export class ISOControlRetrievalService {
  private static readonly MAX_CACHE_ENTRIES = 50

  private fullCatalogCache: CacheEntry<ISOControlForPrompt[]> | null = null
  private applicableControlsCache = new Map<string, CacheEntry<ISOControlForPrompt[]>>()
  private readonly cacheTTLMs: number

  constructor(
    private readonly mappingRepo: IDimensionControlMappingRepository,
    private readonly criteriaRepo: IInterpretiveCriteriaRepository,
    private readonly criteriaVersion: string = 'guardian-iso42001-v1.0',
    cacheTTLMs?: number
  ) {
    this.cacheTTLMs = cacheTTLMs ?? DEFAULT_CACHE_TTL_MS
  }

  /**
   * Get all mapped controls for the static ISO catalog (system prompt).
   * Returns deduped controls across all dimensions.
   * Results are cached in memory until TTL expires.
   */
  async getFullCatalog(): Promise<ISOControlForPrompt[]> {
    if (this.fullCatalogCache && !this.isExpired(this.fullCatalogCache)) {
      return this.fullCatalogCache.data
    }
    const allMappings = await this.mappingRepo.findAllMappings()
    const result = await this.buildControlList(allMappings)
    this.fullCatalogCache = { data: result, timestamp: Date.now() }
    return result
  }

  /**
   * Get controls applicable to specific dimensions (user prompt).
   * Returns deduped controls that map to any of the given dimensions.
   * Uses a single batch query instead of one query per dimension.
   * Results are cached per dimension set (sorted key) until TTL expires.
   */
  async getApplicableControls(dimensions: string[]): Promise<ISOControlForPrompt[]> {
    const cacheKey = [...dimensions].sort().join(',')
    const cached = this.applicableControlsCache.get(cacheKey)
    if (cached && !this.isExpired(cached)) {
      return cached.data
    }
    const allMappings = await this.mappingRepo.findByDimensions(dimensions)
    const result = await this.buildControlList(allMappings)
    if (this.applicableControlsCache.size >= ISOControlRetrievalService.MAX_CACHE_ENTRIES) {
      this.applicableControlsCache.clear()
    }
    this.applicableControlsCache.set(cacheKey, { data: result, timestamp: Date.now() })
    return result
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
   * Preserves per-dimension weights (fixes H2: weight dedup bug).
   */
  private async buildControlList(
    mappings: MappingWithControlDTO[]
  ): Promise<ISOControlForPrompt[]> {
    // Dedupe by control ID, preserving per-dimension weights
    const controlMap = new Map<
      string,
      {
        control: MappingWithControlDTO['control']
        dimensions: string[]
        weights: Record<string, number>
      }
    >()

    for (const m of mappings) {
      const existing = controlMap.get(m.controlId)
      if (existing) {
        if (!existing.dimensions.includes(m.dimension)) {
          existing.dimensions.push(m.dimension)
        }
        existing.weights[m.dimension] = m.relevanceWeight
      } else {
        controlMap.set(m.controlId, {
          control: m.control,
          dimensions: [m.dimension],
          weights: { [m.dimension]: m.relevanceWeight },
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
        relevanceWeights: entry.weights,
      })
    }

    return results
  }

  /**
   * Clear all cached data. Useful for tests and after framework updates.
   */
  clearCache(): void {
    this.fullCatalogCache = null
    this.applicableControlsCache.clear()
  }

  /**
   * Check if a cache entry has exceeded its TTL.
   */
  private isExpired(entry: CacheEntry<unknown>): boolean {
    return Date.now() - entry.timestamp > this.cacheTTLMs
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
