/**
 * Vendor Repository Interface
 *
 * Defines contract for vendor data access.
 * Infrastructure layer implements this interface.
 */

import { Vendor } from '../../domain/entities/Vendor'

export interface IVendorRepository {
  /**
   * Creates a new vendor
   */
  create(vendor: Vendor): Promise<Vendor>

  /**
   * Finds a vendor by ID
   * @returns Vendor if found, null otherwise
   */
  findById(id: string): Promise<Vendor | null>

  /**
   * Finds a vendor by exact name match
   * @returns Vendor if found, null otherwise
   */
  findByName(name: string): Promise<Vendor | null>

  /**
   * Updates an existing vendor
   */
  update(vendor: Vendor): Promise<Vendor>

  /**
   * Deletes a vendor by ID
   */
  delete(id: string): Promise<void>

  /**
   * Lists all vendors
   * @param limit Maximum number of vendors to return (default: 100)
   * @param offset Pagination offset (default: 0)
   * @returns Array of vendors
   */
  list(limit?: number, offset?: number): Promise<Vendor[]>

  /**
   * Searches vendors by name (partial match, case-insensitive)
   */
  searchByName(searchTerm: string): Promise<Vendor[]>
}
