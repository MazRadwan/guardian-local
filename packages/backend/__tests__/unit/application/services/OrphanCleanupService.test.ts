/**
 * Unit tests for OrphanCleanupService
 *
 * Epic 20 Story 20.2.2: Orphaned Response Cleanup Job
 *
 * Tests the cleanup service logic:
 * - Logging of deletions
 * - Empty result handling
 * - Retention window from env var
 * - Race-condition safe deletion (skips batches that are no longer orphaned)
 */

import { OrphanCleanupService, type CleanupResult } from '../../../../src/application/services/OrphanCleanupService.js'
import type { IResponseRepository, OrphanedBatchRef } from '../../../../src/application/interfaces/IResponseRepository.js'

describe('OrphanCleanupService', () => {
  let service: OrphanCleanupService
  let mockResponseRepo: jest.Mocked<IResponseRepository>

  // Helper to create OrphanedBatchRef
  const orphanRef = (assessmentId: string, batchId: string): OrphanedBatchRef => ({
    assessmentId,
    batchId,
  })

  beforeEach(() => {
    // Reset env vars
    delete process.env.ORPHAN_CLEANUP_RETENTION_HOURS

    // Create mock repository
    mockResponseRepo = {
      createBatch: jest.fn(),
      findByAssessmentId: jest.fn(),
      findByBatchId: jest.fn(),
      deleteByBatchId: jest.fn(),
      findOrphanedBatches: jest.fn(),
      deleteByBatchIdIfOrphaned: jest.fn(),
    } as jest.Mocked<IResponseRepository>

    service = new OrphanCleanupService(mockResponseRepo)
  })

  afterEach(() => {
    // Clean up env vars
    delete process.env.ORPHAN_CLEANUP_RETENTION_HOURS
    jest.restoreAllMocks()
  })

  describe('cleanupOrphanedResponses', () => {
    it('should return empty result when no orphans found', async () => {
      mockResponseRepo.findOrphanedBatches.mockResolvedValue([])

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {})

      const result = await service.cleanupOrphanedResponses()

      expect(result.deletedCount).toBe(0)
      expect(result.batchIds).toEqual([])
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('No orphaned responses found')
      )
    })

    it('should delete orphaned batches and return count', async () => {
      const orphan1 = orphanRef('assess-1', 'batch-1')
      const orphan2 = orphanRef('assess-2', 'batch-2')

      mockResponseRepo.findOrphanedBatches.mockResolvedValue([orphan1, orphan2])
      mockResponseRepo.deleteByBatchIdIfOrphaned
        .mockResolvedValueOnce(5) // batch-1 has 5 responses
        .mockResolvedValueOnce(3) // batch-2 has 3 responses

      const result = await service.cleanupOrphanedResponses()

      expect(result.deletedCount).toBe(8)
      expect(result.batchIds).toEqual(['batch-1', 'batch-2'])

      // Verify both batches were deleted with correct (assessmentId, batchId) pairs
      expect(mockResponseRepo.deleteByBatchIdIfOrphaned).toHaveBeenCalledTimes(2)
      expect(mockResponseRepo.deleteByBatchIdIfOrphaned).toHaveBeenCalledWith('assess-1', 'batch-1')
      expect(mockResponseRepo.deleteByBatchIdIfOrphaned).toHaveBeenCalledWith('assess-2', 'batch-2')
    })

    it('should log each batch deletion', async () => {
      const orphan = orphanRef('assess-abc', 'batch-abc-123')
      mockResponseRepo.findOrphanedBatches.mockResolvedValue([orphan])
      mockResponseRepo.deleteByBatchIdIfOrphaned.mockResolvedValue(10)

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {})

      await service.cleanupOrphanedResponses()

      // Should log the batch deletion with count and assessment info
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Deleted 10 response(s) for orphaned batch batch-abc-123')
      )
    })

    it('should log summary after cleanup', async () => {
      const orphans = [
        orphanRef('a1', 'b1'),
        orphanRef('a2', 'b2'),
        orphanRef('a3', 'b3'),
      ]
      mockResponseRepo.findOrphanedBatches.mockResolvedValue(orphans)
      mockResponseRepo.deleteByBatchIdIfOrphaned.mockResolvedValue(2)

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {})

      await service.cleanupOrphanedResponses()

      // Should log the final summary
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Cleanup complete: 6 total response(s) deleted from 3 batch(es)')
      )
    })

    it('should use default 24h retention when env var not set', async () => {
      mockResponseRepo.findOrphanedBatches.mockResolvedValue([])

      await service.cleanupOrphanedResponses()

      // Should call findOrphanedBatches with 24 hours
      expect(mockResponseRepo.findOrphanedBatches).toHaveBeenCalledWith(24)
    })

    it('should use env var for retention hours when set', async () => {
      process.env.ORPHAN_CLEANUP_RETENTION_HOURS = '48'
      mockResponseRepo.findOrphanedBatches.mockResolvedValue([])

      // Need to create new service instance to pick up env var
      const serviceWithEnv = new OrphanCleanupService(mockResponseRepo)
      await serviceWithEnv.cleanupOrphanedResponses()

      expect(mockResponseRepo.findOrphanedBatches).toHaveBeenCalledWith(48)
    })

    it('should use default when env var is invalid', async () => {
      process.env.ORPHAN_CLEANUP_RETENTION_HOURS = 'invalid'
      mockResponseRepo.findOrphanedBatches.mockResolvedValue([])

      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})

      const serviceWithBadEnv = new OrphanCleanupService(mockResponseRepo)
      await serviceWithBadEnv.cleanupOrphanedResponses()

      // Should warn about invalid value
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Invalid ORPHAN_CLEANUP_RETENTION_HOURS')
      )

      // Should use default 24
      expect(mockResponseRepo.findOrphanedBatches).toHaveBeenCalledWith(24)
    })

    it('should use default when env var is negative', async () => {
      process.env.ORPHAN_CLEANUP_RETENTION_HOURS = '-5'
      mockResponseRepo.findOrphanedBatches.mockResolvedValue([])

      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})

      const serviceWithNegative = new OrphanCleanupService(mockResponseRepo)
      await serviceWithNegative.cleanupOrphanedResponses()

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Invalid ORPHAN_CLEANUP_RETENTION_HOURS')
      )
      expect(mockResponseRepo.findOrphanedBatches).toHaveBeenCalledWith(24)
    })

    it('should use default when env var is zero', async () => {
      process.env.ORPHAN_CLEANUP_RETENTION_HOURS = '0'
      mockResponseRepo.findOrphanedBatches.mockResolvedValue([])

      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})

      const serviceWithZero = new OrphanCleanupService(mockResponseRepo)
      await serviceWithZero.cleanupOrphanedResponses()

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Invalid ORPHAN_CLEANUP_RETENTION_HOURS')
      )
      expect(mockResponseRepo.findOrphanedBatches).toHaveBeenCalledWith(24)
    })

    it('should handle race condition gracefully - batch no longer orphaned', async () => {
      // Batch was orphaned when findOrphanedBatches ran, but assessment_result
      // was created before deleteByBatchIdIfOrphaned (race condition)
      const orphan = orphanRef('assess-race', 'batch-race')
      mockResponseRepo.findOrphanedBatches.mockResolvedValue([orphan])
      mockResponseRepo.deleteByBatchIdIfOrphaned.mockResolvedValue(0) // 0 = not orphaned anymore

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {})

      const result = await service.cleanupOrphanedResponses()

      // Should NOT include the batch in results since it wasn't actually deleted
      expect(result.deletedCount).toBe(0)
      expect(result.batchIds).toEqual([]) // Empty because delete returned 0

      // Should log that the batch was skipped
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Skipped batch batch-race')
      )
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('no longer orphaned')
      )
    })

    it('should log retention window at start', async () => {
      process.env.ORPHAN_CLEANUP_RETENTION_HOURS = '12'
      mockResponseRepo.findOrphanedBatches.mockResolvedValue([])

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {})

      const serviceWith12h = new OrphanCleanupService(mockResponseRepo)
      await serviceWith12h.cleanupOrphanedResponses()

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Starting cleanup with 12h retention window')
      )
    })

    it('should only include actually deleted batches in result', async () => {
      // Mix of orphaned and race-condition batches
      const orphans = [
        orphanRef('a1', 'b1'),
        orphanRef('a2', 'b2'),
        orphanRef('a3', 'b3'),
      ]
      mockResponseRepo.findOrphanedBatches.mockResolvedValue(orphans)
      mockResponseRepo.deleteByBatchIdIfOrphaned
        .mockResolvedValueOnce(5) // b1: actually deleted
        .mockResolvedValueOnce(0) // b2: race condition, not deleted
        .mockResolvedValueOnce(3) // b3: actually deleted

      const result = await service.cleanupOrphanedResponses()

      expect(result.deletedCount).toBe(8) // 5 + 3
      expect(result.batchIds).toEqual(['b1', 'b3']) // b2 excluded
    })
  })
})
