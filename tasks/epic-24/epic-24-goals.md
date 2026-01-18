# Epic 24: Chat UX Refinements

## Overview

Polish chat interactions including regenerate functionality, scoring progress indicators, and mode switching animations. Focus on making AI interactions feel more responsive and informative.

## Problem Statement

**Current State:**
1. Regenerate button resends identical prompt - LLM doesn't know it's a retry, often produces same response
2. Scoring progress messages may not all display reliably during long operations
3. No "this will take a minute..." animation during long waits
4. Progress text "Analyzing responses against rubric..." is verbose
5. Mode switch preamble messages pop in instantly instead of streaming naturally

**Desired State:**
1. Regenerate includes retry context so LLM produces genuinely different response
2. All scoring progress messages display reliably with smooth transitions
3. Animated "please wait" indicator alternates with progress messages
4. Cleaner progress text: "Analyzing scoring..."
5. Mode switch preambles stream in like regular assistant messages

---

## Technical Investigation Results

### Story 24.1: Regenerate Function Analysis

**Current Flow (no retry context):**
```
ChatMessage.tsx:227-238     → Regenerate button rendered
ChatMessage.tsx:105-109     → handleRegenerateClick() calls onRegenerate(messageIndex)
useChatController.ts:528-539 → handleRegenerate() delegates to ChatService
ChatService.ts:100-161       → regenerateMessage() core logic
ChatService.ts:154           → adapter.sendMessage(previousMessage.content, conversationId)
                               ❌ NO retry flag, NO context - identical to new message
```

**Problem:** Line 154 in `ChatService.ts` sends the exact same message content with no indication this is a regeneration attempt. The backend and LLM have no way to know this is a retry.

**Solution:** Add `isRegenerate: true` flag to the message payload, and modify backend to prepend retry context to the system prompt or user message.

---

### Story 24.2: Scoring Progress Messages Analysis

**Backend Progress Emissions (ScoringService.ts):**
| Line | Status | Message |
|------|--------|---------|
| 65 | parsing | "Retrieving uploaded document..." |
| 80 | parsing | "Extracting responses from document..." |
| 188 | parsing | "Storing extracted responses..." |
| 196 | scoring | "Analyzing responses against rubric..." |
| 203 | scoring | (dynamic from Claude streaming) |
| 211 | validating | "Validating scoring results..." |
| 220 | validating | "Storing assessment results..." |
| 243 | complete | "Scoring complete!" |

**WebSocket Events (ChatServer.ts):**
- `scoring_started` (line 752-755)
- `scoring_progress` (line 768-774)
- `scoring_complete` (line 798-802)
- `scoring_error` (error handling)

**Frontend Flow:**
```
WebSocket → useWebSocketEvents.ts:561-579 → chatStore.updateScoringProgress()
                                          → ProgressMessage.tsx renders
```

**Files:**
- `apps/web/src/hooks/useScoringProgress.ts` - Hook managing progress state
- `apps/web/src/components/chat/ProgressMessage.tsx` - Display component
- `apps/web/src/stores/chatStore.ts:594-608` - Store update method

---

### Story 24.3: "This Will Take a Minute" Animation

**Current:** Static progress messages during long operations.

**Solution:** Add alternating animated text that cycles with current progress message. Use existing `animate-shimmer` or new animation in `globals.css`.

**Files:**
- `apps/web/src/components/chat/ProgressMessage.tsx` - Add alternating text
- `apps/web/src/app/globals.css` - Animation if needed

---

### Story 24.4: Progress Text Update

**Current (ScoringService.ts:196):**
```typescript
onProgress?.({ status: 'scoring', message: 'Analyzing responses against rubric...' });
```

**Change to:**
```typescript
onProgress?.({ status: 'scoring', message: 'Analyzing scoring...' });
```

**Single file change:** `packages/backend/src/application/services/ScoringService.ts:196`

---

### Story 24.5: Mode Switch Preamble Streaming

**Current Flow (ChatServer.ts:1854-1876):**
```typescript
// Assessment Mode Guidance message - sent all at once
const guidanceMessage = `🔍 **Assessment Mode Activated**\n\nPlease select...`;
socket.emit('conversation_mode_updated', {
  conversationId,
  mode,
  message: guidanceMessage  // ← Entire message at once
});
```

**Problem:** The guidance message is emitted as a single chunk. Frontend receives and displays it instantly, no streaming effect.

**Solution:** Emit guidance message as streaming chunks (like regular Claude responses) OR have frontend simulate streaming by revealing characters progressively.

**Files:**
- `packages/backend/src/infrastructure/websocket/ChatServer.ts:1854-1876` - Guidance emission
- `apps/web/src/hooks/useWebSocketEvents.ts` - Handle mode update with streaming
- `apps/web/src/hooks/useConversationMode.ts` - Mode switch handling

---

## Stories

### Story 24.1: Regenerate with Retry Context

**Description:** Modify regenerate to include context indicating this is a retry, prompting LLM to provide different/improved response.

**Acceptance Criteria:**
- [ ] `sendMessage` payload includes `isRegenerate: boolean` flag
- [ ] Backend detects regenerate flag in `ChatServer.ts`
- [ ] When regenerating, system prompt includes: "The user requested a different response. Provide a fresh perspective."
- [ ] Regenerated responses are noticeably different from original
- [ ] **QA in browser:** Click regenerate, verify response differs from original
- [ ] Unit tests for regenerate flag handling

