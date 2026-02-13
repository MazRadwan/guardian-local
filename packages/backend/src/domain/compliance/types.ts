/**
 * ISO Compliance Domain Types
 *
 * Type definitions for the ISO compliance framework feature.
 * Part of Epic 37: ISO Foundation + Scoring Enrichment
 */

import { RiskDimension } from '../types/QuestionnaireSchema.js'

/**
 * Framework version status
 */
export type FrameworkStatus = 'active' | 'deprecated'

/**
 * Interpretive criteria review status
 */
export type ReviewStatus = 'draft' | 'approved' | 'deprecated'

/**
 * Assessment confidence level (qualitative, NOT numeric)
 * NEVER conflate with extractionConfidence (which is numeric 0-1 in responses table)
 */
export type AssessmentConfidenceLevel = 'high' | 'medium' | 'low'

/**
 * Assessment confidence output per dimension
 * Stored in findings JSONB of dimension_scores table
 */
export interface AssessmentConfidence {
  level: AssessmentConfidenceLevel
  rationale: string // MUST cite specific evidence and ISO references
}

/**
 * ISO clause reference in scoring output per dimension
 * Stored in findings JSONB of dimension_scores table
 */
export interface ISOClauseReference {
  clauseRef: string // "A.6.2.6"
  title: string // "Data quality management for AI systems"
  framework: string // "ISO/IEC 42001"
  status: 'aligned' | 'partial' | 'not_evidenced' | 'not_applicable'
}

/**
 * Guardian-native dimension indicator
 * Used for clinical_risk, vendor_capability, ethical_considerations,
 * and sustainability (no ISO mapping)
 */
export interface GuardianNativeLabel {
  isGuardianNative: true
  label: string // "Assessed using Guardian healthcare-specific criteria"
}

/**
 * Control with its interpretive criteria, ready for prompt injection.
 * Shared type consumed by ISOControlRetrievalService and prompt builders.
 */
export interface ISOControlForPrompt {
  clauseRef: string
  domain: string
  title: string
  framework: string
  criteriaText: string
  assessmentGuidance?: string
  dimensions: RiskDimension[]
  relevanceWeight: number
}
