/**
 * CreateAssessmentDTO
 *
 * Data Transfer Object for creating a new assessment
 */

import { AssessmentTypeValue } from '../../domain/value-objects/AssessmentType'

export interface CreateAssessmentDTO {
  // Vendor information
  vendorName: string
  vendorIndustry?: string
  vendorWebsite?: string
  vendorContactInfo?: {
    primaryContact?: string
    email?: string
    phone?: string
  }

  // Assessment details
  assessmentType: AssessmentTypeValue
  solutionName?: string
  solutionType?: string

  // Assessment metadata
  assessmentMetadata?: {
    assessorName?: string
    stakeholders?: string[]
    notes?: string
  }

  // User context
  createdBy: string
}

export interface CreateAssessmentResponseDTO {
  assessmentId: string
  vendorId: string
  vendorName: string
  assessmentType: string
  status: string
  createdAt: Date
}
