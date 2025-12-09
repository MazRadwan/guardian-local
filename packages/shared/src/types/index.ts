// Shared types across frontend and backend
export type UserRole = 'admin' | 'analyst' | 'viewer'
export type ConversationMode = 'consult' | 'assessment'
export type ConversationStatus = 'active' | 'completed'
export type MessageRole = 'user' | 'assistant' | 'system'
export type AssessmentType = 'quick' | 'comprehensive' | 'category_focused'
export type AssessmentStatus = 'draft' | 'questions_generated' | 'exported' | 'cancelled'
export type QuestionType = 'text' | 'enum' | 'boolean'

// Generation phase types (Story 13.5.1)
// Used by backend to emit phase events and frontend to track progress

/**
 * Phase identifiers for questionnaire generation
 * Matches GENERATION_STEPS in chatStore.ts
 */
export const GENERATION_PHASES = ['context', 'generating', 'validating', 'saving'] as const;
export type GenerationPhaseId = typeof GENERATION_PHASES[number];

/**
 * Payload for generation_phase WebSocket events
 *
 * @example
 * socket.emit('generation_phase', {
 *   conversationId: 'conv-123',
 *   phase: 1,
 *   phaseId: 'generating',
 *   timestamp: Date.now(),
 * });
 */
export interface GenerationPhasePayload {
  conversationId: string;
  phase: number;
  phaseId: GenerationPhaseId;
  timestamp: number;
}
