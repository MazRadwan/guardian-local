/**
 * Jest Integration Test Setup
 *
 * Overrides DATABASE_URL with TEST_DATABASE_URL to ensure all database
 * operations (including repositories) use the test database.
 *
 * This runs for ALL tests but only overrides if TEST_DATABASE_URL is set.
 * Unit tests don't need it (they mock the db), integration tests require it.
 */

import dotenv from 'dotenv'

// Load .env file
dotenv.config()

// Override DATABASE_URL with TEST_DATABASE_URL if available
// This ensures repositories use the test database, not the dev database
if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL
  console.log('[Jest Setup] Using test database:', process.env.TEST_DATABASE_URL.replace(/:[^:@]+@/, ':***@'))
}
