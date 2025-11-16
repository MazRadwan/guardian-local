---
name: chatbot-ux-spec
description: Complete UX specification for ChatGPT/Claude-style conversational AI interface - defines expected behavior, interactions, and visual patterns for building and testing chat UI features
version: 1.0.0
---

# ChatGPT/Claude-Style Chatbot UX Specification

## Overview

This skill defines the complete user experience specification for a conversational AI chatbot interface modeled after ChatGPT and Claude. Use this as the **single source of truth** when:
- Building new UI features
- Testing UI behavior with Playwright
- Verifying acceptance criteria
- Reporting UI/UX bugs

---

## Layout & Visual Hierarchy

### Empty State (No Messages)
```
┌────────────────────────────────────────┐
│  Header: Logo | User Menu              │
├────────────────────────────────────────┤
│                                        │
│         [Centered Content]             │
│                                        │
│       Welcome to Guardian              │
│   Start a conversation to assess...   │
│                                        │
│   ┌──────────────────────────────┐    │
│   │                              │    │
│   │  Composer (Centered)         │    │
│   │  [Mode Selector ▼] [Input]   │    │
│   │                              │    │
│   └──────────────────────────────┘    │
│                                        │
└────────────────────────────────────────┘
```

**Key Behaviors:**
- ✅ Composer centered vertically and horizontally
- ✅ Max width: 768px (3xl in Tailwind)
- ✅ Welcome message above composer
- ✅ Sidebar closed by default (mobile-first)
- ✅ No messages visible
- ✅ No skeleton loaders

### Active State (Messages Exist)
```
┌─┬──────────────────────────────────────┐
│S│  Header: Logo | Connection | User    │
│i├──────────────────────────────────────┤
│d│  ┌────────────────────────────┐      │
│e│  │ Messages (max-w-3xl)       │      │
│b│  │                            │      │
│a│  │ User: Question here        │      │
│r│  │                            │      │
│ │  │ Assistant: Response...     │      │
│ │  │ [Copy Icon]                │      │
│ │  │                            │      │
│ │  └────────────────────────────┘      │
│ │  ┌────────────────────────────┐      │
│ │  │ Composer (bottom, fixed)   │      │
│ │  │ [Mode ▼] [Input] [Send]    │      │
│ │  └────────────────────────────┘      │
└─┴──────────────────────────────────────┘
```

**Key Behaviors:**
- ✅ Composer moves to bottom (fixed position)
- ✅ Messages scroll independently
- ✅ Content max-width: 768px, centered
- ✅ Auto-scroll to bottom on new messages
- ✅ Sidebar available but closed by default

---

## Sidebar Behavior

### Desktop (≥768px)
**Minimized State (Default):**
- Width: 48px
- Background: White
- Icons only:
  - Toggle (Panel icon) - top
  - New Chat (SquarePen icon) - below toggle
  - Search (Magnifying glass icon) - for conversation search
  - User avatar - bottom

**Expanded State:**
- Width: 256px
- Background: Gray-50
- Shows:
  - Toggle + New Chat buttons (top)
  - Conversation list with titles
  - User name and logout button (bottom)

**Toggle Behavior:**
- Click toggle icon → Expand/collapse sidebar
- Smooth transition (300ms)
- State persisted in localStorage

### Mobile (<768px)
**Default State:**
- Sidebar closed (overlay hidden)
- Toggle button visible in header

**Open State:**
- Full-width overlay (covers entire screen)
- Dark backdrop (bg-black/50)
- Slide-in animation from left
- Click backdrop or X button → Close sidebar

---

## Composer Behavior

### Position States

**Empty Chat (No Messages):**
- Position: Centered vertically and horizontally
- Container: `flex items-center justify-center`
- Max width: 768px
- Padding: Generous (to feel spacious)

**Active Chat (Messages Exist):**
- Position: Fixed to bottom of viewport
- Sticky positioning: `sticky bottom-0`
- Max width: 768px (matches messages)
- Margin: Auto-centered horizontally

### Visual Design
- Background: White
- Border: None (clean interface)
- Shadow: Subtle top shadow when scrolled
- Padding: 16px (comfortable touch target)

### Input Field
- Placeholder: "Type a message..." or contextual based on mode
- Min height: 44px (single line)
- Max height: 200px (grows with content)
- Auto-resize as user types
- Border radius: rounded-full (pill shape)
- Focus state: Blue ring (ring-2 ring-blue-500)

### Send Button
- Shape: Circle (rounded-full)
- Icon: Send arrow (Lucide Send icon)
- Disabled state: Gray background, lower opacity
- Active state: Blue background, white icon
- Position: Right side of input
- Size: 40px × 40px

