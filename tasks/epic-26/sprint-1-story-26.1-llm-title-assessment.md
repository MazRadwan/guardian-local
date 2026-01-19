# Story 26.1: LLM Title for Assessment Mode

## Description

Generate an LLM-based title for Assessment mode conversations after the first meaningful Q&A exchange. Currently, Assessment mode uses only truncated first message, not LLM-generated titles. This leaves users who accidentally enter Assessment mode or abandon the flow with a "New Assessment" placeholder indefinitely.

**Problem:**
1. `TitleGenerationService` exists but is **NOT wired** into production code
2. `ChatServer.ts` calls `conversationService.getConversationTitle()` which just truncates the first message
3. Assessment mode conversations show "New Assessment" until `generate_questionnaire` fires with vendor info

**Solution:**
1. Wire `TitleGenerationService` into `ChatServer` dependency injection
2. Replace `conversationService.getConversationTitle()` call with `titleGenerationService.generateModeAwareTitle()`
3. Update `generateAssessmentTitle()` to call LLM when no vendor info available

## Acceptance Criteria

- [ ] `TitleGenerationService` is instantiated and injected into `ChatServer`
- [ ] `ChatServer` uses `TitleGenerationService` for title generation (replaces truncation)
- [ ] Assessment mode conversations get LLM-generated title after first Q&A exchange
- [ ] Consult mode also now uses LLM (upgrade from truncation)
- [ ] Title updates from "New Assessment" to meaningful LLM-generated title
- [ ] `conversation_title_updated` WebSocket event emitted
- [ ] Frontend shimmer (`titleLoading`) cleared when title arrives
- [ ] Scoring mode title generation is NOT affected (must still skip LLM, use filename only)
- [ ] Manual renames are respected (check `titleManuallyEdited` flag)
- [ ] Unit and integration tests verify new flow

## Technical Approach

### Phase 1: Wire TitleGenerationService into ChatServer

**Step 1a: Add TitleGenerationService to ChatServer constructor**

```typescript
// In ChatServer.ts constructor
import { TitleGenerationService } from '../../application/services/TitleGenerationService.js';

export class ChatServer {
  private titleGenerationService: TitleGenerationService;

  constructor(
    server: ReturnType<typeof createServer>,
    private readonly conversationService: ConversationService,
    // ... other services
  ) {
    // Initialize TitleGenerationService with API key
    this.titleGenerationService = new TitleGenerationService(process.env.ANTHROPIC_API_KEY);
    // ... rest of constructor
  }
}
```

**Step 1b: Replace getConversationTitle call (lines ~1354-1362)**

```typescript
// BEFORE (current - truncation only)
if (shouldGenerateTitle) {
  const messageCount = await this.conversationService.getMessageCount(conversationId);
  if (messageCount === 1) {
    const title = await this.conversationService.getConversationTitle(conversationId);
    socket.emit('conversation_title_updated', { conversationId, title });
  }
}

// AFTER (LLM-based title generation)
if (shouldGenerateTitle) {
  const messageCount = await this.conversationService.getMessageCount(conversationId);
  if (messageCount === 1) {
    // Get first user message and assistant response for context
    const firstUserMessage = await this.conversationService.getFirstUserMessage(conversationId);
    const firstAssistantMessage = await this.conversationService.getFirstAssistantMessage(conversationId);

    // Build title context
    const titleContext: TitleContext = {
      mode: conversationForTitle.mode,
      userMessage: firstUserMessage?.content?.text,
      assistantResponse: firstAssistantMessage?.content?.text,
    };

    // Generate LLM title
    const result = await this.titleGenerationService.generateModeAwareTitle(titleContext);

    // Update conversation title in database
    await this.conversationService.updateTitle(conversationId, result.title);

    // Emit title update event
    socket.emit('conversation_title_updated', {
      conversationId,
      title: result.title,
    });
  }
}
```

**Step 1c: Add helper methods to ConversationService**

```typescript
// In ConversationService.ts
async getFirstUserMessage(conversationId: string): Promise<Message | null> {
  return this.messageRepo.findFirstUserMessage(conversationId);
}

async getFirstAssistantMessage(conversationId: string): Promise<Message | null> {
  return this.messageRepo.findFirstAssistantMessage(conversationId);
}
```

**Step 1d: Add findFirstAssistantMessage to MessageRepository**

