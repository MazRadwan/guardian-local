import { ISOControlRetrievalService } from '../../../../src/application/services/ISOControlRetrievalService'
import type { IDimensionControlMappingRepository, MappingWithControlDTO } from '../../../../src/application/interfaces/IDimensionControlMappingRepository'
import type { IInterpretiveCriteriaRepository } from '../../../../src/application/interfaces/IInterpretiveCriteriaRepository'
import type { InterpretiveCriteriaDTO } from '../../../../src/domain/compliance/dtos'

/**
 * Helper to create a MappingWithControlDTO for testing
 */
function makeMappingDTO(overrides: {
  controlId: string
  dimension: string
  clauseRef: string
  domain?: string
  title?: string
  relevanceWeight?: number
}): MappingWithControlDTO {
  return {
    id: `mapping-${overrides.controlId}-${overrides.dimension}`,
    controlId: overrides.controlId,
    dimension: overrides.dimension as MappingWithControlDTO['dimension'],
    relevanceWeight: overrides.relevanceWeight ?? 1.0,
    createdAt: new Date('2024-01-01'),
    control: {
      id: overrides.controlId,
      versionId: 'version-1',
      clauseRef: overrides.clauseRef,
      domain: overrides.domain ?? 'Test domain',
      title: overrides.title ?? 'Test control',
      createdAt: new Date('2024-01-01'),
    },
  }
}

function makeCriteriaDTO(overrides: {
  controlId: string
  criteriaText: string
  assessmentGuidance?: string
}): InterpretiveCriteriaDTO {
  return {
    id: `criteria-${overrides.controlId}`,
    controlId: overrides.controlId,
    criteriaVersion: 'guardian-iso42001-v1.0',
    criteriaText: overrides.criteriaText,
    assessmentGuidance: overrides.assessmentGuidance,
    reviewStatus: 'approved',
    approvedAt: new Date('2024-01-01'),
    approvedBy: 'seed-script',
    createdAt: new Date('2024-01-01'),
  }
}

function createMockRepos() {
  const mockMappingRepo: jest.Mocked<IDimensionControlMappingRepository> = {
    findByDimension: jest.fn(),
    findByDimensions: jest.fn(),
    findAllMappings: jest.fn(),
    create: jest.fn(),
    createBatch: jest.fn(),
  }
  const mockCriteriaRepo: jest.Mocked<IInterpretiveCriteriaRepository> = {
    findByControlId: jest.fn(),
    findApprovedByVersion: jest.fn(),
    create: jest.fn(),
    createBatch: jest.fn(),
    updateReviewStatus: jest.fn(),
  }
  return { mockMappingRepo, mockCriteriaRepo }
}

