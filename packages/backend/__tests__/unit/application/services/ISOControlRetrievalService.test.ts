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
      relevanceWeight: 0.8,
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
    mockMappingRepo = {
      findByDimension: jest.fn(),
      findAllMappings: jest.fn(),
      create: jest.fn(),
      createBatch: jest.fn(),
    }
    mockCriteriaRepo = {
      findByControlId: jest.fn(),
      findApprovedByVersion: jest.fn(),
      create: jest.fn(),
      createBatch: jest.fn(),
      updateReviewStatus: jest.fn(),
    }

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
    it('should dedupe controls across dimensions', async () => {
      // ctrl-1 appears in both regulatory_compliance and operational_excellence
      mockMappingRepo.findByDimension.mockImplementation(async (dim) => {
        return mappings.filter((m) => m.dimension === dim)
      })

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
})
