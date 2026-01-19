# Epic 25 Sprint 2: Chat History UX Refinements

**Sprint Goal:** Improve chat history sidebar density and fix scoring title bug to match ChatGPT-style UX.

**Stories:** 3 total (2 frontend, 1 backend)

**Reference:** ChatGPT sidebar shows titles without icons, with smaller font, maximizing visible title text.

---

## Story 25.7: Reduce Chat History Item Font Size

**Priority:** High
**Agent:** frontend-agent
**Estimated Complexity:** Low

### Description

Reduce the font size of chat history item titles to match ChatGPT's density. Current font is too large, causing excessive truncation and poor scannability.

### Acceptance Criteria

- [ ] Chat history titles use smaller font (change from `text-sm` to `text-xs` or equivalent)
- [ ] Title text remains readable and accessible
- [ ] More characters visible before truncation occurs
- [ ] Timestamp and dropdown menu sizing adjusted proportionally if needed
- [ ] No visual regression on hover/active states
- [ ] **Line-height adjusted** to prevent vertical misalignment (`leading-tight` or `leading-snug`)
- [ ] **Hit target preserved** - list item maintains minimum height (36-40px) for accessibility

### Technical Approach

1. Locate `ConversationListItem.tsx` component
2. Identify the title text element (likely using `text-sm` class)
3. Change to `text-xs` (12px) or custom size that matches ChatGPT
4. **Add explicit line-height** class (`leading-tight` or `leading-snug`) to prevent vertical misalignment
5. **Verify `min-height`** on list item container - should remain 36-40px for clickability
6. Test truncation behavior with long titles
7. Verify hover states and active selection still work with smaller text
8. **Check background color contrast** - ensure hover/active states remain distinguishable

**Important: Use Tailwind spacing tokens only** - avoid raw px values:
- Font size: `text-xs` (not `font-size: 12px`)
- Line height: `leading-tight` or `leading-snug`
- Min height: `min-h-9` or `min-h-10` (36-40px)
- This ensures consistency across breakpoints and design system compliance.

### Files Touched

- `apps/web/src/components/chat/ConversationListItem.tsx` - Reduce title font size, adjust line-height
- `apps/web/src/components/chat/__tests__/ConversationListItem.test.tsx` - Update snapshot if applicable

### Tests Required

- Visual test: Title shows more characters than before
- Unit test: Component renders with correct CSS classes (`text-xs`, `leading-tight`)
- Unit test: List item has minimum height for accessibility
- Unit test: Hover/active states have sufficient contrast

---

## Story 25.8: Remove Chat Icon from Sidebar History Items

**Priority:** High
**Agent:** frontend-agent
**Estimated Complexity:** Low

### Description

Remove the chat bubble icon (MessageSquare) that appears next to each conversation title in the sidebar. This icon wastes ~24px of horizontal space that could show more title text. ChatGPT's sidebar does not use icons for individual conversations.

### Acceptance Criteria

- [ ] Chat bubble icon removed from conversation list items
- [ ] Title text starts at the left edge (after proper padding)
- [ ] ~24px horizontal space recovered for title display
- [ ] No layout shift or alignment issues
- [ ] Active/hover states still distinguishable without icon
- [ ] **Hit target preserved** - clickable area unchanged despite icon removal
- [ ] **Padding maintained** - left padding provides visual breathing room (not flush to edge)
- [ ] **Hover affordances clear** - background color change still visible on hover

### Technical Approach

1. Locate `ConversationListItem.tsx` component
2. Find the `MessageSquare` or similar icon import/usage
3. Remove the icon element from the render output
4. **Maintain left padding** (e.g., `pl-3` or `pl-4`) for visual balance - don't remove padding that icon occupied
5. **Preserve min-height and clickable area** - item should remain same height
6. Ensure the dropdown menu (MoreHorizontal icon) still appears on hover
7. Test that delete/rename functionality still works
8. **Verify hover/active background** colors still provide clear feedback

**Important: Use Tailwind spacing tokens only** - avoid raw px values:
- Left padding: `pl-3` (12px) or `pl-4` (16px)
- Min height: `min-h-9` or `min-h-10` (matches Story 25.7)
- This ensures consistency across breakpoints and design system compliance.

### Files Touched

- `apps/web/src/components/chat/ConversationListItem.tsx` - Remove icon, maintain padding
- `apps/web/src/components/chat/__tests__/ConversationListItem.test.tsx` - Update tests

