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
