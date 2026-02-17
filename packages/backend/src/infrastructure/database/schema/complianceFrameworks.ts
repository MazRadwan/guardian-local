import { pgTable, uuid, text, timestamp, unique } from 'drizzle-orm/pg-core'

export const complianceFrameworks = pgTable(
  'compliance_frameworks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),          // "ISO/IEC 42001", "ISO/IEC 23894"
    description: text('description'),       // Brief description of the standard
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    uniqueName: unique('compliance_frameworks_name_unique').on(table.name),
  })
)

export type ComplianceFramework = typeof complianceFrameworks.$inferSelect
export type NewComplianceFramework = typeof complianceFrameworks.$inferInsert
