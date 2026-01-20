# Story 28.11.2: Refactor ChatServer to slim orchestrator

**Sprint:** 6 - Final Integration
**Agent:** backend-agent
**Estimation:** Medium (1 file)

---

## Description

Final refactoring pass to reduce ChatServer to ~200 lines. It should only orchestrate handler calls, not contain business logic.

---

## Acceptance Criteria

- [ ] ChatServer is ~200 lines (±50 lines acceptable)
- [ ] Only contains:
  - Constructor (dependency injection)
  - `setupNamespace()` (event routing to handlers)
  - `emitToConversation()` (public helper)
  - `streamMessage()` (public helper)
- [ ] All business logic in handlers
- [ ] All tests pass

---

## Technical Approach

Final ChatServer structure:
```typescript
export class ChatServer {
  // Handlers (created in constructor)
  private readonly connectionHandler: ConnectionHandler;
  private readonly conversationHandler: ConversationHandler;
  private readonly modeSwitchHandler: ModeSwitchHandler;
  private readonly messageHandler: MessageHandler;
  private readonly scoringHandler: ScoringHandler;
  private readonly questionnaireHandler: QuestionnaireHandler;

  // Shared state
  private readonly chatContext: ChatContext;

  // Tool registry
  private readonly toolRegistry: ToolUseRegistry;

  constructor(
    private readonly io: Server,
    private readonly conversationService: ConversationService,
    // ... all other dependencies explicitly injected ...
  ) {
    // Initialize ChatContext
    this.chatContext = createChatContext(rateLimiter, promptCacheManager);

    // Create handlers
    this.connectionHandler = new ConnectionHandler(...);
    this.conversationHandler = new ConversationHandler(...);
    this.modeSwitchHandler = new ModeSwitchHandler(...);
    this.messageHandler = new MessageHandler(...);
    this.scoringHandler = new ScoringHandler(...);
    this.questionnaireHandler = new QuestionnaireHandler(...);

    // Create tool registry
    this.toolRegistry = new ToolUseRegistry();
    this.toolRegistry.register('questionnaire_ready', questionnaireReadyService);

    // Setup namespace
    this.setupNamespace();
  }

  private setupNamespace(): void {
    const chatNamespace = this.io.of('/chat');

    // Auth middleware
    chatNamespace.use(this.connectionHandler.createAuthMiddleware());

    chatNamespace.on('connection', async (socket) => {
      await this.connectionHandler.handleConnection(socket, this.chatContext);

      // Conversation events
      socket.on('get_conversations', () => this.conversationHandler.handleGetConversations(socket));
      socket.on('start_new_conversation', (p) => this.conversationHandler.handleStartNewConversation(socket, p, this.chatContext));
      socket.on('delete_conversation', (p) => this.conversationHandler.handleDeleteConversation(socket, p));
      socket.on('get_history', (p) => this.conversationHandler.handleGetHistory(socket, p));

      // Mode switch
      socket.on('switch_mode', (p) => this.modeSwitchHandler.handleSwitchMode(socket, p));

      // Message handling
      socket.on('send_message', (p) => this.handleSendMessage(socket, p));

      // Questionnaire
      socket.on('generate_questionnaire', (p) => this.questionnaireHandler.handleGenerateQuestionnaire(socket, p, this.chatContext));
      socket.on('get_export_status', (p) => this.questionnaireHandler.handleGetExportStatus(socket, p));

      // Scoring
      socket.on('vendor_selected', (p) => this.scoringHandler.handleVendorSelected(socket, p));

      // Disconnect
      socket.on('disconnect', (reason) => this.connectionHandler.handleDisconnect(socket, reason));
    });
  }

  // Public helpers for external use
  emitToConversation(conversationId: string, event: string, data: unknown): void {
    this.io.of('/chat').to(conversationId).emit(event, data);
  }

  streamMessage(socket: IAuthenticatedSocket, message: string, conversationId: string): Promise<void> {
    return this.streamingHandler.streamToSocket(
      socket,
      message,
      conversationId,
      () => this.chatContext.abortedStreams.has(conversationId),
      () => { /* cleanup */ }
    );
  }
}
```

---

## Files Touched

- `packages/backend/src/infrastructure/websocket/ChatServer.ts` - Final cleanup

---

## Tests Required

Run full test suite:
```bash
pnpm --filter @guardian/backend test
```

---

## Definition of Done

- [ ] ChatServer is ~200 lines
- [ ] All business logic in handlers
- [ ] All tests pass
