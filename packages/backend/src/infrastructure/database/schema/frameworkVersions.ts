import { pgTable, uuid, text, timestamp, index, unique } from 'drizzle-orm/pg-core'
import { complianceFrameworks } from './complianceFrameworks'

export const frameworkVersions = pgTable(
  'framework_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    frameworkId: uuid('framework_id')
      .notNull()
      .references(() => complianceFrameworks.id, { onDelete: 'cascade' }),
    versionLabel: text('version_label').notNull(),   // "2023", "202x"
    status: text('status').notNull().$type<'active' | 'deprecated'>().default('active'),
    publishedAt: timestamp('published_at'),           // When ISO published this version
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    frameworkIdx: index('framework_versions_framework_idx').on(table.frameworkId),
    uniqueFrameworkVersion: unique('framework_versions_framework_version_unique').on(
      table.frameworkId,
      table.versionLabel
    ),
  })
)

export type FrameworkVersion = typeof frameworkVersions.$inferSelect
export type NewFrameworkVersion = typeof frameworkVersions.$inferInsert
