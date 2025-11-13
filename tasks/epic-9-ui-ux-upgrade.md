# Epic 9: UI/UX Upgrade - ChatGPT-Style Interface

**Version:** 1.0
**Created:** 2025-01-13
**Status:** Planning
**Priority:** High
**Estimated Duration:** 3-4 weeks (granular story approach)

---

## Overview

Transform Guardian's chat interface from a simple single-conversation UI to a modern, ChatGPT-style multi-conversation interface with sidebar, centered content, and enhanced composer.

**Design Reference:**
- Implementation Guide: `/guardian-ui-implementation-guide.md`
- Mockup: Desktop screenshots (2025-11-13)
- Icon Library: ShadCN sidebar icon (not hamburger menu)

---

## Goals

1. **Multi-Conversation Management:** Add sidebar with conversation list, new chat, and switching
2. **Modern Composer:** Multi-line textarea with auto-resize, mode selector in toolbar
3. **Message Actions:** Copy and regenerate buttons for assistant messages
4. **Centered Layout:** 768px max-width centered content column
5. **Professional Polish:** Smooth animations, proper spacing, responsive design

---

## Design Philosophy

- **Centered Focus:** Content constrained to 768px for optimal readability
- **Conversation-First:** Users can manage multiple conversations via sidebar
- **Progressive Disclosure:** Sidebar collapses to icons, actions appear on hover
- **Healthcare Professional:** Clean, trustworthy aesthetic

---

## Key Changes from Current UI

| Component | Current | New | Impact |
|-----------|---------|-----|--------|
| Layout | Full-width, single conversation | Sidebar + centered content | 🔴 Major |
| Input | Single-line `<Input>` in full width | Multi-line `<textarea>` in centered composer | 🔴 Major |
| Mode Switcher | `<select>` dropdown in header | Pillbox badge with popover in composer | 🔴 Major |
| Messages | Full-width display | Centered 768px column | 🟠 Medium |
| Message Actions | None | Copy + Regenerate buttons | 🟢 Additive |
| Navigation | Implicit (single conversation) | Explicit (sidebar with list) | 🟢 Additive |

---

## Breaking Changes Summary

**Components to Replace:**
- `MessageInput.tsx` → `Composer.tsx` (complete rewrite)
- `ModeSwitcher.tsx` → `ModeSelector.tsx` (new component in composer)
- `layout.tsx` → New three-panel layout (sidebar + main)

**Components to Refactor:**
- `ChatInterface.tsx` - Remove mode switcher, integrate sidebar
- `MessageList.tsx` - Add centered constraint
- `ChatMessage.tsx` - Add action buttons

**Components to Add (New):**
- `Sidebar.tsx` - Conversation management
- `ConversationList.tsx` - List of conversations
- `ConversationListItem.tsx` - Individual conversation item
- `Composer.tsx` - New message input component
- `MessageActions.tsx` - Copy/regenerate buttons

**Test Impact:**
- **51% of existing tests will break** (27 out of 53 tests)
- **~70-85 new tests required** for new components

**Good News:**
- ✅ WebSocket layer fully compatible (no changes needed)
- ✅ chatStore foundation compatible (needs expansion)
- ✅ Icon library (lucide-react) already correct
- ✅ Avatar design already matches

---

## Architecture Compatibility

### ✅ **Safe (No Breaking Changes)**

**WebSocket Integration:**
- `apps/web/src/lib/websocket.ts` - No changes needed
- `apps/web/src/hooks/useWebSocket.ts` - No changes needed
- Already supports multi-conversation via `conversationId` parameter

**State Management:**
- `apps/web/src/stores/chatStore.ts` - Needs expansion but foundation compatible
- New state needed: `sidebarOpen`, `conversations[]`, `activeConversationId`

**Icon Library:**
- Already using `lucide-react` - all required icons available

### ⚠️ **Requires Changes**

**Layout:**
- `apps/web/src/app/(dashboard)/layout.tsx` - Complete restructure

**Components:**
- All chat components in `apps/web/src/components/chat/` need updates

---

## Sprints & Stories

Stories are sized for **1-2 days each** with incremental testing.

---

## Sprint 1: Foundation & Layout (Week 1)

**Goal:** New layout structure with functional sidebar toggle

### Story 9.1: Create Sidebar Skeleton Component
**Estimated:** 1 day

