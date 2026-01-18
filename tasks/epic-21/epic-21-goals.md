# Epic 21: Chat Stream Restyling

## Overview

Restyle the chat UI from a ChatGPT clone aesthetic to a distinctive Guardian identity using a sky-blue color palette with improved message differentiation.

## Scope

**Primary files:**
- `apps/web/src/components/chat/ChatMessage.tsx` - Main message component (major restructure)
- `apps/web/src/components/chat/MessageList.tsx` - Message container and typing indicator
- `apps/web/src/components/chat/FileChipInChat.tsx` - File attachment display in messages
- `apps/web/src/components/chat/RotatingStatus.tsx` - Scoring/parsing progress spinner
- `apps/web/src/components/chat/ChatInterface.tsx` - Canvas header (Guardian logo when sidebar closed)
- `apps/web/src/components/chat/Sidebar.tsx` - Add Shield icon to expanded sidebar header
- `apps/web/src/app/globals.css` - Global font import

**Test files to update:**
- `apps/web/src/components/chat/__tests__/ChatMessage.test.tsx`
- `apps/web/src/components/chat/__tests__/MessageList.test.tsx`
- `apps/web/src/components/chat/__tests__/FileChipInChat.test.tsx`

**Related components (may need consistency review):**
- `apps/web/src/components/chat/QuestionnaireMessage.tsx` - Uses similar avatar pattern
- `apps/web/src/components/chat/VendorClarificationCard.tsx` - Uses Guardian avatar
- `apps/web/src/components/chat/ProgressMessage.tsx` - May use Guardian styling
- `apps/web/src/components/chat/RotatingStatus.tsx` - Update spinner to sky-blue

## Style Guide (from Claude mockup)

```css
// Font
font-family: 'Atkinson Hyperlegible', sans-serif

// Guardian message container
bg-sky-50 rounded-xl p-5

// Guardian avatar
w-10 h-10 rounded-full bg-sky-500 + ShieldCheck icon (white)

// User message (right-aligned wrapper)
flex flex-col items-end + flex-row-reverse for avatar

// User avatar
w-10 h-10 rounded-full bg-sky-100 + User icon (sky-600)

// File attachment card
bg-white border border-slate-200 rounded-lg + sky-500 icon bg
```

**Icon imports (from lucide-react):**
```tsx
import { ShieldCheck, User } from 'lucide-react';

// Guardian avatar - use ShieldCheck (NOT Bot)
<ShieldCheck className="h-5 w-5 text-white" />

// User avatar - use User with sky-600 color
<User className="h-5 w-5 text-sky-600" />
```

---

## Current State vs Mockup

| Element | Current | Mockup |
|---------|---------|--------|
| **Guardian container** | Full-width `bg-gray-50` | Contained `bg-sky-50 rounded-xl p-5` |
| **Guardian avatar** | `h-8 w-8 bg-purple-600` + Bot icon | `w-10 h-10 bg-sky-500` + ShieldCheck icon |
| **Guardian label** | Gray text | Sky-blue text (`text-sky-600`) |
| **User alignment** | Left-aligned (same as assistant) | Right-aligned with avatar on right |
| **User avatar** | `h-8 w-8 bg-blue-600` + User icon (white) | `w-10 h-10 bg-sky-100` + User icon (sky-600) |
| **File attachment** | `bg-gray-100 border-gray-200` | `bg-white border-slate-200` + sky-500 icon bg |
| **Thinking state** | Purple spinner | Sky-blue spinner (`text-sky-600`) |
| **Timestamps** | Shown below messages | Remove |

---

## Files to Modify

### 1. `ChatMessage.tsx` - Major changes

**Location:** `apps/web/src/components/chat/ChatMessage.tsx`

Changes:
- Guardian messages: wrap content in `bg-sky-50 rounded-xl p-5`
- User messages: `flex-row-reverse`, right-align text
- Avatar sizes: `h-8 w-8` → `w-10 h-10`
- Guardian avatar: `bg-purple-600` → `bg-sky-500`, Bot → ShieldCheck
- User avatar: `bg-blue-600` → `bg-sky-100`, icon `text-white` → `text-sky-600`
- Guardian label color: add `text-sky-600`
- Remove full-width alternating backgrounds
- Remove timestamp rendering
- Keep Copy/Regenerate buttons inside the rounded container

### 2. `FileChipInChat.tsx` - Style update