**Files Touched:**
- `apps/web/src/services/ChatService.ts:154` - Add isRegenerate flag to sendMessage
- `apps/web/src/hooks/useWebSocketAdapter.ts` - Pass flag through
- `apps/web/src/lib/websocket.ts` - Update sendMessage signature
- `packages/backend/src/infrastructure/websocket/ChatServer.ts` - Detect flag, modify prompt

**Agent:** backend-agent (requires both frontend + backend changes)

---

### Story 24.2: Scoring Progress Message Reliability

**Description:** Ensure all scoring progress messages display in sequence with proper timing.

**Acceptance Criteria:**
- [ ] All 8 progress messages display during scoring flow
- [ ] Messages transition smoothly (no flicker/jump)
- [ ] Progress percentage updates correctly (when available)
- [ ] Error states display with proper styling
- [ ] **QA in browser:** Upload questionnaire, verify ALL progress messages appear in sequence
- [ ] No messages skipped or overwritten too quickly

**Files Touched:**
- `apps/web/src/hooks/useWebSocketEvents.ts:561-579` - Verify event handling
- `apps/web/src/components/chat/ProgressMessage.tsx` - Ensure smooth transitions
- `packages/backend/src/application/services/ScoringService.ts` - Verify all emissions

**Agent:** frontend-agent

---

### Story 24.3: "This Will Take a Minute" Animation

**Description:** Add animated indicator that alternates with progress messages during long operations.

**Acceptance Criteria:**
- [ ] After 5 seconds of same status, show "This may take a minute..." with shimmer
- [ ] Animation alternates: progress message ↔ "please wait" message (every 3s)
- [ ] Uses sky color palette (consistent with app theme)
- [ ] Animation stops when status changes or completes
- [ ] **QA in browser:** Trigger scoring, wait 10+ seconds, verify animation appears
- [ ] Respects `prefers-reduced-motion` preference

**Files Touched:**
- `apps/web/src/components/chat/ProgressMessage.tsx` - Add alternating logic
- `apps/web/src/app/globals.css` - Animation styles if needed

**Agent:** frontend-agent

---

### Story 24.4: Update Scoring Progress Text

**Description:** Change verbose progress text to be more concise.

**Acceptance Criteria:**
- [ ] "Analyzing responses against rubric..." → "Analyzing scoring..."
- [ ] No other text regressions
- [ ] **QA in browser:** Trigger scoring, verify new text displays

**Files Touched:**
- `packages/backend/src/application/services/ScoringService.ts:196`

**Agent:** backend-agent

---

### Story 24.5: Stream Mode Switch Preambles

**Description:** Make mode switch preamble messages stream in naturally instead of appearing instantly.

**Acceptance Criteria:**
- [ ] Mode switch guidance streams character-by-character (or chunk-by-chunk)
- [ ] Streaming speed matches regular Claude responses (~30-50 chars/sec)
- [ ] User can see text appearing progressively
- [ ] **QA in browser:** Switch from Consult → Assessment mode, verify guidance streams in
- [ ] Works for all three modes (Consult, Assessment, Scoring)

**Files Touched:**
- `packages/backend/src/infrastructure/websocket/ChatServer.ts:1854-1876` - Emit as stream
- `apps/web/src/hooks/useWebSocketEvents.ts` - Handle streamed mode guidance
- OR: Frontend-only solution with simulated streaming

**Agent:** backend-agent

---

## Sprint Structure

**Sprint file:** `tasks/epic-24/sprint-1.md`

**Story files:**
- `sprint-1-story-1.md` - Regenerate with Retry Context (backend-agent)
- `sprint-1-story-2.md` - Scoring Progress Reliability (frontend-agent)
- `sprint-1-story-3.md` - "This Will Take a Minute" Animation (frontend-agent)
- `sprint-1-story-4.md` - Update Scoring Progress Text (backend-agent)
- `sprint-1-story-5.md` - Stream Mode Switch Preambles (backend-agent)

---

## Dependencies

- Epic 22 (scoring persistence) should be complete for story 24.2 testing
- Existing WebSocket infrastructure
- Existing scoring flow

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Retry context confuses LLM | Test with various prompts, tune context wording |
| Streaming preambles adds complexity | Consider frontend-only simulation as fallback |
| Animation distracts users | Keep subtle, respect reduced-motion |
| Progress messages still skip | Add debounce/queue on frontend |

---

## Success Criteria (QA Required for Approval)

Each story **MUST** pass browser QA before code-reviewer approval:

1. **24.1:** Open browser → Send message → Get response → Click regenerate → Response MUST differ
2. **24.2:** Open browser → Upload questionnaire → ALL 8 progress messages MUST display in sequence
3. **24.3:** Open browser → Trigger scoring → Wait 10s → "This may take a minute..." MUST appear with animation
4. **24.4:** Open browser → Trigger scoring → Text MUST say "Analyzing scoring..." (not "against rubric")
5. **24.5:** Open browser → Switch mode → Guidance message MUST stream in (not pop)

**Agents must use Playwright MCP to take screenshots verifying each criterion.**

---

## References

- Regenerate flow: `ChatService.ts:100-161`
- Scoring progress: `ScoringService.ts:65-254`
- Mode switching: `ChatServer.ts:1806-1876`
- Progress display: `ProgressMessage.tsx`
- WebSocket events: `useWebSocketEvents.ts`