**Tasks:**
- [ ] Create `apps/web/src/components/chat/Sidebar.tsx`
- [ ] Two states: Expanded (256px) and Minimized (48px)
- [ ] Smooth transition animation (300ms)
- [ ] Three sections: header (new chat), middle (conversation list), footer (logout)
- [ ] Install ShadCN Sheet component if needed for mobile drawer

**Acceptance Criteria:**
- [ ] Sidebar renders with correct width in both states
- [ ] Toggle button switches between expanded/minimized smoothly
- [ ] Background color matches design (gray-50)
- [ ] Responsive: Drawer on mobile, persistent on desktop

**Tests:**
- [ ] Sidebar renders expanded by default on desktop
- [ ] Sidebar toggles to minimized state
- [ ] Sidebar shows drawer on mobile
- [ ] Transition animation completes without jank

**Files Created:**
- `apps/web/src/components/chat/Sidebar.tsx`
- `apps/web/src/components/chat/__tests__/Sidebar.test.tsx`

**Dependencies:** None

---

### Story 9.2: Update Layout for Three-Panel Architecture
**Estimated:** 1 day

**Tasks:**
- [ ] Update `apps/web/src/app/(dashboard)/layout.tsx`
- [ ] Add horizontal flex layout (sidebar + main)
- [ ] Move logout button from layout header to sidebar footer
- [ ] Update header: Remove logout, keep user info
- [ ] Add menu toggle button with ShadCN sidebar icon (not hamburger)
- [ ] Wire up sidebar toggle to chatStore

**Acceptance Criteria:**
- [ ] Layout shows sidebar + main area side-by-side
- [ ] Menu button toggles sidebar state
- [ ] Logout button works from sidebar
- [ ] User info displays correctly in header
- [ ] No layout shift when sidebar toggles

**Tests:**
- [ ] Layout renders with sidebar
- [ ] Menu button toggles sidebar
- [ ] Logout button calls handleLogout
- [ ] User info displays correctly

**Files Modified:**
- `apps/web/src/app/(dashboard)/layout.tsx`

**Files Created:**
- `apps/web/src/app/(dashboard)/__tests__/layout.test.tsx`

**Dependencies:** Story 9.1

---

### Story 9.3: Expand chatStore for Sidebar State
**Estimated:** 0.5 day

**Tasks:**
- [x] Add `sidebarOpen: boolean` to chatStore
- [x] Add `sidebarMinimized: boolean` to chatStore
- [x] Add `toggleSidebar()` action
- [x] Add `setSidebarOpen(open: boolean)` action
- [x] Persist desktop minimize preference to localStorage
- [x] Load persisted state on mount

**Acceptance Criteria:**
- [x] Desktop minimize preference persists across page reloads (sidebarMinimized only)
- [x] Toggle actions update state correctly
- [x] localStorage key: `guardian-chat-store` (Zustand store name)
- [x] Mobile drawer state does NOT persist (by design - always closed on reload)

**Design Note:**
Only `sidebarMinimized` persists to localStorage. Mobile drawer state (`sidebarOpen`) is intentionally NOT persisted - mobile drawer is a transient overlay that should always start closed on page load for better UX.

**Tests:**
- [x] toggleSidebar updates state
- [x] sidebarMinimized persists to localStorage
- [x] sidebarOpen does NOT persist (by design)
- [x] State loads from localStorage on mount

**Files Modified:**
- `apps/web/src/stores/chatStore.ts`
- `apps/web/src/stores/__tests__/chatStore.test.ts`

**Dependencies:** None (can run parallel with 9.1/9.2)

---

### Story 9.4: Add Centered Content Constraint to Messages
**Estimated:** 0.5 day

**Tasks:**
- [ ] Update `MessageList.tsx` to wrap messages in centered container
- [ ] Add `max-w-3xl mx-auto px-4` to message container
- [ ] Ensure composer will also use same constraint
- [ ] Test responsive behavior (full-width on mobile with padding)

**Acceptance Criteria:**
- [ ] Messages display in centered column (768px max)
- [ ] Horizontal centering works correctly
- [ ] Padding prevents edge-touching on small screens
- [ ] Visual alignment looks balanced with sidebar

**Tests:**
- [ ] Messages container has correct max-width
- [ ] Container is centered horizontally
- [ ] Responsive padding applied

**Files Modified:**
- `apps/web/src/components/chat/MessageList.tsx`

**Dependencies:** Story 9.2

---

## Sprint 2: Composer Component (Week 1-2)

