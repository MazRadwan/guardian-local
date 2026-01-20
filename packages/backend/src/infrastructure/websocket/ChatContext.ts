import type { RateLimiter } from './RateLimiter.js';
import type { PromptCacheManager } from '../ai/PromptCacheManager.js';

/**
 * Handshake auth shape - passed during socket connection
 * This avoids leaking Socket.IO types while providing type-safe access
 */
export interface ISocketHandshakeAuth {
  /** JWT token for authentication */
  token?: string;
  /** Conversation ID for resume requests */
  conversationId?: string;
}

/**
 * IAuthenticatedSocket - Abstract socket interface for handlers
 *
 * ARCHITECTURE: Handlers receive this interface, not concrete Socket.IO type.
 * This enables:
 * - Unit testing with mock sockets
 * - Transport abstraction (could support other protocols)
 * - Clear contract for handler dependencies
 *
 * LIFECYCLE: userId is optional before auth middleware runs.
 * Auth middleware sets userId after JWT verification.
 */
export interface IAuthenticatedSocket {
  /** Unique socket connection ID */
  readonly id: string;

  /**
   * Authenticated user ID
   * - Optional: undefined before auth middleware runs
   * - Writable: auth middleware sets this after JWT verification
   */
  userId?: string;

  /** User email from JWT (optional) */
  userEmail?: string;

  /** User role from JWT (optional) */
  userRole?: string;

  /** Current conversation ID (mutable, updated on conversation switch) */
  conversationId?: string;

  /** Socket data store for custom properties */
  data: Record<string, unknown>;

  /**
   * Handshake auth data - used by connection handler
   * Provides type-safe access without importing Socket.IO
   */
  handshake: {
    auth: ISocketHandshakeAuth;
  };

  /**
   * Emit event to this socket
   * @param event - Event name
   * @param data - Event payload
   */
  emit(event: string, data: unknown): void;

  /**
   * Join a room for targeted broadcasts
   * @param room - Room name (e.g., "user:{userId}")
   */
  join(room: string): void;
}

/**
 * Type guard to check if socket has completed authentication
 * NOTE: Checks userId is present (not just that socket matches interface)
 */
export function isAuthenticatedSocket(
  socket: unknown
): socket is IAuthenticatedSocket & { userId: string } {
  return (
    typeof socket === 'object' &&
    socket !== null &&
    'id' in socket &&
    'userId' in socket &&
    typeof (socket as IAuthenticatedSocket).userId === 'string' &&
    typeof (socket as IAuthenticatedSocket).emit === 'function'
  );
}

/**
 * ChatContext - Shared state for WebSocket handlers
 *
 * ARCHITECTURE: Infrastructure layer only.
 * Per architecture-layers.md: No Socket.IO types, no WebSocket concerns
 * leak to application/domain layers.
 *
 * This is NOT a service locator - application services are injected
 * via constructor, not accessed through ChatContext.
 */
export interface ChatContext {
  /**
   * Idempotency guard for conversation creation
   * Prevents duplicate conversations from rapid double-clicks
   */
  pendingCreations: Map<string, { conversationId: string; timestamp: number }>;

  /**
   * Stream abort tracking
   * Tracks conversations with aborted streams for cleanup
   */
  abortedStreams: Set<string>;

  /**
   * Rate limiter instance
   * Enforces per-user message rate limits
   */
  rateLimiter: RateLimiter;

  /**
   * Prompt cache manager
   * Manages cached prompts for performance optimization
   */
  promptCache: PromptCacheManager;
}

/**
 * Create a new ChatContext with initialized collections
 */
export function createChatContext(
  rateLimiter: RateLimiter,
  promptCache: PromptCacheManager
): ChatContext {
  return {
    pendingCreations: new Map(),
    abortedStreams: new Set(),
    rateLimiter,
    promptCache,
  };
}
