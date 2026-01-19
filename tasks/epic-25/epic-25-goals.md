# Epic 25: Chat Title Intelligence

## Overview

Improve chat history sidebar titles to be meaningful and context-aware instead of using the first user message verbatim. The current approach fails for Assessment mode (user types "1") and Scoring mode (user uploads a file).

## Problem Statement

### Sprint 1 Issues (Resolved)
Current title generation uses the first user message, which results in:
- **Assessment mode**: Titles like "1" or "2" (user's assessment type selection)
- **Scoring mode**: No meaningful title (file upload has no text)
- **Consult mode**: Sometimes works, but single-word queries produce poor titles

### Sprint 2 Issues (New)
Post-Sprint 1 testing revealed UX refinements needed:
- **Font too large**: Chat history titles are larger than ChatGPT's, causing excessive truncation
- **Icon wastes space**: Chat bubble icon next to each title consumes ~24px of horizontal space
- **Scoring title bug**: In scoring mode, LLM sends "[Upload file for analysis]" message BEFORE user uploads file. Title generation captures this prompt message instead of waiting for filename, resulting in titles like "[Uploaded file fo..." instead of "Scoring: vendor.pdf"

## Goals

1. Generate meaningful, scannable titles for all conversation modes
2. Use context-aware titling based on mode and available metadata
3. Support dynamic title updates as more context becomes available
4. Keep title generation non-blocking (async/background)

## Research-Backed Approach

### Strategy by Mode

| Mode | Title Strategy | Example |
|------|----------------|---------|
| **Consult** | LLM-generated from first Q&A exchange | "AI Governance Compliance Questions" |
| **Assessment** | Use vendor/solution name when provided | "Assessment: Acme AI Platform" |
| **Scoring** | Use uploaded filename or extracted vendor | "Scoring: acme-questionnaire.pdf" |

### LLM Title Generation (for Consult mode)

Use Claude to generate concise titles after the first meaningful exchange:

```
Generate a concise 3-6 word title for this conversation.
Be specific and descriptive. Do not use quotes.

User: [first user message]
Assistant: [first assistant response]

Title:
```

### Delayed/Dynamic Titling

- Don't generate title immediately on first message if context is insufficient
- Wait for meaningful context (e.g., vendor name in assessment flow)
- Update title dynamically when key information becomes available
- Use placeholder like "New Chat" or "New Assessment" until ready

### Key UX Principles

1. **Async generation** - Don't block user while generating title
2. **Specificity** - Capture the essence of the discussion
3. **Brevity** - 3-6 words, scannable in sidebar
4. **Context-aware** - Include mode, vendor name, or topic as appropriate

## User Stories

| Story | Description | Priority | Sprint |
|-------|-------------|----------|--------|
| 25.1 | Add title generation service with Claude API call | High | 1 |
| 25.2 | Implement mode-aware title strategy (consult/assessment/scoring) | High | 1 |
| 25.3 | Update title when vendor name is provided in assessment | Medium | 1 |
| 25.4 | Use filename for scoring mode titles | Medium | 1 |
| 25.5 | Add "Generating title..." placeholder UX | Low | 1 |
| 25.6 | Add dropdown menu with rename/delete options (replace trash icon) | High | 1 |
| 25.7 | Reduce chat history item font size for better density | High | 2 |
| 25.8 | Remove chat icon from sidebar history items | High | 2 |
| 25.9 | Fix scoring title to skip LLM prompt message | High | 2 |

### Story 25.6: Chat History Dropdown Menu

**Description:** Replace the trash icon on chat history items with an ellipsis (`...`) button that opens a dropdown menu with Rename and Delete options. This follows the standard pattern used by ChatGPT and Claude.

**UI Behavior:**
- On hover: Show `...` (ellipsis/MoreHorizontal icon) instead of trash icon
- On click: Open shadcn `DropdownMenu` with options:
  - **Rename** - Enables inline editing of the title
  - **Delete** - Removes the conversation (existing functionality)

**Rename Flow:**
1. User clicks "Rename" from dropdown
2. Title text becomes an editable input field (inline)
3. User types new title
4. On Enter or blur: Save new title, exit edit mode
5. On Escape: Cancel edit, revert to original title

**Technical Approach:**
- Use shadcn `DropdownMenu` component
- Add `isEditing` state per conversation item
- Call existing `updateConversationTitle` API endpoint (or add if missing)
- Emit WebSocket event on title change for multi-tab sync

## Technical Considerations

### Backend
- Create `TitleGenerationService` that calls Claude with minimal prompt
- Use fast model (Haiku) for title generation to minimize latency/cost
- Store generated title in conversation record
- Emit WebSocket event when title is updated

### Frontend
- Listen for `conversation_title_updated` WebSocket event
- Update sidebar in real-time when title changes
- Show subtle loading indicator while title generates

### Title Generation Triggers
1. **Consult**: After first assistant response completes
2. **Assessment**: When vendor_name or solution_name is captured (from assessment context)
3. **Scoring**: When file is uploaded (use filename) or when vendor extracted from document

### Data Available for Titling

| Mode | Available Context |
|------|-------------------|
| Consult | User message + Assistant response |
| Assessment | vendor_name, solution_name, assessment_type, categories |
| Scoring | filename, extracted vendor name, assessment linkage |

## Acceptance Criteria

### Sprint 1 (Complete)
- [x] Consult mode: Title reflects conversation topic (not "hi" or "help")
- [x] Assessment mode: Title includes vendor/solution name when available
- [x] Scoring mode: Title includes filename or vendor name
- [x] Titles update dynamically as context becomes available
- [x] Title generation does not block user interaction
- [x] Sidebar updates in real-time when title changes
- [x] Chat history items show `...` on hover (not trash icon)
- [x] Dropdown menu opens with Rename and Delete options
- [x] User can rename conversation title inline
- [x] Rename saves on Enter/blur, cancels on Escape

### Sprint 2 (Refinements)
- [ ] Chat history items use smaller font for better title visibility
- [ ] Chat icon removed from history items to maximize title space
- [ ] Scoring mode: Title waits for file upload, ignores LLM prompt message

## Files Likely Touched

### Backend
- `packages/backend/src/application/services/TitleGenerationService.ts` (NEW)
- `packages/backend/src/infrastructure/websocket/ChatServer.ts` (emit title updates)
- `packages/backend/src/application/services/ConversationService.ts` (update title)

### Frontend
- `apps/web/src/hooks/useWebSocketEvents.ts` (handle title_updated event)
- `apps/web/src/stores/chatStore.ts` (update conversation title in state)
- `apps/web/src/components/layout/Sidebar.tsx` (dropdown menu, inline rename, display updated titles)
- `apps/web/src/components/ui/dropdown-menu.tsx` (shadcn component - may need to install)

## Dependencies

- Claude API access for LLM-based title generation
- Existing conversation and assessment services

## Notes

- Consider caching/debouncing to avoid excessive API calls
- Title should not exceed ~50 characters for sidebar display
- Story 25.6 enables manual title editing via dropdown menu
