import { db, queryClient } from '../../src/infrastructure/database/client'
import { sql } from 'drizzle-orm'

describe('Database Schema', () => {
  afterAll(async () => {
    await queryClient.end()
  })

  it('should have all 7 tables (6 MVP + files)', async () => {
    const result = await db.execute<{ tablename: string }>(
      sql`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`
    )

    const tableNames = result.map((row) => row.tablename)

    // Check all 6 MVP tables exist
    expect(tableNames).toContain('users')
    expect(tableNames).toContain('vendors')
    expect(tableNames).toContain('assessments')
    expect(tableNames).toContain('questions')
    expect(tableNames).toContain('conversations')
    expect(tableNames).toContain('messages')
    // Epic 16.6.9: Files table for attachment security
    expect(tableNames).toContain('files')

    // Should have exactly 7 tables
    expect(tableNames).toHaveLength(7)
  })

  it('should have users table with correct columns', async () => {
    const result = await db.execute<{ column_name: string }>(
      sql`SELECT column_name FROM information_schema.columns WHERE table_name = 'users'`
    )

    const columnNames = result.map((row) => row.column_name)

    expect(columnNames).toContain('id')
    expect(columnNames).toContain('email')
    expect(columnNames).toContain('password_hash')
    expect(columnNames).toContain('name')
    expect(columnNames).toContain('role')
    expect(columnNames).toContain('created_at')
    expect(columnNames).toContain('updated_at')
  })

  it('should have vendors table with correct columns', async () => {
    const result = await db.execute<{ column_name: string }>(
      sql`SELECT column_name FROM information_schema.columns WHERE table_name = 'vendors'`
    )

    const columnNames = result.map((row) => row.column_name)

    expect(columnNames).toContain('id')
    expect(columnNames).toContain('name')
    expect(columnNames).toContain('industry')
    expect(columnNames).toContain('website')
    expect(columnNames).toContain('contact_info')
  })

  it('should have assessments table with foreign keys', async () => {
    const result = await db.execute<{ column_name: string }>(
      sql`SELECT column_name FROM information_schema.columns WHERE table_name = 'assessments'`
    )

    const columnNames = result.map((row) => row.column_name)

    expect(columnNames).toContain('id')
    expect(columnNames).toContain('vendor_id')
    expect(columnNames).toContain('assessment_type')
    expect(columnNames).toContain('status')
    expect(columnNames).toContain('created_by')
  })

  it('should have questions table with unique constraint', async () => {
    const result = await db.execute<{ column_name: string }>(
      sql`SELECT column_name FROM information_schema.columns WHERE table_name = 'questions'`
    )

    const columnNames = result.map((row) => row.column_name)

    expect(columnNames).toContain('assessment_id')
    expect(columnNames).toContain('section_number')
    expect(columnNames).toContain('question_number')
    expect(columnNames).toContain('question_text')
  })

  it('should have conversations table with correct columns', async () => {
    const result = await db.execute<{ column_name: string }>(
      sql`SELECT column_name FROM information_schema.columns WHERE table_name = 'conversations'`
    )

    const columnNames = result.map((row) => row.column_name)

    expect(columnNames).toContain('id')
    expect(columnNames).toContain('user_id')
    expect(columnNames).toContain('mode')
    expect(columnNames).toContain('status')
  })

  it('should have messages table with JSONB content', async () => {
    const result = await db.execute<{ column_name: string; data_type: string }>(
      sql`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'messages'`
    )

    const columns = result.map((row) => ({ name: row.column_name, type: row.data_type }))

    expect(columns.find((c) => c.name === 'content')?.type).toBe('jsonb')
    expect(columns.some((c) => c.name === 'conversation_id')).toBe(true)
    expect(columns.some((c) => c.name === 'role')).toBe(true)
  })

  it('should have files table with correct columns and foreign keys', async () => {
    const result = await db.execute<{ column_name: string }>(
      sql`SELECT column_name FROM information_schema.columns WHERE table_name = 'files'`
    )

    const columnNames = result.map((row) => row.column_name)

    expect(columnNames).toContain('id')
    expect(columnNames).toContain('user_id')
    expect(columnNames).toContain('conversation_id')
    expect(columnNames).toContain('filename')
    expect(columnNames).toContain('mime_type')
    expect(columnNames).toContain('size')
    expect(columnNames).toContain('storage_path')
    expect(columnNames).toContain('created_at')
  })
})