```typescript
// In DrizzleMessageRepository.ts
async findFirstAssistantMessage(conversationId: string): Promise<Message | null> {
  const result = await this.db
    .select()
    .from(messages)
    .where(and(
      eq(messages.conversationId, conversationId),
      eq(messages.role, 'assistant')
    ))
    .orderBy(asc(messages.createdAt))
    .limit(1);

  return result[0] ? this.mapToDomain(result[0]) : null;
}
```

### Phase 2: Update TitleGenerationService for Assessment LLM Fallback

**Step 2a: Make generateAssessmentTitle async with LLM fallback**

```typescript
// In TitleGenerationService.ts
private async generateAssessmentTitle(
  context: TitleContext
): Promise<TitleGenerationResult> {
  const { metadata } = context;

  // Phase 2: If vendor info available, use it (takes precedence)
  if (metadata?.vendorName) {
    return { title: this.sanitizeTitle(`Assessment: ${metadata.vendorName}`), source: 'vendor' };
  }
  if (metadata?.solutionName) {
    return { title: this.sanitizeTitle(`Assessment: ${metadata.solutionName}`), source: 'vendor' };
  }

  // Phase 1: No vendor info yet - generate LLM title (like Consult mode)
  const llmTitle = await this.generateTitle(context);
  if (llmTitle) {
    return { title: llmTitle, source: 'llm' };
  }

  // Fallback if LLM fails
  return { title: PLACEHOLDER_TITLES.ASSESSMENT, source: 'default' };
}
```

**Step 2b: Update generateModeAwareTitle to await assessment**

The method is already async but needs to call the async assessment method:

```typescript
async generateModeAwareTitle(context: TitleContext): Promise<TitleGenerationResult> {
  const { mode } = context;

  switch (mode) {
    case 'assessment':
      return this.generateAssessmentTitle(context);  // Now async

    case 'scoring':
      return this.generateScoringTitle(context.metadata);  // Unchanged - no LLM

    case 'consult':
    default:
      return this.generateConsultTitle(context);
  }
}
```

### Phase 3: Verify Scoring Mode Guard

**CRITICAL:** Scoring mode must NOT regress. The guard at line ~1351 (`mode !== 'scoring'`) ensures scoring mode skips the entire title generation block. Scoring titles ONLY come from filename in the file upload flow (lines ~1387-1422).

The guard structure:
```typescript
const shouldGenerateTitle =
  isPlaceholderTitle(conversationForTitle.title) &&
  conversationForTitle.mode !== 'scoring' &&  // <-- Scoring excluded here
  !conversationForTitle.titleManuallyEdited;
```

Add explicit comment:
```typescript
// Story 25.9: Scoring mode titles ONLY come from filename (set in file upload flow)
// Story 26.1: Do not add LLM generation for scoring mode here - it's handled separately
```

## Files Touched

- `packages/backend/src/infrastructure/websocket/ChatServer.ts` - Wire TitleGenerationService, replace truncation with LLM
- `packages/backend/src/application/services/TitleGenerationService.ts` - Make `generateAssessmentTitle` async with LLM fallback
- `packages/backend/src/application/services/ConversationService.ts` - Add `getFirstAssistantMessage` helper
- `packages/backend/src/infrastructure/database/repositories/DrizzleMessageRepository.ts` - Add `findFirstAssistantMessage`
- `packages/backend/src/application/interfaces/IMessageRepository.ts` - Add interface method
- `packages/backend/__tests__/unit/application/services/TitleGenerationService.test.ts` - Update tests for async assessment
- `packages/backend/__tests__/unit/ChatServer.titleGeneration.test.ts` - NEW: Add tests for title generation flow

## Agent Assignment

- [x] backend-agent

## Tests Required

### Unit Tests (TitleGenerationService)
- [ ] Assessment mode with no vendor info calls LLM
- [ ] Assessment mode with vendor info uses vendor (no LLM call)
- [ ] Assessment mode LLM failure falls back to "New Assessment"
- [ ] Scoring mode still does NOT call LLM (regression guard)
- [ ] Consult mode unchanged (still calls LLM)

### Integration Tests (ChatServer)
- [ ] Title generation uses TitleGenerationService (not truncation)
- [ ] Assessment mode conversation gets LLM title after first exchange
- [ ] Consult mode conversation gets LLM title
- [ ] Scoring mode conversation skips LLM (title set from filename later)
- [ ] WebSocket event emitted with generated title

