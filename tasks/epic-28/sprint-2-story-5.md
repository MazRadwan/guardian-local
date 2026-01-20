# Story 28.4.2: Extract ConnectionHandler.ts (connection + resume)

**Sprint:** 2 - Infrastructure
**Agent:** backend-agent
**Estimation:** Medium (1-2 files)

---

## Description

Add connection and resume logic to ConnectionHandler. This includes the critical `user:{userId}` room join that DocumentUploadController depends on.

---

## Acceptance Criteria

- [ ] `handleConnection()` method added to ConnectionHandler
- [ ] **CRITICAL: `socket.join(\`user:${userId}\`)` preserved**
- [ ] Resume conversation logic preserved
- [ ] **Resume failure behavior preserved**:
  - Resume failures do NOT auto-create conversations (logs and waits for `start_new_conversation`)
  - `socket.conversationId` remains `undefined` when no valid resume occurs
- [ ] `connection_ready` event emitted with **ALL current payload fields** to avoid frontend regressions:
  - `message: string` - Human-readable connection status
  - `userId: string` - Authenticated user ID
  - `conversationId?: string` - Resumed conversation ID (if any)
  - `resumed: boolean` - Whether conversation was resumed
  - `hasActiveConversation: boolean` - Whether user has active conversation
  - `assessmentId?: string` - Assessment ID from conversation (if any)
- [ ] Unit tests verify room join
- [ ] Unit tests verify ALL connection_ready payload fields
- [ ] Unit tests verify resume failure does NOT auto-create and leaves socket.conversationId unset
- [ ] Integration with DocumentUploadController verified

---

## Technical Approach

```typescript
// Add to ConnectionHandler.ts

import { IAuthenticatedSocket, ChatContext } from '../ChatContext';

export class ConnectionHandler {
  // ...existing constructor and auth middleware...

  /**
   * Handle new socket connection
   *
   * CRITICAL: Room join must be preserved - DocumentUploadController
   * depends on user:{userId} room for:
   * - upload_progress events
   * - intake_context_ready events
   * - scoring_parse_ready events
   */
  async handleConnection(
    socket: IAuthenticatedSocket,
    chatContext: ChatContext
  ): Promise<{ conversation: any | null; resumed: boolean }> {
    console.log(`[ConnectionHandler] Client connected: ${socket.id} (User: ${socket.userId})`);

    // CRITICAL: Join user-specific room for document upload events
    // DocumentUploadController emits to this room
    socket.join(`user:${socket.userId}`);
    console.log(`[ConnectionHandler] Socket ${socket.id} joined room user:${socket.userId}`);

    // Check for resume request
    const resumeConversationId = (socket as any).handshake?.auth?.conversationId;
    let conversation = null;
    let resumed = false;

    if (resumeConversationId) {
      try {
        const existing = await this.conversationService.getConversation(resumeConversationId);

        // Validate ownership
        if (existing && existing.userId === socket.userId) {
          conversation = existing;
          resumed = true;
          console.log(`[ConnectionHandler] Resumed conversation ${resumeConversationId}`);
        } else {
          console.log(`[ConnectionHandler] Cannot resume - not found or not owned`);
        }
      } catch (error) {
        console.error('[ConnectionHandler] Error resuming:', error);
      }
    }

    // Update socket state
    socket.conversationId = conversation?.id;

    // Emit connection ready
    socket.emit('connection_ready', {
      message: resumed ? 'Reconnected to existing conversation' : 'Connected to Guardian chat server',
      userId: socket.userId,
      conversationId: conversation?.id,
      resumed,
      hasActiveConversation: conversation !== null,
      assessmentId: conversation?.assessmentId || null,
    });

    return { conversation, resumed };
  }
}
```

---

## Files Touched

- `packages/backend/src/infrastructure/websocket/handlers/ConnectionHandler.ts` - Add handleConnection
- `packages/backend/__tests__/unit/infrastructure/websocket/handlers/ConnectionHandler.test.ts` - Add tests

---

## Tests Required

