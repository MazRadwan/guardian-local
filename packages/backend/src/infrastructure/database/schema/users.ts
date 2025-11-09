import { pgTable, uuid, text, timestamp } from 'drizzle-orm/pg-core'

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),

  // Auth
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),

  // Profile
  name: text('name').notNull(),
  role: text('role').notNull().$type<'admin' | 'analyst' | 'viewer'>().default('analyst'),

  // Session
  lastLoginAt: timestamp('last_login_at'),

  // Audit
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

// Type exports
export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert
