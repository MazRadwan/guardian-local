/**
 * IProgressEmitter - Interface for emitting progress events during long-running operations
 *
 * Epic 32: Questionnaire Generation Progress Streaming
 *
 * This interface decouples the service layer from the transport mechanism (WebSocket).
 * Progress messages are timer-based perceived progress, NOT actual generation status,
 * since questionnaire generation is a single Claude API call where we cannot know
 * which dimension Claude is currently processing.
 */

/**
 * Progress event payload sent to clients
 */
export interface ProgressEvent {
  /** Human-readable progress message */
  message: string;

  /** Current step number (1-based) */
  step: number;

  /** Total expected steps */
  totalSteps: number;

  /** Unix timestamp in milliseconds */
  timestamp: number;

  /** Monotonic sequence number for ordering protection (client can reject out-of-order events) */
  seq: number;
}

/**
 * Interface for emitting progress events
 *
 * Implementations can emit to WebSocket, console, or null (no-op).
 * This enables service layer to report progress without knowing transport details.
 */
export interface IProgressEmitter {
  /**
   * Emit a progress event to the client.
   *
   * @param message - Human-readable progress message
   * @param step - Current step number (1-based)
   * @param totalSteps - Total expected steps
   * @param seq - Monotonic sequence number (client can reject out-of-order events)
   */
  emit(message: string, step: number, totalSteps: number, seq: number): void;
}

/**
 * No-op implementation for when progress isn't needed
 *
 * Used as default when no progress reporting is required,
 * enabling backward compatibility with existing code.
 */
export class NullProgressEmitter implements IProgressEmitter {
  /**
   * No-op emit - intentionally does nothing
   *
   * @param _message - Ignored
   * @param _step - Ignored
   * @param _totalSteps - Ignored
   * @param _seq - Ignored
   */
  emit(_message: string, _step: number, _totalSteps: number, _seq: number): void {
    // Intentionally empty - used when no progress reporting needed
  }
}
