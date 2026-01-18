/**
 * Conversation Controller
 *
 * Handles HTTP requests for conversation operations
 * Epic 25: Chat Title Intelligence - PATCH /api/conversations/:id/title
 */

import { Request, Response, NextFunction } from 'express';
import { ConversationService } from '../../../application/services/ConversationService.js';
import { Server as SocketIOServer } from 'socket.io';

export class ConversationController {
  constructor(
    private readonly conversationService: ConversationService,
    private readonly io: SocketIOServer
  ) {}

  /**
   * PATCH /api/conversations/:id/title
   * Update conversation title
   *
   * Epic 25: Chat Title Intelligence
   * Sets titleManuallyEdited=true to prevent auto-updates
   */
  updateTitle = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { id } = req.params;
      const { title } = req.body;

      // Get authenticated user from middleware
      const userId = (req as any).user?.id;

      if (!userId) {
        res.status(401).json({
          error: 'User not authenticated',
        });
        return;
      }

      // Validation
      if (!title || typeof title !== 'string') {
        res.status(400).json({
          error: 'Title is required and must be a string',
        });
        return;
      }

      const trimmedTitle = title.trim();
      if (trimmedTitle.length === 0) {
        res.status(400).json({
          error: 'Title cannot be empty',
        });
        return;
      }

      if (trimmedTitle.length > 50) {
        res.status(400).json({
          error: 'Title must be 50 characters or less',
        });
        return;
      }

      // Get conversation and verify ownership
      const conversation = await this.conversationService.getConversation(id);

      if (!conversation) {
        res.status(404).json({
          error: 'Conversation not found',
        });
        return;
      }

      if (conversation.userId !== userId) {
        res.status(403).json({
          error: 'Not authorized to update this conversation',
        });
        return;
      }

      // Update title with manuallyEdited=true
      await this.conversationService.updateTitle(id, trimmedTitle, true);

      // Emit WebSocket event for real-time update
      this.emitTitleUpdate(id, trimmedTitle);

      res.json({
        conversationId: id,
        title: trimmedTitle,
        titleManuallyEdited: true,
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Emit conversation_title_updated WebSocket event
   */
  private emitTitleUpdate(conversationId: string, title: string): void {
    this.io.of('/chat').emit('conversation_title_updated', {
      conversationId,
      title,
    });
  }
}
