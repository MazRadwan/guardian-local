/**
 * Vendor Service
 *
 * Handles vendor-specific business logic, separate from assessments.
 */

import { IVendorRepository } from '../interfaces/IVendorRepository';
import { Vendor } from '../../domain/entities/Vendor';

export class VendorService {
  private static readonly DEFAULT_VENDOR_NAME = 'Chat Assessment Vendor';
  private static readonly DEFAULT_VENDOR_INDUSTRY = 'Healthcare Technology';

  constructor(private readonly vendorRepository: IVendorRepository) {}

  /**
   * Find existing default vendor or create one.
   * Used when creating assessments from chat without explicit vendor selection.
   *
   * @param _userId - User ID (reserved for future per-user vendors)
   * @returns The default vendor (existing or newly created)
   */
  async findOrCreateDefault(_userId: string): Promise<Vendor> {
    // Try to find existing default vendor
    const existing = await this.vendorRepository.findByName(
      VendorService.DEFAULT_VENDOR_NAME
    );

    if (existing) {
      return existing;
    }

    // Create default vendor
    const vendor = Vendor.create({
      name: VendorService.DEFAULT_VENDOR_NAME,
      industry: VendorService.DEFAULT_VENDOR_INDUSTRY,
      website: undefined,
      contactInfo: undefined,
    });

    return await this.vendorRepository.create(vendor);
  }

  /**
   * Find vendor by name or create new one (generic version).
   * Used for fallback assessment creation when markers detected but no assessment exists.
   *
   * @param name - Vendor name to find or create
   * @returns The vendor (existing or newly created)
   */
  async findOrCreateVendor(name: string): Promise<Vendor> {
    // Try to find existing vendor
    const existing = await this.vendorRepository.findByName(name);

    if (existing) {
      return existing;
    }

    // Create new vendor with minimal info
    const vendor = Vendor.create({
      name,
      industry: undefined,
      website: undefined,
      contactInfo: undefined,
    });

    return await this.vendorRepository.create(vendor);
  }

  /**
   * Get vendor by ID
   */
  async getVendor(vendorId: string): Promise<Vendor | null> {
    return this.vendorRepository.findById(vendorId);
  }

  /**
   * Get vendor by name
   */
  async getVendorByName(vendorName: string): Promise<Vendor | null> {
    return this.vendorRepository.findByName(vendorName);
  }

  /**
   * List all vendors
   */
  async listVendors(limit?: number, offset?: number): Promise<Vendor[]> {
    return this.vendorRepository.list(limit, offset);
  }

  /**
   * Search vendors by name
   */
  async searchVendors(searchTerm: string): Promise<Vendor[]> {
    return this.vendorRepository.searchByName(searchTerm);
  }

  /**
   * Create a new vendor
   */
  async createVendor(data: {
    name: string;
    industry?: string;
    website?: string;
    contactInfo?: Record<string, unknown>;
  }): Promise<Vendor> {
    // Check if vendor already exists
    const existing = await this.vendorRepository.findByName(data.name);
    if (existing) {
      throw new Error(`Vendor with name "${data.name}" already exists`);
    }

    const vendor = Vendor.create({
      name: data.name,
      industry: data.industry,
      website: data.website,
      contactInfo: data.contactInfo,
    });

    return this.vendorRepository.create(vendor);
  }

  /**
   * Update a vendor
   */
  async updateVendor(
    vendorId: string,
    data: {
      industry?: string;
      website?: string;
      contactInfo?: Record<string, unknown>;
    }
  ): Promise<Vendor> {
    const vendor = await this.vendorRepository.findById(vendorId);

    if (!vendor) {
      throw new Error(`Vendor not found: ${vendorId}`);
    }

    vendor.update(data);

    return this.vendorRepository.update(vendor);
  }

  /**
   * Delete a vendor
   */
  async deleteVendor(vendorId: string): Promise<void> {
    await this.vendorRepository.delete(vendorId);
  }
}
