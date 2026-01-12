# Story 18.4.5: Consult Mode Auto-Summarize

**Sprint:** 4
**Track:** D (standalone)
**Phase:** 1 (parallel with 18.4.3, 18.4.4a)
**Agent:** backend-agent
**Estimated Lines:** ~300
**Dependencies:** None

---

## Overview

### What This Story Does

When a user uploads a file in Consult mode without typing a message, the system
automatically generates a summary of the document. This provides immediate value
and prompts further conversation.

### User-Visible Change

**Before:**
```
User: [uploads vendor-security-whitepaper.pdf] [no message]
User: [clicks Send]
System: [nothing happens / confusing behavior]
```

**After:**
```
User: [uploads vendor-security-whitepaper.pdf] [no message]
User: [clicks Send]
System: "Here's a summary of the document you uploaded:

         This is a security whitepaper from CloudSec Solutions describing
         their cloud security platform. Key points:
         - SOC 2 Type II certified
         - AES-256 encryption at rest and in transit
         - Multi-tenant architecture with data isolation
         ...

         Would you like me to explain any of these points in more detail,
         or do you have specific questions about this document?"
```

### Why It's Needed

- Users often upload files to learn about them
- Empty message + file is a common pattern
- Auto-summary provides immediate value
- Creates natural conversation entry point
- Matches ChatGPT/Claude.ai behavior

---

## Prerequisites

- Sprint 3 complete (consult mode working)
- buildFileContext method exists (ChatServer.ts)
- ClaudeService available for summary generation

---

## Codebase Context

### File to Modify

**Path:** `packages/backend/src/infrastructure/websocket/ChatServer.ts`

### Current Consult Mode Handling (lines 1098-1104)

```typescript
// In send_message handler:
if (mode === 'consult' || mode === 'assessment') {
  const fileContext = await this.buildFileContext(conversationId);
  if (fileContext) {
    enhancedSystemPrompt = `${systemPrompt}${fileContext}`;
    console.log(`[ChatServer] Injected file context (${fileContext.length} chars) into ${mode} mode prompt`);
  }
}
```

### Current Message Flow

The handler processes user messages and generates Claude responses. If the user
sends an empty message with files, Claude receives the file context but no
specific question, leading to unclear behavior.

---

## Implementation Steps

### Step 1: Detect Empty Message with File in Consult Mode

**File:** `packages/backend/src/infrastructure/websocket/ChatServer.ts`
**Location:** After mode-specific behavior section (~line 1105)

**Add check:**
```typescript
// =========================================================
// Epic 18.4.5: Auto-summarize in Consult mode
// =========================================================

// Check for empty message with file in Consult mode
const isEmptyMessageWithFile =
  mode === 'consult' &&
  enrichedAttachments &&
  enrichedAttachments.length > 0 &&
  (!messageText || messageText.trim().length === 0);

if (isEmptyMessageWithFile) {
  console.log(`[ChatServer] Consult mode: empty message with ${enrichedAttachments.length} files - auto-summarizing`);

  await this.autoSummarizeDocuments(
    socket,
    conversationId,
    socket.userId!,
    enrichedAttachments.map(a => a.fileId)
  );

  return; // Skip normal message handling
}
```

---

### Step 2: Add Auto-Summarize Method

**Location:** After buildScoringFollowUpContext method

**Add:**
```typescript
/**
 * Epic 18.4.5: Auto-summarize documents in Consult mode
 *
 * When user sends file(s) without a message in Consult mode,
 * automatically generate a summary to kickstart the conversation.
 */
private async autoSummarizeDocuments(
  socket: AuthenticatedSocket,
  conversationId: string,
  userId: string,
  fileIds: string[]
): Promise<void> {
  try {
    // Build file context (uses textExcerpt)
    const fileContext = await this.buildFileContext(conversationId);

    if (!fileContext) {
      // No context available - ask user to try again
      socket.emit('message', {
        role: 'assistant',
        content: "I received your file but couldn't extract the content. Could you try uploading it again?",
        conversationId,
      });
      return;
    }

    // Get file names for personalized response
    const files = await Promise.all(
      fileIds.map(id => this.fileRepository.findById(id))
    );
    const fileNames = files
      .filter(Boolean)
      .map(f => f!.filename)
      .join(', ');

    // Build summarization prompt
    const systemPrompt = this.buildAutoSummarizePrompt(fileNames);

    // Get conversation context
    const { messages } = await this.buildConversationContext(conversationId);

    // Emit typing indicator
    socket.emit('assistant_stream_start', { conversationId });

    // Stream Claude response
    let fullResponse = '';

    await this.claudeService.streamChat(
      messages,
      {
        systemPrompt: `${systemPrompt}\n\n${fileContext}`,
      },
      (chunk: string) => {
        fullResponse += chunk;
        socket.emit('assistant_stream_chunk', {
          conversationId,
          chunk,
          fullText: fullResponse,
        });
      }
    );

    // Save assistant response
    const summaryMessage = await this.conversationService.sendMessage({
      conversationId,
      role: 'assistant',
      content: fullResponse,
      userId,
    });

    // Emit stream complete
    socket.emit('assistant_stream_complete', {
      conversationId,
      messageId: summaryMessage.id,
      content: fullResponse,
    });

    console.log(`[ChatServer] Auto-summarize complete (${fullResponse.length} chars)`);
  } catch (error) {
    console.error('[ChatServer] Auto-summarize failed:', error);
    socket.emit('message', {
      role: 'assistant',
      content: "I had trouble summarizing the document. What would you like to know about it?",
      conversationId,
    });
  }
}

/**
 * Build system prompt for auto-summarization
 */
private buildAutoSummarizePrompt(fileNames: string): string {
  return `You are Guardian, an AI assistant helping healthcare organizations assess AI vendors.

