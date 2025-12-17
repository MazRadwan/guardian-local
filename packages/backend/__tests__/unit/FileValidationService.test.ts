import { FileValidationService } from '../../src/application/services/FileValidationService';

describe('FileValidationService', () => {
  let service: FileValidationService;

  beforeEach(() => {
    service = new FileValidationService();
  });

  describe('quickValidateByExtensionAndSize', () => {
    it('should accept valid PDF', () => {
      const result = service.quickValidateByExtensionAndSize(
        1024 * 1024, // 1MB
        'document.pdf'
      );
      expect(result.valid).toBe(true);
      expect(result.documentType).toBe('pdf');
    });

    it('should accept valid DOCX', () => {
      const result = service.quickValidateByExtensionAndSize(
        1024 * 1024,
        'document.docx'
      );
      expect(result.valid).toBe(true);
      expect(result.documentType).toBe('docx');
    });

    it('should accept valid PNG', () => {
      const result = service.quickValidateByExtensionAndSize(
        1024 * 1024,
        'screenshot.png'
      );
      expect(result.valid).toBe(true);
      expect(result.documentType).toBe('image');
    });

    it('should reject unsupported extension', () => {
      const result = service.quickValidateByExtensionAndSize(
        1024,
        'data.json'
      );
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Unsupported');
    });

    it('should reject legacy .doc format', () => {
      const result = service.quickValidateByExtensionAndSize(
        1024 * 1024,
        'legacy.doc'
      );
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Unsupported');
    });

    it('should reject oversized PDF', () => {
      const result = service.quickValidateByExtensionAndSize(
        25 * 1024 * 1024, // 25MB (over 20MB limit)
        'huge.pdf'
      );
      expect(result.valid).toBe(false);
      expect(result.error).toContain('exceeds');
    });

    it('should reject oversized image', () => {
      const result = service.quickValidateByExtensionAndSize(
        15 * 1024 * 1024, // 15MB (over 10MB limit)
        'huge.png'
      );
      expect(result.valid).toBe(false);
      expect(result.error).toContain('exceeds');
    });
  });

  describe('validate (full)', () => {
    it('should reject empty file', async () => {
      const result = await service.validate(
        Buffer.alloc(0),
        'application/pdf',
        'empty.pdf'
      );
      expect(result.valid).toBe(false);
      expect(result.error).toContain('empty');
    });

    it('should reject tiny file as corrupt', async () => {
      const result = await service.validate(
        Buffer.from('tiny'),
        'application/pdf',
        'tiny.pdf'
      );
      expect(result.valid).toBe(false);
      expect(result.error).toContain('corrupt');
    });

    it('should accept valid DOCX even when detected as zip', async () => {
      // DOCX files are ZIP archives - file-type may detect them as application/zip
      // Create a minimal ZIP header to simulate this scenario
      const zipHeader = Buffer.from([0x50, 0x4b, 0x03, 0x04]); // PK ZIP magic
      const docxBuffer = Buffer.concat([zipHeader, Buffer.alloc(200, 0)]);

      const result = await service.validate(
        docxBuffer,
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'document.docx'
      );

      // Should not reject valid DOCX even if detected as zip
      // The extension should be trusted for DOCX
      expect(result.documentType).toBe('docx');
    });

    it('should warn when extension and detected type mismatch', async () => {
      // Create a PNG header but name it .pdf
      const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      const fakeBuffer = Buffer.concat([pngHeader, Buffer.alloc(200, 0)]);

      const result = await service.validate(
        fakeBuffer,
        'application/pdf',
        'fake.pdf'
      );

      // Should include warning about mismatch
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it('should reject EXE bytes disguised as PDF (security)', async () => {
      // Create a Windows PE/EXE header (MZ magic bytes) but name it .pdf
      const exeHeader = Buffer.from([0x4d, 0x5a]); // MZ - PE executable header
      const maliciousBuffer = Buffer.concat([exeHeader, Buffer.alloc(200, 0)]);

      const result = await service.validate(
        maliciousBuffer,
        'application/pdf',
        'virus.pdf'
      );

      // Should reject - EXE is not a supported type
      expect(result.valid).toBe(false);
      expect(result.error).toContain('does not match a supported type');
      expect(result.error).toContain('exe');
    });

    it('should reject ELF bytes disguised as PNG (security)', async () => {
      // Create a Linux ELF header but name it .png
      const elfHeader = Buffer.from([0x7f, 0x45, 0x4c, 0x46]); // \x7FELF
      const maliciousBuffer = Buffer.concat([elfHeader, Buffer.alloc(200, 0)]);

      const result = await service.validate(
        maliciousBuffer,
        'image/png',
        'image.png'
      );

      // Should reject - ELF executable is not a supported type
      expect(result.valid).toBe(false);
      expect(result.error).toContain('does not match a supported type');
    });

    it('should accept valid PDF with correct magic bytes', async () => {
      // Create valid PDF header
      const pdfHeader = Buffer.from([0x25, 0x50, 0x44, 0x46]); // %PDF
      const validPdf = Buffer.concat([pdfHeader, Buffer.alloc(200, 0)]);

      const result = await service.validate(
        validPdf,
        'application/pdf',
        'document.pdf'
      );

      expect(result.valid).toBe(true);
      expect(result.documentType).toBe('pdf');
    });
  });
});
