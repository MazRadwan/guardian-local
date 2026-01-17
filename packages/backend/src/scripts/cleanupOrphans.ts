#!/usr/bin/env npx tsx
/**
 * Orphan Cleanup CLI Script
 *
 * Epic 20 Story 20.2.2: Manual invocation of orphan cleanup
 *
 * Usage:
 *   pnpm --filter @guardian/backend run cleanup:orphans
 *   # Or directly:
 *   npx tsx packages/backend/src/scripts/cleanupOrphans.ts
 *
 * Environment:
 *   ORPHAN_CLEANUP_RETENTION_HOURS - Hours before responses are considered orphaned (default: 24)
 *   DATABASE_URL - PostgreSQL connection string (required)
 */

import { config } from 'dotenv'
// Load .env before any other imports
config()

import { OrphanCleanupService } from '../application/services/OrphanCleanupService.js'
import { DrizzleResponseRepository } from '../infrastructure/database/repositories/DrizzleResponseRepository.js'

async function main(): Promise<void> {
  console.log('='.repeat(60))
  console.log('Guardian - Orphan Response Cleanup')
  console.log('='.repeat(60))

  // Verify database connection
  if (!process.env.DATABASE_URL) {
    console.error('ERROR: DATABASE_URL environment variable is not set')
    process.exit(1)
  }

  const retentionHours = process.env.ORPHAN_CLEANUP_RETENTION_HOURS || '24'
  console.log(`\nConfiguration:`)
  console.log(`  Retention window: ${retentionHours} hours`)
  console.log(`  Database: ${process.env.DATABASE_URL.replace(/\/\/[^:]+:[^@]+@/, '//***:***@')}`)
  console.log('')

  try {
    const responseRepo = new DrizzleResponseRepository()
    const cleanupService = new OrphanCleanupService(responseRepo)

    const result = await cleanupService.cleanupOrphanedResponses()

    console.log('\n' + '='.repeat(60))
    console.log('Cleanup Summary')
    console.log('='.repeat(60))
    console.log(`  Batches cleaned: ${result.batchIds.length}`)
    console.log(`  Responses deleted: ${result.deletedCount}`)

    if (result.batchIds.length > 0) {
      console.log('\nDeleted batch IDs:')
      result.batchIds.forEach((id) => console.log(`  - ${id}`))
    }

    console.log('\nCleanup completed successfully')
    process.exit(0)
  } catch (error) {
    console.error('\nERROR: Cleanup failed')
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
}

main()
