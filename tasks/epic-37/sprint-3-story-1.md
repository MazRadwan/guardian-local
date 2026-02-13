# Story 37.3.1: Create ISO Types and DTOs

## Description

Create the TypeScript types and DTOs for the ISO compliance domain. These types are used by domain entities, repositories, and services throughout the ISO feature. Following the existing pattern from `domain/scoring/types.ts` and `domain/scoring/dtos.ts`.

## Acceptance Criteria

- [ ] `domain/compliance/types.ts` created with all ISO-related type definitions
- [ ] `domain/compliance/dtos.ts` created with DTOs for all 6 ISO entities
- [ ] Types include: `FrameworkStatus`, `ReviewStatus`, `AssessmentConfidenceLevel`, `AssessmentConfidence`, `ISOClauseReference`
- [ ] DTOs include: `ComplianceFrameworkDTO`, `FrameworkVersionDTO`, `FrameworkControlDTO`, `InterpretiveCriteriaDTO`, `DimensionControlMappingDTO`, `AssessmentComplianceResultDTO`
- [ ] Create DTOs for each entity (for repository insert operations)
- [ ] Both files under 150 LOC each
- [ ] No TypeScript errors

## Technical Approach

### 1. Create Types File

**File:** `packages/backend/src/domain/compliance/types.ts`

```typescript
/**
 * ISO Compliance Domain Types
 *
 * Type definitions for the ISO compliance framework feature.
 * Part of Epic 37: ISO Foundation + Scoring Enrichment
 */

import { RiskDimension } from '../types/QuestionnaireSchema';

/**
 * Framework version status
 */
export type FrameworkStatus = 'active' | 'deprecated';

/**
 * Interpretive criteria review status
 */
export type ReviewStatus = 'draft' | 'approved' | 'deprecated';

/**
 * Assessment confidence level (qualitative, NOT numeric)
 * NEVER conflate with extractionConfidence (which is numeric 0-1 in responses table)
 */
export type AssessmentConfidenceLevel = 'high' | 'medium' | 'low';

/**
 * Assessment confidence output per dimension
 * Stored in findings JSONB of dimension_scores table
 */
export interface AssessmentConfidence {
  level: AssessmentConfidenceLevel;
  rationale: string;  // MUST cite specific evidence and ISO references
}

/**
 * ISO clause reference in scoring output per dimension
 * Stored in findings JSONB of dimension_scores table
 */
export interface ISOClauseReference {
  clauseRef: string;       // "A.6.2.6"
  title: string;           // "Data quality management for AI systems"
  framework: string;       // "ISO/IEC 42001"
  status: 'aligned' | 'partial' | 'not_evidenced' | 'not_applicable';
}

/**
 * Guardian-native dimension indicator
 * Used for clinical_risk, vendor_capability, ethical_considerations, and sustainability (no ISO mapping)
 */
export interface GuardianNativeLabel {
  isGuardianNative: true;
  label: string;  // "Assessed using Guardian healthcare-specific criteria"
}
```

### 2. Create DTOs File

**File:** `packages/backend/src/domain/compliance/dtos.ts`

```typescript
/**
 * ISO Compliance DTOs
 *
 * Data Transfer Objects for ISO compliance entities.
 * Follow the pattern from domain/scoring/dtos.ts.
 */

import { FrameworkStatus, ReviewStatus } from './types';

// --- ComplianceFramework ---
export interface ComplianceFrameworkDTO {
  id: string;
  name: string;
  description?: string;
  createdAt: Date;
}

export interface CreateComplianceFrameworkDTO {
  name: string;
  description?: string;
}

// --- FrameworkVersion ---
export interface FrameworkVersionDTO {
  id: string;
  frameworkId: string;
  versionLabel: string;
  status: FrameworkStatus;
  publishedAt?: Date;
  createdAt: Date;
}

export interface CreateFrameworkVersionDTO {
  frameworkId: string;
  versionLabel: string;
  status?: FrameworkStatus;
  publishedAt?: Date;
}

// --- FrameworkControl ---
export interface FrameworkControlDTO {
  id: string;
  versionId: string;
  clauseRef: string;
  domain: string;
  title: string;
  createdAt: Date;
}

export interface CreateFrameworkControlDTO {
  versionId: string;
  clauseRef: string;
  domain: string;
  title: string;
}

// --- InterpretiveCriteria ---
export interface InterpretiveCriteriaDTO {
  id: string;
  controlId: string;
  criteriaVersion: string;
  criteriaText: string;
  assessmentGuidance?: string;
  reviewStatus: ReviewStatus;
  approvedAt?: Date;
  approvedBy?: string;
  createdAt: Date;
}

export interface CreateInterpretiveCriteriaDTO {
  controlId: string;
  criteriaVersion: string;
  criteriaText: string;
  assessmentGuidance?: string;
  reviewStatus?: ReviewStatus;
}

// --- DimensionControlMapping ---
export interface DimensionControlMappingDTO {
  id: string;
  controlId: string;
  dimension: string;
  relevanceWeight: number;
  createdAt: Date;
}

export interface CreateDimensionControlMappingDTO {
  controlId: string;
  dimension: string;
  relevanceWeight?: number;
}

// --- AssessmentComplianceResult ---
export interface AssessmentComplianceResultDTO {
  id: string;
  assessmentId: string;
  frameworkVersionId: string;
  criteriaVersion?: string;
  controlId: string;
  finding?: unknown;
  evidenceRefs?: unknown;
  createdAt: Date;
}

export interface CreateAssessmentComplianceResultDTO {
  assessmentId: string;
  frameworkVersionId: string;
  criteriaVersion?: string;
  controlId: string;
  finding?: unknown;
  evidenceRefs?: unknown;
}
```

## Files Touched

- `packages/backend/src/domain/compliance/types.ts` - CREATE (~55 LOC)
- `packages/backend/src/domain/compliance/dtos.ts` - CREATE (~110 LOC)

## Tests Affected

- None (pure creation, no existing code imports from these paths)

## Agent Assignment

- [x] backend-agent

## Tests Required

- None for type/DTO files (TypeScript compilation validates correctness; tested via consuming code in later sprints)

## Definition of Done

- [ ] Both files created and compile
- [ ] All types align with database schema columns from Sprint 2
- [ ] DTOs follow pattern from `domain/scoring/dtos.ts`
- [ ] `AssessmentConfidence` type matches PRD Section 7 output schema
- [ ] No TypeScript errors
