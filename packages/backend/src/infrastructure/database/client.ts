import { config } from 'dotenv'
config() // Load .env before reading DATABASE_URL

import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema/index'

// Export transaction type for repositories
export type DbTransaction = PostgresJsDatabase<typeof schema>

// Database connection URL
const DATABASE_URL = process.env.DATABASE_URL

if (!DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is not set')
}

// Create PostgreSQL connection with connection pooling
const queryClient = postgres(DATABASE_URL, {
  max: 20, // Maximum 20 connections in pool
  idle_timeout: 20, // Close idle connections after 20 seconds
  connect_timeout: 10, // Connection timeout 10 seconds
})

// Create Drizzle instance with schema
export const db = drizzle(queryClient, { schema })

// Export query client for raw SQL queries if needed
export { queryClient }
