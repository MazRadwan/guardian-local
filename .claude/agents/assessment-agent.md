---
name: assessment-agent
description: Build vendor and assessment management system (Epic 5)
tools: Read, Write, Edit, Bash
model: opus
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

**Refer to:** `.claude/skills/testing/SKILL.md` for commands and patterns.

**What to test for this epic:**
- Unit: Vendor.create() validates name
- Unit: Assessment.create() validates assessment_type
- Unit: AssessmentService (mock repositories)
- Integration: Repositories save/find vendors/assessments
- E2E: Vendor + Assessment CRUD endpoints

**Commands:**
- During dev: `pnpm --filter @guardian/backend test:watch:unit`
- Before commit: `pnpm test:unit` + `pnpm test:integration`

## Dependencies

**Requires:**
- Epic 1 complete (database schema)
- Epic 2 complete (auth, createdBy field)

## Definition of Done

Before marking this epic complete, verify:

- [ ] All acceptance criteria met (check `tasks/mvp-tasks.md` Epic 5 stories)
- [ ] Tests written and passing (`pnpm test:unit` + `pnpm test:integration`)
- [ ] Assessment CRUD operations work correctly
- [ ] Vendor management functional (create, update, list)
- [ ] Repository pattern implemented (IAssessmentRepository, IVendorRepository)
- [ ] No eslint/prettier errors (`npm run lint`)
- [ ] Clean architecture maintained (domain layer has zero dependencies)

**Extended Thinking:** For complex domain modeling or repository pattern decisions, use "think hard" to evaluate design systematically.

## Implementation Log (Continuous Updates)

**Update log as you work:** `/tasks/implementation-logs/epic-5-assessment.md`

Document continuously (not just at end):
- ✅ What you're implementing (during work)
- ✅ Bugs discovered (repository bugs, domain logic issues, etc.)
- ✅ Fixes attempted (even if they didn't work)
- ✅ Final solution (what actually worked)
- ✅ Code review feedback and your fixes
- ✅ Domain modeling decisions

**Example:** Document entity design choices, repository pattern decisions, validation logic with reasoning.

## When You're Done

**Create summary file:** `/summaries/EPIC5_SUMMARY.md`

**If initial build:** Document stories, tests, endpoints.

**If fixing issues:** Read `.claude/review-feedback.md`, add "Fixes Applied" section (document each fix or skip with rationale).

**Wait for code review.**
