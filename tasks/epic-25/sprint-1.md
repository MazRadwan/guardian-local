# Epic 25 Sprint 1: Chat Title Intelligence

**Sprint Goal:** Implement intelligent chat title generation with mode-aware strategies and user rename capability.

**Stories:** 6 total (4 backend, 2 frontend)

---

## Story 25.1: Title Generation Service

**Priority:** High
**Agent:** backend-agent
**Estimated Complexity:** Medium

### Description

Create a `TitleGenerationService` that uses Claude Haiku to generate concise, meaningful chat titles from conversation content.

### Acceptance Criteria

- [ ] TitleGenerationService class exists with `generateTitle(context: TitleContext)` method
- [ ] Uses Claude Haiku model for fast, low-cost title generation
- [ ] Prompt template generates 3-6 word titles
- [ ] Returns generated title string (max 50 characters)
- [ ] Handles API errors gracefully (returns null on failure)
- [ ] Unit tests cover happy path and error cases

### Technical Approach

1. Create `TitleGenerationService` in application/services
2. Define `TitleContext` interface with mode, userMessage, assistantResponse, metadata
3. Use Anthropic SDK with `claude-3-haiku-20240307` model
4. Implement prompt template:
   ```
   Generate a concise 3-6 word title for this conversation.
   Be specific and descriptive. Do not use quotes.

   User: {userMessage}
   Assistant: {assistantResponse}

   Title:
   ```
5. Truncate result to 50 characters max
6. Add to DI container

### Files Touched

- `packages/backend/src/application/services/TitleGenerationService.ts` (NEW)
- `packages/backend/src/application/services/index.ts` (export)
- `packages/backend/src/infrastructure/di/container.ts` (register)
- `packages/backend/__tests__/unit/application/services/TitleGenerationService.test.ts` (NEW)

### Tests Required

- Unit test: generates title from user/assistant messages
- Unit test: truncates long titles to 50 chars
- Unit test: returns null on API error
- Unit test: handles empty/missing context gracefully

---

## Story 25.2: Mode-Aware Title Strategy

**Priority:** High
**Agent:** backend-agent
**Estimated Complexity:** Medium
**Depends On:** 25.1

### Description

Implement mode-aware title generation that chooses the appropriate strategy based on conversation mode (Consult, Assessment, Scoring).

### Acceptance Criteria

- [ ] Consult mode: Uses LLM to generate title from first Q&A exchange
- [ ] Assessment mode: Returns "Assessment: {vendor_name}" or "New Assessment" if no vendor
- [ ] Scoring mode: Returns "Scoring: {filename}" or "Scoring Analysis" if no filename
- [ ] Title generation triggers after appropriate context is available
- [ ] ConversationService.updateTitle() method exists
- [ ] WebSocket event `conversation_title_updated` emitted on title change

### Technical Approach

1. Add `generateModeAwareTitle(conversation, context)` method to TitleGenerationService
2. Strategy pattern:
   - Consult: Call LLM after first assistant response
   - Assessment: Extract vendor_name from assessment context, prefix with "Assessment:"
   - Scoring: Use uploaded filename, prefix with "Scoring:"
3. Add `updateTitle(conversationId, title)` to ConversationService
4. Emit WebSocket event when title changes
5. Add title field to conversation if not exists

### Files Touched

- `packages/backend/src/application/services/TitleGenerationService.ts` (extend)
- `packages/backend/src/application/services/ConversationService.ts` (add updateTitle)
- `packages/backend/src/infrastructure/websocket/ChatServer.ts` (emit title event)
- `packages/backend/__tests__/unit/application/services/TitleGenerationService.test.ts` (extend)

### Tests Required

- Unit test: Consult mode generates LLM title
- Unit test: Assessment mode uses vendor_name
- Unit test: Assessment mode fallback to "New Assessment"
- Unit test: Scoring mode uses filename
- Unit test: Scoring mode fallback to "Scoring Analysis"
- Unit test: WebSocket event emitted on title update

---

## Story 25.3: Assessment Title Updates

**Priority:** Medium
**Agent:** backend-agent
**Estimated Complexity:** Low
**Depends On:** 25.2

### Description

Update conversation title dynamically when vendor_name or solution_name becomes available during assessment flow.

### Acceptance Criteria

- [ ] Title updates when vendor_name is captured in assessment context
- [ ] Title format: "Assessment: {vendor_name}" or "Assessment: {solution_name}"
- [ ] WebSocket event triggers sidebar update
- [ ] Does not overwrite user-edited titles (check for manual edit flag)

### Technical Approach

1. Hook into assessment context update flow
2. When vendor_name or solution_name is set, call TitleGenerationService
3. Check if title was manually edited (add `titleManuallyEdited` flag)
4. If not manually edited, update title and emit event
5. Integration with existing AssessmentService

### Files Touched

- `packages/backend/src/application/services/AssessmentService.ts` (hook title update)
- `packages/backend/src/application/services/ConversationService.ts` (add titleManuallyEdited check)
- `packages/backend/src/domain/entities/Conversation.ts` (add titleManuallyEdited field if needed)
- `packages/backend/__tests__/unit/application/services/AssessmentService.test.ts` (extend)

### Tests Required

- Unit test: Title updates when vendor_name set
- Unit test: Title not updated if manually edited
- Integration test: Assessment flow triggers title update

---

## Story 25.4: Scoring Filename Titles

**Priority:** Medium
**Agent:** backend-agent
**Estimated Complexity:** Low
**Depends On:** 25.2

### Description

Use uploaded filename for scoring mode conversation titles.

