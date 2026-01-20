# Story 28.9.1: Extract MessageHandler.ts (send_message validation)

**Sprint:** 5 - Core Message Flow
**Agent:** backend-agent
**Estimation:** Medium (2-3 files)

---

## Description

Create MessageHandler and implement the validation logic for `send_message` event. This includes rate limiting, conversation validation, input sanitization, and file-only message support.

---

## Acceptance Criteria

- [ ] `MessageHandler.ts` created at `infrastructure/websocket/handlers/`
- [ ] Supports both `text` and `content` fields in payload (`payload.text || payload.content`)
- [ ] Rate limit check using `rateLimiter.isRateLimited(userId)` and `getResetTime(userId)`
- [ ] Conversation ID validation (required from payload, NOT fallback to socket.conversationId)
- [ ] Validates must have text OR attachments (file-only messages supported)
- [ ] Attachment validation via `fileRepository.findByIdAndConversation(fileId, conversationId)`
- [ ] Ownership validation for attachments (`file.userId === socket.userId`)
- [ ] **CRITICAL:** Placeholder text generation for file-only messages preserved
- [ ] Unit tests cover all validation scenarios including file-only

---

## Technical Approach

```typescript
// infrastructure/websocket/handlers/MessageHandler.ts

import type { ConversationService } from '../../../application/services/ConversationService';
import type { IFileRepository, FileRecord } from '../../../application/interfaces/IFileRepository';
import type { IAuthenticatedSocket } from '../ChatContext';
import type { RateLimiter } from '../RateLimiter';
import type { MessageAttachment } from '../../../domain/entities/Message';

interface SendMessagePayload {
  conversationId?: string;
  text?: string;      // Message text (preferred)
  content?: string;   // Backward compatibility
  attachments?: Array<{ fileId: string }>;
  components?: Array<{
    type: 'button' | 'link' | 'form' | 'download' | 'error' | 'scoring_result';
    data: unknown;
  }>;
  isRegenerate?: boolean;
}

export class MessageHandler {
  constructor(
    private readonly conversationService: ConversationService,
    private readonly fileRepository: IFileRepository,
    private readonly rateLimiter: RateLimiter
  ) {}

  /**
   * Validate send_message request
   *
   * CRITICAL BEHAVIORS TO PRESERVE:
   * 1. Support both `text` and `content` fields (payload.text || payload.content)
   * 2. Rate limiter uses isRateLimited(userId) and getResetTime(userId)
   * 3. conversationId MUST be from payload - NO fallback to socket.conversationId
   * 4. Must have text OR attachments (file-only messages allowed)
   * 5. Attachment validation via findByIdAndConversation
   * 6. Attachment ownership check (file.userId === socket.userId)
   *
   * @returns validation result with error or enriched attachments
   */
  async validateSendMessage(
    socket: IAuthenticatedSocket,
    payload: SendMessagePayload
  ): Promise<{
    valid: boolean;
    error?: { event: string; message: string; code?: string };
    conversationId?: string;
    messageText?: string;
    enrichedAttachments?: MessageAttachment[];
  }> {
    // Validate payload is an object
    if (!payload || typeof payload !== 'object') {
      return {
        valid: false,
        error: { event: 'send_message', message: 'Invalid message payload' },
      };
    }

    // Auth check
    if (!socket.userId) {
      return {
        valid: false,
        error: { event: 'send_message', message: 'User not authenticated' },
      };
    }

    // CRITICAL: conversationId MUST be provided by client
    const conversationId = payload.conversationId;
    if (!conversationId) {
      return {
        valid: false,
        error: { event: 'send_message', message: 'Conversation ID required' },
      };
    }

    // Support both text and content fields
    const messageText = payload.text || payload.content;
    const attachments = payload.attachments;

    // Validate: must have text OR attachments (or both)
    const hasAttachments = attachments && attachments.length > 0;
    const hasText = messageText && typeof messageText === 'string' && messageText.trim().length > 0;

    if (!hasText && !hasAttachments) {
      return {
        valid: false,
        error: { event: 'send_message', message: 'Message text or attachments required' },
      };
    }

    // Validate conversation ownership
    try {
      await this.validateConversationOwnership(conversationId, socket.userId);
    } catch (error) {
      return {
        valid: false,
        error: {
          event: 'send_message',
          message: error instanceof Error ? error.message : 'Unauthorized access',
        },
      };
    }

    // Rate limit check
    if (this.rateLimiter.isRateLimited(socket.userId)) {
      const resetTime = this.rateLimiter.getResetTime(socket.userId);
      return {
        valid: false,
        error: {
          event: 'send_message',
          message: `Rate limit exceeded. Please wait ${resetTime} seconds before sending more messages.`,
          code: 'RATE_LIMIT_EXCEEDED',
        },
      };
    }

    // Validate and enrich attachments
    let enrichedAttachments: MessageAttachment[] | undefined;
    if (hasAttachments && attachments) {
      const attachmentResult = await this.validateAndEnrichAttachments(
        attachments,
        conversationId,
        socket.userId
      );

      if (!attachmentResult.valid) {
        return {
          valid: false,
          error: attachmentResult.error,
        };
      }

      enrichedAttachments = attachmentResult.attachments;
    }

    return {
      valid: true,
      conversationId,
      messageText,
      enrichedAttachments,
    };
  }

  /**
   * Validate and enrich attachments
   *
   * CRITICAL: Uses findByIdAndConversation for validation
   */
  private async validateAndEnrichAttachments(
    attachments: Array<{ fileId: string }>,
    conversationId: string,
    userId: string
  ): Promise<{
    valid: boolean;
    attachments?: MessageAttachment[];
    error?: { event: string; message: string };
  }> {
    const enriched: MessageAttachment[] = [];

    for (const att of attachments) {
      // Validate: file exists AND belongs to this conversation
      const file = await this.fileRepository.findByIdAndConversation(att.fileId, conversationId);

      if (!file) {
        return {
          valid: false,
          error: {
            event: 'send_message',
            message: `Invalid attachment: file ${att.fileId} not found or not authorized`,
          },
        };
      }

      // Verify user owns the file
      if (file.userId !== userId) {
        return {
          valid: false,
          error: {
            event: 'send_message',
            message: 'Attachment not authorized',
          },
        };
      }

      // Enrich with server-side metadata (don't trust client)
      enriched.push({
        fileId: file.id,
        filename: file.filename,
        mimeType: file.mimeType,
        size: file.size,
      });
    }

    return { valid: true, attachments: enriched };
  }

  /**
   * Generate placeholder text for file-only messages
   *
   * CRITICAL BEHAVIOR TO PRESERVE:
   * When user sends files without text, generate placeholder text
   * for Claude API (which requires non-empty content).
   */
  generatePlaceholderText(attachments: MessageAttachment[]): string {
    const fileNames = attachments.map(a => a.filename).join(', ');
    return `[Uploaded file for analysis: ${fileNames}]`;
  }

  /**
   * Validate conversation ownership
   */
  private async validateConversationOwnership(conversationId: string, userId: string): Promise<void> {
    const conversation = await this.conversationService.getConversation(conversationId);
    if (!conversation) {
      throw new Error(`Conversation ${conversationId} not found`);
    }
    if (conversation.userId !== userId) {
      throw new Error('You do not have access to this conversation');
    }
  }
}
```

