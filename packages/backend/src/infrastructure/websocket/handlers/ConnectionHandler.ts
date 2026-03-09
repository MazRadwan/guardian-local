/**
 * ConnectionHandler - WebSocket connection and authentication middleware
 *
 * Story 28.4.1: Extract auth middleware from ChatServer.ts
 * Story 28.4.2: Extract handleConnection with room join and resume logic
 * Story 28.4.3: Extract handleDisconnect with logging
 *
 * ARCHITECTURE: Infrastructure layer only.
 * - Handles Socket.IO authentication via JWT
 * - Augments socket with userId, userEmail, userRole
 * - Uses IAuthenticatedSocket interface from ChatContext.ts
 *
 * CRITICAL: socket.join(`user:${userId}`) MUST be preserved.
 * DocumentUploadController depends on this room for:
 * - upload_progress events
 * - intake_context_ready events
 * - scoring_parse_ready events
 */

import jwt from 'jsonwebtoken';
import type { IAuthenticatedSocket } from '../ChatContext.js';
import type { ConversationService } from '../../../application/services/ConversationService.js';
import type { AuthService } from '../../../application/services/AuthService.js';
import type { Conversation } from '../../../domain/entities/Conversation.js';
import type { IVisionContentBuilder } from '../../../application/interfaces/IVisionContentBuilder.js';

/**
 * JWT payload structure from authentication tokens
 */
interface JWTPayload {
  userId: string;
  email?: string;
  role?: string;
}

/**
 * Socket.IO middleware function type
 * Uses unknown socket type to avoid Socket.IO dependency in the interface
 */
type SocketMiddleware = (socket: unknown, next: (err?: Error) => void) => void;

/**
 * Result from handleConnection
 * Returns conversation (if resumed) and resume status
 */
export interface ConnectionResult {
  conversation: Conversation | null;
  resumed: boolean;
}

/**
 * connection_ready event payload
 * CRITICAL: ALL fields must be preserved to avoid frontend regressions
 */
export interface ConnectionReadyPayload {
  /** Human-readable connection status */
  message: string;
  /** Authenticated user ID */
  userId: string;
  /** Resumed conversation ID (if any) */
  conversationId?: string;
  /** Whether conversation was resumed */
  resumed: boolean;
  /** Whether user has active conversation */
  hasActiveConversation: boolean;
  /** Assessment ID from conversation (if any) */
  assessmentId: string | null;
}

/**
 * ConnectionHandler - Manages WebSocket authentication and connection
 *
 * Responsibilities:
 * 1. Create auth middleware for Socket.IO namespace
 * 2. Verify JWT tokens from handshake auth
 * 3. Augment socket with user information
 * 4. Handle new connections with room join
 * 5. Resume existing conversations on reconnect
 *
 * Error handling:
 * - Missing token: Error with "Authentication token required"
 * - Invalid/expired/malformed token: Error with "Invalid authentication token"
 *
 * Resume behavior:
 * - Resume failures do NOT auto-create conversations
 * - Logs and waits for `start_new_conversation` event
 * - socket.conversationId remains undefined when no valid resume
 */
export class ConnectionHandler {
  constructor(
    private readonly conversationService: ConversationService,
    private readonly jwtSecret: string,
    private readonly visionContentBuilder?: IVisionContentBuilder,
    private readonly authService?: AuthService
  ) {}

  /**
   * Create Socket.IO authentication middleware
   *
   * Verifies JWT from socket.handshake.auth.token and augments
   * socket with user information.
   *
   * @returns Socket.IO middleware function
   *
   * @example
   * ```typescript
   * const handler = new ConnectionHandler(jwtSecret);
   * chatNamespace.use(handler.createAuthMiddleware());
   * ```
   */
  createAuthMiddleware(): SocketMiddleware {
    return (rawSocket: unknown, next: (err?: Error) => void) => {
      // Cast to IAuthenticatedSocket for type-safe access
      const socket = rawSocket as IAuthenticatedSocket;

      // Extract token from handshake auth
      const token = socket.handshake?.auth?.token;

      // Guard: Missing token
      if (!token) {
        return next(new Error('Authentication token required'));
      }

      try {
        // Verify and decode JWT
        const decoded = jwt.verify(token, this.jwtSecret) as JWTPayload;

        // Validate user still exists in DB (prevents deleted users from connecting)
        if (this.authService) {
          await this.authService.validateToken(token);
        }

        // Augment socket with user information
        socket.userId = decoded.userId;
        socket.userEmail = decoded.email;
        socket.userRole = decoded.role;

        // Authentication successful
        next();
      } catch (error) {
        // Log for debugging (token errors include expired, invalid signature, malformed)
        console.error('[ConnectionHandler] Authentication failed:', error);

        // Return generic error to client (don't leak token validation details)
        next(new Error('Invalid authentication token'));
      }
    };
  }