describe('ISOControlRetrievalService', () => {
  let service: ISOControlRetrievalService
  let mockMappingRepo: jest.Mocked<IDimensionControlMappingRepository>
  let mockCriteriaRepo: jest.Mocked<IInterpretiveCriteriaRepository>

  const mappings: MappingWithControlDTO[] = [
    makeMappingDTO({
      controlId: 'ctrl-1',
      dimension: 'regulatory_compliance',
      clauseRef: 'A.4.2',
      domain: 'Context of the organization',
      title: 'AI policy',
      relevanceWeight: 0.8,
    }),
    makeMappingDTO({
      controlId: 'ctrl-1',
      dimension: 'operational_excellence',
      clauseRef: 'A.4.2',
      domain: 'Context of the organization',
      title: 'AI policy',
      relevanceWeight: 0.6,
    }),
    makeMappingDTO({
      controlId: 'ctrl-2',
      dimension: 'regulatory_compliance',
      clauseRef: 'A.6.2.6',
      domain: 'Data management',
      title: 'Data quality management',
      relevanceWeight: 0.9,
    }),
    makeMappingDTO({
      controlId: 'ctrl-3',
      dimension: 'security_risk',
      clauseRef: '6.3',
      domain: 'Risk management',
      title: 'Risk treatment for AI',
      relevanceWeight: 0.8,
    }),
  ]

  const criteria: InterpretiveCriteriaDTO[] = [
    makeCriteriaDTO({
      controlId: 'ctrl-1',
      criteriaText: 'Organization has established an AI policy.',
      assessmentGuidance: 'Look for documented AI governance policy.',
    }),
    makeCriteriaDTO({
      controlId: 'ctrl-2',
      criteriaText: 'Systematic data quality processes exist.',
    }),
  ]

  beforeEach(() => {
    const repos = createMockRepos()
    mockMappingRepo = repos.mockMappingRepo
    mockCriteriaRepo = repos.mockCriteriaRepo

    mockCriteriaRepo.findApprovedByVersion.mockResolvedValue(criteria)

    service = new ISOControlRetrievalService(
      mockMappingRepo,
      mockCriteriaRepo,
      'guardian-iso42001-v1.0'
    )
  })

  describe('getFullCatalog', () => {
    it('should return all mapped controls', async () => {
      mockMappingRepo.findAllMappings.mockResolvedValue(mappings)

      const result = await service.getFullCatalog()
      expect(result).toHaveLength(3) // ctrl-1 deduped, ctrl-2, ctrl-3
      expect(mockMappingRepo.findAllMappings).toHaveBeenCalledTimes(1)
    })

    it('should return empty array when no mappings exist', async () => {
      mockMappingRepo.findAllMappings.mockResolvedValue([])
      mockCriteriaRepo.findApprovedByVersion.mockResolvedValue([])

      const result = await service.getFullCatalog()
      expect(result).toEqual([])
    })
  })

  describe('getApplicableControls', () => {
    it('should call findByDimensions with all dimensions in a single batch query', async () => {
      mockMappingRepo.findByDimensions.mockResolvedValue([mappings[0], mappings[1]])

      await service.getApplicableControls([
        'regulatory_compliance',
        'operational_excellence',
      ])

      // Verify single batch call instead of N+1 per-dimension calls
      expect(mockMappingRepo.findByDimensions).toHaveBeenCalledTimes(1)
      expect(mockMappingRepo.findByDimensions).toHaveBeenCalledWith([
        'regulatory_compliance',
        'operational_excellence',
      ])
      // findByDimension should NOT be called
      expect(mockMappingRepo.findByDimension).not.toHaveBeenCalled()
    })

    it('should dedupe controls across dimensions', async () => {
      // ctrl-1 appears in both regulatory_compliance and operational_excellence
      mockMappingRepo.findByDimensions.mockResolvedValue([mappings[0], mappings[1]])

      const result = await service.getApplicableControls([
        'regulatory_compliance',
        'operational_excellence',
      ])

      // ctrl-1 should appear once, with both dimensions
      const ctrl1 = result.find((r) => r.clauseRef === 'A.4.2')
      expect(ctrl1).toBeDefined()
      expect(ctrl1!.dimensions).toContain('regulatory_compliance')
      expect(ctrl1!.dimensions).toContain('operational_excellence')
    })

    it('should return empty for empty dimensions array', async () => {
      mockMappingRepo.findByDimensions.mockResolvedValue([])
      mockCriteriaRepo.findApprovedByVersion.mockResolvedValue([])
      const result = await service.getApplicableControls([])
      expect(result).toEqual([])
    })
  })

  describe('getControlsForDimension', () => {
    it('should return empty array for clinical_risk (no mappings)', async () => {
      mockMappingRepo.findByDimension.mockResolvedValue([])
      mockCriteriaRepo.findApprovedByVersion.mockResolvedValue([])

      const result = await service.getControlsForDimension('clinical_risk')
      expect(result).toEqual([])
    })

    it('should return controls with criteria for regulatory_compliance', async () => {
      mockMappingRepo.findByDimension.mockResolvedValue(
        mappings.filter((m) => m.dimension === 'regulatory_compliance')
      )

      const result = await service.getControlsForDimension('regulatory_compliance')
      expect(result.length).toBeGreaterThan(0)

      const ctrl1 = result.find((r) => r.clauseRef === 'A.4.2')
      expect(ctrl1).toBeDefined()
      expect(ctrl1!.criteriaText).toBe('Organization has established an AI policy.')
      expect(ctrl1!.assessmentGuidance).toBe(
        'Look for documented AI governance policy.'
      )
    })
  })

  describe('criteria text handling', () => {
    it('should include criteria text when approved criteria exists', async () => {
      mockMappingRepo.findAllMappings.mockResolvedValue([mappings[0]])

      const result = await service.getFullCatalog()
      expect(result[0].criteriaText).toBe(
        'Organization has established an AI policy.'
      )
    })

    it('should return empty string when no approved criteria exists', async () => {
      mockMappingRepo.findAllMappings.mockResolvedValue([mappings[3]]) // ctrl-3 has no criteria
      mockCriteriaRepo.findApprovedByVersion.mockResolvedValue([]) // no criteria at all

      const result = await service.getFullCatalog()
      expect(result[0].criteriaText).toBe('')
    })
  })

  describe('inferFramework', () => {
    it('should return ISO 42001 for "A.x.x" clause refs', async () => {
      mockMappingRepo.findAllMappings.mockResolvedValue([mappings[0]])

      const result = await service.getFullCatalog()
      expect(result[0].framework).toBe('ISO/IEC 42001')
    })

    it('should return ISO 23894 for numeric clause refs', async () => {
      mockMappingRepo.findAllMappings.mockResolvedValue([mappings[3]]) // 6.3

      const result = await service.getFullCatalog()
      expect(result[0].framework).toBe('ISO/IEC 23894')
    })
  })

  describe('dimension list aggregation', () => {
    it('should aggregate dimensions for a control mapped to multiple dimensions', async () => {
      // ctrl-1 is mapped to regulatory_compliance AND operational_excellence
      mockMappingRepo.findAllMappings.mockResolvedValue([mappings[0], mappings[1]])

      const result = await service.getFullCatalog()
      expect(result).toHaveLength(1)
      expect(result[0].dimensions).toContain('regulatory_compliance')
      expect(result[0].dimensions).toContain('operational_excellence')
      expect(result[0].dimensions).toHaveLength(2)
    })
  })

  describe('relevanceWeights per dimension (H2 fix)', () => {
    it('should preserve per-dimension weights when a control maps to multiple dimensions', async () => {
      // ctrl-1 has weight 0.8 for regulatory_compliance, 0.6 for operational_excellence
      mockMappingRepo.findAllMappings.mockResolvedValue([mappings[0], mappings[1]])

      const result = await service.getFullCatalog()
      expect(result).toHaveLength(1)
      expect(result[0].relevanceWeights).toEqual({
        regulatory_compliance: 0.8,
        operational_excellence: 0.6,
      })
    })

    it('should preserve single weight when control maps to one dimension', async () => {
      mockMappingRepo.findAllMappings.mockResolvedValue([mappings[2]]) // ctrl-2

      const result = await service.getFullCatalog()
      expect(result).toHaveLength(1)
      expect(result[0].relevanceWeights).toEqual({
        regulatory_compliance: 0.9,
      })
    })

    it('should not silently drop different weights for same control across dimensions', async () => {
      // This is the exact scenario the H2 bug manifested:
      // ctrl-1 appears with weight 0.8 (regulatory_compliance) and 0.6 (operational_excellence)
      // Old code would keep only 0.8 and silently discard 0.6
      mockMappingRepo.findByDimensions.mockResolvedValue([mappings[0], mappings[1]])

      const result = await service.getApplicableControls([
        'regulatory_compliance',
        'operational_excellence',
      ])

      const ctrl1 = result.find((r) => r.clauseRef === 'A.4.2')!
      expect(ctrl1.relevanceWeights['regulatory_compliance']).toBe(0.8)
      expect(ctrl1.relevanceWeights['operational_excellence']).toBe(0.6)
    })
  })

  describe('getFullCatalog caching', () => {
    it('should return data from DB on first call', async () => {
      mockMappingRepo.findAllMappings.mockResolvedValue(mappings)

      const result = await service.getFullCatalog()

      expect(result).toHaveLength(3)
      expect(mockMappingRepo.findAllMappings).toHaveBeenCalledTimes(1)
      expect(mockCriteriaRepo.findApprovedByVersion).toHaveBeenCalledTimes(1)
    })

    it('should return cached data on second call without hitting DB again', async () => {
      mockMappingRepo.findAllMappings.mockResolvedValue(mappings)

      const first = await service.getFullCatalog()
      const second = await service.getFullCatalog()

      expect(first).toEqual(second)
      expect(mockMappingRepo.findAllMappings).toHaveBeenCalledTimes(1)
      expect(mockCriteriaRepo.findApprovedByVersion).toHaveBeenCalledTimes(1)
    })

    it('should refresh cache after TTL expires', async () => {
      // Use a short TTL (50ms) to test expiration without fake timers
      const shortTTLService = new ISOControlRetrievalService(
        mockMappingRepo,
        mockCriteriaRepo,
        'guardian-iso42001-v1.0',
        50 // 50ms TTL
      )

      mockMappingRepo.findAllMappings.mockResolvedValue(mappings)

      await shortTTLService.getFullCatalog()
      expect(mockMappingRepo.findAllMappings).toHaveBeenCalledTimes(1)

      // Wait for TTL to expire
      await new Promise((resolve) => setTimeout(resolve, 60))

      await shortTTLService.getFullCatalog()
      expect(mockMappingRepo.findAllMappings).toHaveBeenCalledTimes(2)
    })
  })

  describe('getApplicableControls caching', () => {
    it('should cache per dimension set', async () => {
      mockMappingRepo.findByDimensions.mockResolvedValue([mappings[0], mappings[1]])

      const dims = ['regulatory_compliance', 'operational_excellence']

      await service.getApplicableControls(dims)
      await service.getApplicableControls(dims)

      expect(mockMappingRepo.findByDimensions).toHaveBeenCalledTimes(1)
    })

    it('should use order-independent cache key (sorted dimensions)', async () => {
      mockMappingRepo.findByDimensions.mockResolvedValue([mappings[0], mappings[1]])

      await service.getApplicableControls([
        'operational_excellence',
        'regulatory_compliance',
      ])
      await service.getApplicableControls([
        'regulatory_compliance',
        'operational_excellence',
      ])

      // Same dimensions in different order should produce one DB call
      expect(mockMappingRepo.findByDimensions).toHaveBeenCalledTimes(1)
    })

    it('should cache different dimension sets independently', async () => {
      mockMappingRepo.findByDimensions
        .mockResolvedValueOnce([mappings[0]])
        .mockResolvedValueOnce([mappings[3]])

      await service.getApplicableControls(['regulatory_compliance'])
      await service.getApplicableControls(['security_risk'])

      expect(mockMappingRepo.findByDimensions).toHaveBeenCalledTimes(2)
    })

    it('should refresh after TTL expires', async () => {
      const shortTTLService = new ISOControlRetrievalService(
        mockMappingRepo,
        mockCriteriaRepo,
        'guardian-iso42001-v1.0',
        50 // 50ms TTL
      )

      mockMappingRepo.findByDimensions.mockResolvedValue([mappings[0]])

      await shortTTLService.getApplicableControls(['regulatory_compliance'])
      expect(mockMappingRepo.findByDimensions).toHaveBeenCalledTimes(1)

      await new Promise((resolve) => setTimeout(resolve, 60))

      await shortTTLService.getApplicableControls(['regulatory_compliance'])
      expect(mockMappingRepo.findByDimensions).toHaveBeenCalledTimes(2)
    })

    it('should evict all entries when cache exceeds MAX_CACHE_ENTRIES (50)', async () => {
      mockMappingRepo.findByDimensions.mockResolvedValue([mappings[0]])

      // Fill cache to MAX_CACHE_ENTRIES (50 unique dimension sets)
      for (let i = 0; i < 50; i++) {
        await service.getApplicableControls([`dimension_${i}`])
      }

      // 50 unique calls = 50 DB hits
      expect(mockMappingRepo.findByDimensions).toHaveBeenCalledTimes(50)

      // Verify one of the early entries is cached (no extra DB call)
      await service.getApplicableControls(['dimension_0'])
      expect(mockMappingRepo.findByDimensions).toHaveBeenCalledTimes(50) // still 50

      // Adding the 51st entry should trigger eviction (clear all)
      await service.getApplicableControls(['dimension_50'])
      expect(mockMappingRepo.findByDimensions).toHaveBeenCalledTimes(51) // new DB call

      // After eviction, previously cached entry should require a DB call
      await service.getApplicableControls(['dimension_0'])
      expect(mockMappingRepo.findByDimensions).toHaveBeenCalledTimes(52) // re-fetched
    })
  })

  describe('clearCache', () => {
    it('should force next getFullCatalog call to hit DB', async () => {
      mockMappingRepo.findAllMappings.mockResolvedValue(mappings)

      await service.getFullCatalog()
      expect(mockMappingRepo.findAllMappings).toHaveBeenCalledTimes(1)

      service.clearCache()

      await service.getFullCatalog()
      expect(mockMappingRepo.findAllMappings).toHaveBeenCalledTimes(2)
    })

    it('should force next getApplicableControls call to hit DB', async () => {
      mockMappingRepo.findByDimensions.mockResolvedValue([mappings[0]])

      await service.getApplicableControls(['regulatory_compliance'])
      expect(mockMappingRepo.findByDimensions).toHaveBeenCalledTimes(1)

      service.clearCache()

      await service.getApplicableControls(['regulatory_compliance'])
      expect(mockMappingRepo.findByDimensions).toHaveBeenCalledTimes(2)
    })
  })

  describe('different criteriaVersion instances do not share cache', () => {
    it('should not share cache between service instances with different versions', async () => {
      const repos = createMockRepos()
      repos.mockMappingRepo.findAllMappings.mockResolvedValue(mappings)
      repos.mockCriteriaRepo.findApprovedByVersion.mockResolvedValue(criteria)

      const serviceV1 = new ISOControlRetrievalService(
        repos.mockMappingRepo,
        repos.mockCriteriaRepo,
        'guardian-iso42001-v1.0'
      )
      const serviceV2 = new ISOControlRetrievalService(
        repos.mockMappingRepo,
        repos.mockCriteriaRepo,
        'guardian-iso42001-v2.0'
      )

      await serviceV1.getFullCatalog()
      await serviceV2.getFullCatalog()

      // Each service instance has its own cache, so both hit DB
      expect(repos.mockMappingRepo.findAllMappings).toHaveBeenCalledTimes(2)
    })
  })
})
