import { pgTable, uuid, text, timestamp, index, unique } from 'drizzle-orm/pg-core'
import { frameworkVersions } from './frameworkVersions'

export const frameworkControls = pgTable(
  'framework_controls',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    versionId: uuid('version_id')
      .notNull()
      .references(() => frameworkVersions.id, { onDelete: 'cascade' }),
    clauseRef: text('clause_ref').notNull(),     // "A.6.2.6", "6.3", etc.
    domain: text('domain').notNull(),             // "Data management", "Risk management"
    title: text('title').notNull(),               // "Data quality management for AI systems"
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    versionClauseIdx: index('framework_controls_version_clause_idx').on(
      table.versionId,
      table.clauseRef
    ),
    uniqueVersionClause: unique('framework_controls_version_clause_unique').on(
      table.versionId,
      table.clauseRef
    ),
  })
)

export type FrameworkControl = typeof frameworkControls.$inferSelect
export type NewFrameworkControl = typeof frameworkControls.$inferInsert