  /**
   * Handle socket disconnection
   *
   * Story 28.4.3: Extracted disconnect handler
   * Epic 30: Added Vision cache cleanup on disconnect
   *
   * Logs disconnection with socket ID and reason for debugging.
   * Clears Vision API image cache for the conversation to prevent memory leaks.
   *
   * @param socket - Disconnecting socket
   * @param reason - Disconnect reason from Socket.IO (e.g., 'transport close', 'client namespace disconnect')
   */
  handleDisconnect(socket: IAuthenticatedSocket, reason: string): void {
    console.log(`[ConnectionHandler] Client disconnected: ${socket.id} (User: ${socket.userId}, Reason: ${reason})`);

    // Epic 30: Clear Vision content cache on disconnect to prevent memory leaks
    // Cache is conversation-scoped, so only clear if there's an active conversation
    if (socket.conversationId && this.visionContentBuilder) {
      this.visionContentBuilder.clearConversationCache(socket.conversationId);
      console.log(`[ConnectionHandler] Cleared vision cache for conversation ${socket.conversationId}`);
    }
  }

  /**
   * Handle new socket connection
   *
   * Story 28.4.2: Extracted from ChatServer.setupNamespace()
   *
   * CRITICAL: Room join MUST be preserved - DocumentUploadController
   * depends on user:{userId} room for:
   * - upload_progress events
   * - intake_context_ready events
   * - scoring_parse_ready events
   *
   * Resume behavior:
   * - If conversationId in handshake, attempts to resume
   * - Validates ownership (userId must match)
   * - On failure: does NOT auto-create, logs and waits for start_new_conversation
   * - socket.conversationId remains undefined when no valid resume
   *
   * @param socket - Authenticated socket (userId already set by auth middleware)
   * @returns ConnectionResult with conversation (if resumed) and resume status
   */
  async handleConnection(socket: IAuthenticatedSocket): Promise<ConnectionResult> {
    console.log(`[ConnectionHandler] Client connected: ${socket.id} (User: ${socket.userId})`);

    // CRITICAL: Join user-specific room for document upload events
    // This room is used by DocumentUploadController to emit upload_progress,
    // intake_context_ready, and scoring_parse_ready events
    if (socket.userId) {
      socket.join(`user:${socket.userId}`);
      console.log(`[ConnectionHandler] Socket ${socket.id} joined room user:${socket.userId}`);
    }

    // Check if client wants to resume an existing conversation
    const resumeConversationId = socket.handshake?.auth?.conversationId;
    let conversation: Conversation | null = null;
    let resumed = false;

    if (resumeConversationId) {
      try {
        // Try to resume existing conversation
        const existing = await this.conversationService.getConversation(resumeConversationId);

        // Validate ownership - only allow resuming own conversations
        if (existing && existing.userId === socket.userId) {
          conversation = existing;
          resumed = true;
          console.log(`[ConnectionHandler] Resumed conversation ${resumeConversationId} for user ${socket.userId}`);
        } else {
          // Invalid or not owned - do NOT auto-create
          console.log(`[ConnectionHandler] Cannot resume conversation ${resumeConversationId} - user must create new conversation explicitly`);
        }
      } catch (error) {
        // Resume failed - do NOT auto-create
        console.error('[ConnectionHandler] Error resuming conversation:', error);
        console.log('[ConnectionHandler] User must create new conversation explicitly');
      }
    } else {
      // No saved conversation - do NOT auto-create
      // Frontend will request new conversation via start_new_conversation event
      console.log(`[ConnectionHandler] No saved conversation - awaiting explicit new conversation request from user ${socket.userId}`);
    }

    // Store conversationId in socket for this session (may be undefined)
    socket.conversationId = conversation?.id;

    // Build connection_ready payload with ALL required fields
    const payload: ConnectionReadyPayload = {
      message: resumed
        ? 'Reconnected to existing conversation'
        : 'Connected to Guardian chat server',
      userId: socket.userId!,
      conversationId: conversation?.id,
      resumed,
      hasActiveConversation: conversation !== null,
      assessmentId: conversation?.assessmentId ?? null,
    };

    // Emit connection ready
    socket.emit('connection_ready', payload);

    return { conversation, resumed };
  }
}
