# Sprint 3: Pipeline Integration

## Goal

Wire VisionContentBuilder into the message pipeline so images are included in Claude API calls.

## Dependencies

- Sprint 1 complete (types)
- Sprint 2 complete (VisionContentBuilder)

## Stories

### 30.3.1: Update FileContextBuilder for Images

**Description:** Modify FileContextBuilder to detect image files and delegate to VisionContentBuilder instead of text extraction.

**Acceptance Criteria:**
- [ ] Image files routed to VisionContentBuilder
- [ ] Non-image files use existing text extraction path
- [ ] Returns both text context AND image blocks separately
- [ ] Graceful fallback if image processing fails

**Technical Approach:**
```typescript
interface FileContextResult {
  textContext: string;           // Existing text excerpts
  imageBlocks: ImageContentBlock[]; // NEW: Vision blocks for images
}

async build(conversationId: string): Promise<FileContextResult> {
  const files = await this.fileRepo.findByConversationId(conversationId);

  const textContext: string[] = [];
  const imageBlocks: ImageContentBlock[] = [];

  for (const file of files) {
    if (this.isImageFile(file.mimeType)) {
      const block = await this.visionContentBuilder.buildImageContent(file);
      if (block) imageBlocks.push(block);
    } else {
      const excerpt = await this.extractTextExcerpt(file);
      if (excerpt) textContext.push(excerpt);
    }
  }

  return { textContext: textContext.join('\n'), imageBlocks };
}
```

**Files Touched:**
- `packages/backend/src/infrastructure/websocket/context/FileContextBuilder.ts` - Add image detection and delegation

**Agent:** backend-agent

**Tests Required:**
- `FileContextBuilder.test.ts` - Image file → imageBlocks array
- `FileContextBuilder.test.ts` - PDF file → textContext only
- `FileContextBuilder.test.ts` - Mixed files → both populated
- `FileContextBuilder.test.ts` - Image processing failure → graceful fallback

---

### 30.3.2: Update ConversationContextBuilder

**Description:** Modify ConversationContextBuilder to return image blocks separately (not embedded in ClaudeMessage). Domain types stay string-only; ClaudeClient handles the API format conversion.

**Architecture Note:** Per clean architecture, `ClaudeMessage` (domain) stays `content: string`. The `imageBlocks` are passed separately to `ClaudeClient.streamMessage()`, which internally converts to `ClaudeApiMessage` with `ContentBlock[]`.

**Acceptance Criteria:**
- [ ] Returns `{ messages: ClaudeMessage[], imageBlocks: ImageContentBlock[] }`
- [ ] `ClaudeMessage.content` remains string (domain type unchanged)
- [ ] ImageBlocks passed separately to ClaudeClient
- [ ] Falls back to empty imageBlocks array when no images

**Technical Approach:**
```typescript
interface ConversationContext {
  messages: ClaudeMessage[];        // Domain type - content is string
  imageBlocks: ImageContentBlock[]; // Infrastructure type - passed to ClaudeClient separately
}

async build(conversationId: string, userMessage: string): Promise<ConversationContext> {
  const { textContext, imageBlocks } = await this.fileContextBuilder.build(conversationId);

  // Domain messages stay string-only
  const messages: ClaudeMessage[] = [
    { role: 'user', content: userMessage + '\n\n' + textContext }
  ];

  // ImageBlocks passed separately - ClaudeClient merges them into API format
  return { messages, imageBlocks };
}
```

**Files Touched:**
- `packages/backend/src/infrastructure/websocket/context/ConversationContextBuilder.ts` - Return imageBlocks separately

**Agent:** backend-agent

**Tests Required:**
- `ConversationContextBuilder.test.ts` - With images → imageBlocks populated, messages stay string
- `ConversationContextBuilder.test.ts` - Without images → empty imageBlocks array
- `ConversationContextBuilder.test.ts` - Verify ClaudeMessage.content is always string

---

### 30.3.3: Update MessageHandler

**Description:** Update MessageHandler to pass imageBlocks separately to ClaudeClient.streamMessage().

**Acceptance Criteria:**
- [ ] Destructure `{ messages, imageBlocks }` from ConversationContextBuilder
- [ ] Pass imageBlocks to `claudeClient.streamMessage(messages, systemPrompt, imageBlocks)`
- [ ] Streaming responses work with Vision requests
- [ ] Call `visionContentBuilder.clearConversationCache()` on conversation end

**Technical Approach:**
```typescript
async handleMessage(conversationId: string, userMessage: string): Promise<void> {
  const { messages, imageBlocks } = await this.contextBuilder.build(conversationId, userMessage);

  // Pass imageBlocks separately - ClaudeClient merges into API format
  const stream = this.claudeClient.streamMessage(messages, systemPrompt, imageBlocks);

  for await (const chunk of stream) {
    this.emit('chunk', chunk);
  }
}
```

