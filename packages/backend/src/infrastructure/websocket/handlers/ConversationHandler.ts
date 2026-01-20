/**
 * ConversationHandler - WebSocket handler for conversation management events
 *
 * Story 28.5.1: Extract handleGetConversations from ChatServer.ts
 * Story 28.5.2: Add handleStartNewConversation and handleDeleteConversation
 * Story 28.5.3: Add handleGetHistory (get_history event)
 *
 * ARCHITECTURE: Infrastructure layer only.
 * - Handles get_conversations event
 * - Handles start_new_conversation event (with idempotency guard)
 * - Handles delete_conversation event (with ownership validation)
 * - Handles get_history event (idempotent empty history on missing conversation)
 * - Returns conversation list with titles and metadata
 * - Auth check preserved (emit error if socket.userId is undefined)
 *
 * CRITICAL: Response format MUST be preserved to avoid frontend regressions.
 * The conversations_list event payload includes:
 * - id, title, createdAt, updatedAt, mode
 *
 * The conversation_created event payload includes:
 * - conversation: { id, title, createdAt, updatedAt, mode }
 *
 * The history event payload includes:
 * - conversationId, messages[] (with shaped attachments, NO storagePath)
 */

import type { ConversationService } from '../../../application/services/ConversationService.js';
import type { IAuthenticatedSocket, ChatContext } from '../ChatContext.js';
import type { ConversationMode } from '../../../domain/entities/Conversation.js';
import { sanitizeErrorForClient } from '../../../utils/sanitize.js';

/**
 * Conversation metadata returned to clients
 * CRITICAL: ALL fields must be preserved for frontend compatibility
 */
export interface ConversationMetadata {
  /** Unique conversation ID */
  id: string;
  /** Conversation title (from DB or first message) */
  title: string;
  /** When conversation was started */
  createdAt: Date;
  /** Last activity timestamp */
  updatedAt: Date;
  /** Conversation mode (consult, assessment, or scoring) */
  mode: ConversationMode;
}

/**
 * conversations_list event payload
 */
export interface ConversationsListPayload {
  conversations: ConversationMetadata[];
}

/**
 * conversation_created event payload
 * CRITICAL: Event name is conversation_created (NOT conversation_started)
 */
export interface ConversationCreatedPayload {
  conversation: ConversationMetadata;
}

/**
 * start_new_conversation event payload
 */
export interface StartNewConversationPayload {
  /** Mode is ignored - always creates in 'consult' mode */
  mode?: 'consult' | 'assessment';
}

/**
 * delete_conversation event payload
 */
export interface DeleteConversationPayload {
  conversationId: string;
}

/**
 * conversation_deleted event payload
 */
export interface ConversationDeletedPayload {
  conversationId: string;
}

/**
 * get_history event payload
 * CRITICAL: conversationId is REQUIRED - no fallback to socket.conversationId
 */
export interface GetHistoryPayload {
  /** Conversation ID to get history for (REQUIRED) */
  conversationId: string;
  /** Maximum number of messages to return (default 50) */
  limit?: number;
  /** Offset for pagination (default 0) */
  offset?: number;
}

/**
 * Shaped attachment for client response
 * SECURITY: storagePath is intentionally excluded
 */
export interface ShapedAttachment {
  fileId: string;
  filename: string;
  mimeType: string;
  size: number;
}

/**
 * Shaped message for client response
 */
export interface ShapedMessage {
  id: string;
  conversationId: string;
  role: string;
  content: { text: string; components?: unknown[] };
  createdAt: Date;
  attachments?: ShapedAttachment[];
}

/**
 * history event payload
 * CRITICAL: Event name is 'history' (NOT 'conversation_history')
 */
export interface HistoryPayload {
  conversationId: string;
  messages: ShapedMessage[];
}