**Goal:** Replace MessageInput with new Composer component

### Story 9.5: Build Composer Component (Textarea Only)
**Estimated:** 1 day

**Tasks:**
- [ ] Create `apps/web/src/components/chat/Composer.tsx`
- [ ] Reversed layout: textarea (top), toolbar (bottom)
- [ ] Multi-line textarea with auto-resize (60px min, 200px max)
- [ ] Send button (circular, purple, right side)
- [ ] Enable send button only when text exists
- [ ] Handle Enter key to send, Shift+Enter for newline
- [ ] Centered container (max-w-3xl mx-auto px-4)
- [ ] Elevated container: border, rounded-2xl, shadow-lg

**Acceptance Criteria:**
- [ ] Textarea auto-resizes as user types
- [ ] Send button enables/disables based on text
- [ ] Enter sends message, Shift+Enter creates newline
- [ ] Composer visually matches design (centered, elevated)
- [ ] Message sending still works

**Tests:**
- [ ] Textarea auto-resizes on input
- [ ] Send button disabled when empty
- [ ] Enter key sends message
- [ ] Shift+Enter creates new line
- [ ] Message clears after send

**Files Created:**
- `apps/web/src/components/chat/Composer.tsx`
- `apps/web/src/components/chat/__tests__/Composer.test.tsx`

**Dependencies:** Story 9.4

---

### Story 9.6: Build ModeSelector Component (Pillbox Badge Dropdown)
**Estimated:** 1 day

**Tasks:**
- [ ] Create `apps/web/src/components/chat/ModeSelector.tsx`
- [ ] Pillbox badge button (blue-50 bg, blue-700 text, rounded-full)
- [ ] Shows current mode name + ChevronDown icon
- [ ] Popover dropdown appears above badge (bottom-full positioning)
- [ ] Dropdown shows both modes with descriptions
- [ ] Check icon next to selected mode
- [ ] Backdrop overlay closes dropdown on click
- [ ] Keyboard navigation (arrow keys, Enter, Escape)

**Acceptance Criteria:**
- [ ] Badge displays current mode correctly
- [ ] Clicking badge opens dropdown above it
- [ ] Selecting mode updates state and closes dropdown
- [ ] Backdrop dismisses dropdown
- [ ] Keyboard navigation works
- [ ] ChevronDown rotates 180deg when open

**Tests:**
- [ ] Badge renders with current mode
- [ ] Click opens dropdown
- [ ] Selecting mode updates state
- [ ] Backdrop closes dropdown
- [ ] Keyboard navigation works
- [ ] Check icon shows for selected mode

**Files Created:**
- `apps/web/src/components/chat/ModeSelector.tsx`
- `apps/web/src/components/chat/__tests__/ModeSelector.test.tsx`

**Dependencies:** None (can run parallel with 9.5)

---

### Story 9.7: Integrate ModeSelector into Composer Toolbar
**Estimated:** 0.5 day

**Tasks:**
- [ ] Add toolbar section to Composer (below textarea)
- [ ] Left group: File upload button (stub) + ModeSelector
- [ ] Right group: Send button (move from textarea area)
- [ ] Wire up mode switching to chatStore/useConversationMode
- [ ] Remove old ModeSwitcher from ChatInterface

**Acceptance Criteria:**
- [ ] Toolbar displays below textarea
- [ ] ModeSelector works in toolbar
- [ ] File upload button visible (no-op for now)
- [ ] Send button positioned correctly
- [ ] Mode switching still works
- [ ] Old ModeSwitcher removed from header

**Tests:**
- [ ] Toolbar renders with all elements
- [ ] ModeSelector changes mode correctly
- [ ] Send button still sends messages

**Files Modified:**
- `apps/web/src/components/chat/Composer.tsx`
- `apps/web/src/components/chat/ChatInterface.tsx`

**Files to Delete:**
- `apps/web/src/components/chat/ModeSwitcher.tsx`
- `apps/web/src/components/chat/__tests__/ModeSwitcher.test.tsx`

**Dependencies:** Story 9.5, 9.6

---

### Story 9.8: Replace MessageInput with Composer in ChatInterface
**Estimated:** 0.5 day

**Tasks:**
- [ ] Remove `<MessageInput />` from ChatInterface
- [ ] Add `<Composer />` to ChatInterface
- [ ] Wire up message sending logic
- [ ] Update tests to use Composer instead of MessageInput
- [ ] Verify WebSocket integration still works

