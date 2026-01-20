# Story 28.6.2: Extract ModeSwitchHandler.ts (guidance messages)

**Sprint:** 3 - Conversation Management
**Agent:** backend-agent
**Estimation:** Small (1-2 files)

---

## Description

Add mode-specific guidance messages to ModeSwitchHandler. When switching to assessment or scoring mode, the guidance is **persisted as an assistant message** and emitted via the `message` event (not a separate guidance event).

---

## Acceptance Criteria

- [ ] Guidance message persisted and emitted for assessment mode
- [ ] Guidance message persisted and emitted for scoring mode
- [ ] No guidance message for consult mode (default mode)
- [ ] Messages stored as constants for easy updates
- [ ] Unit tests verify guidance message persistence and emission
- [ ] Idempotent: no guidance if already in requested mode

---

## Technical Approach

```typescript
// Add to ModeSwitchHandler.ts

const ASSESSMENT_GUIDANCE = `
🔍 **Assessment Mode Activated**

Please select your assessment approach (reply with 1, 2, or 3):

1️⃣ **Quick Assessment** (30-40 questions)
   ↳ Fast red-flag screening, ~15 minutes

2️⃣ **Comprehensive Assessment** (85-95 questions)
   ↳ Full coverage across all 10 risk dimensions

3️⃣ **Category-Focused Assessment**
   ↳ Tailored to your AI solution type

Reply with: **1**, **2**, or **3**
`.trim();

const SCORING_GUIDANCE = `
📊 **Scoring Mode Activated**

Upload a completed vendor questionnaire for risk analysis.

**Important:** Only questionnaires exported from Guardian can be scored. These contain an embedded Assessment ID that links responses to your original assessment.

**How it works:**
1. Export a questionnaire from Guardian (Assessment Mode → Generate → Download)
2. Send it to the vendor to complete
3. Upload the completed questionnaire here

**Supported formats:** PDF or Word (.docx)

Once uploaded, I'll analyze the responses and provide:
- Composite risk score (0-100)
- Per-dimension breakdown
- Executive summary
- Recommendation (Approve/Conditional/Decline)

**Drag & drop** your file or click the upload button to begin.
`.trim();

// Update handleSwitchMode to emit guidance
async handleSwitchMode(
  socket: IAuthenticatedSocket,
  payload: { mode: string; conversationId?: string }
): Promise<void> {
  // ... existing validation code ...

  // Idempotent: already in requested mode
  if (conversation.mode === mode) {
    socket.emit('conversation_mode_updated', { conversationId, mode });
    return;
  }

  await this.conversationService.switchMode(conversationId, mode);
  socket.emit('conversation_mode_updated', { conversationId, mode });

  // Send and persist guidance message
  await this.sendGuidanceMessage(socket, conversationId, mode);
}

private async sendGuidanceMessage(
  socket: IAuthenticatedSocket,
  conversationId: string,
  mode: string
): Promise<void> {
  let guidanceText: string | null = null;

  if (mode === 'assessment') {
    guidanceText = ASSESSMENT_GUIDANCE;
  } else if (mode === 'scoring') {
    guidanceText = SCORING_GUIDANCE;
  }

  if (!guidanceText) return;

  // Persist as assistant message
  const guidanceMessage = await this.conversationService.sendMessage({
    conversationId,
    role: 'assistant',
    content: { text: guidanceText },
  });

  // Emit via standard message event
  socket.emit('message', {
    id: guidanceMessage.id,
    conversationId: guidanceMessage.conversationId,
    role: guidanceMessage.role,
    content: guidanceMessage.content,
    createdAt: guidanceMessage.createdAt,
  });
}
```

---

## Files Touched

- `packages/backend/src/infrastructure/websocket/handlers/ModeSwitchHandler.ts` - Add guidance messages
- `packages/backend/__tests__/unit/infrastructure/websocket/handlers/ModeSwitchHandler.test.ts` - Add tests

---

## Tests Required

```typescript
describe('mode guidance messages', () => {
  it('should persist and emit guidance for assessment mode', async () => {
    mockConversationService.getConversation.mockResolvedValue({
      id: 'conv-1',
      userId: 'user-1',
      mode: 'consult',
    });
    mockConversationService.sendMessage.mockResolvedValue({
      id: 'msg-1',
      conversationId: 'conv-1',
      role: 'assistant',
      content: { text: 'Assessment guidance...' },
      createdAt: new Date(),
    });

    await handler.handleSwitchMode(mockSocket, { mode: 'assessment' });

    // Verify message persisted
    expect(mockConversationService.sendMessage).toHaveBeenCalledWith(expect.objectContaining({
      conversationId: 'conv-1',
      role: 'assistant',
    }));

    // Verify emitted via 'message' event
    expect(mockSocket.emit).toHaveBeenCalledWith('message', expect.objectContaining({
      id: 'msg-1',
      role: 'assistant',
    }));
  });

  it('should persist and emit guidance for scoring mode', async () => {
    mockConversationService.getConversation.mockResolvedValue({
      id: 'conv-1',
      userId: 'user-1',
      mode: 'consult',
    });
    mockConversationService.sendMessage.mockResolvedValue({
      id: 'msg-2',
      conversationId: 'conv-1',
      role: 'assistant',
      content: { text: 'Scoring guidance...' },
      createdAt: new Date(),
    });

    await handler.handleSwitchMode(mockSocket, { mode: 'scoring' });

    expect(mockConversationService.sendMessage).toHaveBeenCalled();
    expect(mockSocket.emit).toHaveBeenCalledWith('message', expect.any(Object));
  });

  it('should not emit guidance for consult mode', async () => {
    mockConversationService.getConversation.mockResolvedValue({
      id: 'conv-1',
      userId: 'user-1',
      mode: 'assessment',
    });

    await handler.handleSwitchMode(mockSocket, { mode: 'consult' });

    expect(mockSocket.emit).toHaveBeenCalledWith('conversation_mode_updated', expect.any(Object));
    // No sendMessage call for guidance
    expect(mockConversationService.sendMessage).not.toHaveBeenCalled();
  });

  it('should be idempotent - no guidance if already in mode', async () => {
    mockConversationService.getConversation.mockResolvedValue({
      id: 'conv-1',
      userId: 'user-1',
      mode: 'assessment', // Already in assessment
    });

    await handler.handleSwitchMode(mockSocket, { mode: 'assessment' });

    // Mode not switched, no guidance
    expect(mockConversationService.switchMode).not.toHaveBeenCalled();
    expect(mockConversationService.sendMessage).not.toHaveBeenCalled();
  });
});
```

---

## Definition of Done

- [ ] Guidance messages added as constants
- [ ] mode_guidance event emitted for assessment/scoring
- [ ] Unit tests passing