---

## Files Touched

- `packages/backend/src/infrastructure/websocket/handlers/MessageHandler.ts` - Create
- `packages/backend/__tests__/unit/infrastructure/websocket/handlers/MessageHandler.test.ts` - Create

---

## Tests Required

```typescript
describe('MessageHandler', () => {
  describe('validateSendMessage', () => {
    it('should accept valid request with text', async () => {
      mockConversationService.getConversation.mockResolvedValue({ userId: 'user-1' });
      mockRateLimiter.isRateLimited.mockReturnValue(false);

      const result = await handler.validateSendMessage(
        mockSocket,
        { conversationId: 'conv-1', text: 'Hello' }
      );

      expect(result.valid).toBe(true);
      expect(result.messageText).toBe('Hello');
    });

    it('should accept content field for backward compatibility', async () => {
      mockConversationService.getConversation.mockResolvedValue({ userId: 'user-1' });
      mockRateLimiter.isRateLimited.mockReturnValue(false);

      const result = await handler.validateSendMessage(
        mockSocket,
        { conversationId: 'conv-1', content: 'Hello from content' }
      );

      expect(result.valid).toBe(true);
      expect(result.messageText).toBe('Hello from content');
    });

    it('should prefer text over content when both provided', async () => {
      mockConversationService.getConversation.mockResolvedValue({ userId: 'user-1' });
      mockRateLimiter.isRateLimited.mockReturnValue(false);

      const result = await handler.validateSendMessage(
        mockSocket,
        { conversationId: 'conv-1', text: 'From text', content: 'From content' }
      );

      expect(result.messageText).toBe('From text');
    });

    it('should reject unauthenticated user', async () => {
      mockSocket.userId = undefined;
      const result = await handler.validateSendMessage(mockSocket, { conversationId: 'conv-1' });
      expect(result.valid).toBe(false);
      expect(result.error?.message).toContain('not authenticated');
    });

    it('should reject rate limited user with reset time', async () => {
      mockConversationService.getConversation.mockResolvedValue({ userId: 'user-1' });
      mockRateLimiter.isRateLimited.mockReturnValue(true);
      mockRateLimiter.getResetTime.mockReturnValue(30);

      const result = await handler.validateSendMessage(
        mockSocket,
        { conversationId: 'conv-1', text: 'Hello' }
      );

      expect(result.valid).toBe(false);
      expect(result.error?.message).toContain('30 seconds');
      expect(result.error?.code).toBe('RATE_LIMIT_EXCEEDED');
    });

    it('should reject missing conversation ID (NO fallback)', async () => {
      mockSocket.conversationId = 'fallback-conv';  // Should NOT use this

      const result = await handler.validateSendMessage(
        mockSocket,
        { text: 'Hello' }  // No conversationId
      );

      expect(result.valid).toBe(false);
      expect(result.error?.message).toContain('Conversation ID required');
    });

    it('should accept file-only message (no text)', async () => {
      mockConversationService.getConversation.mockResolvedValue({ userId: 'user-1' });
      mockRateLimiter.isRateLimited.mockReturnValue(false);
      mockFileRepository.findByIdAndConversation.mockResolvedValue({
        id: 'file-1',
        userId: 'user-1',
        filename: 'test.pdf',
        mimeType: 'application/pdf',
        size: 1024,
      });

      const result = await handler.validateSendMessage(
        mockSocket,
        { conversationId: 'conv-1', attachments: [{ fileId: 'file-1' }] }
      );

      expect(result.valid).toBe(true);
      expect(result.enrichedAttachments).toHaveLength(1);
      expect(result.messageText).toBeUndefined();
    });

    it('should reject empty message without attachments', async () => {
      mockConversationService.getConversation.mockResolvedValue({ userId: 'user-1' });

      const result = await handler.validateSendMessage(
        mockSocket,
        { conversationId: 'conv-1', text: '   ' }  // Whitespace only
      );

      expect(result.valid).toBe(false);
      expect(result.error?.message).toContain('text or attachments required');
    });

    it('should validate attachment via findByIdAndConversation', async () => {
      mockConversationService.getConversation.mockResolvedValue({ userId: 'user-1' });
      mockRateLimiter.isRateLimited.mockReturnValue(false);
      mockFileRepository.findByIdAndConversation.mockResolvedValue(null);  // Not found

      const result = await handler.validateSendMessage(
        mockSocket,
        { conversationId: 'conv-1', attachments: [{ fileId: 'wrong-file' }] }
      );

      expect(result.valid).toBe(false);
      expect(result.error?.message).toContain('not found or not authorized');
      expect(mockFileRepository.findByIdAndConversation).toHaveBeenCalledWith('wrong-file', 'conv-1');
    });

    it('should reject attachment owned by different user', async () => {
      mockConversationService.getConversation.mockResolvedValue({ userId: 'user-1' });
      mockRateLimiter.isRateLimited.mockReturnValue(false);
      mockFileRepository.findByIdAndConversation.mockResolvedValue({
        id: 'file-1',
        userId: 'other-user',  // Different user
        filename: 'test.pdf',
      });

      const result = await handler.validateSendMessage(
        mockSocket,
        { conversationId: 'conv-1', attachments: [{ fileId: 'file-1' }] }
      );

      expect(result.valid).toBe(false);
      expect(result.error?.message).toContain('not authorized');
    });
  });

  describe('generatePlaceholderText', () => {
    it('should generate placeholder for single file', () => {
      const text = handler.generatePlaceholderText([
        { fileId: 'f1', filename: 'report.pdf', mimeType: 'application/pdf', size: 1024 },
      ]);

      expect(text).toBe('[Uploaded file for analysis: report.pdf]');
    });

    it('should generate placeholder for multiple files', () => {
      const text = handler.generatePlaceholderText([
        { fileId: 'f1', filename: 'report.pdf', mimeType: 'application/pdf', size: 1024 },
        { fileId: 'f2', filename: 'data.xlsx', mimeType: 'application/xlsx', size: 2048 },
      ]);

      expect(text).toBe('[Uploaded file for analysis: report.pdf, data.xlsx]');
    });
  });
});
```

---

## Preserve Notes (CRITICAL)

The following behaviors MUST be preserved in handler extraction:

1. **Placeholder text for file-only messages**:
   ```typescript
   let finalMessageText = messageText || '';
   if (!finalMessageText && enrichedAttachments && enrichedAttachments.length > 0) {
     const fileNames = enrichedAttachments.map(a => a.filename).join(', ');
     finalMessageText = `[Uploaded file for analysis: ${fileNames}]`;
   }
   ```

2. **`message_sent` event** - Emitted immediately after saving user message

3. **Both `text` and `content` fields supported** for backward compatibility

---

## Definition of Done

- [ ] MessageHandler created
- [ ] Supports both text and content fields
- [ ] Rate limiter uses isRateLimited() and getResetTime()
- [ ] No fallback to socket.conversationId
- [ ] File-only messages supported
- [ ] Attachment validation via findByIdAndConversation
- [ ] generatePlaceholderText method implemented
- [ ] Unit tests passing