**Location:** `apps/web/src/components/chat/FileChipInChat.tsx`

Changes:
- Container: `bg-gray-100 border-gray-200` → `bg-white border border-slate-200`
- Icon bg: `bg-blue-500` → `bg-sky-500`
- Type label: `text-sky-500` (like "Word" in mockup)

### 3. `MessageList.tsx` - Typing indicator (Pulsing Shield + Shimmer Text)

**Location:** `apps/web/src/components/chat/MessageList.tsx`

Changes:
- Replace bouncing dots with pulsing shield avatar + shimmer text
- Avatar: `w-10 h-10 bg-sky-500` circle with `ShieldCheck` icon (white)
- Text: "Guardian is thinking..." with shimmer gradient animation
- Remove the three bouncing dot spans

**Custom animations (add to globals.css):**
```css
/* Pulsing shield avatar */
@keyframes pulse-shield {
  0%, 100% {
    transform: scale(1);
    box-shadow: 0 0 0 0 rgba(14, 165, 233, 0.5);
  }
  50% {
    transform: scale(1.18);
    box-shadow: 0 0 0 14px rgba(14, 165, 233, 0);
  }
}

.animate-pulse-shield {
  animation: pulse-shield 1.5s ease-in-out infinite;
}

/* Shimmer text effect */
@keyframes shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

.animate-shimmer {
  animation: shimmer 2s linear infinite;
}
```

**Target JSX:**
```tsx
<div className="flex items-center gap-3 py-6">
  {/* Pulsing Avatar */}
  <div className="w-10 h-10 rounded-full bg-sky-500 flex items-center justify-center animate-pulse-shield">
    <ShieldCheck className="h-5 w-5 text-white" />
  </div>

  {/* Shimmer Text */}
  <span
    className="text-sm font-medium bg-gradient-to-r from-slate-500 via-sky-400 to-slate-500 bg-clip-text text-transparent animate-shimmer"
    style={{ backgroundSize: '200% 100%' }}
  >
    Guardian is thinking...
  </span>
</div>
```

**Shimmer details:**
- Gradient: `from-slate-500 via-sky-400 to-slate-500` (sky highlight sweeps across slate text)
- Background size: `200% 100%` (required for sweep effect)
- Duration: 2s linear infinite

### 4. `RotatingStatus.tsx` - Style update

**Location:** `apps/web/src/components/chat/RotatingStatus.tsx`

Changes:
- Spinner color: `text-purple-600` → `text-sky-600`
- Container bg: `bg-gray-50` → `bg-sky-50` (consistent with Guardian messages)

### 5. `Sidebar.tsx` - Expanded Header (Add Shield Icon)

**Location:** `apps/web/src/components/chat/Sidebar.tsx`

Changes:
- Add `Shield` icon next to "Guardian" text in expanded sidebar header
- Keep existing color (`text-gray-900`)
- Font changes automatically via global Atkinson Hyperlegible

**Icon import:**
```tsx
import { Shield } from 'lucide-react';
```

**Current (line 96-97):**
```tsx
<span className="font-semibold text-lg text-gray-900 pl-2">Guardian</span>
```

**Target:**
```tsx
<div className="flex items-center gap-2 pl-2">
  <Shield className="h-5 w-5 text-gray-900" />
  <span className="font-semibold text-lg text-gray-900">Guardian</span>
</div>
```

### 6. `ChatInterface.tsx` - Canvas Header (Guardian Logo)

**Location:** `apps/web/src/components/chat/ChatInterface.tsx`

Changes:
- Add Guardian branding to upper-left of main canvas when sidebar is minimized
- Display: `Shield` icon (no checkmark) + "Guardian" text
- Only visible when `isMinimized` is true
- Positioned at top-left of the main content area (not inside sidebar)

**Icon import:**
```tsx
import { Shield } from 'lucide-react';  // NOT ShieldCheck
```

**Target JSX (add to main canvas area):**
```tsx
{isMinimized && (
  <div className="absolute top-4 left-4 flex items-center gap-2">
    <Shield className="h-6 w-6 text-sky-500" />
    <span className="text-lg font-semibold text-gray-900">Guardian</span>
  </div>
)}
```

**Behavior:**
- Hidden when sidebar is expanded (sidebar shows "Guardian" title with Shield)
- Visible when sidebar is minimized (mini icon strip only)
- Similar to ChatGPT's logo placement

