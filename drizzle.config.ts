import { defineConfig } from 'drizzle-kit'
import * as dotenv from 'dotenv'

dotenv.config({ path: './packages/backend/.env' })

export default defineConfig({
  schema: './packages/backend/src/infrastructure/database/schema/index.ts',
  out: './packages/backend/src/infrastructure/database/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  verbose: true,
  strict: true,
})