```typescript
describe('handleConnection', () => {
  it('should join user room', async () => {
    const socket = createMockSocket('user-123');
    await handler.handleConnection(socket, mockChatContext);

    expect(socket.join).toHaveBeenCalledWith('user:user-123');
  });

  it('should emit connection_ready with ALL required payload fields (new connection)', async () => {
    const socket = createMockSocket('user-123');
    await handler.handleConnection(socket, mockChatContext);

    expect(socket.emit).toHaveBeenCalledWith('connection_ready', {
      message: 'Connected to Guardian chat server',
      userId: 'user-123',
      conversationId: undefined,
      resumed: false,
      hasActiveConversation: false,
      assessmentId: null,
    });
  });

  it('should emit connection_ready with ALL required payload fields (resumed)', async () => {
    mockConversationService.getConversation.mockResolvedValue({
      id: 'conv-1',
      userId: 'user-123',
      mode: 'assessment',
      assessmentId: 'assess-1',
    });

    const socket = createMockSocket('user-123', 'conv-1');
    await handler.handleConnection(socket, mockChatContext);

    expect(socket.emit).toHaveBeenCalledWith('connection_ready', {
      message: 'Reconnected to existing conversation',
      userId: 'user-123',
      conversationId: 'conv-1',
      resumed: true,
      hasActiveConversation: true,
      assessmentId: 'assess-1',
    });
  });

  it('should resume valid conversation', async () => {
    mockConversationService.getConversation.mockResolvedValue({
      id: 'conv-1',
      userId: 'user-123',
      mode: 'consult',
    });

    const socket = createMockSocket('user-123', 'conv-1');
    const result = await handler.handleConnection(socket, mockChatContext);

    expect(result.resumed).toBe(true);
    expect(socket.conversationId).toBe('conv-1');
  });

  it('should not resume conversation owned by different user', async () => {
    mockConversationService.getConversation.mockResolvedValue({
      id: 'conv-1',
      userId: 'other-user',
    });

    const socket = createMockSocket('user-123', 'conv-1');
    const result = await handler.handleConnection(socket, mockChatContext);

    expect(result.resumed).toBe(false);
  });

  describe('resume failure behavior', () => {
    it('should NOT auto-create conversation when resume fails', async () => {
      mockConversationService.getConversation.mockResolvedValue(null); // Not found

      const socket = createMockSocket('user-123', 'invalid-conv-id');
      const result = await handler.handleConnection(socket, mockChatContext);

      // Should NOT call createConversation - waits for explicit start_new_conversation
      expect(mockConversationService.createConversation).not.toHaveBeenCalled();
      expect(result.resumed).toBe(false);
      expect(result.conversation).toBeNull();
    });

    it('should leave socket.conversationId unset when no valid resume', async () => {
      mockConversationService.getConversation.mockResolvedValue(null);

      const socket = createMockSocket('user-123', 'invalid-conv-id');
      await handler.handleConnection(socket, mockChatContext);

      expect(socket.conversationId).toBeUndefined();
    });

    it('should emit connection_ready with resumed:false and no conversationId on failure', async () => {
      mockConversationService.getConversation.mockRejectedValue(new Error('DB error'));

      const socket = createMockSocket('user-123', 'conv-1');
      await handler.handleConnection(socket, mockChatContext);

      expect(socket.emit).toHaveBeenCalledWith('connection_ready', {
        message: 'Connected to Guardian chat server',
        userId: 'user-123',
        conversationId: undefined,
        resumed: false,
        hasActiveConversation: false,
        assessmentId: null,
      });
    });
  });
});

function createMockSocket(userId: string, resumeConvId?: string): jest.Mocked<IAuthenticatedSocket> {
  return {
    id: 'socket-1',
    userId,
    conversationId: undefined,
    data: {},
    emit: jest.fn(),
    join: jest.fn(),
    handshake: { auth: { conversationId: resumeConvId } },
  } as any;
}
```

---

## Definition of Done

- [ ] handleConnection method added
- [ ] Room join verified in tests
- [ ] Resume logic tested
- [ ] connection_ready emission tested
