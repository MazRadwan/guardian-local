/**
 * Assessment Repository Interface
 *
 * Defines contract for assessment data access.
 * Infrastructure layer implements this interface.
 */

import { Assessment } from '../../domain/entities/Assessment'

export interface IAssessmentRepository {
  /**
   * Creates a new assessment
   */
  create(assessment: Assessment): Promise<Assessment>

  /**
   * Finds an assessment by ID
   * @returns Assessment if found, null otherwise
   */
  findById(id: string): Promise<Assessment | null>

  /**
   * Finds all assessments for a specific vendor
   * @param vendorId The vendor ID
   * @returns Array of assessments ordered by creation date (newest first)
   */
  findByVendorId(vendorId: string): Promise<Assessment[]>

  /**
   * Finds all assessments created by a specific user
   * @param userId The user ID
   * @returns Array of assessments ordered by creation date (newest first)
   */
  findByCreatedBy(userId: string): Promise<Assessment[]>

  /**
   * Updates an existing assessment
   */
  update(assessment: Assessment): Promise<Assessment>

  /**
   * Updates assessment status
   */
  updateStatus(
    id: string,
    status: 'draft' | 'questions_generated' | 'exported' | 'scored' | 'cancelled'
  ): Promise<void>

  /**
   * Gets the vendor for an assessment
   * Used by scoring service to get vendor info for prompts
   */
  getVendor(assessmentId: string): Promise<{ id: string; name: string }>

  /**
   * Deletes an assessment by ID
   */
  delete(id: string): Promise<void>

  /**
   * Lists assessments with pagination
   * @param limit Maximum number of assessments to return (default: 50)
   * @param offset Pagination offset (default: 0)
   * @returns Array of assessments ordered by creation date (newest first)
   */
  list(limit?: number, offset?: number): Promise<Assessment[]>
}
