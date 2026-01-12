/**
 * Epic 18.4: Vendor Validation Service
 *
 * Validates that uploaded files belong to a single vendor.
 * Supports single-vendor scoring enforcement by detecting when files
 * have different detectedVendorName values.
 *
 * Rules:
 * - All files with same explicit vendorName = valid (single vendor)
 * - All files with null/undefined/empty vendorName = valid (all unknown)
 * - Mix of explicit + null = valid (treat null as belonging to explicit)
 * - Different explicit vendorNames = invalid (multiple vendors)
 */
import type { IFileRepository, FileRecord } from '../interfaces/IFileRepository.js';
import type { VendorInfo } from '../../domain/types/QuestionnaireSchema.js';

/**
 * Result of vendor validation
 */
export interface VendorValidationResult {
  /** Whether all files belong to a single vendor */
  valid: boolean;
  /** If valid with single explicit vendor, the vendor name */
  vendorName?: string;
  /** If invalid (multiple vendors), the list of vendors sorted by file count */
  vendors?: VendorInfo[];
}

export class VendorValidationService {
  constructor(private readonly fileRepository: IFileRepository) {}

  /**
   * Validates that all files belong to a single vendor.
   *
   * Rules:
   * - All files with same explicit vendorName = valid (single vendor)
   * - All files with null/undefined vendorName = valid (all unknown)
   * - Mix of explicit + null = valid (treat null as belonging to explicit)
   * - Different explicit vendorNames = invalid (multiple vendors)
   *
   * @param fileIds - Array of file IDs to validate
   * @returns Validation result with vendor info
   */
  async validateSingleVendor(fileIds: string[]): Promise<VendorValidationResult> {
    // Empty list is valid (no files to validate)
    if (fileIds.length === 0) {
      return { valid: true };
    }

    // Fetch files from repository
    const files = await this.fileRepository.findByIds(fileIds);

    // No files found (all IDs were invalid) - treat as valid
    if (files.length === 0) {
      return { valid: true };
    }

    // Group files by normalized vendor name (for comparison)
    // Returns Map with normalized key and { displayName, files } value
    const vendorGroups = this.groupByVendor(files);

    // Filter to only explicit vendor names (non-null key = has vendor)
    const explicitVendors = Array.from(vendorGroups.entries()).filter(
      ([normalizedKey]) => normalizedKey !== null
    );

    // Case 1: No explicit vendors (all unknown) - valid
    if (explicitVendors.length === 0) {
      return { valid: true };
    }

    // Case 2: Single explicit vendor - valid
    if (explicitVendors.length === 1) {
      const [, { displayName }] = explicitVendors[0];
      return { valid: true, vendorName: displayName };
    }

    // Case 3: Multiple explicit vendors - invalid
    const vendors: VendorInfo[] = explicitVendors.map(([, { displayName, files: fileList }]) => ({
      name: displayName,
      fileCount: fileList.length,
      fileIds: fileList.map((f) => f.id),
    }));

    // Sort by file count descending (most files first)
    vendors.sort((a, b) => b.fileCount - a.fileCount);

    return { valid: false, vendors };
  }

  /**
   * Groups files by their detected vendor name.
   * Uses normalized key (lowercase, trimmed) for comparison to prevent false
   * multi-vendor failures (e.g., "Acme", "ACME", "Acme " are the same vendor).
   * Preserves original display name from the first file in each group.
   */
  private groupByVendor(files: FileRecord[]): Map<string | null, { displayName: string; files: FileRecord[] }> {
    const groups = new Map<string | null, { displayName: string; files: FileRecord[] }>();

    for (const file of files) {
      // Get original name (trimmed for display, but case preserved)
      const originalName = file.detectedVendorName?.trim() || '';

      // Normalize for grouping: lowercase, treat empty as null
      const normalizedKey = originalName.length > 0 ? originalName.toLowerCase() : null;

      const existing = groups.get(normalizedKey);
      if (existing) {
        existing.files.push(file);
      } else {
        // First file in group - use its name as display name
        groups.set(normalizedKey, {
          displayName: originalName,
          files: [file],
        });
      }
    }

    return groups;
  }
}
