# Story 28.3.1: Create ChatContext.ts interface

**Sprint:** 2 - Infrastructure
**Agent:** backend-agent
**Estimation:** Small (1 file)

---

## Description

Create the `ChatContext` interface to formally model shared state that handlers need access to. This is infrastructure-only and must not leak Socket.IO types to application/domain layers.

---

## Acceptance Criteria

- [ ] `ChatContext.ts` created at `infrastructure/websocket/ChatContext.ts`
- [ ] Contains pendingCreations Map
- [ ] Contains abortedStreams Set
- [ ] Contains rateLimiter reference
- [ ] Contains promptCacheManager reference
- [ ] No Socket.IO types in interface
- [ ] JSDoc comments explain purpose

---

## Technical Approach

```typescript
// infrastructure/websocket/ChatContext.ts

import { RateLimiter } from './RateLimiter';
import { PromptCacheManager } from '../../application/services/PromptCacheManager';

/**
 * ChatContext - Shared state for WebSocket handlers
 *
 * ARCHITECTURE: Infrastructure layer only.
 * Per architecture-layers.md: No Socket.IO types, no WebSocket concerns
 * leak to application/domain layers.
 *
 * This is NOT a service locator - application services are injected
 * via constructor, not accessed through ChatContext.
 */
export interface ChatContext {
  /**
   * Idempotency guard for conversation creation
   * Prevents duplicate conversations from rapid double-clicks
   */
  pendingCreations: Map<string, { conversationId: string; timestamp: number }>;

  /**
   * Stream abort tracking
   * Tracks conversations with aborted streams for cleanup
   */
  abortedStreams: Set<string>;

  /**
   * Rate limiter instance
   * Enforces per-user message rate limits
   */
  rateLimiter: RateLimiter;

  /**
   * Prompt cache manager
   * Manages cached prompts for performance optimization
   */
  promptCache: PromptCacheManager;
}

/**
 * Create a new ChatContext with initialized collections
 */
export function createChatContext(
  rateLimiter: RateLimiter,
  promptCache: PromptCacheManager
): ChatContext {
  return {
    pendingCreations: new Map(),
    abortedStreams: new Set(),
    rateLimiter,
    promptCache,
  };
}
```

---

## Files Touched

- `packages/backend/src/infrastructure/websocket/ChatContext.ts` - Create new file

---

## Tests Required

No unit tests needed for pure interface/type definitions.

---

## Definition of Done

- [ ] ChatContext.ts created
- [ ] TypeScript compiles without errors
- [ ] Interface has JSDoc documentation
