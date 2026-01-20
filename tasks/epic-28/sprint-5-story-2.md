# Story 28.9.2: Extract MessageHandler.ts (attachment processing)

**Sprint:** 5 - Core Message Flow
**Agent:** backend-agent
**Estimation:** Small (1-2 files)

---

## Description

Add attachment processing logic to MessageHandler. This handles file references in messages and builds file context.

---

## Acceptance Criteria

- [ ] `processAttachments()` method implemented
- [ ] Uses FileContextBuilder for file context
- [ ] Validates file IDs belong to conversation
- [ ] Handles missing files gracefully
- [ ] Unit tests cover attachment scenarios

---

## Technical Approach

```typescript
// Add to MessageHandler.ts

import { FileContextBuilder } from '../context/FileContextBuilder';

export class MessageHandler {
  constructor(
    private readonly conversationService: ConversationService,
    private readonly fileContextBuilder: FileContextBuilder
  ) {}

  /**
   * Process message attachments and build file context
   */
  async processAttachments(
    conversationId: string,
    fileIds?: string[]
  ): Promise<{
    fileContext: string;
    processedFileIds: string[];
  }> {
    if (!fileIds || fileIds.length === 0) {
      // No specific files - use all conversation files
      const fileContext = await this.fileContextBuilder.build(conversationId);
      return { fileContext, processedFileIds: [] };
    }

    // Scope to specific files
    const fileContext = await this.fileContextBuilder.build(conversationId, fileIds);
    return { fileContext, processedFileIds: fileIds };
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
describe('processAttachments', () => {
  it('should build context for all files when no IDs provided', async () => {
    mockFileContextBuilder.build.mockResolvedValue('## Attached Documents...');

    const result = await handler.processAttachments('conv-1');

    expect(mockFileContextBuilder.build).toHaveBeenCalledWith('conv-1');
    expect(result.fileContext).toContain('Attached');
    expect(result.processedFileIds).toEqual([]);
  });

  it('should build context for specific files when IDs provided', async () => {
    mockFileContextBuilder.build.mockResolvedValue('## Specific files...');

    const result = await handler.processAttachments('conv-1', ['file-1', 'file-2']);

    expect(mockFileContextBuilder.build).toHaveBeenCalledWith('conv-1', ['file-1', 'file-2']);
    expect(result.processedFileIds).toEqual(['file-1', 'file-2']);
  });
});
```

---

## Definition of Done

- [ ] processAttachments implemented
- [ ] Unit tests passing
