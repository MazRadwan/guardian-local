/**
 * Unit tests for TextExtractionService
 *
 * Epic 18: Tests text extraction from PDF and DOCX documents.
 * Uses mocks for reliable testing - avoids dependency on specific PDF/DOCX parsers.
 */

import { TextExtractionService } from '../../../../src/infrastructure/extraction/TextExtractionService'
import {
  createMinimalDocx,
  createLargeText,
  createMinimalPng,
} from '../../../fixtures/synthetic-documents'

describe('TextExtractionService', () => {
  let service: TextExtractionService

  beforeEach(() => {
    service = new TextExtractionService()
  })

  describe('extract', () => {
    describe('PDF extraction', () => {
      it('should extract text from a valid PDF (mocked)', async () => {
        // Mock the private extractPdfText method for reliable testing
        const serviceCast = service as unknown as {
          extractPdfText: (buffer: Buffer) => Promise<string>
        }
        jest.spyOn(serviceCast, 'extractPdfText').mockResolvedValue('Hello World Test Content')

        const buffer = Buffer.from('fake pdf')
        const result = await service.extract(buffer, 'pdf')

        expect(result.success).toBe(true)
        expect(result.excerpt).toContain('Hello World')
        expect(result.excerpt.length).toBeLessThanOrEqual(10000)
        expect(result.extractionMs).toBeGreaterThanOrEqual(0)
      })

      it('should truncate PDF text to 10k chars', async () => {
        const largeText = createLargeText(15000)
        const serviceCast = service as unknown as {
          extractPdfText: (buffer: Buffer) => Promise<string>
        }
        jest.spyOn(serviceCast, 'extractPdfText').mockResolvedValue(largeText)

        const buffer = Buffer.from('fake pdf')
        const result = await service.extract(buffer, 'pdf')

        expect(result.success).toBe(true)
        expect(result.excerpt.length).toBe(10000)
        expect(result.fullLength).toBeGreaterThan(10000)
      })

      it('should return error result for PDF extraction failure', async () => {
        const serviceCast = service as unknown as {
          extractPdfText: (buffer: Buffer) => Promise<string>
        }
        jest.spyOn(serviceCast, 'extractPdfText').mockRejectedValue(new Error('PDF parse failed'))

        const buffer = Buffer.from('not a valid pdf')
        const result = await service.extract(buffer, 'pdf')

        expect(result.success).toBe(false)
        expect(result.error).toContain('PDF parse failed')
        expect(result.excerpt).toBe('')
      })
    })

    describe('DOCX extraction', () => {
      it('should extract text from a valid DOCX', async () => {
        const testText = 'Test DOCX Content'
        const buffer = await createMinimalDocx(testText)

        const result = await service.extract(buffer, 'docx')

        expect(result.success).toBe(true)
        expect(result.excerpt).toContain('Test DOCX Content')
      })

      it('should truncate DOCX text to 10k chars', async () => {
        const largeText = createLargeText(15000)
        const buffer = await createMinimalDocx(largeText)

        const result = await service.extract(buffer, 'docx')

        expect(result.success).toBe(true)
        expect(result.excerpt.length).toBe(10000)
        expect(result.fullLength).toBeGreaterThan(10000)
      })

      it('should handle special characters in DOCX', async () => {
        const testText = 'Special chars: <>&"\''
        const buffer = await createMinimalDocx(testText)

        const result = await service.extract(buffer, 'docx')

        expect(result.success).toBe(true)
        // Note: XML escaping is handled by createMinimalDocx
      })

      it('should return error result for invalid DOCX', async () => {
        const buffer = Buffer.from('not a valid docx')

        const result = await service.extract(buffer, 'docx')

        expect(result.success).toBe(false)
        expect(result.error).toBeDefined()
        expect(result.excerpt).toBe('')
      })
    })

    describe('image handling', () => {
      it('should return empty string for images', async () => {
        const buffer = createMinimalPng()

        const result = await service.extract(buffer, 'image')

        expect(result.success).toBe(true)
        expect(result.excerpt).toBe('')
        expect(result.fullLength).toBe(0)
      })
    })

    describe('timeout handling', () => {
      it('should handle timeout gracefully', async () => {
        // Mock the private extractPdfText method to simulate slow operation
        const serviceCast = service as unknown as {
          extractPdfText: (buffer: Buffer) => Promise<string>
        }
        jest.spyOn(serviceCast, 'extractPdfText').mockImplementation(
          () => new Promise((resolve) => setTimeout(() => resolve('text'), 5000))
        )

        const buffer = Buffer.from('fake pdf')
        const result = await service.extract(buffer, 'pdf')

        expect(result.success).toBe(false)
        expect(result.error).toContain('timeout')
        expect(result.extractionMs).toBeGreaterThanOrEqual(3000)
        expect(result.extractionMs).toBeLessThan(5000) // Should timeout before completion
      }, 10000) // Increase test timeout
    })

    describe('timing metrics', () => {
      it('should report extraction time', async () => {
        const serviceCast = service as unknown as {
          extractPdfText: (buffer: Buffer) => Promise<string>
        }
        jest.spyOn(serviceCast, 'extractPdfText').mockResolvedValue('Quick test content')

        const buffer = Buffer.from('fake pdf')
        const result = await service.extract(buffer, 'pdf')

        expect(result.success).toBe(true)
        expect(result.extractionMs).toBeGreaterThanOrEqual(0)
        expect(result.extractionMs).toBeLessThan(3000) // Should be well under timeout
      })
    })
  })
})
