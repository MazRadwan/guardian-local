/**
 * Assessment Service
 *
 * Orchestrates assessment workflows - creating assessments, managing vendors
 */

import { IVendorRepository } from '../interfaces/IVendorRepository'
import { IAssessmentRepository } from '../interfaces/IAssessmentRepository'
import { Vendor } from '../../domain/entities/Vendor'
import { Assessment } from '../../domain/entities/Assessment'
import {
  CreateAssessmentDTO,
  CreateAssessmentResponseDTO,
} from '../dtos/CreateAssessmentDTO'

export class AssessmentService {
  constructor(
    private readonly vendorRepository: IVendorRepository,
    private readonly assessmentRepository: IAssessmentRepository
  ) {}

  /**
   * Creates a new assessment, creating or reusing vendor as needed
   */
  async createAssessment(
    data: CreateAssessmentDTO
  ): Promise<CreateAssessmentResponseDTO> {
    // Step 1: Find or create vendor
    let vendor = await this.vendorRepository.findByName(data.vendorName)

    if (!vendor) {
      // Create new vendor
      vendor = Vendor.create({
        name: data.vendorName,
        industry: data.vendorIndustry,
        website: data.vendorWebsite,
        contactInfo: data.vendorContactInfo,
      })

      vendor = await this.vendorRepository.create(vendor)
    } else if (
      data.vendorIndustry ||
      data.vendorWebsite ||
      data.vendorContactInfo
    ) {
      // Update existing vendor with new information if provided
      vendor.update({
        industry: data.vendorIndustry,
        website: data.vendorWebsite,
        contactInfo: data.vendorContactInfo,
      })

      vendor = await this.vendorRepository.update(vendor)
    }

    // Step 2: Create assessment
    const assessment = Assessment.create({
      vendorId: vendor.id,
      assessmentType: data.assessmentType,
      solutionName: data.solutionName,
      solutionType: data.solutionType,
      assessmentMetadata: data.assessmentMetadata,
      createdBy: data.createdBy,
    })

    const savedAssessment = await this.assessmentRepository.create(assessment)

    // Step 3: Return response DTO
    return {
      assessmentId: savedAssessment.id,
      vendorId: vendor.id,
      vendorName: vendor.name,
      assessmentType: savedAssessment.assessmentType,
      status: savedAssessment.status,
      createdAt: savedAssessment.createdAt,
    }
  }

  /**
   * Gets an assessment by ID
   */
  async getAssessment(assessmentId: string): Promise<Assessment | null> {
    return this.assessmentRepository.findById(assessmentId)
  }

  /**
   * Gets all assessments for a vendor (vendor history)
   */
  async getVendorHistory(vendorId: string): Promise<Assessment[]> {
    return this.assessmentRepository.findByVendorId(vendorId)
  }

  /**
   * Gets vendor by ID
   */
  async getVendor(vendorId: string): Promise<Vendor | null> {
    return this.vendorRepository.findById(vendorId)
  }

  /**
   * Gets vendor by name
   */
  async getVendorByName(vendorName: string): Promise<Vendor | null> {
    return this.vendorRepository.findByName(vendorName)
  }

  /**
   * Lists all vendors
   */
  async listVendors(limit?: number, offset?: number): Promise<Vendor[]> {
    return this.vendorRepository.list(limit, offset)
  }

  /**
   * Lists all assessments
   */
  async listAssessments(
    limit?: number,
    offset?: number
  ): Promise<Assessment[]> {
    return this.assessmentRepository.list(limit, offset)
  }

  /**
   * Gets assessments created by a user
   */
  async getUserAssessments(userId: string): Promise<Assessment[]> {
    return this.assessmentRepository.findByCreatedBy(userId)
  }

  /**
   * Updates an assessment status
   */
  async updateAssessmentStatus(
    assessmentId: string,
    status: 'questions_generated' | 'exported' | 'cancelled'
  ): Promise<Assessment> {
    const assessment = await this.assessmentRepository.findById(assessmentId)

    if (!assessment) {
      throw new Error(`Assessment not found: ${assessmentId}`)
    }

    assessment.updateStatus(status)

    return this.assessmentRepository.update(assessment)
  }

  /**
   * Deletes an assessment
   */
  async deleteAssessment(assessmentId: string): Promise<void> {
    await this.assessmentRepository.delete(assessmentId)
  }

  /**
   * Creates a new vendor
   */
  async createVendor(data: {
    name: string
    industry?: string
    website?: string
    contactInfo?: Record<string, unknown>
  }): Promise<Vendor> {
    // Check if vendor already exists
    const existing = await this.vendorRepository.findByName(data.name)
    if (existing) {
      throw new Error(`Vendor with name "${data.name}" already exists`)
    }

    const vendor = Vendor.create({
      name: data.name,
      industry: data.industry,
      website: data.website,
      contactInfo: data.contactInfo,
    })

    return this.vendorRepository.create(vendor)
  }

  /**
   * Checks if user has any assessments with status >= 'exported'
   * Used for determining scoring mode visibility
   */
  async hasExportedAssessments(userId: string): Promise<boolean> {
    return this.assessmentRepository.hasExportedAssessments(userId)
  }
}
