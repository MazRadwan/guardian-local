# Story 28.6.1: Extract ModeSwitchHandler.ts (switch_mode)

**Sprint:** 3 - Conversation Management
**Agent:** backend-agent
**Estimation:** Medium (2-3 files)

---

## Description

Create ModeSwitchHandler to handle mode switching between consult, assessment, and scoring modes. This includes validation, persistence, and response emission.

---

## Acceptance Criteria

- [ ] `ModeSwitchHandler.ts` created at `infrastructure/websocket/handlers/`
- [ ] `handleSwitchMode()` implemented
- [ ] Validates mode is one of: consult, assessment, scoring
- [ ] Persists mode change to conversation
- [ ] Emits `conversation_mode_updated` event (actual event name in codebase)
- [ ] **Idempotent mode switches**: `conversation_mode_updated` emitted even when already in requested mode (no mode change, but event still fires)
- [ ] Unit tests cover valid/invalid modes and idempotent switch behavior

---

## Technical Approach

```typescript
// infrastructure/websocket/handlers/ModeSwitchHandler.ts

import { ConversationService } from '../../../application/services/ConversationService';
import { IAuthenticatedSocket } from '../ChatContext';
import { sanitizeErrorForClient } from '../../../utils/sanitize';

export type ChatMode = 'consult' | 'assessment' | 'scoring';

const VALID_MODES: ChatMode[] = ['consult', 'assessment', 'scoring'];

export class ModeSwitchHandler {
  constructor(
    private readonly conversationService: ConversationService
  ) {}

  async handleSwitchMode(
    socket: IAuthenticatedSocket,
    payload: { conversationId?: string; mode?: ChatMode }
  ): Promise<void> {
    try {
      if (!socket.userId) {
        socket.emit('error', { event: 'switch_mode', message: 'User not authenticated' });
        return;
      }

      const { conversationId, mode } = payload;

      // Both conversationId and mode are required (NO socket.conversationId fallback)
      if (!conversationId || !mode) {
        socket.emit('error', {
          event: 'switch_mode',
          message: 'conversationId and mode are required',
        });
        return;
      }

      // Validate mode
      if (!VALID_MODES.includes(mode)) {
        socket.emit('error', {
          event: 'switch_mode',
          message: `Invalid mode: ${mode}. Must be one of: ${VALID_MODES.join(', ')}`,
        });
        return;
      }

      // Validate ownership
      await this.validateConversationOwnership(conversationId, socket.userId);

      const conversation = await this.conversationService.getConversation(conversationId);
      if (!conversation) {
        socket.emit('error', {
          event: 'switch_mode',
          message: `Conversation ${conversationId} not found`,
        });
        return;
      }

      // Idempotent: already in requested mode
      if (conversation.mode === mode) {
        socket.emit('conversation_mode_updated', {
          conversationId,
          mode,
        });
        return;
      }

      // Switch mode (uses switchMode, not updateMode)
      await this.conversationService.switchMode(conversationId, mode);

      console.log(`[ModeSwitchHandler] Switched conversation ${conversationId} to ${mode} mode`);

      socket.emit('conversation_mode_updated', {
        conversationId,
        mode,
      });
    } catch (error) {
      console.error('[ModeSwitchHandler] Error switching mode:', error);
      socket.emit('error', {
        event: 'switch_mode',
        message: sanitizeErrorForClient(error, 'Failed to switch mode'),
      });
    }
  }

  /**
   * Validate that a conversation belongs to the requesting user
   * @throws Error if conversation not found or doesn't belong to user
   */
  private async validateConversationOwnership(
    conversationId: string,
    userId: string
  ): Promise<void> {
    const conversation = await this.conversationService.getConversation(conversationId);

    if (!conversation) {
      throw new Error(`Conversation ${conversationId} not found`);
    }

    if (conversation.userId !== userId) {
      console.warn(`[ModeSwitchHandler] SECURITY: User ${userId} attempted to access conversation ${conversationId} owned by ${conversation.userId}`);
      throw new Error('Unauthorized: You do not have access to this conversation');
    }
  }
}
```

---

## Files Touched

- `packages/backend/src/infrastructure/websocket/handlers/ModeSwitchHandler.ts` - Create
- `packages/backend/__tests__/unit/infrastructure/websocket/handlers/ModeSwitchHandler.test.ts` - Create

---

## Tests Required

```typescript
describe('ModeSwitchHandler', () => {
  let handler: ModeSwitchHandler;
  let mockConversationService: jest.Mocked<ConversationService>;
  let mockSocket: jest.Mocked<IAuthenticatedSocket>;

  beforeEach(() => {
    mockConversationService = {
      getConversation: jest.fn(),
      switchMode: jest.fn(),
    } as any;
    mockSocket = {
      id: 'socket-1',
      userId: 'user-1',
      emit: jest.fn(),
    } as any;
    handler = new ModeSwitchHandler(mockConversationService);
  });

  describe('handleSwitchMode', () => {
    it('should switch to valid mode', async () => {
      mockConversationService.getConversation.mockResolvedValue({
        id: 'conv-1',
        userId: 'user-1',
        mode: 'consult',
      });

      await handler.handleSwitchMode(mockSocket, { conversationId: 'conv-1', mode: 'assessment' });

      expect(mockConversationService.switchMode).toHaveBeenCalledWith('conv-1', 'assessment');
      expect(mockSocket.emit).toHaveBeenCalledWith('conversation_mode_updated', {
        conversationId: 'conv-1',
        mode: 'assessment',
      });
    });

    it('should reject invalid mode', async () => {
      mockConversationService.getConversation.mockResolvedValue({
        id: 'conv-1',
        userId: 'user-1',
        mode: 'consult',
      });

      await handler.handleSwitchMode(mockSocket, { conversationId: 'conv-1', mode: 'invalid' as any });

      expect(mockSocket.emit).toHaveBeenCalledWith('error', expect.objectContaining({
        message: expect.stringContaining('Invalid mode'),
      }));
      expect(mockConversationService.switchMode).not.toHaveBeenCalled();
    });

    it('should reject if conversationId missing', async () => {
      await handler.handleSwitchMode(mockSocket, { mode: 'assessment' });

      expect(mockSocket.emit).toHaveBeenCalledWith('error', expect.objectContaining({
        event: 'switch_mode',
        message: 'conversationId and mode are required',
      }));
    });

    it('should reject if mode missing', async () => {
      await handler.handleSwitchMode(mockSocket, { conversationId: 'conv-1' });

      expect(mockSocket.emit).toHaveBeenCalledWith('error', expect.objectContaining({
        event: 'switch_mode',
        message: 'conversationId and mode are required',
      }));
    });

    it('should emit conversation_mode_updated even when already in requested mode (idempotent)', async () => {
      mockConversationService.getConversation.mockResolvedValue({
        id: 'conv-1',
        userId: 'user-1',
        mode: 'assessment', // Already in assessment mode
      });

      await handler.handleSwitchMode(mockSocket, { conversationId: 'conv-1', mode: 'assessment' });

      // Should NOT call switchMode (already in that mode)
      expect(mockConversationService.switchMode).not.toHaveBeenCalled();

      // But SHOULD still emit the event (idempotent acknowledgment)
      expect(mockSocket.emit).toHaveBeenCalledWith('conversation_mode_updated', {
        conversationId: 'conv-1',
        mode: 'assessment',
      });
    });
  });
});
```

---

## Definition of Done

- [ ] ModeSwitchHandler created
- [ ] handleSwitchMode implemented
- [ ] Unit tests passing