/**
 * ConversationHandler - Manages conversation lifecycle
 *
 * Responsibilities:
 * 1. Handle get_conversations event - list user's conversations
 * 2. Handle start_new_conversation event - create new conversation (with idempotency)
 * 3. Handle delete_conversation event - delete conversation (with ownership validation)
 * 4. Handle get_history event - get conversation message history (idempotent)
 * 5. Fetch user's conversations with titles
 * 6. Return properly formatted metadata
 * 7. Provide centralized ownership validation via validateOwnership()
 *
 * Idempotency:
 * - start_new_conversation: 200ms guard prevents double-click duplicates
 * - delete_conversation: Returns success even if already deleted
 * - get_history: Returns empty messages array if conversation not found
 *
 * Security:
 * - Ownership validation prevents cross-user access
 * - Error messages hide ownership info ("Conversation not found" not "Unauthorized")
 * - Attachments shaped without storagePath (never expose file paths to client)
 *
 * Error handling:
 * - Unauthenticated users receive error with event name
 * - Service errors are sanitized before sending to client
 */
export class ConversationHandler {
  constructor(
    private readonly conversationService: ConversationService
  ) {}

  /**
   * Validate that a conversation exists and is owned by the given user
   *
   * This is a centralized validation method that can be used by any handler
   * method that needs to verify conversation ownership before performing
   * operations on it.
   *
   * @param conversationId - The ID of the conversation to validate
   * @param userId - The ID of the user who should own the conversation
   * @throws Error if conversation not found
   * @throws Error if conversation is not owned by the specified user
   */
  async validateOwnership(conversationId: string, userId: string): Promise<void> {
    const conversation = await this.conversationService.getConversation(conversationId);

    if (!conversation) {
      throw new Error(`Conversation ${conversationId} not found`);
    }

    if (conversation.userId !== userId) {
      console.warn(
        `[ConversationHandler] User ${userId} attempted to access conversation ${conversationId} owned by ${conversation.userId}`
      );
      throw new Error('Unauthorized: You do not have access to this conversation');
    }
  }

  /**
   * Handle get_conversations event
   *
   * Fetches all conversations for the authenticated user and returns
   * them with titles and metadata.
   *
   * CRITICAL: Auth check MUST be performed first.
   * CRITICAL: Response format must match ConversationsListPayload.
   *
   * @param socket - Authenticated socket
   */
  async handleGetConversations(socket: IAuthenticatedSocket): Promise<void> {
    try {
      // Auth check - must have userId
      if (!socket.userId) {
        socket.emit('error', {
          event: 'get_conversations',
          message: 'User not authenticated',
        });
        return;
      }

      console.log(`[ConversationHandler] Fetching conversations for user ${socket.userId}`);

      // Fetch user's conversations
      const conversations = await this.conversationService.getUserConversations(socket.userId);

      console.log(`[ConversationHandler] Found ${conversations.length} conversations for user ${socket.userId}`);

      // Generate titles and build metadata for each conversation
      const conversationsWithMetadata: ConversationMetadata[] = await Promise.all(
        conversations.map(async (conv) => {
          const title = await this.conversationService.getConversationTitle(conv.id);

          return {
            id: conv.id,
            title,
            createdAt: conv.startedAt,
            updatedAt: conv.lastActivityAt,
            mode: conv.mode,
          };
        })
      );

      // Emit conversations list
      socket.emit('conversations_list', {
        conversations: conversationsWithMetadata,
      });

      console.log(`[ConversationHandler] Emitted conversations_list with ${conversations.length} conversations`);
    } catch (error) {
      console.error('[ConversationHandler] Error fetching conversations:', error);
      socket.emit('error', {
        event: 'get_conversations',
        message: sanitizeErrorForClient(error, 'Failed to fetch conversations'),
      });
    }
  }

