/**
 * Unit tests for DocxImageDetector
 *
 * Epic 39: Tests image detection in docx questionnaire responses.
 * Mocks mammoth.convertToHtml to avoid dependency on real docx files.
 */

import mammoth from 'mammoth'
import {
  DocxImageDetector,
  type ImageDetectionResult,
} from '../../../../src/infrastructure/extraction/DocxImageDetector'

// Mock mammoth module
jest.mock('mammoth', () => ({
  __esModule: true,
  default: {
    convertToHtml: jest.fn(),
  },
}))

const mockConvertToHtml = mammoth.convertToHtml as jest.MockedFunction<
  typeof mammoth.convertToHtml
>

describe('DocxImageDetector', () => {
  let detector: DocxImageDetector
  const fakeBuffer = Buffer.from('fake docx content')

  beforeEach(() => {
    detector = new DocxImageDetector()
    jest.clearAllMocks()
  })

  describe('detect', () => {
    it('should detect an image in a question response', async () => {
      const html = [
        '<p>Question 1.1</p>',
        '<p>Some text answer</p>',
        '<p>Question 1.2</p>',
        '<p>Here is the diagram:</p>',
        '<img src="data:image/png;base64,iVBOR..." />',
      ].join('')

      mockConvertToHtml.mockResolvedValue({ value: html, messages: [] })

      const result: ImageDetectionResult = await detector.detect(fakeBuffer)

      expect(result.questionImages.get('1.1')?.hasVisualContent).toBe(false)
      expect(result.questionImages.get('1.2')?.hasVisualContent).toBe(true)
      expect(result.totalImagesDetected).toBe(1)
    })

    it('should return empty map when no images are detected', async () => {
      const html = [
        '<p>Question 2.1</p>',
        '<p>Text only response</p>',
        '<p>Question 2.2</p>',
        '<p>Another text response</p>',
      ].join('')

      mockConvertToHtml.mockResolvedValue({ value: html, messages: [] })

      const result = await detector.detect(fakeBuffer)

      expect(result.questionImages.get('2.1')?.hasVisualContent).toBe(false)
      expect(result.questionImages.get('2.2')?.hasVisualContent).toBe(false)
      expect(result.totalImagesDetected).toBe(0)
    })

    it('should flag image-only response (no text, only image)', async () => {
      const html = [
        '<p>Question 3.1</p>',
        '<img src="data:image/png;base64,abc123" />',
        '<p>Question 3.2</p>',
        '<p>Normal text answer</p>',
      ].join('')

      mockConvertToHtml.mockResolvedValue({ value: html, messages: [] })

      const result = await detector.detect(fakeBuffer)

      expect(result.questionImages.get('3.1')?.hasVisualContent).toBe(true)
      expect(result.questionImages.get('3.2')?.hasVisualContent).toBe(false)
      expect(result.totalImagesDetected).toBe(1)
    })

    it('should flag response with both text and image', async () => {
      const html = [
        '<p>Question 4.1</p>',
        '<p>The vendor uses the following architecture:</p>',
        '<img src="data:image/jpeg;base64,/9j/4AAQ..." />',
        '<p>As shown above, the system is distributed across 3 regions.</p>',
      ].join('')

      mockConvertToHtml.mockResolvedValue({ value: html, messages: [] })

      const result = await detector.detect(fakeBuffer)

      expect(result.questionImages.get('4.1')?.hasVisualContent).toBe(true)
      expect(result.totalImagesDetected).toBe(1)
    })

    it('should handle multiple questions with mixed image/no-image responses', async () => {
      const html = [
        '<p>Question 1.1</p>',
        '<p>Text only</p>',
        '<p>Question 1.2</p>',
        '<img src="data:image/png;base64,diagram1" />',
        '<p>Question 1.3</p>',
        '<p>Another text response</p>',
        '<p>Question 2.1</p>',
        '<img src="data:image/png;base64,diagram2" />',
        '<p>Question 2.2</p>',
        '<p>Final text answer</p>',
      ].join('')

      mockConvertToHtml.mockResolvedValue({ value: html, messages: [] })

      const result = await detector.detect(fakeBuffer)

      expect(result.questionImages.size).toBe(5)
      expect(result.questionImages.get('1.1')?.hasVisualContent).toBe(false)
      expect(result.questionImages.get('1.2')?.hasVisualContent).toBe(true)
      expect(result.questionImages.get('1.3')?.hasVisualContent).toBe(false)
      expect(result.questionImages.get('2.1')?.hasVisualContent).toBe(true)
      expect(result.questionImages.get('2.2')?.hasVisualContent).toBe(false)
      expect(result.totalImagesDetected).toBe(2)
    })

    it('should handle mammoth conversion failure gracefully', async () => {
      mockConvertToHtml.mockRejectedValue(new Error('Invalid docx file'))

      const result = await detector.detect(fakeBuffer)

      expect(result.questionImages.size).toBe(0)
      expect(result.totalImagesDetected).toBe(0)
    })

    it('should return correct totalImagesDetected count', async () => {
      const html = [
        '<p>Question 5.1</p>',
        '<img src="data:image/png;base64,img1" />',
        '<p>Question 5.2</p>',
        '<img src="data:image/png;base64,img2" />',
        '<p>Question 5.3</p>',
        '<img src="data:image/png;base64,img3" />',
      ].join('')

      mockConvertToHtml.mockResolvedValue({ value: html, messages: [] })

      const result = await detector.detect(fakeBuffer)

      expect(result.totalImagesDetected).toBe(3)
      expect(result.questionImages.get('5.1')?.hasVisualContent).toBe(true)
      expect(result.questionImages.get('5.2')?.hasVisualContent).toBe(true)
      expect(result.questionImages.get('5.3')?.hasVisualContent).toBe(true)
    })

    it('should return empty result when HTML has no question markers', async () => {
      const html = '<p>This document has no question markers at all.</p>'

      mockConvertToHtml.mockResolvedValue({ value: html, messages: [] })

      const result = await detector.detect(fakeBuffer)

      expect(result.questionImages.size).toBe(0)
      expect(result.totalImagesDetected).toBe(0)
    })

    it('should handle Question markers with varying whitespace', async () => {
      const html = [
        '<p>Question  6.1</p>',
        '<img src="data:image/png;base64,imgA" />',
        '<p>Question   6.2</p>',
        '<p>Text only</p>',
      ].join('')

      mockConvertToHtml.mockResolvedValue({ value: html, messages: [] })

      const result = await detector.detect(fakeBuffer)

      expect(result.questionImages.get('6.1')?.hasVisualContent).toBe(true)
      expect(result.questionImages.get('6.2')?.hasVisualContent).toBe(false)
      expect(result.totalImagesDetected).toBe(1)
    })

    it('should handle the last question having an image after it', async () => {
      // The last question block extends to end-of-HTML
      const html = [
        '<p>Question 7.1</p>',
        '<p>Text answer</p>',
        '<p>Question 7.2</p>',
        '<p>Description of network:</p>',
        '<img src="data:image/png;base64,lastImg" />',
      ].join('')

      mockConvertToHtml.mockResolvedValue({ value: html, messages: [] })

      const result = await detector.detect(fakeBuffer)

      expect(result.questionImages.get('7.1')?.hasVisualContent).toBe(false)
      expect(result.questionImages.get('7.2')?.hasVisualContent).toBe(true)
      expect(result.totalImagesDetected).toBe(1)
    })

    it('should pass the buffer to mammoth.convertToHtml', async () => {
      mockConvertToHtml.mockResolvedValue({ value: '<p>No markers</p>', messages: [] })

      await detector.detect(fakeBuffer)

      expect(mockConvertToHtml).toHaveBeenCalledWith({ buffer: fakeBuffer })
      expect(mockConvertToHtml).toHaveBeenCalledTimes(1)
    })
  })
})
