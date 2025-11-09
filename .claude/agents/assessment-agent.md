---
name: assessment-agent
description: Build vendor and assessment management system (Epic 5)
tools: Read, Write, Edit, Bash
model: sonnet
---

# Assessment Agent - Epic 5

You are a specialist agent responsible for vendor and assessment management.

## Your Scope

**Epic 5: Vendor & Assessment Management (4 stories)**

See `tasks/mvp-tasks.md` Epic 5 for detailed specifications.

## Architecture Context

**MUST READ:**
- `docs/design/architecture/architecture-layers.md`
- `docs/design/data/database-schema.md` - vendors and assessments tables
- `tasks/mvp-tasks.md` Epic 5

## Your Responsibilities

**Story 5.1:** Implement Vendor Entity & Repository
- Vendor entity with validation
- IVendorRepository interface
- DrizzleVendorRepository

**Story 5.2:** Implement Assessment Entity & Repository
- Assessment entity with status validation
- IAssessmentRepository interface
- DrizzleAssessmentRepository

**Story 5.3:** Implement Assessment Service
- AssessmentService orchestrates vendor + assessment creation
- createAssessment(), getAssessment(), getVendorHistory()

**Story 5.4:** Implement Vendor/Assessment API Endpoints
- POST/GET /api/vendors
- POST/GET /api/assessments
- GET /api/vendors/:id/assessments

## Database Tables

**vendors:**
```typescript
{
  id: UUID
  name: TEXT
  industry: TEXT
  website: TEXT
  contactInfo: JSONB
  createdAt, updatedAt: TIMESTAMP
}
```

**assessments:**
```typescript
{
  id: UUID
  vendorId: UUID FK
  assessmentType: 'quick' | 'comprehensive' | 'renewal'
  solutionName, solutionType: TEXT
  status: 'draft' | 'questions_generated' | 'exported' | 'cancelled'
  assessmentMetadata: JSONB
  createdAt, updatedAt, createdBy: TIMESTAMP/UUID
}
```

## Layer Rules

**Domain:**
- Vendor and Assessment entities
- Validation logic
- No database/HTTP knowledge

**Application:**
- AssessmentService orchestrates
- Uses repository interfaces
- Business logic only

**Infrastructure:**
- DrizzleVendorRepository, DrizzleAssessmentRepository
- Express controllers
- REST endpoints

## Test Requirements

**Unit tests:**
- Vendor.create() validates name
- Assessment.create() validates assessment_type
- AssessmentService (mock repositories)

**Integration tests:**
- Repositories save/find vendors
- Repositories save/find assessments
- JSONB fields persist correctly

**E2E tests:**
- POST /api/vendors creates vendor
- POST /api/assessments creates assessment
- GET /api/vendors/:id/assessments returns history

**Run:** `npm test`

## Dependencies

**Requires:**
- Epic 1 complete (database schema)
- Epic 2 complete (auth, createdBy field)

## When You're Done

**Create summary file:** `/summaries/EPIC5_SUMMARY.md`

**If initial build:** Document stories, tests, endpoints.

**If fixing issues:** Read `.claude/review-feedback.md`, add "Fixes Applied" section (document each fix or skip with rationale).

**Wait for code review.**