  /**
   * Handle start_new_conversation event
   *
   * Creates a new conversation for the authenticated user.
   * Includes idempotency guard to prevent duplicate conversations from
   * rapid double-clicks (200ms window).
   *
   * CRITICAL: Always creates in 'consult' mode regardless of payload.
   * CRITICAL: Event name is conversation_created (NOT conversation_started).
   *
   * @param socket - Authenticated socket
   * @param payload - Start conversation payload (mode is ignored)
   * @param chatContext - Shared chat context with pendingCreations map
   */
  async handleStartNewConversation(
    socket: IAuthenticatedSocket,
    payload: StartNewConversationPayload,
    chatContext: ChatContext
  ): Promise<void> {
    try {
      // Auth check - must have userId
      if (!socket.userId) {
        socket.emit('error', {
          event: 'start_new_conversation',
          message: 'User not authenticated',
        });
        return;
      }

      const userId = socket.userId;

      // Idempotency guard - 200ms prevents accidental double-clicks
      const pending = chatContext.pendingCreations.get(userId);
      if (pending && Date.now() - pending.timestamp < 200) {
        console.log(`[ConversationHandler] Conversation creation already in progress for user ${userId}`);

        // Return the pending conversation info
        const existingConv = await this.conversationService.getConversation(pending.conversationId);
        if (existingConv) {
          socket.emit('conversation_created', {
            conversation: {
              id: existingConv.id,
              title: 'New Chat',
              createdAt: existingConv.startedAt,
              updatedAt: existingConv.lastActivityAt,
              mode: existingConv.mode,
            },
          });
        }
        return;
      }

      console.log(`[ConversationHandler] Starting new conversation for user ${userId}`);

      // Create new conversation - ALWAYS default to 'consult' mode
      const conversation = await this.conversationService.createConversation({
        userId,
        mode: 'consult',
      });

      // Track creation to prevent duplicates
      chatContext.pendingCreations.set(userId, {
        conversationId: conversation.id,
        timestamp: Date.now(),
      });

      // Update socket's current conversation ID
      socket.conversationId = conversation.id;

      // Emit conversation_created event (NOT conversation_started)
      socket.emit('conversation_created', {
        conversation: {
          id: conversation.id,
          title: 'New Chat',
          createdAt: conversation.startedAt,
          updatedAt: conversation.lastActivityAt,
          mode: conversation.mode,
        },
      });

      console.log(`[ConversationHandler] New conversation ${conversation.id} created and set as active`);

      // Clear pending after 200ms (allows accidental double-clicks to use cached value)
      setTimeout(() => {
        chatContext.pendingCreations.delete(userId);
      }, 200);
    } catch (error) {
      console.error('[ConversationHandler] Error starting new conversation:', error);

      // Clear pending on error (prevents stuck state)
      if (socket.userId) {
        chatContext.pendingCreations.delete(socket.userId);
      }

      socket.emit('error', {
        event: 'start_new_conversation',
        message: sanitizeErrorForClient(error, 'Failed to create conversation'),
      });
    }
  }

  /**
   * Handle delete_conversation event
   *
   * Deletes a conversation owned by the authenticated user.
   * Implements idempotent deletion - returns success even if already deleted.
   *
   * Security: Returns "Conversation not found" for unauthorized access
   * (hides ownership information from potential attackers).
   *
   * @param socket - Authenticated socket
   * @param payload - Delete conversation payload with conversationId
   */
  async handleDeleteConversation(
    socket: IAuthenticatedSocket,
    payload: DeleteConversationPayload
  ): Promise<void> {
    // Auth check - must have userId
    if (!socket.userId) {
      socket.emit('error', {
        event: 'delete_conversation',
        message: 'User not authenticated',
      });
      return;
    }

    const { conversationId } = payload;

    // Validate required field
    if (!conversationId) {
      socket.emit('error', {
        event: 'delete_conversation',
        message: 'conversationId is required',
      });
      return;
    }

    try {
      console.log(`[ConversationHandler] Deleting conversation ${conversationId} for user ${socket.userId}`);

      // Check if conversation exists
      const conversation = await this.conversationService.getConversation(conversationId);

      if (!conversation) {
        // IDEMPOTENT: Already deleted - return success
        console.log(`[ConversationHandler] Conversation ${conversationId} already deleted - returning success`);
        socket.emit('conversation_deleted', { conversationId });

        // Clear active conversation if this was it
        if (socket.conversationId === conversationId) {
          socket.conversationId = undefined;
        }
        return;
      }

      // Ownership validation - hide ownership info for security
      if (conversation.userId !== socket.userId) {
        console.warn(
          `[ConversationHandler] SECURITY: User ${socket.userId} attempted to delete ` +
          `conversation ${conversationId} owned by ${conversation.userId}`
        );
        // Return generic "not found" to hide ownership information
        socket.emit('error', {
          event: 'delete_conversation',
          message: 'Conversation not found',
        });
        return;
      }

      // Delete from database
      await this.conversationService.deleteConversation(conversationId);

      console.log(`[ConversationHandler] Successfully deleted conversation ${conversationId}`);

      // Emit confirmation to client
      socket.emit('conversation_deleted', { conversationId });

      // Clear active conversation if this was it
      if (socket.conversationId === conversationId) {
        socket.conversationId = undefined;
      }
    } catch (error) {
      console.error('[ConversationHandler] Error deleting conversation:', error);
      socket.emit('error', {
        event: 'delete_conversation',
        message: sanitizeErrorForClient(error, 'Failed to delete conversation'),
      });
    }
  }

