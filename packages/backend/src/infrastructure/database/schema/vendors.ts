import { pgTable, uuid, text, jsonb, timestamp, index } from 'drizzle-orm/pg-core'

export const vendors = pgTable(
  'vendors',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    industry: text('industry'),
    website: text('website'),
    contactInfo: jsonb('contact_info').$type<{
      primaryContact?: string
      email?: string
      phone?: string
    }>(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    nameIdx: index('vendors_name_idx').on(table.name),
  })
)

// Type exports
export type Vendor = typeof vendors.$inferSelect
export type NewVendor = typeof vendors.$inferInsert
