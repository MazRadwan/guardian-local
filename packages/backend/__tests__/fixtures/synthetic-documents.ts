/**
 * Synthetic Document Fixtures for Testing
 *
 * Epic 18: Creates in-memory test documents for TextExtractionService tests.
 * Avoids binary test assets per Sprint 0 privacy guidance.
 */

import PDFDocument from 'pdfkit'
import JSZip from 'jszip'

/**
 * Generate a valid PDF in memory using pdfkit
 *
 * Creates a real PDF that pdf-parse can actually read.
 */
export async function createMinimalPdf(text: string = 'Test content'): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument()
    const chunks: Buffer[] = []

    doc.on('data', (chunk: Buffer) => chunks.push(chunk))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    // Add text to the PDF
    doc.text(text)
    doc.end()
  })
}

/**
 * Generate a valid DOCX in memory using jszip
 *
 * Creates a minimal DOCX structure that mammoth can extract text from.
 * DOCX is a ZIP archive with XML files inside.
 */
export async function createMinimalDocx(text: string = 'Test content'): Promise<Buffer> {
  const zip = new JSZip()

  // [Content_Types].xml - Required file types declaration
  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`
  )

  // _rels/.rels - Package relationships
  zip.file(
    '_rels/.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`
  )

  // word/document.xml - The actual document content
  // Escape XML special characters in text
  const escapedText = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')

  zip.file(
    'word/document.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:r>
        <w:t>${escapedText}</w:t>
      </w:r>
    </w:p>
  </w:body>
</w:document>`
  )

  return await zip.generateAsync({ type: 'nodebuffer' })
}

/**
 * Generate large text content for truncation tests
 *
 * @param targetLength - Approximate length of text to generate
 */
export function createLargeText(targetLength: number = 15000): string {
  const paragraph = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. '
  const repetitions = Math.ceil(targetLength / paragraph.length)
  return paragraph.repeat(repetitions).slice(0, targetLength)
}

/**
 * Create a minimal valid PNG image (1x1 transparent pixel)
 */
export function createMinimalPng(): Buffer {
  // Minimal PNG: 1x1 transparent pixel
  // This is a valid PNG that can be parsed but contains no text
  return Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // PNG signature
    0x00, 0x00, 0x00, 0x0d, // IHDR length
    0x49, 0x48, 0x44, 0x52, // IHDR
    0x00, 0x00, 0x00, 0x01, // width: 1
    0x00, 0x00, 0x00, 0x01, // height: 1
    0x08, 0x04, // bit depth: 8, color type: 4 (grayscale + alpha)
    0x00, 0x00, 0x00, // compression, filter, interlace
    0xb5, 0x1c, 0x0c, 0x02, // IHDR CRC
    0x00, 0x00, 0x00, 0x0b, // IDAT length
    0x49, 0x44, 0x41, 0x54, // IDAT
    0x08, 0x99, 0x63, 0x62, 0x60, 0x60, 0x00, 0x00, 0x00, 0x05, 0x00, 0x01, // compressed data
    0x5a, 0xad, 0x56, 0xe8, // IDAT CRC
    0x00, 0x00, 0x00, 0x00, // IEND length
    0x49, 0x45, 0x4e, 0x44, // IEND
    0xae, 0x42, 0x60, 0x82, // IEND CRC
  ])
}