### 7. `globals.css` - Font + Animations (Confirmed)

**Location:** `apps/web/src/app/globals.css`

Changes:
- Add Atkinson Hyperlegible font import from Google Fonts
- Apply globally to body
- Fallback to sans-serif
- Add `pulse-shield` and `shimmer` keyframes

Note: If font doesn't look good, rollback by removing the import and font-family declaration.

---

## Layout Changes

```
Current:
┌─────────────────────────────────────────┐
│ [Avatar] Guardian                       │ ← full-width bg-gray-50
│          Message content...             │
└─────────────────────────────────────────┘
┌─────────────────────────────────────────┐
│ [Avatar] You                            │ ← full-width bg-white
│          User message...                │
└─────────────────────────────────────────┘

Mockup:
┌─────────────────────────────────────────┐
│ [Avatar] Guardian                       │
│   ┌─────────────────────────────────┐   │
│   │ bg-sky-50 rounded-xl p-5        │   │
│   │ Message content...              │   │
│   │                                 │   │
│   │ [Copy] [Regenerate]             │   │
│   └─────────────────────────────────┘   │
└─────────────────────────────────────────┘
┌─────────────────────────────────────────┐
│                       You [Avatar]      │ ← right-aligned
│                   User message...       │
│        ┌──────────────────────┐         │
│        │ File attachment card │         │
│        └──────────────────────┘         │
└─────────────────────────────────────────┘
```

---

## Final Requirements (Confirmed)

| Item | Decision |
|------|----------|
| Timestamps | Remove |
| Copy/Regenerate | Inside sky-50 container |
| Font | Add Atkinson Hyperlegible globally (rollback if needed) |
| Message width | Keep current `max-w-3xl` |
| Thinking state | Pulsing shield + shimmer "Guardian is thinking..." text |

---

## Implementation Order

1. `globals.css` - Add font + animations (pulse-shield, shimmer)
2. `Sidebar.tsx` - Add Shield icon to expanded header
3. `ChatMessage.tsx` - Core message styling (biggest change)
4. `MessageList.tsx` - Typing indicator (pulsing shield + shimmer text)
5. `FileChipInChat.tsx` - File attachment styling
6. `RotatingStatus.tsx` - Progress spinner styling
7. `ChatInterface.tsx` - Canvas header (Guardian logo when sidebar minimized)
8. Update tests as needed

---

## Reference Mockup

The mockup shows:
- Guardian messages with sky-blue rounded containers
- ShieldCheck icon in sky-500 circle for Guardian avatar
- User messages right-aligned with avatar on right
- User icon in sky-100 circle with sky-600 icon color
- File attachments in white cards with slate border
- Copy/Regenerate buttons at bottom of Guardian message container
- No timestamps displayed

---

## Current Implementation Details

### ChatMessage.tsx Structure (lines 79-215)

Current JSX structure:
```tsx
<div className="flex w-full gap-4 px-4 py-6 md:px-8 md:py-8 {isUser ? 'bg-white' : 'bg-gray-50'}">
  {/* Avatar - always on left */}
  <div className="h-8 w-8 rounded-full {isUser ? 'bg-blue-600' : 'bg-purple-600'}">
    {isUser ? <User /> : <Bot />}
  </div>

  {/* Content */}
  <div className="flex-1 min-w-0 space-y-3">
    <div className="text-sm font-semibold text-gray-900">{isUser ? 'You' : 'Guardian'}</div>
    <div className="prose...">{content via ReactMarkdown}</div>
    {attachments && <FileChipInChat />}
    {components && <EmbeddedComponent />}
    {timestamp && <div className="text-xs text-gray-500">...</div>}  // REMOVE THIS
    {!isUser && <Copy/Regenerate buttons />}
  </div>
</div>
```

Target JSX structure:
```tsx
<div className="flex w-full gap-4 px-4 py-6 {isUser ? 'flex-row-reverse' : ''}">
  {/* Avatar */}
  <div className="w-10 h-10 rounded-full {isUser ? 'bg-sky-100' : 'bg-sky-500'}">
    {isUser ? <User className="text-sky-600" /> : <ShieldCheck className="text-white" />}
  </div>

  {/* Content wrapper */}
  <div className="flex-1 min-w-0 {isUser ? 'flex flex-col items-end' : ''}">
    <div className="text-sm font-semibold {isUser ? 'text-gray-900' : 'text-sky-600'}">
      {isUser ? 'You' : 'Guardian'}
    </div>

    {/* Guardian: sky-50 container; User: no container */}
    <div className="{!isUser ? 'bg-sky-50 rounded-xl p-5 mt-2' : 'mt-2'}">
      <div className="prose...">{content}</div>
      {attachments && <FileChipInChat />}
      {components && <EmbeddedComponent />}
      {!isUser && <Copy/Regenerate buttons />}  // Inside the sky-50 container
    </div>
  </div>
</div>
```

