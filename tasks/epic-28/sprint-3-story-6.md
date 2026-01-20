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
- [ ] Unit tests cover valid/invalid modes

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
    payload: { mode: string; conversationId?: string }
  ): Promise<void> {
    try {
      if (!socket.userId) {
        socket.emit('error', { event: 'switch_mode', message: 'User not authenticated' });
        return;
      }

      const conversationId = payload.conversationId || socket.conversationId;
      if (!conversationId) {
        socket.emit('error', { event: 'switch_mode', message: 'No active conversation' });
        return;
      }

      // Validate mode
      const mode = payload.mode as ChatMode;
      if (!VALID_MODES.includes(mode)) {
        socket.emit('error', {
          event: 'switch_mode',
          message: `Invalid mode: ${payload.mode}. Must be one of: ${VALID_MODES.join(', ')}`,
        });
        return;
      }

      // Validate ownership
      const conversation = await this.conversationService.getConversation(conversationId);
      if (!conversation || conversation.userId !== socket.userId) {
        socket.emit('error', { event: 'switch_mode', message: 'Conversation not found' });
        return;
      }

      // Update mode
      await this.conversationService.updateMode(conversationId, mode);

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
      updateMode: jest.fn(),
    } as any;
    mockSocket = {
      id: 'socket-1',
      userId: 'user-1',
      conversationId: 'conv-1',
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

      await handler.handleSwitchMode(mockSocket, { mode: 'assessment' });

      expect(mockConversationService.updateMode).toHaveBeenCalledWith('conv-1', 'assessment');
      expect(mockSocket.emit).toHaveBeenCalledWith('conversation_mode_updated', {
        conversationId: 'conv-1',
        mode: 'assessment',
      });
    });

    it('should reject invalid mode', async () => {
      await handler.handleSwitchMode(mockSocket, { mode: 'invalid' });

      expect(mockSocket.emit).toHaveBeenCalledWith('error', expect.objectContaining({
        message: expect.stringContaining('Invalid mode'),
      }));
      expect(mockConversationService.updateMode).not.toHaveBeenCalled();
    });

    it('should reject if no conversation', async () => {
      mockSocket.conversationId = undefined;

      await handler.handleSwitchMode(mockSocket, { mode: 'assessment' });

      expect(mockSocket.emit).toHaveBeenCalledWith('error', expect.objectContaining({
        message: 'No active conversation',
      }));
    });
  });
});
```

---

## Definition of Done

- [ ] ModeSwitchHandler created
- [ ] handleSwitchMode implemented
- [ ] Unit tests passing