### Acceptance Criteria

- [ ] When file uploaded in scoring mode, title becomes "Scoring: {filename}"
- [ ] Filename truncated if too long (keep extension visible)
- [ ] Title updates when file is processed (not just uploaded)
- [ ] Does not overwrite user-edited titles

### Technical Approach

1. Hook into file upload handling for scoring mode
2. Extract filename from upload metadata
3. Format title: "Scoring: {truncatedFilename}"
4. Truncation strategy: Keep last 30 chars + extension
5. Call ConversationService.updateTitle()

### Files Touched

- `packages/backend/src/application/services/ScoringService.ts` (hook title update)
- `packages/backend/src/application/services/TitleGenerationService.ts` (add formatScoringTitle helper)
- `packages/backend/__tests__/unit/application/services/ScoringService.test.ts` (extend)

### Tests Required

- Unit test: Scoring title uses filename
- Unit test: Long filename truncated correctly
- Unit test: Extension preserved in truncation
- Unit test: Title not updated if manually edited

---

## Story 25.5: Title Loading Placeholder UX

**Priority:** Low
**Agent:** frontend-agent
**Estimated Complexity:** Low

### Description

Show subtle loading indicator in sidebar while title is being generated.

### Acceptance Criteria

- [ ] New conversations show "New Chat" placeholder initially
- [ ] While title generates, show subtle shimmer/pulse animation
- [ ] When title arrives via WebSocket, update smoothly
- [ ] No layout shift when title updates

### Technical Approach

1. Add `titleLoading` state to conversation items in chatStore
2. Show "New Chat" with subtle pulse animation when titleLoading=true
3. Listen for `conversation_title_updated` WebSocket event
4. On event: update title in store, set titleLoading=false
5. CSS transition for smooth title change

### Files Touched

- `apps/web/src/stores/chatStore.ts` (add titleLoading state)
- `apps/web/src/components/layout/Sidebar.tsx` (loading UI)
- `apps/web/src/hooks/useWebSocketEvents.ts` (handle title_updated event)

### Tests Required

- Unit test: Sidebar shows "New Chat" when title empty
- Unit test: Loading animation shown when titleLoading=true
- Unit test: Title updates on WebSocket event
- Unit test: titleLoading cleared after update

---

## Story 25.6: Chat History Dropdown Menu

**Priority:** High
**Agent:** frontend-agent
**Estimated Complexity:** Medium

### Description

Replace trash icon on chat history items with ellipsis (`...`) dropdown menu containing Rename and Delete options.

### Acceptance Criteria

- [ ] Hover shows `...` (MoreHorizontal icon) instead of trash icon
- [ ] Click opens shadcn DropdownMenu
- [ ] Menu has "Rename" and "Delete" options with icons
- [ ] Rename: Enables inline text input for title editing
- [ ] Rename: Enter/blur saves, Escape cancels
- [ ] Delete: Removes conversation (existing functionality)
- [ ] API endpoint for updating conversation title exists

### Technical Approach

1. Install shadcn DropdownMenu component if not present
2. Replace trash icon with MoreHorizontal icon on hover
3. Wrap in DropdownMenu with DropdownMenuTrigger
4. Add DropdownMenuContent with:
   - Rename item (Pencil icon)
   - Delete item (Trash icon)
5. Add `editingConversationId` state to track which item is being renamed
6. When Rename clicked, show input field instead of title text
7. Input handlers:
   - onKeyDown: Enter → save, Escape → cancel
   - onBlur: save
8. Add `updateConversationTitle` API call
9. Set `titleManuallyEdited` flag when user renames

### Files Touched

- `apps/web/src/components/layout/Sidebar.tsx` (dropdown menu, inline rename)
- `apps/web/src/components/ui/dropdown-menu.tsx` (install if needed)
- `apps/web/src/stores/chatStore.ts` (add editingConversationId, updateTitle action)
- `apps/web/src/services/api.ts` (add updateConversationTitle endpoint)
- `packages/backend/src/interfaces/http/routes/conversationRoutes.ts` (PATCH endpoint)

### Tests Required

- Unit test: Dropdown menu renders on hover
- Unit test: Rename option enables inline editing
- Unit test: Enter key saves title
- Unit test: Escape key cancels edit
- Unit test: Blur saves title
- Unit test: Delete option triggers delete confirmation
- Integration test: API call updates title in database

---

## Parallelization Analysis

### Batch 1 (Backend Foundation)
- **Story 25.1**: TitleGenerationService (no dependencies)

### Batch 2 (Backend + Frontend Parallel)
- **Story 25.2**: Mode-aware title strategy (depends on 25.1)
- **Story 25.6**: Dropdown menu with rename/delete (frontend, no backend dependency)

### Batch 3 (Backend Features + Frontend Polish)
- **Story 25.3**: Assessment title updates (depends on 25.2)
- **Story 25.4**: Scoring filename titles (depends on 25.2)
- **Story 25.5**: Title loading placeholder UX (frontend, can run parallel)

### Execution Plan

```
Batch 1: backend-agent → 25.1
         ↓
Batch 2: backend-agent → 25.2 | frontend-agent → 25.6 (parallel)
         ↓
Batch 3: backend-agent → 25.3, 25.4 | frontend-agent → 25.5 (parallel)
```

---

## Definition of Done

- [ ] All acceptance criteria met
- [ ] Unit tests written and passing
- [ ] Integration tests for WebSocket events
- [ ] No TypeScript errors
- [ ] Code review approved
- [ ] Manual QA: Create new conversation in each mode, verify titles
