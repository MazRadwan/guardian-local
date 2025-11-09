// Shared types across frontend and backend
export type UserRole = 'admin' | 'analyst' | 'viewer'
export type ConversationMode = 'consult' | 'assessment'
export type ConversationStatus = 'active' | 'completed'
export type MessageRole = 'user' | 'assistant' | 'system'
export type AssessmentType = 'quick' | 'comprehensive' | 'renewal'
export type AssessmentStatus = 'draft' | 'questions_generated' | 'exported' | 'cancelled'
export type QuestionType = 'text' | 'enum' | 'boolean'
