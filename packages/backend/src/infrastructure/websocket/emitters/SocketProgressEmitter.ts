/**
 * SocketProgressEmitter - WebSocket progress emitter for questionnaire generation
 *
 * Story 32.1.3: Implements IProgressEmitter using direct socket.emit()
 *
 * Uses direct socket.emit() (NOT io.to(room).emit()) to match ChatServer patterns.
 * Progress events are client-specific, not broadcast to conversation rooms.
 *
 * Event: questionnaire_progress
 * Payload: { conversationId, message, step, totalSteps, timestamp, seq }
 */

import type { IProgressEmitter, ProgressEvent } from '../../../application/interfaces/IProgressEmitter.js';
import type { IAuthenticatedSocket } from '../ChatContext.js';

/**
 * WebSocket progress event payload (extends ProgressEvent with conversationId)
 */
export interface WebSocketProgressEvent extends ProgressEvent {
  conversationId: string;
}

/**
 * SocketProgressEmitter - Emits progress events directly to the client socket
 *
 * IMPORTANT: This uses direct socket.emit(), NOT room-based io.to(room).emit().
 * Guardian's ChatServer architecture uses direct socket emission for all events
 * because:
 * 1. Users only connect to their own conversations
 * 2. Progress events are specific to the requesting client
 * 3. Room-based emission is unnecessary overhead
 */
export class SocketProgressEmitter implements IProgressEmitter {
  constructor(
    private readonly socket: IAuthenticatedSocket,
    private readonly conversationId: string
  ) {}

  /**
   * Emit a progress event to the client socket
   *
   * @param message - Human-readable progress message
   * @param step - Current step number (1-based)
   * @param totalSteps - Total expected steps
   * @param seq - Monotonic sequence number (client can reject out-of-order events)
   */
  emit(message: string, step: number, totalSteps: number, seq: number): void {
    const event: WebSocketProgressEvent = {
      conversationId: this.conversationId,
      message,
      step,
      totalSteps,
      timestamp: Date.now(),
      seq,
    };

    // Direct socket emission - NOT room-based
    this.socket.emit('questionnaire_progress', event);
  }
}

/**
 * Factory function for creating socket progress emitters
 *
 * @param socket - The client's WebSocket connection (IAuthenticatedSocket interface)
 * @param conversationId - The conversation receiving progress updates
 * @returns IProgressEmitter implementation bound to the socket
 */
export function createSocketProgressEmitter(
  socket: IAuthenticatedSocket,
  conversationId: string
): IProgressEmitter {
  return new SocketProgressEmitter(socket, conversationId);
}
