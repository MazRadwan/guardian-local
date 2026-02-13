# Story 37.2.7: Update schema/index.ts Barrel Exports

## Description

Add the 6 new schema table exports to `schema/index.ts`. This barrel file is imported by `test-db.ts`, the Drizzle client, and any code that needs schema references. Must be done after all 6 schema files are created (37.2.1-37.2.6).

## Acceptance Criteria

- [ ] `schema/index.ts` exports all 6 new tables
- [ ] Export order follows existing alphabetical/dependency pattern
- [ ] No TypeScript errors
- [ ] No circular import issues

## Technical Approach

**File:** `packages/backend/src/infrastructure/database/schema/index.ts`

Current content (11 LOC):
```typescript
export * from './users'
export * from './vendors'
export * from './assessments'
export * from './questions'
export * from './conversations'
export * from './messages'
export * from './files'
export * from './responses'
export * from './dimensionScores'
export * from './assessmentResults'
```

Add 6 new exports (order: parent tables before child tables to avoid forward reference issues):
```typescript
// ISO Compliance Framework tables (Epic 37)
export * from './complianceFrameworks'
export * from './frameworkVersions'
export * from './frameworkControls'
export * from './interpretiveCriteria'
export * from './dimensionControlMappings'
export * from './assessmentComplianceResults'
```

## Files Touched

- `packages/backend/src/infrastructure/database/schema/index.ts` - MODIFY (add 6 export lines)

## Tests Affected

- `packages/backend/__tests__/setup/test-db.ts` - Imports `* as schema` from this file. Adding exports here means the schema object passed to Drizzle client will include new tables. This is safe since `drizzle()` handles additional schema entries gracefully.

## Agent Assignment

- [x] backend-agent

## Tests Required

- None for this story (compile check is sufficient; integration tests will validate in Sprint 4)

## Definition of Done

- [ ] All 6 new tables exported from barrel file
- [ ] No TypeScript errors
- [ ] No circular imports