### Tests Required

- Unit test: Icon no longer rendered in component
- Unit test: Title element has correct left padding
- Unit test: List item maintains minimum clickable height
- Unit test: Hover state applies correct background color
- Visual test: More title text visible without icon

---

## Story 25.9: Fix Scoring Title to Skip LLM Prompt Message

**Priority:** High
**Agent:** backend-agent
**Estimated Complexity:** Medium

### Description

In scoring mode, the LLM immediately sends an "[Upload file for analysis]" prompt message before the user uploads a file. The current title generation logic captures this message and sets the title to "[Uploaded file fo..." instead of waiting for the actual filename.

**Current (Broken) Flow:**
1. User switches to Scoring mode
2. LLM sends "[Upload file for analysis]" message
3. Title generation triggers → sets title to "[Uploaded file fo..."
4. User uploads file → filename available but title already set
5. Result: Title shows LLM prompt instead of "Scoring: filename.pdf"

**Expected Flow:**
1. User switches to Scoring mode
2. LLM sends "[Upload file for analysis]" message
3. Title generation **skipped** (recognizes this is assistant message in scoring mode)
4. User uploads file
5. File upload triggers title generation → "Scoring: filename.pdf"

### Acceptance Criteria

- [ ] Title generation skips assistant messages in scoring mode (not just string patterns)
- [ ] Title remains "New Chat" or placeholder until file is uploaded
- [ ] When file uploaded in scoring mode, title becomes "Scoring: {filename}"
- [ ] Does not affect consult or assessment mode title generation
- [ ] Does not break existing title update logic
- [ ] **Metadata-based skip logic** - use `role === 'assistant'` + `mode === 'scoring'`, not string matching
- [ ] **ALL assistant messages skipped in scoring mode** - not just the initial prompt; scoring titles ONLY come from filename
- [ ] **Idempotency** - title generation fires once per conversation unless explicitly updated
- [ ] **File upload bypasses idempotency + assistant-skip guards** - but STILL respects `titleManuallyEdited`
- [ ] **Manual renames respected** - check `titleManuallyEdited` flag before ANY auto-generation (including file upload)

### Technical Approach

1. **Centralize placeholder title constants** (prevents drift between guard and UI):
   ```typescript
   // In TitleGenerationService.ts or shared constants file
   export const PLACEHOLDER_TITLES = {
     DEFAULT: 'New Chat',
     ASSESSMENT: 'New Assessment',
     SCORING: 'Scoring Analysis',
   } as const;

   export const isPlaceholderTitle = (title: string | null): boolean => {
     if (!title) return true;
     return Object.values(PLACEHOLDER_TITLES).includes(title as any);
   };
   ```

2. Identify where title generation is triggered in `ChatServer.ts`

3. **Use metadata-based guard** (preferred over string matching):
   ```typescript
   // Skip title generation for ALL assistant messages in scoring mode
   // Scoring mode titles ONLY come from filename - never from LLM responses
   if (message.role === 'assistant' && conversation.mode === 'scoring') {
     return; // Wait for file upload to set title
   }
   ```

4. **Add idempotency guard** (using centralized constants):
   ```typescript
   // Skip if title already set (unless it's a default placeholder)
   if (conversation.title && !isPlaceholderTitle(conversation.title)) {
     return; // Title already generated
   }
   ```

5. **File upload title logic** - bypasses idempotency + assistant-skip, but respects manual edits:
   ```typescript
   // In file upload handler
   if (conversation.titleManuallyEdited) {
     return; // User renamed - don't overwrite
   }
   // Bypass other guards - always set filename-based title
   await this.conversationService.updateTitle(
     conversationId,
     `Scoring: ${filename}`,
     { source: 'filename' }
   );
   ```

6. **Verify `titleManuallyEdited` respected** in ALL auto-generation paths (consult, assessment, scoring file upload)

7. Add unit tests for metadata-based skip logic and centralized constants

### Files Touched