The user has uploaded a document (${fileNames}) and wants to understand its contents.

Please provide a helpful summary that:
1. Identifies what type of document this is (security whitepaper, compliance cert, product doc, etc.)
2. Highlights key points relevant to AI governance and vendor assessment
3. Notes any security, privacy, or compliance information mentioned
4. Ends with an invitation to ask follow-up questions

Keep the summary concise (3-5 paragraphs) and focus on information relevant to vendor assessment.
If the document appears to be a completed questionnaire, mention that it can be scored in Scoring mode.`;
}
```

---

### Step 3: Handle Multiple Files

The current implementation handles multiple files naturally through `buildFileContext`,
which aggregates all file excerpts. The summary prompt acknowledges multiple files.

**Enhancement for clarity (optional):**
```typescript
// In autoSummarizeDocuments, adjust prompt for multiple files:
const isSingleFile = fileIds.length === 1;
const fileLabel = isSingleFile
  ? `a document (${fileNames})`
  : `${fileIds.length} documents (${fileNames})`;

// Use fileLabel in prompt
```

---

## Tests to Write

### Unit Test File

**Path:** `packages/backend/__tests__/unit/ChatServer.autoSummarize.test.ts`

### Test Cases

```typescript
describe('ChatServer - Auto-Summarize (Epic 18.4.5)', () => {
  describe('autoSummarizeDocuments', () => {
    it('should generate summary for single file', async () => {
      // Upload 1 file, send empty message in consult mode
      // Assert: Claude called with summarize prompt
      // Assert: Response streamed to socket
    });

    it('should generate summary for multiple files', async () => {
      // Upload 2 files, send empty message
      // Assert: Claude receives context for both files
      // Assert: Prompt mentions multiple documents
    });

    it('should handle missing file context gracefully', async () => {
      // Mock buildFileContext to return null
      // Assert: Fallback message sent
    });

    it('should not trigger for non-empty message', async () => {
      // Send file with message "Tell me about this"
      // Assert: Normal flow, not auto-summarize
    });

    it('should not trigger in assessment mode', async () => {
      // Send file with empty message in assessment mode
      // Assert: Normal flow, not auto-summarize
    });

    it('should not trigger in scoring mode', async () => {
      // Send file with empty message in scoring mode
      // Assert: Scoring flow triggered, not auto-summarize
    });
  });

  describe('buildAutoSummarizePrompt', () => {
    it('should include file names in prompt', async () => {
      const prompt = chatServer.buildAutoSummarizePrompt('security-doc.pdf');
      expect(prompt).toContain('security-doc.pdf');
    });

    it('should request relevant summary points', async () => {
      const prompt = chatServer.buildAutoSummarizePrompt('doc.pdf');
      expect(prompt).toContain('AI governance');
      expect(prompt).toContain('vendor assessment');
    });
  });
});
```

---

## Acceptance Criteria

- [ ] Empty message + file in Consult mode triggers auto-summarize
- [ ] Summary generated via Claude with file context
- [ ] Response streamed to frontend
- [ ] Response saved as assistant message
- [ ] Non-empty messages handled normally (no auto-summarize)
- [ ] Assessment mode NOT auto-summarizing (different flow)
- [ ] Scoring mode NOT auto-summarizing (scoring flow)
- [ ] Error handling with fallback message
- [ ] Unit tests for all scenarios

---

## Verification

### Commands to Run

```bash
# Run unit tests
pnpm --filter @guardian/backend test:unit -- --grep "Auto-Summarize"

# Run all ChatServer tests
pnpm --filter @guardian/backend test:unit -- --grep "ChatServer"
```

### Manual Testing Checklist

1. [ ] Upload PDF in Consult mode, send with empty message
2. [ ] Verify summary appears (3-5 paragraphs)
3. [ ] Verify summary mentions AI governance relevance
4. [ ] Upload PDF with message "What is this?" → normal response (not auto-summarize)
5. [ ] Upload PDF in Assessment mode with empty message → intake flow
6. [ ] Upload PDF in Scoring mode with empty message → scoring flow
7. [ ] Upload multiple files with empty message → summary of all

### Expected Behavior

```
Consult Mode + File + Empty Message:
1. file_attached event fires (~3s)
2. User sends with empty message
3. assistant_stream_start fires
4. assistant_stream_chunk events with summary
5. assistant_stream_complete fires
6. Summary saved as assistant message
7. Summary ends with invitation to ask questions
```

---

## Notes

- This only applies to Consult mode (not Assessment or Scoring)
- "Empty message" means empty string or whitespace only
- Summary focuses on AI governance relevance (Guardian's domain)
- Multi-file summaries aggregate all documents
- If file is a questionnaire, summary suggests Scoring mode