**Files Touched:**
- `packages/backend/src/infrastructure/websocket/handlers/MessageHandler.ts` - Pass imageBlocks to ClaudeClient

**Agent:** backend-agent

**Tests Required:**
- `MessageHandler.test.ts` - Verify imageBlocks passed to ClaudeClient
- `MessageHandler.test.ts` - Verify streaming works with Vision content
- `MessageHandler.test.ts` - Verify cache cleared on conversation end

---

### 30.3.4: Inject VisionContentBuilder Dependency

**Description:** Update FileContextBuilder constructor to receive VisionContentBuilder.

**Acceptance Criteria:**
- [ ] FileContextBuilder accepts IVisionContentBuilder in constructor
- [ ] DI wiring updated in index.ts
- [ ] ChatServer receives updated FileContextBuilder

**Technical Approach:**
```typescript
// FileContextBuilder constructor
constructor(
  private readonly fileRepo: IFileRepository,
  private readonly fileStorage: IFileStorage,
  private readonly visionContentBuilder: IVisionContentBuilder, // NEW
) {}

// index.ts wiring
const visionContentBuilder = new VisionContentBuilder(fileStorage);
const fileContextBuilder = new FileContextBuilder(fileRepo, fileStorage, visionContentBuilder);
```

**Files Touched:**
- `packages/backend/src/infrastructure/websocket/context/FileContextBuilder.ts` - Update constructor
- `packages/backend/src/index.ts` - Update DI wiring

**Agent:** backend-agent

**Tests Required:**
- Existing FileContextBuilder tests updated with mock VisionContentBuilder

---

### 30.3.5: Image Content Caching (Performance)

**Description:** Cache base64-encoded image content to avoid repeated S3 fetches and encoding on every message in a conversation.

**Problem:** Without caching, every user message triggers:
1. S3 fetch for each image
2. Base64 encoding of each image buffer
3. Repeated for every message in the conversation

**Acceptance Criteria:**
- [ ] ImageContentBlock cached with key `conversationId:fileId` (prevents cross-conversation leakage)
- [ ] Cache invalidated when conversation ends or file deleted
- [ ] Second message with same image uses cached block (no S3 fetch)
- [ ] Cache bounded by conversation lifetime (no memory leaks)
- [ ] Clear lifecycle hook: `clearConversationCache(conversationId)` called on conversation end

**Technical Approach:**
```typescript
// VisionContentBuilder with conversation-scoped cache
// Key format: "conversationId:fileId" to prevent cross-conversation leakage
private imageCache = new Map<string, ImageContentBlock>();

private cacheKey(conversationId: string, fileId: string): string {
  return `${conversationId}:${fileId}`;
}

async buildImageContent(conversationId: string, file: FileDTO): Promise<ImageContentBlock | null> {
  const key = this.cacheKey(conversationId, file.id);

  // Check cache first
  const cached = this.imageCache.get(key);
  if (cached) {
    console.log(`[VisionContentBuilder] Cache hit: fileId=${file.id}`);
    return cached;
  }

  // Fetch and encode
  const block = await this.fetchAndEncode(file);
  if (block) {
    this.imageCache.set(key, block);
  }
  return block;
}

// Called when conversation ends or WebSocket disconnects
clearConversationCache(conversationId: string): void {
  for (const key of this.imageCache.keys()) {
    if (key.startsWith(`${conversationId}:`)) {
      this.imageCache.delete(key);
    }
  }
}
```

**Lifecycle hook:** MessageHandler or ChatServer calls `clearConversationCache()` on conversation end/disconnect.

**Files Touched:**
- `packages/backend/src/infrastructure/ai/VisionContentBuilder.ts` - Add caching logic
- `packages/backend/src/infrastructure/websocket/handlers/MessageHandler.ts` - Clear cache after response

**Agent:** backend-agent

**Tests Required:**
- `VisionContentBuilder.test.ts` - Second call with same fileId → no S3 fetch (mock verifies)
- `VisionContentBuilder.test.ts` - clearCache() removes cached entry
- `VisionContentBuilder.test.ts` - Different fileId → cache miss, S3 fetch

---

## Definition of Done

- [ ] Images uploaded in chat are converted to Vision blocks
- [ ] Vision blocks included in Claude API request
- [ ] Claude can "see" and analyze uploaded images
- [ ] Existing text file uploads still work
- [ ] Image content cached to avoid repeated S3 fetches
- [ ] All tests pass
- [ ] Manual QA: Upload image in Consult mode, Claude describes it