  /**
   * Handle get_history event
   *
   * Gets message history for a conversation with pagination support.
   *
   * CRITICAL: conversationId is REQUIRED - does NOT fallback to socket.conversationId
   * CRITICAL: Emits 'history' event (NOT 'conversation_history')
   * CRITICAL: Returns empty messages array when conversation not found (idempotent)
   *
   * Security:
   * - Ownership validation if conversation exists
   * - Attachments shaped without storagePath (never expose file paths)
   *
   * @param socket - Authenticated socket
   * @param payload - Get history payload with conversationId (required)
   */
  async handleGetHistory(
    socket: IAuthenticatedSocket,
    payload: GetHistoryPayload
  ): Promise<void> {
    try {
      console.log(`[ConversationHandler] History requested for conversation ${payload.conversationId}`);

      // Auth check - must have userId
      if (!socket.userId) {
        socket.emit('error', {
          event: 'get_history',
          message: 'User not authenticated',
        });
        return;
      }

      // Validate required field - NO fallback to socket.conversationId
      if (!payload.conversationId) {
        socket.emit('error', {
          event: 'get_history',
          message: 'conversationId is required',
        });
        return;
      }

      // Check if conversation exists
      const conversation = await this.conversationService.getConversation(payload.conversationId);

      if (!conversation) {
        // IDEMPOTENT: Conversation doesn't exist - return empty history (NOT error)
        console.log(`[ConversationHandler] Conversation ${payload.conversationId} not found - returning empty history`);
        socket.emit('history', {
          conversationId: payload.conversationId,
          messages: [],
        });
        return;
      }

      // Ownership validation - if conversation exists, user must own it
      if (conversation.userId !== socket.userId) {
        console.warn(
          `[ConversationHandler] SECURITY: User ${socket.userId} attempted to access ` +
          `conversation ${payload.conversationId} owned by ${conversation.userId}`
        );
        socket.emit('error', {
          event: 'get_history',
          message: 'Unauthorized: You do not have access to this conversation',
        });
        return;
      }

      // Get message history with pagination
      // Note: ConversationService.getHistory throws if conversation not found,
      // but we already checked existence above, so this is safe
      const messages = await this.conversationService.getHistory(
        payload.conversationId,
        payload.limit,
        payload.offset
      );

      // Shape messages for client - strip storagePath from attachments
      const shapedMessages: ShapedMessage[] = messages.map((msg) => ({
        id: msg.id,
        conversationId: msg.conversationId,
        role: msg.role,
        content: msg.content,
        createdAt: msg.createdAt,
        // Only include attachments if they exist and are non-empty
        ...(msg.attachments && msg.attachments.length > 0 && {
          attachments: msg.attachments.map((att) => ({
            fileId: att.fileId,
            filename: att.filename,
            mimeType: att.mimeType,
            size: att.size,
            // SECURITY: storagePath intentionally excluded
          })),
        }),
      }));

      // Emit history event (NOT conversation_history)
      socket.emit('history', {
        conversationId: payload.conversationId,
        messages: shapedMessages,
      });

      console.log(`[ConversationHandler] Sent ${messages.length} messages for conversation ${payload.conversationId}`);
    } catch (error) {
      console.error('[ConversationHandler] Error getting history:', error);
      socket.emit('error', {
        event: 'get_history',
        message: sanitizeErrorForClient(error, 'Failed to get history'),
      });
    }
  }
}