**Acceptance Criteria:**
- [ ] Composer appears in chat interface
- [ ] Messages still send/receive correctly
- [ ] Streaming still works
- [ ] No visual regressions
- [ ] Old MessageInput not rendered

**Tests:**
- [ ] Update ChatInterface tests to find Composer
- [ ] Message sending tests still pass
- [ ] Streaming tests still pass

**Files Modified:**
- `apps/web/src/components/chat/ChatInterface.tsx`
- `apps/web/src/components/chat/__tests__/ChatInterface.test.tsx`

**Files to Delete:**
- `apps/web/src/components/chat/MessageInput.tsx`
- `apps/web/src/components/chat/__tests__/MessageInput.test.tsx`

**Dependencies:** Story 9.7

---

## Sprint 3: Conversation Management (Week 2-3)

**Goal:** Multi-conversation support with sidebar list

### Story 9.9: Expand chatStore for Conversation Management
**Estimated:** 0.5 day

**Tasks:**
- [ ] Add `conversations: Conversation[]` to chatStore
- [ ] Add `activeConversationId: string | null` to chatStore
- [ ] Add `addConversation(conversation)` action
- [ ] Add `setActiveConversation(id)` action
- [ ] Add `deleteConversation(id)` action
- [ ] Add `updateConversationTitle(id, title)` action
- [ ] Persist conversations to localStorage (or fetch from API)

**Acceptance Criteria:**
- [ ] Conversations stored in state
- [ ] Active conversation tracked
- [ ] CRUD operations work correctly
- [ ] State syncs with backend (or localStorage)

**Tests:**
- [ ] addConversation adds to list
- [ ] setActiveConversation updates active ID
- [ ] deleteConversation removes from list
- [ ] updateConversationTitle updates title

**Files Modified:**
- `apps/web/src/stores/chatStore.ts`

**Dependencies:** None

---

### Story 9.10: Build ConversationListItem Component
**Estimated:** 1 day

**Tasks:**
- [ ] Create `ConversationListItem.tsx`
- [ ] Layout: Icon (MessageSquare) + Title + Timestamp + Actions (MoreVertical)
- [ ] Three states: Default, Hover (show actions), Active (highlighted)
- [ ] Click item switches to that conversation
- [ ] Actions menu: Rename, Delete, Pin
- [ ] Timestamp formatting ("2 hours ago", "Yesterday", etc.)
- [ ] Ellipsis truncation for long titles

**Acceptance Criteria:**
- [ ] Item displays conversation info correctly
- [ ] Hover shows actions button
- [ ] Active conversation highlighted
- [ ] Click switches conversation
- [ ] Actions menu works

**Tests:**
- [ ] Renders conversation info
- [ ] Hover shows actions
- [ ] Active state applies correctly
- [ ] Click triggers onSelect callback
- [ ] Actions menu opens/closes

**Files Created:**
- `apps/web/src/components/chat/ConversationListItem.tsx`
- `apps/web/src/components/chat/__tests__/ConversationListItem.test.tsx`

**Dependencies:** Story 9.9

---

### Story 9.11: Build ConversationList Component
**Estimated:** 0.5 day

**Tasks:**
- [ ] Create `ConversationList.tsx`
- [ ] Render list of ConversationListItem components
- [ ] Scrollable container (flex-1, overflow-y-auto)
- [ ] Group by recency (Today, Yesterday, Last week, etc.)
- [ ] Empty state: "No conversations yet"
- [ ] Load conversations from chatStore

**Acceptance Criteria:**
- [ ] Conversations render in list
- [ ] Scrolling works for long lists
- [ ] Grouping by date works
- [ ] Empty state shows when no conversations
- [ ] Active conversation highlighted

**Tests:**
- [ ] Renders list of conversations
- [ ] Shows empty state when list empty
- [ ] Groups conversations by date
- [ ] Scrollable container works

**Files Created:**
- `apps/web/src/components/chat/ConversationList.tsx`
- `apps/web/src/components/chat/__tests__/ConversationList.test.tsx`

**Dependencies:** Story 9.10

---

### Story 9.12: Integrate ConversationList into Sidebar
**Estimated:** 0.5 day