### Test Cases

```typescript
describe('Assessment mode LLM fallback (Story 26.1)', () => {
  it('should call LLM when no vendor info available', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'AI Vendor Risk Assessment' }],
    });

    const context: TitleContext = {
      mode: 'assessment',
      userMessage: 'I need to assess an AI vendor',
      assistantResponse: 'I can help you assess AI vendors...',
    };

    const result = await service.generateModeAwareTitle(context);

    expect(result.title).toBe('AI Vendor Risk Assessment');
    expect(result.source).toBe('llm');
    expect(mockCreate).toHaveBeenCalled();
  });

  it('should prefer vendor info over LLM when available', async () => {
    const context: TitleContext = {
      mode: 'assessment',
      userMessage: 'I need to assess Acme Corp',
      metadata: { vendorName: 'Acme Corp' },
    };

    const result = await service.generateModeAwareTitle(context);

    expect(result.title).toBe('Assessment: Acme Corp');
    expect(result.source).toBe('vendor');
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('should fallback to placeholder when LLM fails', async () => {
    mockCreate.mockRejectedValueOnce(new Error('API Error'));

    const context: TitleContext = {
      mode: 'assessment',
      userMessage: 'Hello',
      assistantResponse: 'Hi!',
    };

    const result = await service.generateModeAwareTitle(context);

    expect(result.title).toBe('New Assessment');
    expect(result.source).toBe('default');
  });
});

describe('Scoring mode regression guard (Story 26.1)', () => {
  it('should NOT call LLM for scoring mode', async () => {
    const context: TitleContext = {
      mode: 'scoring',
      userMessage: 'Score this file',
      assistantResponse: 'Processing...',
    };

    const result = await service.generateModeAwareTitle(context);

    expect(result.title).toBe('Scoring Analysis');
    expect(result.source).toBe('default');
    expect(mockCreate).not.toHaveBeenCalled();
  });
});

describe('ChatServer title generation integration (Story 26.1)', () => {
  it('should use TitleGenerationService instead of truncation', async () => {
    // Setup: Mock TitleGenerationService
    const mockTitleService = {
      generateModeAwareTitle: jest.fn().mockResolvedValue({
        title: 'AI Governance Discussion',
        source: 'llm',
      }),
    };

    // ... integration test setup

    // Send first message
    await chatServer.handleSendMessage(socket, {
      conversationId: 'test-conv',
      message: 'What are the risks of AI in healthcare?',
    });

    // Verify TitleGenerationService was called
    expect(mockTitleService.generateModeAwareTitle).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'consult',
        userMessage: expect.any(String),
      })
    );

    // Verify WebSocket event emitted
    expect(socket.emit).toHaveBeenCalledWith('conversation_title_updated', {
      conversationId: 'test-conv',
      title: 'AI Governance Discussion',
    });
  });
});
```

## Definition of Done

- [ ] `TitleGenerationService` instantiated in `ChatServer` constructor
- [ ] `ChatServer` calls `titleGenerationService.generateModeAwareTitle()` for title generation
- [ ] `generateAssessmentTitle` is async and calls LLM when no vendor info
- [ ] `generateModeAwareTitle` updated to await assessment title
- [ ] Helper methods added to `ConversationService` and `MessageRepository`
- [ ] Scoring mode still skips LLM (regression verified)
- [ ] All existing TitleGenerationService tests pass (with updates)
- [ ] New tests added for assessment LLM fallback
- [ ] Integration tests verify ChatServer uses TitleGenerationService
- [ ] No TypeScript errors
- [ ] No lint errors
- [ ] Code reviewed and approved

## Architecture Notes

This story addresses a **critical gap** identified during architectural review: `TitleGenerationService` was designed and tested but never integrated into the production code path.

**Before Story 26.1:**
```
User Message → ChatServer → ConversationService.getConversationTitle() → Truncate first 60 chars
```

**After Story 26.1:**
```
User Message → ChatServer → TitleGenerationService.generateModeAwareTitle() → Claude Haiku LLM
```

This change affects ALL modes:
- **Consult:** Upgrade from truncation to LLM-generated titles
- **Assessment:** New LLM fallback when no vendor info
- **Scoring:** No change (still skipped, title from filename)