### MessageList.tsx Typing Indicator (lines 249-270)

Current:
```tsx
<div className="flex gap-3 py-6">
  <div className="flex h-8 w-8 rounded-full bg-purple-600 text-white">
    <svg>...</svg>  // Generic circle
  </div>
  <div className="flex items-center gap-1">
    <span className="animate-bounce">...</span>  // 3 bouncing dots
    <span className="animate-bounce">...</span>
    <span className="animate-bounce">...</span>
  </div>
</div>
```

Target (pulsing shield + shimmer text):
```tsx
<div className="flex items-center gap-3 py-6">
  {/* Pulsing Avatar */}
  <div className="w-10 h-10 rounded-full bg-sky-500 flex items-center justify-center animate-pulse-shield">
    <ShieldCheck className="h-5 w-5 text-white" />
  </div>

  {/* Shimmer Text */}
  <span
    className="text-sm font-medium bg-gradient-to-r from-slate-500 via-sky-400 to-slate-500 bg-clip-text text-transparent animate-shimmer"
    style={{ backgroundSize: '200% 100%' }}
  >
    Guardian is thinking...
  </span>
</div>
```

### FileChipInChat.tsx (lines 36-61)

Current:
```tsx
<button className="bg-gray-100 border border-gray-200 ...">
  <div className="w-8 h-8 bg-blue-500 rounded ...">
    <FileText className="text-white" />
  </div>
  <span className="text-gray-500">{typeLabel}</span>
</button>
```

Target:
```tsx
<button className="bg-white border border-slate-200 ...">
  <div className="w-8 h-8 bg-sky-500 rounded ...">
    <FileText className="text-white" />
  </div>
  <span className="text-sky-500">{typeLabel}</span>
</button>
```

---

## Dependencies

| Story | Depends On | Notes |
|-------|------------|-------|
| Font + animations (globals.css) | None | Do first, includes pulse-shield and shimmer |
| Sidebar header (Shield icon) | Font | Add Shield icon to expanded header |
| ChatMessage styling | Font | Main visual identity |
| MessageList typing indicator | Font, animations | Uses pulse-shield + shimmer |
| FileChipInChat | None | Independent styling |
| RotatingStatus | None | Independent styling |
| ChatInterface canvas header | None | Independent (uses Shield icon) |
| Test updates | All styling changes | Run after each file |

---

## Agent Assignment

All stories should be assigned to **frontend-agent** since this is purely UI work in `apps/web/`.

---

## Risk Considerations

1. **Test breakage**: Tests may assert on specific class names or structure. Review test files before implementation.
2. **Accessibility**: Ensure color contrast ratios are maintained (sky-500 on white, white on sky-500).
3. **Related components**: `QuestionnaireMessage`, `VendorClarificationCard`, `ProgressMessage` use similar avatar patterns - may need consistency updates or can be deferred to a follow-up.
4. **Font loading**: Google Fonts import may briefly show fallback font (FOUT). Consider `font-display: swap`.

---

## Success Criteria

- [ ] All chat messages use new sky-blue color palette
- [ ] Guardian messages have rounded sky-50 containers
- [ ] User messages are right-aligned with avatar on right
- [ ] Timestamps removed from all messages
- [ ] Copy/Regenerate buttons inside Guardian message container
- [ ] File attachments use white/slate/sky styling
- [ ] Typing indicator uses pulsing shield + shimmer "Guardian is thinking..." text
- [ ] Progress spinner uses sky-blue (no purple anywhere in chat UI)
- [ ] Expanded sidebar header shows Shield icon + "Guardian" text
- [ ] Canvas shows Shield + "Guardian" logo when sidebar is minimized
- [ ] Atkinson Hyperlegible font applied globally
- [ ] All existing tests pass (updated as needed)
- [ ] No accessibility regressions (contrast, focus states)

---

*Last updated: 2026-01-17*
