import { pgTable, uuid, text, integer, timestamp, index, unique, jsonb } from 'drizzle-orm/pg-core'
import { assessments } from './assessments'

export const dimensionScores = pgTable(
  'dimension_scores',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    assessmentId: uuid('assessment_id')
      .notNull()
      .references(() => assessments.id, { onDelete: 'cascade' }),
    batchId: uuid('batch_id').notNull(),

    dimension: text('dimension').notNull(), // 'clinical_risk', 'privacy_risk', etc.
    score: integer('score').notNull(), // 0-100
    riskRating: text('risk_rating').notNull().$type<'low' | 'medium' | 'high' | 'critical'>(),

    // Detailed findings
    findings: jsonb('findings').$type<{
      subScores: Array<{ name: string; score: number; maxScore: number; notes: string }>
      keyRisks: string[]
      mitigations: string[]
      evidenceRefs: Array<{ sectionNumber: number; questionNumber: number; quote: string }>
      // ISO enrichment (Epic 37)
      assessmentConfidence?: { level: 'high' | 'medium' | 'low'; rationale: string }
      isoClauseReferences?: Array<{ clauseRef: string; title: string; framework: string; status: 'aligned' | 'partial' | 'not_evidenced' | 'not_applicable' }>
    }>(),

    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    assessmentDimensionIdx: index('dimension_scores_assessment_idx').on(table.assessmentId, table.dimension),
    // Idempotency: prevent duplicate scores for same dimension in same batch
    uniqueBatchDimension: unique('dimension_scores_batch_dimension_unique').on(
      table.assessmentId,
      table.batchId,
      table.dimension
    ),
  })
)

export type DimensionScore = typeof dimensionScores.$inferSelect
export type NewDimensionScore = typeof dimensionScores.$inferInsert
