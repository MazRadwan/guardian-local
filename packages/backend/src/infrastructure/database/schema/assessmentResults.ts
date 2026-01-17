import { pgTable, uuid, text, integer, timestamp, index, unique, jsonb, varchar } from 'drizzle-orm/pg-core'
import { assessments } from './assessments'

/**
 * Narrative generation status values
 * - null: not started
 * - 'generating': claim acquired, LLM call in progress
 * - 'complete': narrative generated successfully
 * - 'failed': generation failed, can be retried
 */
export type NarrativeStatus = 'generating' | 'complete' | 'failed'

export const assessmentResults = pgTable(
  'assessment_results',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    assessmentId: uuid('assessment_id')
      .notNull()
      .references(() => assessments.id, { onDelete: 'cascade' }),
    batchId: uuid('batch_id').notNull(),

    // Composite scoring
    compositeScore: integer('composite_score').notNull(), // 0-100
    recommendation: text('recommendation').notNull().$type<'approve' | 'conditional' | 'decline' | 'more_info'>(),
    overallRiskRating: text('overall_risk_rating').notNull().$type<'low' | 'medium' | 'high' | 'critical'>(),

    // Generated content
    narrativeReport: text('narrative_report'), // Full markdown from Claude
    executiveSummary: text('executive_summary'),
    keyFindings: jsonb('key_findings').$type<string[]>(),
    disqualifyingFactors: jsonb('disqualifying_factors').$type<string[]>(),

    // Narrative generation status (Epic 20: concurrency-safe claim pattern)
    narrativeStatus: varchar('narrative_status', { length: 20 }).$type<NarrativeStatus>(),
    narrativeClaimedAt: timestamp('narrative_claimed_at', { withTimezone: true }),
    narrativeCompletedAt: timestamp('narrative_completed_at', { withTimezone: true }),
    narrativeError: text('narrative_error'),

    // Provenance (for auditability)
    rubricVersion: text('rubric_version').notNull(), // 'guardian-v1.0'
    modelId: text('model_id').notNull(), // 'claude-sonnet-4-5-20250929'
    rawToolPayload: jsonb('raw_tool_payload'), // Original scoring_complete payload

    // Audit
    scoredAt: timestamp('scored_at').defaultNow().notNull(),
    scoringDurationMs: integer('scoring_duration_ms'),
  },
  (table) => ({
    assessmentIdx: index('assessment_results_assessment_idx').on(table.assessmentId),
    // Idempotency: one result per batch
    uniqueBatch: unique('assessment_results_batch_unique').on(table.assessmentId, table.batchId),
    // Index for efficient narrative status queries (partial index for non-null statuses)
    narrativeStatusIdx: index('assessment_results_narrative_status_idx').on(table.narrativeStatus),
  })
)

export type AssessmentResult = typeof assessmentResults.$inferSelect
export type NewAssessmentResult = typeof assessmentResults.$inferInsert