- `packages/backend/src/application/services/TitleGenerationService.ts` - Add `PLACEHOLDER_TITLES` constants, `isPlaceholderTitle()` helper
- `packages/backend/src/infrastructure/websocket/ChatServer.ts` - Add metadata-based guard, idempotency check using centralized constants
- `apps/web/src/stores/chatStore.ts` - Import and use `PLACEHOLDER_TITLES` for UI consistency (or duplicate constants if cross-package import not feasible)
- `packages/backend/__tests__/unit/application/services/TitleGenerationService.test.ts` - Add skip logic tests, placeholder constant tests
- `packages/backend/__tests__/unit/infrastructure/websocket/ChatServer.test.ts` - Add idempotency tests

### Tests Required

- Unit test: Title generation skipped for assistant messages in scoring mode
- Unit test: Title generation NOT skipped for user messages in scoring mode
- Unit test: Title generation NOT skipped for assistant messages in consult mode
- Unit test: Scoring mode title set correctly when file uploaded (bypasses guards)
- Unit test: Title generation skipped if title already set (idempotency)
- Unit test: Title generation allowed if current title is placeholder
- Unit test: Title generation skipped if `titleManuallyEdited` is true
- Integration test: Full scoring flow results in "Scoring: filename.pdf" title

---

## Cross-Cutting Concerns (Code Reviewer Feedback)

These apply to Sprint 2 and existing Sprint 1 code:

### Title Generation Robustness

| Concern | Requirement | Implementation |
|---------|-------------|----------------|
| **Length limits** | Enforce max 50 chars server-side on ALL paths | Verify `sanitizeTitle()` called in manual rename API |
| **Manual renames protected** | Never overwrite `titleManuallyEdited` titles | Check flag in ALL auto-generation triggers |
| **Loading timeout** | Frontend clears loading state after 5s | Add timeout in `useWebSocketEvents` or chatStore |

### API Security (PATCH /api/conversations/:id/title)

| Concern | Requirement | Implementation |
|---------|-------------|----------------|
| **Authorization** | Verify `conversation.userId === req.user.id` | Add ownership check in controller |
| **Length validation** | Max 50 characters | Validate in controller before service call |
| **Character safety** | Strip control characters, XSS-safe | Use `sanitizeTitle()` on input |
| **Logging safety** | Don't log user-provided title in errors | Log only conversationId, not title content |

### Regression Safety

| Concern | Requirement | Implementation |
|---------|-------------|----------------|
| **Loading state on failure** | Clear `titleLoading` if generation fails | Add error handler in WebSocket event listener |
| **WebSocket loop prevention** | Client-initiated updates don't re-trigger | Compare incoming title with current, or use `sourceClientId` |

### Frontend Loading State Timeout

Add to `chatStore.ts` or `useWebSocketEvents.ts`:
```typescript
// Store timeout refs to enable cleanup
const titleTimeouts = new Map<string, NodeJS.Timeout>();

// When title generation starts, set timeout
const startTitleTimeout = (conversationId: string) => {
  // Clear any existing timeout for this conversation
  const existing = titleTimeouts.get(conversationId);
  if (existing) clearTimeout(existing);

  const timeout = setTimeout(() => {
    // Clear loading state, use default title
    setTitleLoading(conversationId, false);
    titleTimeouts.delete(conversationId);
  }, 5000); // 5 second timeout

  titleTimeouts.set(conversationId, timeout);
};

// Clear timeout when title arrives
const clearTitleTimeout = (conversationId: string) => {
  const timeout = titleTimeouts.get(conversationId);
  if (timeout) {
    clearTimeout(timeout);
    titleTimeouts.delete(conversationId);
  }
};

// IMPORTANT: Cleanup on conversation delete/unmount
const cleanupConversation = (conversationId: string) => {
  clearTitleTimeout(conversationId);
  // ... other cleanup
};
```

**Cleanup requirement:** When a conversation is deleted or component unmounts, clear any pending timeout to avoid:
- Memory leaks from orphaned timers
- "setState on unmounted component" React warnings
- Stale state updates to deleted conversations

### WebSocket Loop Prevention

Add to WebSocket event handler:
```typescript
socket.on('conversation_title_updated', ({ conversationId, title }) => {
  const current = getConversation(conversationId);
  // Skip if title matches (we initiated this update)
  if (current?.title === title) return;

  updateConversationTitle(conversationId, title);
});
```

---

## Parallelization Analysis

All three stories can run in parallel:

| Story | Agent | Dependencies |
|-------|-------|--------------|
| 25.7 | frontend-agent | None |
| 25.8 | frontend-agent | None |
| 25.9 | backend-agent | None |

