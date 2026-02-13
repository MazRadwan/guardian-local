/**
 * Test Database Setup
 * Creates a separate database client for testing with proper cleanup
 */

import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { sql } from 'drizzle-orm'
import * as schema from '../../src/infrastructure/database/schema/index'

// Test database URL (MUST be different from dev database)
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL

if (!TEST_DATABASE_URL) {
  throw new Error(
    'TEST_DATABASE_URL environment variable is not set. ' +
    'Integration tests require a separate test database to avoid wiping dev data. ' +
    'Add TEST_DATABASE_URL=postgresql://guardian:guardian_password@localhost:5433/guardian_test to your .env file.'
  )
}

// Create dedicated postgres-js client for tests
// Set max connections to 1 for tests to avoid connection caching issues
const testQueryClient = postgres(TEST_DATABASE_URL, {
  max: 1, // Single connection for tests (prevents caching issues)
  idle_timeout: 20,
  connect_timeout: 10,
  onnotice: () => {}, // Suppress notices in test output
})

// Create Drizzle instance for tests
export const testDb = drizzle(testQueryClient, { schema })

// Export query client for cleanup
export const testQueryClientInstance = testQueryClient

/**
 * Close test database connection
 * Call this in global teardown or afterAll
 */
export async function closeTestDb() {
  await testQueryClient.end({ timeout: 5 })
}

/**
 * Truncate all tables (reset database for tests)
 */
export async function truncateAllTables() {
  await testDb.execute(sql`
    TRUNCATE TABLE
      assessment_compliance_results,
      dimension_control_mappings,
      interpretive_criteria,
      framework_controls,
      framework_versions,
      compliance_frameworks,
      assessment_results,
      dimension_scores,
      responses,
      files,
      messages,
      conversations,
      questions,
      assessments,
      vendors,
      users
    CASCADE
  `)
}