**Tasks:**
- [ ] Add ConversationList to Sidebar middle section
- [ ] Add "New Chat" button to Sidebar header
- [ ] Add Logout button to Sidebar footer
- [ ] Wire up "New Chat" to create new conversation
- [ ] Wire up conversation selection to switch active conversation
- [ ] Handle minimized state (hide list, show icons only)

**Acceptance Criteria:**
- [ ] ConversationList appears in sidebar
- [ ] "New Chat" creates new conversation
- [ ] Clicking conversation switches to it
- [ ] Logout button works
- [ ] Minimized state shows icons only

**Tests:**
- [ ] Sidebar renders with conversation list
- [ ] New Chat button creates conversation
- [ ] Clicking conversation switches active conversation
- [ ] Logout button works

**Files Modified:**
- `apps/web/src/components/chat/Sidebar.tsx`

**Dependencies:** Story 9.11

---

### Story 9.13: Implement Conversation Switching Logic
**Estimated:** 1 day

**Tasks:**
- [ ] Update ChatInterface to load messages for active conversation
- [ ] Fetch message history when conversation changes
- [ ] Clear current messages when switching conversations
- [ ] Update URL with conversation ID
- [ ] Scroll to bottom of new conversation
- [ ] Show loading state during conversation load

**Acceptance Criteria:**
- [ ] Switching conversation loads correct messages
- [ ] URL updates with conversation ID
- [ ] Old conversation clears before new one loads
- [ ] Loading state shows during fetch
- [ ] Scroll position resets to bottom

**Tests:**
- [ ] Switching conversation fetches messages
- [ ] URL updates with conversation ID
- [ ] Messages clear before new conversation loads
- [ ] Loading state shows during transition

**Files Modified:**
- `apps/web/src/components/chat/ChatInterface.tsx`
- `apps/web/src/hooks/useWebSocket.ts` (if needed)

**Dependencies:** Story 9.12

---

### Story 9.14: Implement "New Chat" Functionality
**Estimated:** 0.5 day

