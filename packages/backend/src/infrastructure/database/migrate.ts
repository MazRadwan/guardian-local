import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import * as dotenv from 'dotenv'

// Load environment variables
dotenv.config()

const DATABASE_URL = process.env.DATABASE_URL

if (!DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is not set')
}

// Narrow to string after the guard (TS doesn't persist narrowing for module-level vars)
const databaseUrl: string = DATABASE_URL

async function runMigrations(): Promise<void> {
  console.log('Running database migrations...')

  const migrationClient = postgres(databaseUrl, { max: 1 })
  const db = drizzle(migrationClient)

  try {
    await migrate(db, {
      migrationsFolder: './src/infrastructure/database/migrations',
    })
    console.log('Migrations completed successfully!')
  } catch (error) {
    console.error('Migration failed:', error)
    throw error
  } finally {
    await migrationClient.end()
  }
}

runMigrations().catch((error) => {
  console.error('Failed to run migrations:', error)
  process.exit(1)
})