### Mode Selector
- Component: Dropdown using ShadCN Popover
- Trigger: Pill-shaped button with mode name + chevron
- Position: Left side of input
- Behavior: Opens ABOVE composer (floats over, doesn't push down)
- Modes: "Consult" | "Assessment"
- Visual: Blue background for active mode
- Disabled during streaming

### Interaction States

**Default:**
- Input enabled
- Send button disabled (no text)
- Mode selector enabled

**Typing:**
- Send button becomes active (blue)
- Character count optional
- Enter key submits (Shift+Enter for new line)

**Sending:**
- Input disabled
- Send button shows loading spinner
- Mode selector disabled

**Streaming Response:**
- Input disabled
- Typing indicator visible
- Mode selector disabled
- **Stop button visible** (replaces Send button)
  - Icon: Square (Lucide Square icon)
  - Color: Red background
  - Label: "Stop generating" (tooltip)
  - Click: Abort stream immediately

---

## Message Display

### Message Structure

**User Message:**
```
┌────────────────────────────────┐
│ [Avatar]  You                  │
│                                │
│ What are the key risks...     │
│                                │
│ 2:34 PM                        │
└────────────────────────────────┘
```

**Assistant Message:**
```
┌────────────────────────────────┐
│ [Avatar]  Guardian             │
│                                │
│ Based on your question...      │
│                                │
│ 2:34 PM         [Copy Icon]    │
└────────────────────────────────┘
```

### Visual Styling
- **User messages:**
  - Avatar: User initial or photo (right side)
  - Background: None or subtle blue tint
  - Alignment: Right-aligned (optional, or left like Claude)
  - Text color: Gray-900

- **Assistant messages:**
  - Avatar: App logo or "G" initial (left side)
  - Background: None or subtle gray tint
  - Alignment: Left-aligned
  - Text color: Gray-900
  - Copy button: Visible on hover or always visible on mobile

### Streaming Behavior
- Cursor blinks at end of streaming text
- Text appears token-by-token
- No "typing..." skeleton after streaming starts
- Smooth scroll to keep latest content visible

### Copy Button
- Icon: Lucide Copy icon
- Position: Bottom-right of assistant message
- States:
  - Default: Gray icon, visible on hover (desktop)
  - Hover: Darker gray
  - Clicked: Checkmark icon + "Copied!" tooltip (2s)
- Mobile: Always visible (no hover state)

---

## Conversation Management

### Conversation List (Sidebar)

**Display:**
- Sorted by: Most recent first (updatedAt)
- Title: Auto-generated from first user message (not "Conversation abc123")
- Format:
  ```
  Today
  - How to assess AI vendors for...
  - Security compliance questions

  Yesterday
  - HIPAA requirements for...

  Last 7 Days
  - ...
  ```

**Item Structure:**
```
┌──────────────────────────────┐
│ [MessageSquare Icon]         │
│ How to assess AI vendors...  │ <- Truncated title
│ 2:34 PM                      │
└──────────────────────────────┘
```

**Interaction:**
- Click → Load conversation history
- Hover → Show delete/rename options (future)
- Active conversation: Highlighted (blue background)

### Conversation Titles

**Generation Rules:**
1. **First message-based (Preferred):**
   - Use first 50-60 characters of first user message
   - Trim to last complete word
   - Example: "What are the key security risks..." (not "What are the key security risks for AI v...")

2. **Fallback (Temporary):**
   - "New Chat" immediately after creation
   - Backend updates title after first message sent

**Never:**
- ❌ "Conversation abc12345"
- ❌ "Untitled"
- ❌ Random IDs in user-visible titles

### New Chat Behavior

**Click "New Chat" Button:**
1. If active conversation has streaming response:
   - Abort stream immediately
   - Emit `abort_stream` event to backend
   - Clear streaming state

2. Clear current messages from UI
3. Request backend to create new conversation
4. Set activeConversationId to null (temporary)
5. Backend emits `conversation_created` event
6. Update activeConversationId with new ID
7. Save new conversation ID to localStorage
8. Update URL: `/chat?conversation={newId}`
9. Focus composer input
10. Composer returns to centered position (no messages)

**Critical:**
- ✅ Must NOT create infinite loop
- ✅ Only one new conversation created per click
- ✅ Previous conversation saved and appears in sidebar
- ✅ Can switch back to previous conversation

### Conversation Switching

**Click Conversation in Sidebar:**
1. If currently streaming:
   - Abort active stream
   - Ignore further chunks for old conversation

2. Clear current messages
3. Show loading skeleton (3 message placeholders)
4. Request history: `get_history` event with conversationId
5. Backend emits `conversation_history` event
6. Replace messages with loaded history
7. Update activeConversationId
8. Update localStorage
9. Update URL: `/chat?conversation={id}`
10. Scroll to bottom
11. Focus composer

**Mid-Stream Switching:**
- Streaming response in Conversation A
- User clicks Conversation B
- **Expected:**
  - Stream stops immediately
  - Conversation B loads
  - Streaming chunks for A are ignored (not appended to B)
  - No error messages
  - Clean transition

**Validation:**
- Backend validates conversation ownership
- 404 if conversation doesn't exist
- 403 if conversation belongs to different user
- Error displayed in UI banner

---

## Persistence & State Management

### LocalStorage
**Stored:**
- `guardian_conversation_id` - Active conversation ID
- `guardian-chat-store` - Zustand persisted state:
  - `sidebarMinimized` - Boolean
  - `activeConversationId` - String | null

**NOT Stored:**
- `conversations` - Always fetched from backend (security)
- `messages` - Always fetched from backend (prevents stale data)
- User auth token (stored separately)

### Session Persistence

**Page Reload (F5):**
1. Read `guardian_conversation_id` from localStorage
2. Reconnect WebSocket with conversationId
3. Backend emits `connected` event with `resumed: true`
4. Frontend requests history for saved conversation
5. Backend emits `conversation_history`
6. Fetch conversations list: `get_conversations`
7. Backend emits `conversations_list`
8. UI displays:
   - Loaded message history
   - Populated sidebar
   - Active conversation highlighted

**Expected Result:**
- ✅ Chat history visible
- ✅ Sidebar shows all conversations
- ✅ Active conversation highlighted
- ✅ No data loss
- ✅ Ready to continue chatting

**Logout:**
1. Clear auth token
2. Clear `guardian_conversation_id`
3. Clear chat store (messages, conversations, activeConversationId)
4. Disconnect WebSocket
5. Redirect to login page

**Login (Returning User):**
1. Authenticate
2. Connect WebSocket
3. Fetch conversations: `get_conversations`
4. Display sidebar with user's conversations
5. No active conversation (empty state)
6. Sidebar closed by default
7. Composer centered

---

## Responsive Design

### Breakpoints
- Mobile: < 768px
- Desktop: ≥ 768px

### Mobile Adaptations

**Sidebar:**
- Default: Closed (hidden)
- Open: Full-screen overlay with backdrop
- Close: Click backdrop or X button
- No minimized state (either open or closed)

**Composer:**
- Empty state: Still centered but with less padding
- Active state: Fixed to bottom
- Input: Full width minus padding
- Mode selector: Potentially stacked above input (optional)

**Messages:**
- Full width with padding
- Copy button: Always visible (no hover)
- Font size: Slightly smaller (14px vs 16px)

### Touch Interactions
- Tap targets: Minimum 44×44px
- Swipe left on conversation → Show delete (future)
- Pull to refresh: Disabled (causes confusion)

---

## Loading States

### Skeleton Loaders

**Conversation History Loading:**
```
┌────────────────────────────┐
│ ▭▭▭▭▭▭▭▭▭▭▭▭▭▭            │
│   ▭▭▭▭▭▭▭▭▭▭▭▭▭▭▭▭        │
│                            │
│     ▭▭▭▭▭▭▭▭▭▭            │
│     ▭▭▭▭▭▭▭▭▭▭▭▭▭▭        │
│                            │
│ ▭▭▭▭▭▭▭▭▭▭▭▭▭▭            │
└────────────────────────────┘
```

**Typing Indicator (Before Streaming Starts):**
```
┌────────────────────────────┐
│ [Avatar]  Guardian         │
│                            │
│ ● ● ●  (animated dots)     │
└────────────────────────────┘
```

**Streaming Indicator:**
- No skeleton, actual text appears
- Blinking cursor at end: ▋

### Connection Status
- Position: Header (top-right)
- States:
  - Connected: Green dot + "Connected" (text optional)
  - Connecting: Yellow dot + "Connecting..."
  - Disconnected: Red dot + "Disconnected" + Retry button
  - Error: Red dot + Error message

---

## Error Handling

### Error Banner
- Position: Top of screen, below header
- Background: Red-50
- Icon: AlertCircle (Lucide)
- Message: Clear, user-friendly error text
- Dismiss: X button (top-right of banner)
- Auto-dismiss: Optional after 5 seconds (not for critical errors)

### Error Scenarios

**Message Send Failure:**
```
Error: Failed to send message. Please try again.
[Retry Button] [Dismiss]
```

**Conversation Load Failure:**
```
Error: Failed to load conversation. Please refresh.
[Refresh Button] [Dismiss]
```

**Authentication Error:**
```
Error: Session expired. Please log in again.
[Log In Button]
```

**WebSocket Disconnection:**
```
Warning: Connection lost. Attempting to reconnect...
[Reconnect Now Button] [Dismiss]
```

---

## Keyboard Shortcuts

### Composer
- `Enter` → Send message
- `Shift + Enter` → New line
- `Cmd/Ctrl + K` → Focus composer (from anywhere)
- `Esc` → Blur composer

### Navigation
- `Cmd/Ctrl + B` → Toggle sidebar
- `Cmd/Ctrl + N` → New chat
- `Cmd/Ctrl + F` → Search conversations (future)

### Messages
- `Cmd/Ctrl + C` → Copy selected message (when message focused)

---

## Accessibility (A11y)

### ARIA Labels
- Composer input: `aria-label="Type a message"`
- Send button: `aria-label="Send message"` (disabled: "Send message (disabled)")
- Mode selector: `aria-label="Select conversation mode"`
- Sidebar toggle: `aria-label="Toggle sidebar"`
- New chat button: `aria-label="Start new conversation"`
- Copy button: `aria-label="Copy message"`

### Keyboard Navigation
- All interactive elements: Focusable with `Tab`
- Visible focus indicators: Blue ring
- Sidebar: Focus trap when open (modal)
- Messages: Not focusable (static content)

### Screen Reader
- Announce new messages: `aria-live="polite"` region
- Announce errors: `aria-live="assertive"`
- Loading states: `aria-busy="true"`

---

## Animation & Transitions

### Sidebar
- Transition: `transform 300ms ease-in-out`
- Mobile overlay backdrop: `opacity 200ms ease-in-out`

### Composer
- Mode selector dropdown: `opacity 150ms, transform 150ms`
- Send button state: `background-color 200ms`

### Messages
- New message: Fade in (`opacity 200ms`)
- Streaming text: No animation (appears instantly)

### Scroll
- Auto-scroll: Smooth scroll to bottom (`behavior: 'smooth'`)
- Manual scroll: Instant (user-controlled)

---

## Testing Checklist

### Visual Regression
- [ ] Empty state: Composer centered
- [ ] Active state: Composer at bottom
- [ ] Sidebar: Minimized width = 48px
- [ ] Sidebar: Expanded width = 256px
- [ ] Mobile: Sidebar full-width overlay
- [ ] Messages: Max-width 768px, centered
- [ ] Mode selector: Opens above composer

### Functional Tests
- [ ] Send message → Appears in chat
- [ ] Receive response → Appears with copy button
- [ ] Copy button → Copies message to clipboard
- [ ] New chat → Creates new conversation
- [ ] Switch conversation → Loads correct history
- [ ] Reload page → Restores conversation
- [ ] Logout → Clears all data
- [ ] Login → Shows conversation list

### Edge Cases
- [ ] Switch conversation mid-stream → Stream stops
- [ ] New chat mid-stream → Stream aborted
- [ ] Rapid conversation switching → No race conditions
- [ ] Empty conversation list → "No conversations yet"
- [ ] Long message → Text wraps correctly
- [ ] Long conversation title → Truncates with ellipsis
- [ ] Network error → Shows error banner
- [ ] WebSocket disconnect → Attempts reconnect

### Performance
- [ ] 100+ messages → Smooth scrolling
- [ ] Streaming → No janky text rendering
- [ ] Sidebar toggle → Smooth animation
- [ ] Conversation load → < 500ms

---

## Common Bugs & Anti-Patterns

### ❌ Anti-Patterns to Avoid

**Conversation Management:**
- Infinite loops creating new conversations
- Streaming chunks bleeding across conversations
- Showing other users' conversations (security)
- Losing messages on page reload
- Duplicate conversations created

**UI/UX:**
- Composer jumps position unexpectedly
- Sidebar pushes content when opening
- Mode selector pushes composer down
- Copy button only works on desktop
- Titles show conversation IDs
- Chat history disappears on reload

**State Management:**
- Persisting conversations in localStorage (security risk)
- Not validating conversation ownership
- Stale conversation data
- Race conditions in effects
- Memory leaks from uncleared listeners

---

## Reference Implementations

**ChatGPT:**
- Sidebar: Always visible (desktop), overlay (mobile)
- Composer: Centered → Bottom transition
- Titles: Generated from first message
- Copy: Icon appears on hover
- Search: Magnifying glass icon opens modal

**Claude:**
- Sidebar: Collapsible with Projects tab
- Composer: Always centered (different approach)
- Titles: Auto-generated, editable
- Copy: Always visible icon
- Artifacts: Right panel (unique to Claude)

**Guardian (Our Implementation):**
- Hybrid: Best of both
- Mobile-first: Sidebar closed by default
- Clean: No borders, minimal chrome
- Centered → Bottom: Like ChatGPT
- Titles: Auto-generated from content
- Copy: Visible on hover (desktop), always (mobile)

---

## Version History

**v1.0.0 (2025-11-15):**
- Initial specification
- Complete UX patterns documented
- Testing checklist included
- Anti-patterns documented
