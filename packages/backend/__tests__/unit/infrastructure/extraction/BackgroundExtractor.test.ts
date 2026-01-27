/**
 * Unit tests for BackgroundExtractor
 *
 * Epic 31: Background text extraction service
 * Sprint 1 Fix: Now also tests classification backfill
 * Tests fire-and-forget behavior, success/failure handling, and logging
 */

import { BackgroundExtractor } from '../../../../src/infrastructure/extraction/BackgroundExtractor.js'
import type { ITextExtractionService, ExtractionResult } from '../../../../src/application/interfaces/ITextExtractionService.js'
import type { IFileRepository, DetectedDocType } from '../../../../src/application/interfaces/IFileRepository.js'

// Helper for deterministic async testing
// Uses setImmediate to flush the microtask queue
const flushPromises = () => new Promise(resolve => setImmediate(resolve))

describe('BackgroundExtractor', () => {
  let mockTextExtractionService: jest.Mocked<ITextExtractionService>
  let mockFileRepository: jest.Mocked<Pick<IFileRepository, 'updateExcerptAndClassification'>>
  let extractor: BackgroundExtractor

  beforeEach(() => {
    mockTextExtractionService = {
      extract: jest.fn(),
    }
    mockFileRepository = {
      updateExcerptAndClassification: jest.fn(),
    }
    extractor = new BackgroundExtractor(
      mockTextExtractionService,
      mockFileRepository as unknown as IFileRepository
    )
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  describe('queueExtraction', () => {
    it('should queue extraction and update file with excerpt AND classification when complete', async () => {
      const mockResult: ExtractionResult = {
        success: true,
        excerpt: 'Question: What is your security policy?\nResponse: We follow ISO 27001',
        fullLength: 100,
        extractionMs: 100,
      }
      mockTextExtractionService.extract.mockResolvedValue(mockResult)
      mockFileRepository.updateExcerptAndClassification.mockResolvedValue(undefined)

      // Suppress console logs during test
      jest.spyOn(console, 'log').mockImplementation()

      // Call fire-and-forget method (now includes mimeType)
      extractor.queueExtraction('file-uuid-123', Buffer.from('test'), 'pdf', 'application/pdf')

      // Flush all pending promises
      await flushPromises()

      expect(mockTextExtractionService.extract).toHaveBeenCalledWith(
        Buffer.from('test'),
        'pdf'
      )
      // Sprint 1 Fix: Should call updateExcerptAndClassification with excerpt AND classification
      expect(mockFileRepository.updateExcerptAndClassification).toHaveBeenCalledWith(
        'file-uuid-123',
        {
          textExcerpt: expect.any(String),
          detectedDocType: 'questionnaire', // Question/Response patterns trigger this
          detectedVendorName: null, // No vendor pattern in this excerpt
        }
      )
    })

    it('should classify questionnaire content correctly', async () => {
      // Questionnaire indicators: "Question", "Response", security keyword
      const questionnaireExcerpt = 'Question: What is your security policy?\nResponse: We have SOC 2 compliance.';
      const mockResult: ExtractionResult = {
        success: true,
        excerpt: questionnaireExcerpt,
        fullLength: questionnaireExcerpt.length,
        extractionMs: 50,
      }
      mockTextExtractionService.extract.mockResolvedValue(mockResult)
      mockFileRepository.updateExcerptAndClassification.mockResolvedValue(undefined)

      // Suppress console logs during test
      jest.spyOn(console, 'log').mockImplementation()

      extractor.queueExtraction('file-456', Buffer.from('content'), 'docx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')

      await flushPromises()

      // Should classify as questionnaire (Excel MIME + Question/Response patterns)
      expect(mockFileRepository.updateExcerptAndClassification).toHaveBeenCalledWith(
        'file-456',
        expect.objectContaining({
          textExcerpt: questionnaireExcerpt,
          detectedDocType: 'questionnaire',
        })
      )
    })

    it('should extract vendor name from document', async () => {
      const excerptWithVendor = 'Vendor: Acme Corp\nThis is a security questionnaire response.';
      const mockResult: ExtractionResult = {
        success: true,
        excerpt: excerptWithVendor,
        fullLength: excerptWithVendor.length,
        extractionMs: 50,
      }
      mockTextExtractionService.extract.mockResolvedValue(mockResult)
      mockFileRepository.updateExcerptAndClassification.mockResolvedValue(undefined)

      jest.spyOn(console, 'log').mockImplementation()

      extractor.queueExtraction('file-vendor', Buffer.from('test'), 'pdf', 'application/pdf')

      await flushPromises()

      expect(mockFileRepository.updateExcerptAndClassification).toHaveBeenCalledWith(
        'file-vendor',
        expect.objectContaining({
          textExcerpt: excerptWithVendor,
          detectedVendorName: 'Acme Corp',
        })
      )
    })

    it('should not update fileRepository when extraction has empty excerpt', async () => {
      // For images, TextExtractionService returns success: true but empty excerpt
      const mockResult: ExtractionResult = {
        success: true,
        excerpt: '',
        fullLength: 0,
        extractionMs: 5,
      }
      mockTextExtractionService.extract.mockResolvedValue(mockResult)

      // Suppress console logs during test (including warning for empty excerpt)
      jest.spyOn(console, 'log').mockImplementation()
      jest.spyOn(console, 'warn').mockImplementation()

      extractor.queueExtraction('image-file', Buffer.from([0x89, 0x50]), 'image', 'image/png')

      await flushPromises()

      // Should not update when excerpt is empty
      expect(mockFileRepository.updateExcerptAndClassification).not.toHaveBeenCalled()
    })

    it('should log warning on extraction failure (not throw)', async () => {
      const mockResult: ExtractionResult = {
        success: false,
        excerpt: '',
        fullLength: 0,
        extractionMs: 100,
        error: 'Extraction failed',
      }
      mockTextExtractionService.extract.mockResolvedValue(mockResult)

      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation()
      jest.spyOn(console, 'log').mockImplementation()

      extractor.queueExtraction('file-789', Buffer.from('bad'), 'pdf', 'application/pdf')

      await flushPromises()

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Extraction failed for fileId=file-789')
      )
      expect(mockFileRepository.updateExcerptAndClassification).not.toHaveBeenCalled()
    })

    it('should handle extraction service exception gracefully', async () => {
      mockTextExtractionService.extract.mockRejectedValue(new Error('Parse error'))

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation()
      jest.spyOn(console, 'log').mockImplementation()

      extractor.queueExtraction('file-error', Buffer.from('corrupt'), 'pdf', 'application/pdf')

      await flushPromises()

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Error for fileId=file-error'),
        expect.any(Error)
      )
      expect(mockFileRepository.updateExcerptAndClassification).not.toHaveBeenCalled()
    })

    it('should handle repository update failure gracefully', async () => {
      const mockResult: ExtractionResult = {
        success: true,
        excerpt: 'Good text with security keywords',
        fullLength: 32,
        extractionMs: 50,
      }
      mockTextExtractionService.extract.mockResolvedValue(mockResult)
      mockFileRepository.updateExcerptAndClassification.mockRejectedValue(new Error('DB error'))

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation()
      jest.spyOn(console, 'log').mockImplementation()

      extractor.queueExtraction('file-000', Buffer.from('test'), 'pdf', 'application/pdf')

      await flushPromises()

      // Error is caught by inner try/catch, logs "Error for fileId="
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Error for fileId=file-000'),
        expect.any(Error)
      )
    })

    it('should log timing information with docType on success', async () => {
      const mockResult: ExtractionResult = {
        success: true,
        excerpt: 'Question: Test\nResponse: Yes, we have security.',
        fullLength: 50,
        extractionMs: 100,
      }
      mockTextExtractionService.extract.mockResolvedValue(mockResult)
      mockFileRepository.updateExcerptAndClassification.mockResolvedValue(undefined)

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation()

      extractor.queueExtraction('timing-test', Buffer.from('test'), 'docx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')

      await flushPromises()

      // Check START log
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringMatching(/\[TIMING\] BackgroundExtractor START: \d+ \(fileId: timing-test\)/)
      )

      // Sprint 1 Fix: Check SUCCESS log with duration AND docType
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringMatching(/\[TIMING\] BackgroundExtractor SUCCESS: \d+ \(fileId: timing-test, duration: \d+ms, docType: \w+\)/)
      )
    })

    it('should return immediately without waiting for extraction', () => {
      // Create a slow extraction that never resolves quickly
      mockTextExtractionService.extract.mockImplementation(
        () => new Promise(() => {}) // Never resolves
      )

      jest.spyOn(console, 'log').mockImplementation()

      // This should return immediately (fire-and-forget)
      const startTime = Date.now()
      extractor.queueExtraction('slow-file', Buffer.from('test'), 'pdf', 'application/pdf')
      const elapsed = Date.now() - startTime

      // Should complete in less than 10ms (synchronous return)
      expect(elapsed).toBeLessThan(10)
    })
  })
})
