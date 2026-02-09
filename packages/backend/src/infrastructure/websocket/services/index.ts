/**
 * WebSocket Services barrel export
 *
 * Epic 34: Infrastructure layer services for WebSocket operations
 * Epic 35: Title update service extraction
 * Story 36.2.1: ClaudeStreamingService extraction
 */

export { ClaudeStreamingService } from './ClaudeStreamingService.js';

export { ConsultToolLoopService } from './ConsultToolLoopService.js';
export type {
  IConsultToolLoopService,
  ConsultToolLoopOptions,
  ConsultToolLoopResult
} from './IConsultToolLoopService.js';

export { TitleUpdateService } from './TitleUpdateService.js';
export type { ITitleUpdateService } from './ITitleUpdateService.js';
