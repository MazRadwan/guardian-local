/**
 * Mock for file-type package (ESM-only)
 * Used to avoid Jest ESM transformation issues
 */

export interface FileTypeResult {
  ext: string;
  mime: string;
}

// Magic byte patterns for detection
const MAGIC_PATTERNS: Array<{
  header: number[];
  ext: string;
  mime: string;
}> = [
  // PDF: %PDF
  { header: [0x25, 0x50, 0x44, 0x46], ext: 'pdf', mime: 'application/pdf' },
  // PNG: \x89PNG
  { header: [0x89, 0x50, 0x4e, 0x47], ext: 'png', mime: 'image/png' },
  // JPEG: \xFF\xD8\xFF
  { header: [0xff, 0xd8, 0xff], ext: 'jpg', mime: 'image/jpeg' },
  // ZIP (and DOCX): PK
  { header: [0x50, 0x4b, 0x03, 0x04], ext: 'zip', mime: 'application/zip' },
];

export async function fileTypeFromBuffer(
  buffer: Buffer | Uint8Array
): Promise<FileTypeResult | undefined> {
  if (!buffer || buffer.length < 4) {
    return undefined;
  }

  for (const pattern of MAGIC_PATTERNS) {
    let matches = true;
    for (let i = 0; i < pattern.header.length; i++) {
      if (buffer[i] !== pattern.header[i]) {
        matches = false;
        break;
      }
    }
    if (matches) {
      return { ext: pattern.ext, mime: pattern.mime };
    }
  }

  return undefined;
}
