# Guardian UI Redesign - Complete Implementation Guide

**Version:** 1.0  
**Date:** November 12, 2025  
**Status:** Ready for Implementation  
**Target:** Development team implementing the new Guardian interface

---

## Document Purpose

This document provides a complete, granular guide for implementing the Guardian UI redesign. It focuses on explaining layouts, user experience behaviors, component interactions, and design patterns rather than providing code. Use this as the authoritative reference for understanding HOW the new interface should work and behave.

---

## Table of Contents

1. [Design Philosophy](#design-philosophy)
2. [Layout Architecture](#layout-architecture)
3. [Icon Library & Visual Elements](#icon-library--visual-elements)
4. [Component Specifications](#component-specifications)
5. [User Experience Behaviors](#user-experience-behaviors)
6. [Interaction Patterns](#interaction-patterns)
7. [Visual Design Specifications](#visual-design-specifications)
8. [Responsive Behavior](#responsive-behavior)
9. [State Management Requirements](#state-management-requirements)
10. [Accessibility Requirements](#accessibility-requirements)
11. [Implementation Priorities](#implementation-priorities)

---

## Design Philosophy

### Core Principles

**1. Centered Focus**
The new Guardian interface adopts a centered content layout pattern, similar to ChatGPT and other modern AI chat interfaces. This creates visual hierarchy and improves readability by constraining content width to optimal reading dimensions (768px maximum width). All chat messages and the composer align to this centered column, creating a unified focal point.

**2. Progressive Disclosure**
Information and controls appear when needed. The sidebar can collapse to icons-only. Message actions appear on hover. The mode selector expands to show options only when clicked. This reduces visual clutter while keeping functionality accessible.

**3. Conversation-First Design**
Unlike the current single-conversation interface, the new design treats conversations as first-class entities. Users can browse, switch between, and manage multiple conversations through a dedicated sidebar, making Guardian suitable for ongoing work across multiple assessments or consultations.

**4. Professional Healthcare Aesthetic**
Maintain Guardian's professional appearance with clean typography, subtle colors, and appropriate spacing. The purple brand color for Guardian and blue for users creates clear visual distinction while remaining professional for healthcare contexts.

---

## Layout Architecture

### Overall Page Structure

The application uses a three-panel layout architecture:

**Left Panel: Sidebar (256px or 48px)**
The sidebar occupies the full height of the viewport and contains conversation management. It has two distinct states:
- **Expanded state**: 256px wide, shows full conversation list with titles and timestamps
- **Minimized state**: 48px wide, shows only icon representations

The sidebar has a light gray background (gray-50) to visually separate it from the main content area. It includes three vertical sections:
- **Top section**: Contains the "New Chat" button with border separator below
- **Middle section**: Scrollable conversation list that grows to fill available space
- **Bottom section**: Contains logout button with border separator above

**Center Panel: Main Chat Area**
This is the primary content area that takes up all remaining horizontal space. It's divided into three vertical sections:
- **Header bar**: Fixed at top, contains menu toggle, Guardian branding, connection status, and user information
- **Message area**: Scrollable middle section containing all chat messages, with centered content column
- **Composer**: Fixed at bottom, contains the message input and controls

**No Right Panel**
Unlike some chat interfaces, Guardian has no right sidebar. This keeps focus on the conversation and avoids overwhelming users with too many UI zones.

### Centered Content Pattern

Both the message area and composer use identical centering:
- Maximum width: 768px (tailwind's max-w-3xl)
- Horizontal centering: Auto margins on left and right
- Responsive padding: 16px (px-4) on left and right to prevent edge touching on smaller screens

This creates a visual "column" down the center of the main chat area. When the sidebar is open, this column appears slightly right of absolute center (accounting for sidebar width), which is intentional and creates better visual balance.

### Vertical Space Distribution

The header and composer have fixed heights determined by their content, while the message area uses flexbox to claim all remaining vertical space:
- Header: Auto height based on padding and content (approximately 72px)
- Message area: flex-1 (grows to fill available space)
- Composer: Auto height based on content and textarea size

---

## Icon Library & Visual Elements

### Icon System: Lucide React

Guardian uses lucide-react as its icon library throughout the interface. This library provides:
- Consistent stroke-based design language
- Clean, modern aesthetic appropriate for professional healthcare applications
- 24px default size that scales cleanly
- Minimal file size impact due to tree-shaking

### Icon Inventory & Usage

**Navigation & Structure Icons:**

**Menu (20px)** - Hamburger menu icon for toggling sidebar
- Location: Header, left side
- Behavior: Rotates or animates when clicked
- Color: Gray-700, changes on hover

**Plus (18px in buttons, 20px in minimized sidebar)** - Create new conversation
- Locations: Sidebar "New Chat" button, minimized sidebar
- Behavior: No animation, instant feedback
- Color: Inherits from button styling

**MessageSquare (16px in conversation list, 20px in minimized sidebar)** - Represents conversations
- Locations: Conversation list items, minimized sidebar navigation
- Behavior: Static icon
- Color: Gray-500

**MoreVertical (16px)** - Additional actions menu
- Location: Conversation list items, appears on hover
- Behavior: Opacity transition from 0 to 100
- Color: Gray-400

**LogOut (18px in expanded sidebar, 20px in minimized)** - Logout action
- Location: Bottom of sidebar in both states
- Behavior: No icon change, opens confirmation if needed
- Color: Gray-700

**Avatar Icons:**

**User (18px)** - Represents the user in messages
- Location: Message avatars for user messages
- Container: Circular blue background (bg-blue-600), 32x32px
- Color: White icon on colored background
- Behavior: Static, no interactions

**Bot (18px)** - Represents Guardian AI in messages
- Location: Message avatars for assistant messages
- Container: Circular purple background (bg-purple-600), 32x32px
- Color: White icon on colored background
- Behavior: Static, no interactions

**Message Action Icons:**

**Copy (14px)** - Copy message to clipboard
- Location: Message actions bar below assistant messages
- Behavior: Changes to Check icon with "Copied" text for 2 seconds after click
- Color: Gray-600 text, gray-100 background on hover

**Check (14px)** - Confirmation state
- Location: Replaces Copy icon temporarily, also in mode selector dropdown
- Behavior: Appears for 2 seconds then reverts to Copy
- Color: Blue-600 when indicating selection, gray-600 for copy confirmation

**RefreshCw (14px)** - Regenerate response
- Location: Message actions bar below assistant messages
- Behavior: Rotates animation when processing regeneration
- Color: Gray-600 text, gray-100 background on hover

**Composer Icons:**

**Paperclip (18px)** - Attach files
- Location: Composer toolbar, left side
- Behavior: Opens file picker on click
- Color: Gray-500, gray-100 background on hover

**ChevronDown (14px)** - Dropdown indicator
- Location: Mode selector pillbox badge
- Behavior: Rotates 180 degrees when dropdown is open
- Color: Inherits from blue-700 text color

**Send (16px)** - Submit message
- Location: Composer toolbar, right side in circular button
- Behavior: Button disabled when no message text
- Color: White when enabled (purple background), gray-400 when disabled

### Avatar Design Pattern

User and AI avatars follow a consistent pattern:
- **Size**: 32x32 pixels (w-8 h-8)
- **Shape**: Perfect circle (rounded-full)
- **Icon size**: 18px icon centered within circle
- **Colors**: Blue-600 for user, purple-600 for Guardian
- **Positioning**: Flexbox alignment, flex-shrink-0 to prevent compression

This creates clear visual distinction between user and AI messages while maintaining a professional appearance. The icons (User and Bot from lucide-react) are more abstract and professional than photo avatars or initials.

---

## Component Specifications

### Sidebar Component

**Two-State Design**

The sidebar operates in two distinct visual states with smooth transitions between them:

**Expanded State (256px width):**
The expanded sidebar shows complete conversation management interface with three sections:

*Top Section (Header):*
- Contains "New Chat" button
- Button spans full width minus padding
- Has white background with gray border
- Includes Plus icon and "New chat" text
- Bottom border separator

*Middle Section (Conversation List):*
- Scrollable area that grows to fill space (flex-1)
- Contains list of conversation items
- Light padding around list (8px)
- Conversations grouped by recency
- Active conversation highlighted

*Bottom Section (Footer):*
- Contains logout button
- Full width minus padding
- Top border separator
- Shows LogOut icon and "Logout" text
- Hover state with gray background

**Minimized State (48px width):**
The minimized sidebar shows only icon representations:

*Top Actions:*
- Vertically stacked icon buttons
- 40px (p-2.5) square touch targets
- Plus icon for new chat
- MessageSquare icon for conversations
- 8px gap between buttons

*Spacer:*
- flex-1 empty div pushes logout to bottom

*Bottom Action:*
- Single logout icon button
- 40px square touch target
- Consistent with top action styling

**Transition Behavior:**
When toggling between states:
- Width animates smoothly over 300ms
- No content jumping or shifting
- Icons remain visible during transition
- Text fades out/in appropriately
- Maintains consistent background color

### Conversation List Items

Each conversation in the list follows a structured layout:

**Visual Structure:**
The item is a horizontal flex container with three zones:
1. **Icon zone (left)**: MessageSquare icon, gray color, fixed width
2. **Content zone (middle)**: Title and timestamp, flexible width, can truncate
3. **Action zone (right)**: MoreVertical icon, initially invisible, fixed width

**Content Display:**
- **Title**: Single line with ellipsis truncation if too long, medium font weight, dark gray color
- **Timestamp**: Second line below title, smaller text (12px), light gray color, examples like "2 hours ago", "Yesterday", "Last week"

**Interaction States:**

*Default State:*
- Light gray background if not active
- No visible actions button
- Cursor pointer on hover

*Hover State:*
- Slightly darker gray background
- Actions button fades in (opacity 0 to 100)
- Smooth transition over 150ms

*Active State:*
- Darker gray background (gray-200)
- Always visible even without hover
- Indicates current conversation

*Pressed State:*
- Brief visual feedback on click
- Immediate navigation to conversation

**Click Behavior:**
- Clicking anywhere on item (except actions button) switches to that conversation
- Actions button click is prevented from bubbling (stops propagation)
- Actions button opens context menu with rename, delete, pin options

### Header Component

**Layout Structure:**
The header spans full width and contains a horizontal flex container with space-between justification:

**Left Group:**
Three elements in a horizontal row:
1. **Menu Toggle Button**: Circular button with Menu icon, activates sidebar toggle
2. **Guardian Logo/Title**: "Guardian" text in large, semibold font
3. **Connection Status**: Indicator dot (green/yellow/red) with text label

These elements have consistent gap spacing (16px) and vertical center alignment.

**Right Group:**
User information display:
- **User Name**: Display name from authentication
- **User Role**: In parentheses, lighter color, indicates role like "analyst", "admin"

**Visual Styling:**
- White background
- Bottom border (gray-200)
- Padding: 24px horizontal, 16px vertical
- Fixed at top (does not scroll with messages)

**Connection Status Indicator:**
Three possible states with different visual indicators:
- **Connected**: Green dot (2px circle), "Connected" text
- **Connecting**: Yellow dot with pulse animation, "Connecting..." text
- **Disconnected**: Red dot, "Disconnected" text, may show reconnect button

### Message Display

**Message Container:**
Each message is wrapped in a container with bottom margin (32px) for spacing. Messages use a flex layout with avatar on left and content on right.

**Message Structure:**

*Avatar Column (left):*
- Fixed 32px circular avatar
- Contains User or Bot icon
- Colored background (blue for user, purple for Guardian)
- Does not compress (flex-shrink-0)
- Positioned at top of message (flex-start alignment)

*Content Column (right):*
- Flexible width, grows to fill space
- Contains three sub-sections vertically stacked

**Content Sub-sections:**

*Header Row:*
- Name ("You" or "Guardian") in medium font weight, dark gray
- Timestamp in small font (12px), light gray
- Horizontal layout with gap

*Message Text:*
- Body text in regular weight, dark gray
- Pre-wrap white-space to preserve formatting
- Supports multi-line content
- Markdown rendering if applicable
- No maximum height (can scroll container)

*Action Bar (Assistant messages only):*
- Appears below message text
- Horizontal row of action buttons
- 12px gap between buttons
- Each button shows icon and label

**Action Buttons:**

*Copy Button:*
- Shows Copy icon and "Copy" text
- On click: Copies message text to clipboard
- Changes to Check icon and "Copied" text for 2 seconds
- Returns to Copy state automatically

*Regenerate Button:*
- Shows RefreshCw icon and "Regenerate" text
- On click: Requests new response generation
- Icon spins while processing
- Disabled during regeneration

**Visual Feedback:**
- Buttons have rounded corners (6px)
- Light gray background appears on hover
- Smooth transitions for all state changes
- Small padding (12px horizontal, 6px vertical)

### Composer Component

**Reversed Layout Pattern**

The composer uses a top-to-bottom layout order:
1. **Message Input Area** (top)
2. **Toolbar with Controls** (bottom)

This matches modern chat interfaces like ChatGPT where you type first, then see controls below your text.

**Visual Container:**
The entire composer is wrapped in a elevated container:
- White background
- Border around all sides (gray-200)
- Rounded corners (16px)
- Drop shadow for elevation (shadow-lg)
- Maximum width 768px, horizontally centered
- Padding around outer edges

**Message Input Area (Top Section):**

The textarea occupies the top portion of the composer:

*Visual Properties:*
- No visible border (integrated into container)
- Padding: 16px on all sides (top, right, bottom, left)
- Placeholder text: "Type a message..." in gray-400
- Minimum height: 60px (accommodates single line plus padding)
- Maximum height: 200px (approximately 6-7 lines)
- Auto-resizing behavior based on content

*Interaction Behavior:*
- Focus state: No visible border change (integrated design)
- Text input: Textarea expands vertically as user types
- Enter key: Sends message (unless Shift is held)
- Shift+Enter: Creates new line in message
- Resize stops at max height, then scrolls internally
- Font size matches message display (16px)

**Toolbar Section (Bottom):**

The toolbar is a horizontal flex container with space-between justification:

*Left Controls Group:*
Contains two elements with small gap:

1. **File Upload Button:**
   - Paperclip icon only (no text)
   - 36px square target area
   - Rounded corners (8px)
   - Gray icon (gray-500)
   - Light gray background on hover
   - Opens file picker on click

2. **Mode Selector Badge:**
   - Pillbox/badge style button
   - Rounded-full (perfect pill shape)
   - Light blue background (blue-50)
   - Blue text (blue-700)
   - Shows current mode name ("Consult" or "Assessment")
   - ChevronDown icon on right
   - Padding: 12px horizontal, 6px vertical

*Right Control:*
Single send button:

**Send Button:**
- Circular shape (rounded-lg with equal width/height)
- 32px diameter
- Contains Send icon (up arrow)
- Two states:
  - **Enabled**: Purple background (purple-600), white icon, clickable
  - **Disabled**: Gray background (gray-200), gray icon, cursor-not-allowed
- Enabled only when message text is not empty
- Hover effect: Darker purple (purple-700)

**Mode Selector Dropdown:**

When the mode selector badge is clicked, a popover menu appears:

*Popover Positioning:*
- Appears above the badge (bottom-full positioning)
- Aligned to left edge of badge
- 8px gap between badge and popover
- White background
- Rounded corners (12px)
- Drop shadow (shadow-xl)
- Border (gray-200)

*Backdrop Behavior:*
- Invisible overlay covers entire screen
- Clicking backdrop closes dropdown
- Prevents interaction with content behind

*Dropdown Content:*
The dropdown contains:

**Header Section:**
- "Mode" label in small, uppercase text
- Gray-500 color
- Letter-spacing for readability

**Mode Options:**
Each mode is a button with:

*Layout:*
- Full width of dropdown (256px)
- Horizontal layout with text on left, checkmark on right
- Padding: 12px horizontal, 10px vertical
- Rounded corners (8px)

*Content:*
- **Mode name**: Medium font weight, dark gray, 14px
- **Description**: Smaller text (12px), light gray, below name
- **Check icon**: Appears only for selected mode, blue-600 color

*States:*
- **Unselected**: White background, hover shows gray-50
- **Selected**: Gray-100 background, Check icon visible
- **Hover**: Slightly darker background, smooth transition

*Interaction:*
- Clicking any mode option selects that mode
- Dropdown closes immediately after selection
- Badge updates to show new mode name
- No confirmation required

---

## User Experience Behaviors

### Sidebar Interactions

**Opening and Closing:**

The sidebar toggle follows this behavior pattern:

*Initial State:*
- On desktop (>1024px), sidebar starts open by default
- On tablet/mobile, sidebar starts minimized
- State persists across page navigations (saved to local storage)

*Toggle Trigger:*
- Clicking Menu button in header toggles state
- Keyboard shortcut: Cmd/Ctrl + B toggles sidebar
- No other triggers affect sidebar state

*Transition Animation:*
- Width changes smoothly over 300ms
- Content fades appropriately during transition
- No layout shift in main chat area
- Smooth, organic feeling (ease-in-out timing)

*Visual Feedback:*
- Menu icon may rotate or animate during toggle
- Sidebar shadow may appear during transition
- No loading states or spinners needed

**Conversation Navigation:**

When user clicks a conversation in the list:

*Immediate Feedback:*
- Clicked item gets active state styling instantly
- Previous active item loses active state
- No loading spinner in list item

*Content Loading:*
- Message area may show loading state briefly
- Previous conversation clears immediately
- New messages fade in when loaded
- Scroll position resets to bottom of new conversation

*URL Update:*
- Browser URL updates to include conversation ID
- Back button returns to previous conversation
- Shareable URLs work correctly

**Creating New Conversations:**

When user clicks "New Chat" button:

*Immediate Action:*
- Current conversation deselects (loses active state)
- Message area clears instantly
- Composer remains ready for input
- Focus moves to composer textarea

*List Update:*
- New conversation does not appear in list until first message sent
- No empty placeholder conversations
- Clean slate experience

*First Message:*
- When user sends first message, conversation appears in list
- Title auto-generates from first user message
- Conversation becomes active in list
- URL updates with new conversation ID

### Message Interactions

**Copy Functionality:**

When user clicks Copy button on a message:

*Clipboard Action:*
- Message text copies to system clipboard immediately
- Formatting preserved as plain text
- No modal or confirmation dialog

*Visual Confirmation:*
- Copy button changes to Check icon
- Button text changes to "Copied"
- Green checkmark color (temporary)
- After 2 seconds, reverts to Copy icon and text
- Smooth transition between states

*Accessibility:*
- Screen reader announces "Message copied"
- Keyboard accessible (Enter or Space key)
- Focus remains on button after action

**Regenerate Functionality:**

When user clicks Regenerate button:

*Request Behavior:*
- Original message remains visible during regeneration
- New response appears below with typing indicator
- Original message gets "Previous response" label
- No replacement of original (user can compare)

*Visual Feedback:*
- RefreshCw icon spins continuously
- Button disabled during processing
- Button text may change to "Generating..."
- Other regenerate buttons on same message disabled

*Completion:*
- Icon stops spinning
- Button re-enables
- New message appears with new timestamp
- Scroll adjusts to show new content

**Message Text Selection:**

Users can select and copy message text directly:

*Selection Behavior:*
- Click and drag to select text
- Double-click selects word
- Triple-click selects paragraph
- Standard browser selection styling

*Context Menu:*
- Right-click shows browser context menu
- Copy option available
- Does not interfere with Copy button
- Both methods work independently

### Composer Interactions

**Typing Experience:**

As user types in the composer:

*Auto-Resize Behavior:*
- Textarea starts at minimum height (60px)
- Expands automatically as user types
- Each new line increases height smoothly
- Stops expanding at maximum height (200px)
- After max height, internal scrolling activates

*Send Button State:*
- Starts disabled (gray, not clickable)
- Becomes enabled as soon as any text exists
- Checks for non-whitespace characters only
- Updates immediately on input change

*Character Limits:*
- No hard character limit enforced
- Visual indicators if approaching backend limits
- Graceful handling of excessive length

**Sending Messages:**

User can send messages in three ways:

*Method 1: Click Send Button*
- Mouse click on Send button
- Touch tap on mobile
- Immediate submission

*Method 2: Enter Key*
- Pressing Enter (without Shift) sends message
- Works from anywhere in textarea
- Natural, expected behavior

*Method 3: Keyboard Shortcut*
- Cmd/Ctrl + Enter also sends (alternative)
- Works even with Shift held
- Power user feature

*Submission Behavior:*
- Message appears instantly in chat area
- Composer clears immediately
- Textarea resets to minimum height
- Focus remains in textarea (ready for next message)
- Send button disables until more text entered

**File Upload Flow:**

When user clicks Paperclip button:

*File Picker:*
- Native OS file picker opens
- Supports multiple file selection
- Filtered to allowed file types
- Canceling picker has no effect

*File Processing:*
- Selected files show as pills/badges in composer
- Each pill shows file name and size
- X button on each pill to remove
- Files upload asynchronously in background

*Visual Feedback:*
- Upload progress indicator per file
- Success checkmark when complete
- Error state if upload fails
- Can send message while files uploading

**Mode Switching:**

When user clicks mode selector badge:

*Dropdown Appearance:*
- Dropdown animates into view (fade + slide)
- Appears above badge (bottom-full)
- Smooth animation over 200ms
- Backdrop fades in simultaneously

*Mode Selection:*
- Hovering over option highlights it
- Clicking option selects it immediately
- Dropdown closes with fade out animation
- Badge updates to show new mode name

*Keyboard Navigation:*
- Arrow up/down moves selection
- Enter selects highlighted option
- Escape closes dropdown
- Tab moves through options

*Context Awareness:*
- Selected mode affects message processing
- No confirmation needed for mode change
- Mode shown in message metadata (optional)
- Persists across page reloads

### Scroll Behavior

**Auto-Scroll on New Messages:**

When new messages arrive (user sends or assistant responds):

*Scroll Trigger:*
- Only auto-scrolls if user was already at bottom
- If user scrolled up to read history, does not auto-scroll
- Threshold: Within 100px of bottom counts as "at bottom"

*Scroll Animation:*
- Smooth scroll over 300ms
- Ease-out timing function
- Message fully visible after scroll
- No jarring instant jumps

*User Override:*
- Manual scroll during auto-scroll cancels it
- User maintains control always
- "Scroll to bottom" button appears if scrolled up

**Scroll Position Memory:**

When switching conversations:

*New Conversation:*
- Always scrolls to bottom
- Shows most recent messages
- No memory of previous position (fresh context)

*Returning to Conversation:*
- Optionally remembers scroll position
- Or defaults to bottom (simpler UX)
- Depends on product decision

**Scroll Indicators:**

Visual cues for scrolling:

*Scroll Shadow:*
- Top shadow appears when scrolled down
- Bottom shadow appears when scrollable content below
- Fades in/out with scroll position
- Subtle indicator without being distracting

*Scroll to Bottom Button:*
- Appears when scrolled up and new message arrives
- Floats above message area
- Click scrolls smoothly to bottom
- Dismisses automatically when at bottom

---

## Interaction Patterns

### Hover States

**Consistent Hover Feedback:**

All interactive elements provide hover feedback:

*Buttons:*
- Background color shift (lightens or darkens)
- Transition duration: 150ms
- Cursor changes to pointer
- No delay before hover activates

*Conversation List Items:*
- Background lightens on hover
- Actions button fades in
- Entire item is clickable area
- Clear visual distinction from non-hover

*Message Action Buttons:*
- Background appears (was transparent)
- Icon color may intensify slightly
- Smooth transition, not instant
- Consistent with button hover patterns

### Focus States

**Keyboard Navigation Support:**

All interactive elements support keyboard focus:

*Visual Focus Indicator:*
- Blue outline (2px solid blue-500)
- Slight offset from element (2px)
- Rounded to match element shape
- Always visible, never removed

*Focus Order:*
- Logical tab order through interface
- Sidebar items before main content
- Header elements before messages
- Composer last in order

*Skip Links:*
- "Skip to main content" link at top
- "Skip to composer" link available
- Hidden visually, revealed on focus
- Supports keyboard-only users

### Loading States

**Async Operation Feedback:**

When operations take time, provide feedback:

*Conversation Loading:*
- Skeleton screens for message list
- Pulsing animation on skeletons
- Maintains layout (no content shift)
- Replaced by real content when loaded

*Message Sending:*
- User message appears with sending indicator
- Timestamp shows "Sending..."
- Changes to actual time when confirmed
- Error state if send fails

*Regeneration:*
- Spinning icon in regenerate button
- Button disabled during process
- Typing indicator appears in message area
- Smooth transition to completed state

### Error States

**Graceful Error Handling:**

When errors occur, communicate clearly:

*Connection Lost:*
- Connection status indicator turns red
- Toast notification appears
- "Disconnected" message in header
- Composer disabled until reconnected

*Message Send Failure:*
- Error indicator on failed message
- "Retry" button appears
- Error message explains issue
- Can delete failed message

*File Upload Failure:*
- File pill shows error state (red)
- Error message below file name
- Retry button specific to that file
- Can remove and try different file

### Success Feedback

**Positive Confirmation:**

Successful actions receive confirmation:

*Toast Notifications:*
- Brief message (2-3 seconds)
- Appears in top-right corner
- Examples: "Message copied", "Conversation deleted"
- Auto-dismisses, can manually dismiss

*Inline Confirmation:*
- Check icons for completed actions
- Color changes (green for success)
- Brief animation (subtle bounce or fade)
- Returns to default state automatically

---

## Visual Design Specifications

### Color Palette

**Primary Colors:**

*Guardian Purple:*
- Hex: #9333ea (purple-600)
- Usage: Guardian avatar, send button, accent actions
- Hover: #7e22ce (purple-700)
- Disabled: #c4b5fd (purple-300)

*User Blue:*
- Hex: #2563eb (blue-600)
- Usage: User avatar, mode selector badge
- Hover: #1d4ed8 (blue-700)
- Light variant: #eff6ff (blue-50) for badge background

**Neutral Colors:**

*Backgrounds:*
- White: #ffffff - Main background, message containers
- Gray-50: #f9fafb - Sidebar background
- Gray-100: #f3f4f6 - Hover states, active conversations
- Gray-200: #e5e7eb - Active conversation, borders

*Text:*
- Gray-900: #111827 - Primary text (headings, message content)
- Gray-700: #374151 - Secondary text (labels, buttons)
- Gray-600: #4b5563 - Tertiary text (timestamps, metadata)
- Gray-500: #6b7280 - Placeholder text, icons
- Gray-400: #9ca3af - Disabled text, subtle icons

**Status Colors:**

*Success (Green):*
- Green-500: #22c55e - Connected status dot, success states

*Warning (Yellow):*
- Yellow-500: #eab308 - Connecting status dot, warnings

*Error (Red):*
- Red-500: #ef4444 - Disconnected status dot, errors

### Typography

**Font Family:**
- Primary: System font stack (default)
- Fallback: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif
- Ensures native feel on each platform

**Font Sizes:**

*Large:*
- 20px (text-xl): Page title ("Guardian")
- 24px (text-2xl): Empty states, onboarding

*Medium:*
- 16px (text-base): Message content, input text
- 14px (text-sm): Conversation titles, button labels, dropdown options

*Small:*
- 12px (text-xs): Timestamps, metadata, descriptions, helper text

**Font Weights:**

- 400 (normal): Body text, descriptions
- 500 (medium): Conversation titles, button labels, section headers
- 600 (semibold): Page title, active states, emphasis

**Line Height:**

- Tight (1.25): Headers, titles
- Normal (1.5): Body text, message content
- Relaxed (1.625): Descriptions, helper text

### Spacing

**Component Spacing:**

*Extra Small:*
- 4px (1): Between related inline elements
- 8px (2): Between form elements, small gaps

*Small:*
- 12px (3): Padding in buttons, badges, pills
- 16px (4): Standard padding, gaps between sections

*Medium:*
- 24px (6): Section padding, header/footer padding
- 32px (8): Margin between messages

*Large:*
- 48px (12): Major section separation
- 64px (16): Empty state spacing

**Consistent Application:**
- Use multiples of 4px for all spacing
- Maintain consistent gaps throughout interface
- Adjust spacing proportionally on mobile

### Border Radius

**Rounding Values:**

*Small Components:*
- 6px (rounded-md): Small buttons, badges, action buttons
- 8px (rounded-lg): Standard buttons, input fields, cards

*Medium Components:*
- 12px (rounded-xl): Dropdowns, popovers, modals
- 16px (rounded-2xl): Composer container, large cards

*Special Cases:*
- 9999px (rounded-full): Circular avatars, status dots, pill badges
- 0px (rounded-none): None needed in current design

### Shadows

**Elevation Levels:**

*Level 1 (Subtle):*
- shadow-sm: Small elements requiring slight elevation
- Use: Conversation list items on hover

*Level 2 (Standard):*
- shadow-md: Standard cards and containers
- Use: Dropdowns, tooltips

*Level 3 (Elevated):*
- shadow-lg: Important UI components
- Use: Composer container, mode selector dropdown

*Level 4 (High):*
- shadow-xl: Modals, important overlays
- Use: Modal dialogs, major popups

**Shadow Direction:**
- All shadows project downward (positive Y offset)
- Subtle blur for professional appearance
- Semi-transparent black (#000000 with 10-20% opacity)

---

## Responsive Behavior

### Desktop (1024px and above)

**Optimal Layout:**

At desktop widths, Guardian shows its complete layout:

*Sidebar:*
- Visible by default (256px width)
- Can be toggled to minimized (48px)
- User preference persists
- Smooth transitions between states

*Main Area:*
- Centered content (768px max-width)
- Comfortable reading column
- Plenty of white space on sides
- Composer matches message width

*Interactions:*
- Hover states clearly visible
- Mouse-optimized interactions
- Keyboard shortcuts available
- Multiple input methods supported

### Tablet (768px to 1023px)

**Adapted Layout:**

On tablets, space is more constrained:

*Sidebar:*
- Starts minimized by default
- Can expand to overlay content
- Does not push content when expanded
- Closes automatically after navigation

*Main Area:*
- Content width remains centered
- Slightly narrower max-width (90vw)
- More padding on edges
- Composer maintains full width minus padding

*Interactions:*
- Touch-optimized tap targets
- Larger minimum sizes (44x44px)
- Hover states less important
- Gestures may supplement clicks

### Mobile (Below 768px)

**Compact Layout:**

On mobile devices, interface adapts significantly:

*Sidebar:*
- Hidden by default (drawer pattern)
- Slides in from left edge
- Overlays entire screen
- Backdrop dims content behind
- Close button or backdrop tap dismisses

*Main Area:*
- Full width minus standard padding
- No centering constraint
- Edge-to-edge feel appropriate
- Composer full width with padding

*Header:*
- May condense elements
- Hamburger menu always visible
- User info may abbreviate
- Connection status may hide

*Composer:*
- Simplified toolbar
- Larger touch targets
- Mode selector may be full-width button
- Send button more prominent

*Messages:*
- Full width minus padding
- Larger text for readability
- Generous padding
- Touch-friendly action buttons

### Responsive Breakpoints

**Specific Width Thresholds:**

*Small Mobile:*
- Below 640px
- Single column layouts only
- Minimal chrome
- Focus on content

*Large Mobile / Small Tablet:*
- 640px to 767px
- Can show more UI elements
- Comfortable single-hand use
- Portrait orientation optimized

*Tablet:*
- 768px to 1023px
- Two-column layouts possible
- Landscape orientation comfortable
- Stylus interactions supported

*Desktop:*
- 1024px and above
- Full layout with all features
- Multi-column where appropriate
- Mouse and keyboard optimized

### Touch Optimization

**Mobile-Specific Enhancements:**

*Tap Targets:*
- Minimum 44x44px for all interactive elements
- More spacing between adjacent buttons
- Larger padding in clickable areas
- No hover-only interactions

*Gestures:*
- Swipe to go back (conversation navigation)
- Pull to refresh (optional)
- Long-press for context menus
- Pinch to zoom on images

*Mobile Keyboard:*
- Composer adjusts for keyboard
- Scroll position maintains message visibility
- Send button always accessible
- Input doesn't obscure context

---

## State Management Requirements

### Application-Level State

**What Needs to be Tracked:**

*User Session:*
- Authentication status
- User profile information
- Role and permissions
- Connection status to backend

*Active Conversation:*
- Currently displayed conversation ID
- Message history for that conversation
- Scroll position in messages
- Typing indicator status

*Sidebar State:*
- Open or minimized
- List of all conversations
- Active conversation indicator
- Loading states for conversation list

*Composer State:*
- Current message text
- Selected mode (consult/assessment)
- Attached files
- Send button enabled status

### Component-Level State

**Local State Needs:**

*Message List:*
- Scroll position
- Auto-scroll enabled/disabled
- Loading more messages (pagination)
- Copied message ID (for animation)

*Mode Selector:*
- Dropdown open/closed
- Currently selected mode
- Animation state

*Conversation Items:*
- Hover state
- Actions menu open/closed
- Selected for bulk actions

### State Persistence

**What Should Persist:**

*Across Page Reloads:*
- User authentication token
- Sidebar open/closed preference
- Selected mode in composer
- Draft messages in composer

*Across Sessions:*
- User preferences
- Conversation list
- Message history

*Should NOT Persist:*
- Scroll positions
- Hover states
- Temporary UI states
- Error messages

### State Synchronization

**Real-Time Updates:**

*WebSocket Connection:*
- Maintains open connection to backend
- Receives new messages in real-time
- Updates conversation list
- Shows typing indicators

*Optimistic Updates:*
- User messages appear immediately
- Server confirmation updates them
- Rollback if send fails
- Maintains responsive feel

---

## Accessibility Requirements

### Keyboard Navigation

**Full Keyboard Support:**

*Navigation Order:*
- Tab moves through interactive elements logically
- Shift+Tab goes backward
- Focus visible at all times
- No keyboard traps

*Keyboard Shortcuts:*
- Cmd/Ctrl + B: Toggle sidebar
- Cmd/Ctrl + K: New conversation
- Cmd/Ctrl + Enter: Send message
- Escape: Close dropdowns/modals
- Arrow keys: Navigate dropdown options

### Screen Reader Support

**ARIA Labels and Roles:**

*Semantic HTML:*
- Proper heading hierarchy (h1, h2, h3)
- Button elements for clickable items
- Form labels for inputs
- List markup for conversation list

*ARIA Attributes:*
- aria-label on icon-only buttons
- aria-expanded on dropdown triggers
- aria-current on active conversation
- aria-live for dynamic updates

*Announcements:*
- New messages announced
- Mode changes announced
- Error messages announced
- Success confirmations announced

### Visual Accessibility

**Color and Contrast:**

*WCAG AA Compliance:*
- 4.5:1 contrast for normal text
- 3:1 contrast for large text
- 3:1 contrast for UI components
- No color-only indicators

*Focus Indicators:*
- Always visible
- Sufficient contrast (3:1)
- Not removed by CSS
- Clear against all backgrounds

*Text Scaling:*
- Interface works at 200% zoom
- No horizontal scrolling required
- Text reflows appropriately
- No content hidden

### Motor Accessibility

**Interaction Adaptations:**

*Large Touch Targets:*
- 44x44px minimum on mobile
- 40x40px minimum on desktop
- Adequate spacing between targets
- No precision required

*Multiple Input Methods:*
- Mouse support
- Touch support
- Keyboard support
- Voice input support (browser feature)

*No Time Limits:*
- No auto-logout during activity
- Sessions expire gracefully
- Warnings before timeout
- Easy re-authentication

---

## Implementation Priorities

### Phase 1: Core Layout (Week 1)

**Foundation Elements:**

*Priority 1.1: Basic Structure*
- Implement three-panel layout (sidebar, main, composer)
- Add sidebar toggle functionality
- Create minimized sidebar state
- Ensure smooth transitions

*Priority 1.2: Centered Content*
- Apply max-width to message area
- Apply max-width to composer
- Ensure proper horizontal centering
- Test responsive padding

*Priority 1.3: Header*
- Build header component
- Add connection status indicator
- Add user information display
- Implement menu toggle button

**Success Criteria:**
- Layout matches design specifications
- Sidebar toggles smoothly
- Content properly centered
- No layout shifts during transitions

### Phase 2: Composer (Week 1-2)

**Input Component:**

*Priority 2.1: Reversed Layout*
- Position textarea above toolbar
- Create toolbar with left/right groups
- Add proper spacing and padding
- Style composer container

*Priority 2.2: Auto-Resize Textarea*
- Implement height auto-growth
- Set minimum and maximum heights
- Handle overflow scrolling
- Smooth resize animation

*Priority 2.3: Send Button Logic*
- Enable/disable based on text
- Handle click events
- Handle Enter key
- Clear input after send

*Priority 2.4: Mode Selector*
- Create pillbox badge button
- Build popover dropdown
- Implement backdrop
- Handle selection logic

**Success Criteria:**
- Composer visually matches design
- Auto-resize works smoothly
- Send button behaves correctly
- Mode selector fully functional

### Phase 3: Conversations (Week 2)

**Sidebar Content:**

*Priority 3.1: Conversation List*
- Build conversation list component
- Style conversation items
- Implement active state
- Add hover interactions

*Priority 3.2: New Chat*
- Create new chat button
- Handle click to create conversation
- Clear current conversation
- Focus composer after creation

*Priority 3.3: Conversation Navigation*
- Switch conversations on click
- Update active state
- Load messages for conversation
- Update URL with conversation ID

*Priority 3.4: Logout Button*
- Add logout button to sidebar bottom
- Handle logout action
- Clear authentication
- Redirect to login

**Success Criteria:**
- Can create new conversations
- Can switch between conversations
- Active state displays correctly
- Logout functions properly

### Phase 4: Messages (Week 2-3)

**Message Display:**

*Priority 4.1: Message Layout*
- Implement message structure
- Add avatar components
- Style user vs assistant messages
- Apply proper spacing

*Priority 4.2: Message Actions*
- Add copy button
- Implement copy to clipboard
- Add regenerate button
- Show confirmation states

*Priority 4.3: Icons*
- Integrate lucide-react library
- Replace placeholder avatars with User/Bot icons
- Add all action icons
- Ensure consistent sizing

*Priority 4.4: Scroll Behavior*
- Auto-scroll to bottom on new messages
- Maintain scroll position when appropriate
- Add scroll-to-bottom button
- Handle scroll shadows

**Success Criteria:**
- Messages display correctly
- Copy and regenerate work
- Icons render properly
- Scroll behaves as expected

### Phase 5: Polish & Testing (Week 3-4)

**Quality Assurance:**

*Priority 5.1: Responsive Testing*
- Test all breakpoints
- Verify mobile adaptations
- Test tablet layouts
- Ensure desktop perfection

*Priority 5.2: Accessibility*
- Keyboard navigation testing
- Screen reader testing
- Color contrast verification
- Focus indicator testing

*Priority 5.3: Performance*
- Optimize animations
- Reduce unnecessary re-renders
- Test with long conversation lists
- Test with long messages

*Priority 5.4: Edge Cases*
- Test error states
- Test loading states
- Test empty states
- Test extreme content

**Success Criteria:**
- Works perfectly across devices
- Passes accessibility audit
- Performs smoothly
- Handles all edge cases

---

## Testing Checklist

### Visual Testing

- [ ] Layout matches design on desktop
- [ ] Layout matches design on tablet
- [ ] Layout matches design on mobile
- [ ] Sidebar toggles smoothly
- [ ] Composer centered correctly
- [ ] Messages centered correctly
- [ ] Colors match specification
- [ ] Typography matches specification
- [ ] Spacing consistent throughout
- [ ] Icons render correctly
- [ ] Hover states appear correctly
- [ ] Active states appear correctly
- [ ] Transitions smooth on all elements

### Functional Testing

- [ ] Can create new conversations
- [ ] Can switch between conversations
- [ ] Can send messages
- [ ] Can copy messages
- [ ] Can regenerate messages
- [ ] Can toggle sidebar
- [ ] Can switch modes
- [ ] Can upload files
- [ ] Can logout
- [ ] Messages appear in correct order
- [ ] Timestamps display correctly
- [ ] Connection status updates
- [ ] Scroll behavior works correctly

### Interaction Testing

- [ ] All buttons clickable
- [ ] All hover states work
- [ ] All focus states visible
- [ ] Keyboard navigation works
- [ ] Keyboard shortcuts work
- [ ] Touch targets adequate on mobile
- [ ] Gestures work on mobile
- [ ] Dropdowns open/close correctly
- [ ] Backdrop dismisses dropdowns
- [ ] No click-through issues

### Accessibility Testing

- [ ] Screen reader announces correctly
- [ ] All images have alt text
- [ ] All icons have aria-labels
- [ ] Focus indicators visible
- [ ] Color contrast passes WCAG AA
- [ ] Works at 200% zoom
- [ ] No keyboard traps
- [ ] Tab order logical
- [ ] Error messages accessible
- [ ] Success messages accessible

### Responsive Testing

- [ ] Works at 320px width (smallest mobile)
- [ ] Works at 640px width (large mobile)
- [ ] Works at 768px width (tablet)
- [ ] Works at 1024px width (desktop)
- [ ] Works at 1440px width (large desktop)
- [ ] Works at 1920px width (full HD)
- [ ] No horizontal scrolling
- [ ] Touch targets adequate on mobile
- [ ] Text readable on all sizes

### Performance Testing

- [ ] Page loads in under 2 seconds
- [ ] Animations run at 60fps
- [ ] No janky scrolling
- [ ] No layout shifts
- [ ] Images load progressively
- [ ] Works with 100+ conversations
- [ ] Works with 100+ messages
- [ ] Works with large files
- [ ] No memory leaks
- [ ] Efficient re-renders

### Browser Testing

- [ ] Works in Chrome
- [ ] Works in Firefox
- [ ] Works in Safari
- [ ] Works in Edge
- [ ] Works on iOS Safari
- [ ] Works on Android Chrome
- [ ] Works in private/incognito mode
- [ ] No console errors
- [ ] No console warnings

---

## Final Notes

This implementation guide provides the detailed specifications needed to recreate the Guardian UI redesign. The design prioritizes:

1. **User Focus**: Centered content keeps attention on conversations
2. **Professional Appearance**: Clean, modern design suitable for healthcare
3. **Efficient Workflows**: Sidebar enables multi-conversation management
4. **Modern Patterns**: Follows established UX patterns from ChatGPT and similar tools
5. **Accessibility**: Fully keyboard navigable and screen reader compatible
6. **Responsive**: Works beautifully across all device sizes

The implementation should be done in phases, with each phase building on the previous. Test thoroughly at each phase before moving forward. Maintain the professional healthcare aesthetic throughout, and ensure all interactions feel smooth and responsive.

When in doubt, refer back to the ChatGPT interface for guidance on modern chat UX patterns. The goal is to make Guardian feel familiar to users who have used other AI chat interfaces, while maintaining its unique identity as a healthcare AI governance assistant.