**Tasks:**
- [ ] Wire up "New Chat" button in sidebar
- [ ] Clear current messages
- [ ] Create new conversation in chatStore (but don't save to backend yet)
- [ ] Set new conversation as active
- [ ] Focus composer textarea
- [ ] Save conversation to backend after first message sent

**Acceptance Criteria:**
- [ ] "New Chat" clears current conversation
- [ ] Focus moves to composer
- [ ] New conversation appears in list after first message
- [ ] Conversation title auto-generates from first message

**Tests:**
- [ ] New Chat button clears messages
- [ ] Focus moves to composer
- [ ] New conversation saved after first message
- [ ] Title auto-generates correctly

**Files Modified:**
- `apps/web/src/components/chat/Sidebar.tsx`
- `apps/web/src/components/chat/ChatInterface.tsx`
- `apps/web/src/stores/chatStore.ts`

**Dependencies:** Story 9.13

---

### Story 9.14a: Add Conversation Search Modal
**Estimated:** 1 day

**Tasks:**
- [ ] Create `ConversationSearchModal.tsx` component
- [ ] Add Search icon (magnifying glass) to sidebar header
- [ ] Modal opens on search icon click
- [ ] Search input: "Search chats..." placeholder
- [ ] Client-side filtering: filter conversations by title
- [ ] Group results by date: "Yesterday", "Previous 7 Days", "Previous 30 Days", "Older"
- [ ] Each result shows conversation title
- [ ] Clicking result closes modal and switches to conversation
- [ ] ESC key or backdrop click closes modal
- [ ] Keyboard navigation (arrows + Enter)
- [ ] Empty state: "No conversations found"

**Acceptance Criteria:**
- [ ] Search icon appears in sidebar header (expanded and minimized states)
- [ ] Modal opens centered with backdrop overlay
- [ ] Search input filters conversations in real-time
- [ ] Results grouped by time periods
- [ ] Clicking result switches to that conversation
- [ ] ESC/backdrop closes modal
- [ ] Keyboard navigation works (arrow keys, Enter)
- [ ] Empty state shows when no matches

**Tests:**
- [ ] Search icon renders in sidebar
- [ ] Modal opens on icon click
- [ ] Search input filters results correctly
- [ ] Results grouped by date correctly
- [ ] Clicking result switches conversation
- [ ] ESC key closes modal
- [ ] Backdrop click closes modal
- [ ] Keyboard navigation works
- [ ] Empty state renders

**Files Created:**
- `apps/web/src/components/chat/ConversationSearchModal.tsx`
- `apps/web/src/components/chat/__tests__/ConversationSearchModal.test.tsx`

**Files Modified:**
- `apps/web/src/components/chat/Sidebar.tsx` (add Search icon button, integrate modal)

**Dependencies:** Story 9.12 (requires conversation list to exist)

**Design Notes:**
- ChatGPT-style search modal (not Claude's full-page approach)
- Centered modal: max-w-2xl, rounded-lg, shadow-xl
- Search icon position:
  - Expanded: Header row (toggle, new chat, spacer, search)
  - Minimized: Icon button below toggle and new chat
- Date grouping:
  - "Yesterday" (messages from yesterday)
  - "Previous 7 Days" (last week)
  - "Previous 30 Days" (last month)
  - "Older" (everything else)

---

## Sprint 4: Message Actions & Polish (Week 3)

**Goal:** Add message actions and visual polish

### Story 9.15: Add Copy Button to ChatMessage
**Estimated:** 0.5 day

**Tasks:**
- [ ] Add Copy button below assistant messages
- [ ] Use Clipboard API to copy message text
- [ ] Show "Copied" confirmation for 2 seconds
- [ ] Button changes to Check icon during confirmation
- [ ] Toast notification (optional)

**Acceptance Criteria:**
- [ ] Copy button appears below assistant messages
- [ ] Clicking copies message to clipboard
- [ ] Confirmation shows for 2 seconds
- [ ] Button returns to Copy state after confirmation

**Tests:**
- [ ] Copy button renders
- [ ] Click copies to clipboard
- [ ] Confirmation state shows and reverts

**Files Modified:**
- `apps/web/src/components/chat/ChatMessage.tsx`

**Dependencies:** None

---

### Story 9.16: Add Regenerate Button to ChatMessage
**Estimated:** 1 day

**Tasks:**
- [ ] Add Regenerate button below assistant messages
- [ ] Clicking re-sends previous user message
- [ ] Show spinning RefreshCw icon during regeneration
- [ ] Disable button during regeneration
- [ ] New response replaces old one (or shows both with label)

**Acceptance Criteria:**
- [ ] Regenerate button appears below assistant messages
- [ ] Clicking regenerates response
- [ ] Icon spins during regeneration
- [ ] Button disables during process
- [ ] New response appears when complete

**Tests:**
- [ ] Regenerate button renders
- [ ] Click triggers regeneration
- [ ] Icon spins during process
- [ ] Button disables during regeneration
- [ ] New response replaces old one

**Files Modified:**
- `apps/web/src/components/chat/ChatMessage.tsx`
- `apps/web/src/lib/websocket.ts` (if needed for regenerate event)

**Dependencies:** Story 9.15

---

### Story 9.17: Add Scroll-to-Bottom Button
**Estimated:** 0.5 day

**Tasks:**
- [ ] Add floating button that appears when scrolled up
- [ ] Button shows when new message arrives and user scrolled up
- [ ] Clicking button scrolls smoothly to bottom
- [ ] Button hides when at bottom
- [ ] Position: Floating above message area

**Acceptance Criteria:**
- [ ] Button appears when scrolled up
- [ ] Click scrolls to bottom smoothly
- [ ] Button hides when at bottom
- [ ] Shows when new message arrives while scrolled up

**Tests:**
- [ ] Button appears when scrolled up
- [ ] Click scrolls to bottom
- [ ] Button hides when at bottom

**Files Modified:**
- `apps/web/src/components/chat/MessageList.tsx`

**Dependencies:** None

---

### Story 9.18: Add Scroll Shadows (Top/Bottom)
**Estimated:** 0.5 day

**Tasks:**
- [ ] Add top shadow when scrolled down
- [ ] Add bottom shadow when scrollable content below
- [ ] Shadows fade in/out smoothly based on scroll position
- [ ] Use CSS gradients or box-shadow

**Acceptance Criteria:**
- [ ] Top shadow appears when scrolled down
- [ ] Bottom shadow appears when content below
- [ ] Shadows fade smoothly
- [ ] No performance issues

**Tests:**
- [ ] Top shadow appears when scrolled
- [ ] Bottom shadow appears when content below
- [ ] Shadows update on scroll

**Files Modified:**
- `apps/web/src/components/chat/MessageList.tsx`

**Dependencies:** None

---

### Story 9.19: Responsive Design Testing & Fixes
**Estimated:** 1 day

**Tasks:**
- [ ] Test on mobile (320px, 375px, 414px widths)
- [ ] Test on tablet (768px, 1024px widths)
- [ ] Test on desktop (1280px, 1440px, 1920px widths)
- [ ] Fix any layout issues on small screens
- [ ] Ensure touch targets are 44x44px on mobile
- [ ] Test sidebar drawer on mobile
- [ ] Test composer on mobile (keyboard behavior)

**Acceptance Criteria:**
- [ ] Interface works on all breakpoints
- [ ] No horizontal scrolling
- [ ] Touch targets adequate on mobile
- [ ] Sidebar drawer works on mobile
- [ ] Composer handles mobile keyboard

**Tests:**
- [ ] Responsive tests for each breakpoint
- [ ] Touch target size tests
- [ ] Mobile drawer tests

**Files Modified:**
- Various components (CSS/Tailwind fixes)

**Dependencies:** All previous stories

---

### Story 9.20: Animation & Transition Polish
**Estimated:** 0.5 day

**Tasks:**
- [ ] Smooth sidebar toggle animation
- [ ] Message slide-in animation (subtle)
- [ ] Typing indicator pulse animation
- [ ] Button hover transitions
- [ ] Dropdown fade + slide animation
- [ ] Ensure all animations run at 60fps

**Acceptance Criteria:**
- [ ] All transitions smooth (150-300ms)
- [ ] No janky animations
- [ ] Animations feel professional and subtle
- [ ] 60fps performance maintained

**Tests:**
- [ ] Visual regression tests (if available)
- [ ] Performance tests (no dropped frames)

**Files Modified:**
- Various components (CSS transitions)

**Dependencies:** All previous stories

---

## Sprint 5: Testing & Refinement (Week 3-4)

**Goal:** Comprehensive testing and bug fixes

### Story 9.21: Update Existing Tests
**Estimated:** 2 days

**Tasks:**
- [ ] Update ChatInterface tests (remove ModeSwitcher, add Composer)
- [ ] Update MessageList tests (centered layout)
- [ ] Update ChatMessage tests (message actions)
- [ ] Fix any broken tests from layout changes
- [ ] Ensure coverage remains >70%

**Acceptance Criteria:**
- [ ] All existing tests updated
- [ ] Test suite passes (0 failures)
- [ ] Coverage >70% maintained
- [ ] No skipped/disabled tests

**Tests:**
- All tests in `apps/web/src/components/chat/__tests__/`

**Files Modified:**
- All test files in chat components

**Dependencies:** All component stories complete

---

### Story 9.22: Write Integration Tests
**Estimated:** 1 day

**Tasks:**
- [ ] Test full conversation flow (create → send → switch → return)
- [ ] Test sidebar toggle with conversation switching
- [ ] Test mode switching with message sending
- [ ] Test message actions (copy, regenerate)
- [ ] Test responsive behavior (mobile drawer)

**Acceptance Criteria:**
- [ ] Integration tests cover main user flows
- [ ] Tests pass consistently
- [ ] Tests catch regression bugs

**Tests:**
- New integration test suite

**Files Created:**
- `apps/web/src/components/chat/__tests__/integration/`

**Dependencies:** Story 9.21

---

### Story 9.23: Accessibility Audit & Fixes
**Estimated:** 1 day

**Tasks:**
- [ ] Keyboard navigation test (Tab, Enter, Escape, Arrows)
- [ ] Screen reader test (NVDA or JAWS)
- [ ] Color contrast verification (WCAG AA)
- [ ] Focus indicator visibility check
- [ ] ARIA label audit
- [ ] Fix any accessibility issues found

**Acceptance Criteria:**
- [ ] Full keyboard navigation works
- [ ] Screen reader announces correctly
- [ ] Color contrast passes WCAG AA (4.5:1)
- [ ] Focus indicators always visible
- [ ] All interactive elements have labels

**Tests:**
- [ ] Keyboard navigation tests
- [ ] ARIA label tests

**Files Modified:**
- Various components (accessibility fixes)

**Dependencies:** Story 9.21

---

### Story 9.24: Performance Testing & Optimization
**Estimated:** 1 day

**Tasks:**
- [ ] Test with 100+ conversations in list
- [ ] Test with 100+ messages in conversation
- [ ] Profile component re-renders (React DevTools)
- [ ] Optimize any unnecessary re-renders
- [ ] Test animation performance (60fps check)
- [ ] Test with slow network (throttling)

**Acceptance Criteria:**
- [ ] Interface remains responsive with large data sets
- [ ] Animations run at 60fps
- [ ] No memory leaks
- [ ] Efficient re-renders (memoization where needed)

**Tests:**
- [ ] Performance tests (Lighthouse or custom)

**Files Modified:**
- Various components (memoization, optimization)

**Dependencies:** Story 9.21

---

### Story 9.25: Bug Fixes & Final Polish
**Estimated:** 1 day

**Tasks:**
- [ ] Fix any bugs discovered during testing
- [ ] Address any visual inconsistencies
- [ ] Test cross-browser (Chrome, Firefox, Safari, Edge)
- [ ] Test on iOS Safari and Android Chrome
- [ ] Final design review with stakeholders
- [ ] Documentation updates

**Acceptance Criteria:**
- [ ] All bugs fixed
- [ ] Visual consistency verified
- [ ] Cross-browser compatibility confirmed
- [ ] Documentation updated

**Tests:**
- [ ] Manual testing checklist complete

**Files Modified:**
- Various (bug fixes)

**Dependencies:** All previous stories

---

## Definition of Done (Story-Level)

A story is considered **DONE** when:

- [ ] All acceptance criteria met
- [ ] Code reviewed (self-review or peer)
- [ ] All tests written and passing
- [ ] No eslint/prettier errors
- [ ] Component renders correctly in Storybook (if applicable)
- [ ] Responsive design tested (mobile, tablet, desktop)
- [ ] Accessibility basics checked (keyboard nav, focus, labels)
- [ ] Committed with clear commit message
- [ ] Documentation updated (if needed)

---

## Definition of Done (Epic-Level)

Epic 9 is considered **DONE** when:

- [ ] All 26 stories complete
- [ ] Test suite passes (0 failures)
- [ ] Coverage >70% maintained
- [ ] Manual testing checklist complete
- [ ] Accessibility audit passed
- [ ] Performance benchmarks met
- [ ] Cross-browser testing passed
- [ ] Design approved by stakeholders
- [ ] Documentation complete
- [ ] Ready for production deployment

---

## Rollback Plan

If major issues arise:

1. **Feature Flag:** Disable new UI via `NEXT_PUBLIC_NEW_UI=false`
2. **Git Revert:** Revert to commit before UI upgrade
3. **Component Backup:** Old components saved in `components/chat-legacy/`

---

## Success Metrics

**User Experience:**
- [ ] Conversation switching < 500ms
- [ ] Message send/receive latency unchanged
- [ ] Sidebar toggle animation smooth (60fps)
- [ ] Mobile drawer feels native

**Technical:**
- [ ] Test coverage maintained >70%
- [ ] No console errors or warnings
- [ ] Lighthouse score >90 (performance)
- [ ] WebSocket connection stability unchanged

**Accessibility:**
- [ ] WCAG 2.1 AA compliant
- [ ] Keyboard navigation complete
- [ ] Screen reader friendly

---

## Dependencies

**External:**
- ShadCN components (Sheet for mobile drawer)
- Lucide React icons (already installed)
- Tailwind CSS v4 (already configured)

**Internal:**
- WebSocket infrastructure (Epic 3) ✅
- Chat store (Epic 4) ✅
- Message persistence (Epic 3) ✅

---

## Risks & Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| Test breakage overwhelming | High | Granular stories, incremental testing |
| Layout shifts causing bugs | Medium | Test each story before proceeding |
| Performance issues (animations) | Low | Profile early, optimize incrementally |
| Accessibility gaps | Medium | Audit at story level, not just end |
| Timeline slippage | Medium | Buffer time in Week 4 for fixes |

---

## Notes

- **Icon Change:** Use ShadCN sidebar icon (`PanelLeft`) instead of hamburger menu (`Menu`)
- **File Upload:** Button added in Sprint 2 but functionality deferred (stub only)
- **Backend API:** May need new endpoints for conversation CRUD (or use existing)
- **Mobile Testing:** Critical - test on real devices, not just browser DevTools

---

## Document History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2025-01-13 | Initial epic breakdown - 25 stories across 5 sprints |
| 1.1 | 2025-11-13 | Added Story 9.14a: Conversation Search Modal (ChatGPT-style search) - now 26 stories |

---

**This is the single source of truth for Epic 9: UI/UX Upgrade.**

All agents working on UI/UX changes should reference this document.
