# Story 37.2.5: Create dimension_control_mappings Schema

## Description

Create the `dimension_control_mappings` database table. Maps ISO controls to Guardian's 10 risk dimensions. One control can map to multiple dimensions (many-to-many). Only mapped controls (~30 of 38) are injected into scoring prompts. Includes a `relevance_weight` column to indicate how strongly a control relates to a dimension.

## Acceptance Criteria

- [ ] `dimensionControlMappings.ts` created in `infrastructure/database/schema/`
- [ ] Table has columns: `id` (uuid PK), `control_id` (uuid FK -> framework_controls), `dimension` (text, not null), `relevance_weight` (real, default 1.0), `created_at` (timestamp)
- [ ] Foreign key to `framework_controls` with `onDelete: 'cascade'`
- [ ] Composite index on `(dimension, control_id)` for efficient dimension-based queries
- [ ] Unique constraint on `(control_id, dimension)` to prevent duplicate mappings
- [ ] Drizzle inferred types exported: `DimensionControlMapping`, `NewDimensionControlMapping`
- [ ] Under 50 LOC
- [ ] No TypeScript errors

## Technical Approach

**File:** `packages/backend/src/infrastructure/database/schema/dimensionControlMappings.ts`

```typescript
import { pgTable, uuid, text, timestamp, index, unique, real } from 'drizzle-orm/pg-core'
import { frameworkControls } from './frameworkControls'

export const dimensionControlMappings = pgTable(
  'dimension_control_mappings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    controlId: uuid('control_id')
      .notNull()
      .references(() => frameworkControls.id, { onDelete: 'cascade' }),
    dimension: text('dimension').notNull(),          // "regulatory_compliance", "privacy_risk", etc.
    relevanceWeight: real('relevance_weight').notNull().default(1.0),  // How relevant (0.0-1.0)
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    dimensionControlIdx: index('dimension_control_mappings_dimension_idx').on(
      table.dimension,
      table.controlId
    ),
    uniqueControlDimension: unique('dimension_control_mappings_unique').on(
      table.controlId,
      table.dimension
    ),
  })
)

export type DimensionControlMapping = typeof dimensionControlMappings.$inferSelect
export type NewDimensionControlMapping = typeof dimensionControlMappings.$inferInsert
```

**Key design notes:**
- `dimension` stores Guardian's dimension names (e.g., `regulatory_compliance`, `privacy_risk`) matching the `RiskDimension` type in `domain/types/QuestionnaireSchema.ts`
- `relevance_weight` uses `real` (4-byte float) since we only need approximate weighting (0.0-1.0)
- Index on `(dimension, control_id)` supports the primary query pattern: "get all controls for a given dimension"
- Per PRD: `clinical_risk`, `vendor_capability`, `ethical_considerations`, and `sustainability` will have zero mappings (Guardian-native)

## Files Touched

- `packages/backend/src/infrastructure/database/schema/dimensionControlMappings.ts` - CREATE (~30 LOC)

## Tests Affected

- None (pure creation)

## Agent Assignment

- [x] backend-agent

## Tests Required

- None for this story (validated by migration + integration tests)

## Definition of Done

- [ ] File created and compiles
- [ ] Composite index on (dimension, control_id) created
- [ ] Types exported correctly
- [ ] No TypeScript errors
