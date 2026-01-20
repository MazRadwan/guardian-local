# Story 28.9.2: Extract MessageHandler.ts (file context building)

**Sprint:** 5 - Core Message Flow
**Agent:** backend-agent
**Estimation:** Small (1-2 files)

---

## Description

Add file context building logic to MessageHandler. This builds the document context for Claude prompts using FileContextBuilder.

**NOTE:** File validation (ownership, conversation membership) is handled in **Story 28.9.1** via `findByIdAndConversation`. This story focuses ONLY on building context from already-validated files.

---

## Acceptance Criteria

- [ ] `buildFileContext()` method implemented
- [ ] Uses FileContextBuilder for document context generation
- [ ] Accepts `enrichedAttachments` from validation (NOT raw fileIds from payload)
- [ ] Handles no-attachments case (uses all conversation files)
- [ ] Handles specific files case (scopes to validated fileIds)
- [ ] Unit tests cover context building scenarios

---

## Technical Approach

```typescript
// Add to MessageHandler.ts

import { FileContextBuilder } from '../context/FileContextBuilder';
import type { MessageAttachment } from '../../../domain/entities/Message';

export class MessageHandler {
  constructor(
    private readonly conversationService: ConversationService,
    private readonly fileRepository: IFileRepository,
    private readonly rateLimiter: RateLimiter,
    private readonly fileContextBuilder?: FileContextBuilder  // Optional, for context building
  ) {}

  /**
   * Build file context for Claude prompt
   *
   * NOTE: This method receives enrichedAttachments that have ALREADY been
   * validated by validateSendMessage(). It does NOT re-validate.
   *
   * @param conversationId - The conversation ID
   * @param enrichedAttachments - Pre-validated attachments from validation step
   */
  async buildFileContext(
    conversationId: string,
    enrichedAttachments?: MessageAttachment[]
  ): Promise<string> {
    if (!this.fileContextBuilder) {
      return '';  // FileContextBuilder not configured
    }

    if (!enrichedAttachments || enrichedAttachments.length === 0) {
      // No specific files - use all conversation files
      return await this.fileContextBuilder.build(conversationId);
    }

    // Scope to specific validated files
    const fileIds = enrichedAttachments.map(a => a.fileId);
    return await this.fileContextBuilder.build(conversationId, fileIds);
  }
}
```

---

## Files Touched

- `packages/backend/src/infrastructure/websocket/handlers/MessageHandler.ts` - Add method
- `packages/backend/__tests__/unit/infrastructure/websocket/handlers/MessageHandler.test.ts` - Add tests

---

## Tests Required

```typescript
import type { MessageAttachment } from '../../../domain/entities/Message';

describe('buildFileContext', () => {
  it('should return empty string when FileContextBuilder not configured', async () => {
    const handlerNoBuilder = new MessageHandler(
      mockConversationService,
      mockFileRepository,
      mockRateLimiter,
      undefined  // No FileContextBuilder
    );

    const result = await handlerNoBuilder.buildFileContext('conv-1');

    expect(result).toBe('');
  });

  it('should build context for all files when no attachments provided', async () => {
    mockFileContextBuilder.build.mockResolvedValue('\n\n--- Attached Documents ---\n...');

    const result = await handler.buildFileContext('conv-1');

    expect(mockFileContextBuilder.build).toHaveBeenCalledWith('conv-1');
    expect(result).toContain('Attached Documents');
  });

  it('should build context for all files when empty attachments array', async () => {
    mockFileContextBuilder.build.mockResolvedValue('\n\n--- Attached Documents ---\n...');

    const result = await handler.buildFileContext('conv-1', []);

    expect(mockFileContextBuilder.build).toHaveBeenCalledWith('conv-1');
  });

  it('should scope to specific files when enrichedAttachments provided', async () => {
    mockFileContextBuilder.build.mockResolvedValue('Scoped context');

    const enrichedAttachments: MessageAttachment[] = [
      { fileId: 'file-1', filename: 'doc.pdf', mimeType: 'application/pdf', size: 1024 },
      { fileId: 'file-2', filename: 'data.xlsx', mimeType: 'application/xlsx', size: 2048 },
    ];

    const result = await handler.buildFileContext('conv-1', enrichedAttachments);

    expect(mockFileContextBuilder.build).toHaveBeenCalledWith('conv-1', ['file-1', 'file-2']);
    expect(result).toBe('Scoped context');
  });
});
```

---

## Definition of Done

- [ ] buildFileContext implemented
- [ ] Accepts enrichedAttachments (not raw fileIds)
- [ ] Validation responsibility documented in story 28.9.1
- [ ] Unit tests passing
