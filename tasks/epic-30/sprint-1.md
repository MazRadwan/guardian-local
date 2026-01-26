# Sprint 1: Types & Infrastructure

## Goal

Establish the type foundation and update ClaudeClient to support Vision content blocks alongside text content.

## Stories

### 30.1.1: Vision Content Types

**Description:** Create TypeScript types for Vision API content blocks (image, text) that Claude's API expects.

**Acceptance Criteria:**
- [ ] `ContentBlock` union type with `ImageContentBlock` and `TextContentBlock`
- [ ] `ImageSource` type with base64 and media_type fields
- [ ] Types align with Anthropic API specification
- [ ] Exported from `infrastructure/ai/types/` (NOT domain - these are Anthropic API schemas)

**Technical Approach:**
```typescript
export type ContentBlock = ImageContentBlock | TextContentBlock;

export interface ImageContentBlock {
  type: 'image';
  source: {
    type: 'base64';
    media_type: 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp';
    data: string; // base64 encoded
  };
}

export interface TextContentBlock {
  type: 'text';
  text: string;
}
```

**Files Touched:**
- `packages/backend/src/infrastructure/ai/types/vision.ts` - NEW: Vision content types (Anthropic API schemas)
- `packages/backend/src/infrastructure/ai/types/index.ts` - Export new types

**IMPORTANT:** These are Anthropic API schemas, NOT domain types. Must live in `infrastructure/ai/`, not `domain/`.

**Agent:** backend-agent

**Tests Required:**
- Type compilation tests (TypeScript will validate)
- No runtime tests needed for pure types

---

### 30.1.2: Create ClaudeApiMessage Type (Infrastructure Layer)

**Description:** Create an infrastructure-level message type that supports ContentBlock arrays. Domain's ClaudeMessage stays unchanged (string-only) to maintain clean architecture.

**Clean Architecture Constraint:**
- Domain types MUST NOT import infrastructure types
- `ClaudeMessage` (domain) stays `content: string` — no changes
- `ClaudeApiMessage` (infrastructure) supports `content: string | ContentBlock[]`
- ClaudeClient converts domain → API format internally

**Acceptance Criteria:**
- [ ] `ClaudeApiMessage` type created in `infrastructure/ai/types/`
- [ ] `ClaudeApiMessage.content` accepts `string | ContentBlock[]`
- [ ] Domain's `ClaudeMessage` remains UNCHANGED (no ContentBlock reference)
- [ ] Type guards for checking content type in infrastructure layer

**Technical Approach:**
```typescript
// infrastructure/ai/types/message.ts (NEW)
import { ContentBlock } from './vision';

export interface ClaudeApiMessage {
  role: 'user' | 'assistant';
  content: string | ContentBlock[];
}

export function isContentBlockArray(content: string | ContentBlock[]): content is ContentBlock[] {
  return Array.isArray(content);
}

// ClaudeClient converts ClaudeMessage → ClaudeApiMessage internally
```

**Files Touched:**
- `packages/backend/src/infrastructure/ai/types/message.ts` - NEW: ClaudeApiMessage type
- `packages/backend/src/infrastructure/ai/types/index.ts` - Export new type
- `packages/backend/src/infrastructure/ai/ClaudeClient.ts` - Use ClaudeApiMessage internally
- `packages/backend/src/domain/types/claude.ts` - NO CHANGES (stays string-only)

**Agent:** backend-agent

**Tests Required:**
- `ClaudeClient.test.ts` - Existing tests still pass (domain types unchanged)
- Type guard unit tests for isContentBlockArray

---

### 30.1.3: ClaudeClient Content Array Support

**Description:** Update ClaudeClient.streamMessage() to accept optional ImageContentBlock[] and merge them with text content when building API requests.

**Acceptance Criteria:**
- [ ] `streamMessage()` accepts optional `imageBlocks?: ImageContentBlock[]` parameter
- [ ] When imageBlocks provided, constructs `ClaudeApiMessage` with ContentBlock array
- [ ] When no imageBlocks, uses string content as-is (existing behavior)
- [ ] Backward compatible — all existing callers work unchanged
- [ ] No changes to streaming response handling

**Technical Approach:**
```typescript
// ClaudeClient.ts
async *streamMessage(
  messages: ClaudeMessage[],
  systemPrompt: string,
  imageBlocks?: ImageContentBlock[]  // NEW optional parameter
): AsyncGenerator<string> {
  // Convert to API format, merging images into last user message if provided
  const apiMessages = this.toApiMessages(messages, imageBlocks);
  // ... rest unchanged
}

private toApiMessages(messages: ClaudeMessage[], imageBlocks?: ImageContentBlock[]): ClaudeApiMessage[] {
  // Implementation: merge imageBlocks into appropriate message
}
```

**Files Touched:**
- `packages/backend/src/infrastructure/ai/ClaudeClient.ts` - Add imageBlocks parameter, internal conversion

**Agent:** backend-agent

**Tests Required:**
- `ClaudeClient.test.ts` - Test with string content (regression)
- `ClaudeClient.test.ts` - Test with ContentBlock[] content (new)
- `ClaudeClient.test.ts` - Test with mixed text + image blocks

---

## Definition of Done

- [ ] All types compile without errors
- [ ] Existing ClaudeClient tests pass
- [ ] New content array tests pass
- [ ] No runtime regressions in chat functionality