**Note:** Stories 25.7 and 25.8 both touch `ConversationListItem.tsx`. If running truly parallel, coordinate to avoid merge conflicts. Recommended: Run 25.7 first, then 25.8 (sequential within frontend).

### Execution Plan

```
Option A (Fully Parallel):
  frontend-agent → 25.7, 25.8 (sequential)
  backend-agent  → 25.9

Option B (Simple Sequential):
  frontend-agent → 25.7 → 25.8
  backend-agent  → 25.9 (parallel with frontend)
```

---

## Definition of Done

- [ ] All acceptance criteria met
- [ ] Unit tests written and passing
- [ ] No TypeScript errors
- [ ] Code review approved
- [ ] **Cross-cutting concerns addressed:**
  - [ ] Title length enforced server-side (50 chars)
  - [ ] Manual rename API validates ownership and input
  - [ ] Loading state timeout implemented (5s) with cleanup on unmount/delete
  - [ ] WebSocket loop prevention added
  - [ ] `titleManuallyEdited` respected in all paths (including file upload)
  - [ ] Placeholder titles centralized in shared constants
  - [ ] Tailwind spacing tokens used (no raw px values)
- [ ] **Chrome DevTools MCP QA validation completed** (see below)
- [ ] Manual QA:
  - Create scoring conversation, verify title shows "Scoring: filename.pdf" (not LLM prompt)
  - Verify ALL assistant messages in scoring mode don't affect title
  - Verify sidebar titles are smaller and show more text
  - Verify no chat icon appears next to titles
  - Verify manual rename persists across reloads and isn't overwritten by file upload
  - Verify loading state clears if title generation hangs
  - Delete conversation while title loading - verify no console errors

---

## Chrome DevTools MCP QA Validation

**Required QA steps using Chrome DevTools MCP after implementation:**

### 1. Visual Verification (Stories 25.7 + 25.8)

```
take_screenshot: Capture sidebar BEFORE changes (baseline)
take_screenshot: Capture sidebar AFTER changes
- Compare: titles should show more characters
- Compare: no chat icon visible next to titles
- Verify: hover states still visible (background color change)
- Verify: text is readable at smaller size
```

### 2. Scoring Title Flow (Story 25.9)

```
navigate_page: Go to /chat
- Switch to Scoring mode
- Observe sidebar title (should be "New Chat" or placeholder)

take_screenshot: Capture sidebar showing placeholder title

- Upload a test file (e.g., "vendor-questionnaire.pdf")

take_screenshot: Capture sidebar after upload
- Verify: title shows "Scoring: vendor-questionnaire.pdf"
- Verify: title does NOT show "[Upload..." or LLM prompt text
```

### 3. Console Check

```
list_console_messages: After all interactions
- Verify: No errors related to title generation
- Verify: No "setState on unmounted component" warnings
- Verify: No WebSocket errors
- Look for: Title update logs if present
```

### 4. Network Verification

```
list_network_requests: Filter for title-related API calls
- Verify: PATCH /api/conversations/:id/title called on rename
- Verify: Request includes proper authorization header
- Verify: Response is 200 OK

get_network_request: Inspect title update request
- Verify: Request body has title (max 50 chars)
- Verify: Response confirms update
```

### 5. Inline Rename Flow

```
hover: Over a conversation item in sidebar
click: On ellipsis (...) menu
take_screenshot: Capture dropdown menu

click: "Rename" option
take_screenshot: Capture inline edit state

fill: Type new title "My Custom Title"
press_key: Enter

take_screenshot: Capture updated title
- Verify: Title shows "My Custom Title"

navigate_page: Reload page
- Verify: Renamed title persists after reload
```

### 6. Manual Edit Protection

```
- Rename a scoring conversation to "My Vendor Review"
- Upload another file to the same conversation
take_screenshot: Capture sidebar
- Verify: Title still shows "My Vendor Review" (not overwritten by filename)
```

### QA Pass Criteria

- [ ] No console errors related to title/sidebar
- [ ] Sidebar titles visibly smaller and show more text
- [ ] No chat icon next to conversation items
- [ ] Scoring mode: title shows filename, not LLM prompt
- [ ] Inline rename works (Enter saves, Escape cancels)
- [ ] Manual renames persist and aren't overwritten
- [ ] Network requests properly authorized
- [ ] No visual regressions on hover/active states
