import { db, queryClient } from '../../src/infrastructure/database/client'
import { sql } from 'drizzle-orm'

describe('Database Connection', () => {
  afterAll(async () => {
    await queryClient.end()
  })

  it('should connect to PostgreSQL successfully', async () => {
    const result = await db.execute(sql`SELECT 1 as value`)
    expect(result).toBeDefined()
    expect(result.length).toBeGreaterThan(0)
  })

  it('should execute a simple query', async () => {
    const result = await db.execute(sql`SELECT NOW() as current_time`)
    expect(result).toBeDefined()
    expect(result[0]).toHaveProperty('current_time')
  })
})
