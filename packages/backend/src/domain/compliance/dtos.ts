/**
 * ISO Compliance DTOs
 *
 * Data Transfer Objects for ISO compliance entities.
 * Follow the pattern from domain/scoring/dtos.ts.
 */

import { FrameworkStatus, ReviewStatus } from './types.js'
import { RiskDimension } from '../types/QuestionnaireSchema.js'

// --- ComplianceFramework ---
export interface ComplianceFrameworkDTO {
  id: string
  name: string
  description?: string
  createdAt: Date
}

export interface CreateComplianceFrameworkDTO {
  name: string
  description?: string
}

// --- FrameworkVersion ---
export interface FrameworkVersionDTO {
  id: string
  frameworkId: string
  versionLabel: string
  status: FrameworkStatus
  publishedAt?: Date
  createdAt: Date
}

export interface CreateFrameworkVersionDTO {
  frameworkId: string
  versionLabel: string
  status?: FrameworkStatus
  publishedAt?: Date
}

// --- FrameworkControl ---
export interface FrameworkControlDTO {
  id: string
  versionId: string
  clauseRef: string
  domain: string
  title: string
  createdAt: Date
}

export interface CreateFrameworkControlDTO {
  versionId: string
  clauseRef: string
  domain: string
  title: string
}

// --- InterpretiveCriteria ---
export interface InterpretiveCriteriaDTO {
  id: string
  controlId: string
  criteriaVersion: string
  criteriaText: string
  assessmentGuidance?: string
  reviewStatus: ReviewStatus
  approvedAt?: Date
  approvedBy?: string
  createdAt: Date
}

export interface CreateInterpretiveCriteriaDTO {
  controlId: string
  criteriaVersion: string
  criteriaText: string
  assessmentGuidance?: string
}

// --- DimensionControlMapping ---
export interface DimensionControlMappingDTO {
  id: string
  controlId: string
  dimension: RiskDimension
  relevanceWeight: number
  createdAt: Date
}

export interface CreateDimensionControlMappingDTO {
  controlId: string
  dimension: RiskDimension
  relevanceWeight?: number
}

// --- AssessmentComplianceResult ---
export interface AssessmentComplianceResultDTO {
  id: string
  assessmentId: string
  frameworkVersionId: string
  criteriaVersion: string
  controlId: string
  finding?: unknown
  evidenceRefs?: unknown
  createdAt: Date
}

export interface CreateAssessmentComplianceResultDTO {
  assessmentId: string
  frameworkVersionId: string
  criteriaVersion: string
  controlId: string
  finding?: unknown
  evidenceRefs?: unknown
}
