# Story 21.3: Restyle ChatMessage Component

## Description

Major restructure of ChatMessage component to implement Guardian visual identity with sky-blue containers, right-aligned user messages, and updated avatars.

## Acceptance Criteria

- [ ] Guardian messages wrapped in `bg-sky-50 rounded-xl p-5` container
- [ ] User messages right-aligned with `flex-row-reverse`
- [ ] Guardian avatar: `w-10 h-10 bg-sky-500` with ShieldCheck icon (white)
- [ ] User avatar: `w-10 h-10 bg-sky-100` with User icon (sky-600)
- [ ] Guardian label uses `text-sky-600`
- [ ] Timestamps removed from all messages
- [ ] Copy/Regenerate buttons inside sky-50 container (not outside)
- [ ] All existing functionality preserved (copy, regenerate, attachments, components)

## Technical Approach

1. Import `ShieldCheck` from lucide-react, keep `User`
2. Update outer container: remove bg-gray-50/bg-white, add flex-row-reverse for user
3. Update avatar sizes from h-8 w-8 to w-10 h-10
4. Guardian avatar: bg-purple-600 -> bg-sky-500, Bot -> ShieldCheck
5. User avatar: bg-blue-600 -> bg-sky-100, icon text-white -> text-sky-600
6. Add content wrapper with conditional sky-50 container for Guardian messages
7. Remove timestamp rendering (lines 165-173)
8. Move Copy/Regenerate buttons inside sky-50 container

## Files Touched

- `apps/web/src/components/chat/ChatMessage.tsx` - Major restructure (lines 79-215)

## Agent Assignment

frontend-agent

## Tests Required

- Update `ChatMessage.test.tsx` for new class names and structure
- Test Guardian message has sky-50 container
- Test user message is right-aligned
- Test timestamps are not rendered
- Test avatars have correct colors and icons

### Existing Tests to Update

| Test (line) | Action | Reason |
|-------------|--------|--------|
| `'displays timestamp when provided'` (39-44) | **DELETE** | Timestamps removed from UI |

## Implementation Details

### Import Changes

```tsx
// Before
import { User, Bot, Copy, Check, RefreshCw, AlertTriangle } from 'lucide-react';

// After
import { User, ShieldCheck, Copy, Check, RefreshCw, AlertTriangle } from 'lucide-react';
```

### Outer Container Changes

```tsx
// Before
<div className={cn(
  'flex w-full gap-4 px-4 py-6 md:px-8 md:py-8',
  isUser ? 'bg-white' : 'bg-gray-50',
  className
)}>

// After
<div className={cn(
  'flex w-full gap-4 px-4 py-6 md:px-8 md:py-8',
  isUser ? 'flex-row-reverse' : '',
  className
)}>
```

### Avatar Changes

```tsx
// Before
<div className={cn(
  'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
  isUser ? 'bg-blue-600' : 'bg-purple-600'
)}>
  {isUser ? (
    <User className="h-5 w-5 text-white" aria-hidden="true" />
  ) : (
    <Bot className="h-5 w-5 text-white" aria-hidden="true" />
  )}
</div>

// After
<div className={cn(
  'flex w-10 h-10 shrink-0 items-center justify-center rounded-full',
  isUser ? 'bg-sky-100' : 'bg-sky-500'
)}>
  {isUser ? (
    <User className="h-5 w-5 text-sky-600" aria-hidden="true" />
  ) : (
    <ShieldCheck className="h-5 w-5 text-white" aria-hidden="true" />
  )}
</div>
```

### Content Wrapper Structure

**IMPORTANT: Right-Alignment Behavior**

When user messages are right-aligned, only the **container position** should align right. The **text content inside** (especially markdown/code blocks) must remain left-aligned for readability.

- `flex-row-reverse` on outer container → moves avatar to right ✓
- `items-end` on content wrapper → aligns the bubble to the right ✓
- Prose/markdown content inside → stays `text-left` ✓ (default, don't override)

```tsx
// After - content wrapper with conditional sky container
<div className={cn('flex-1 min-w-0', isUser && 'flex flex-col items-end')}>
  {/* Role label */}
  <div className={cn(
    'text-sm font-semibold',
    isUser ? 'text-gray-900' : 'text-sky-600'
  )}>
    {isUser ? 'You' : isSystem ? 'System' : 'Guardian'}
  </div>

  {/* Content container - sky-50 for Guardian, plain for user */}
  {/* Note: text-left is implicit, do NOT add text-right for user messages */}
  <div className={cn(!isUser && !isSystem && 'bg-sky-50 rounded-xl p-5 mt-2', (isUser || isSystem) && 'mt-2')}>
    {/* Message content */}
    <div className="prose prose-slate...">
      <ReactMarkdown>...</ReactMarkdown>
    </div>

    {/* Attachments */}
    {attachments.length > 0 && ...}

    {/* Embedded components */}
    {components.length > 0 && ...}

    {/* Copy/Regenerate - NOW INSIDE the sky-50 container */}
    {!isUser && !isSystem && (
      <div className="mt-4 flex items-center gap-2">
        {/* buttons */}
      </div>
    )}
  </div>
</div>
```

### Contrast Note (WCAG Accessibility)

The Guardian role label uses `text-sky-600` (#0284c7) which provides ~4.5:1 contrast ratio on white background, meeting WCAG AA for normal text. Do NOT use `text-sky-500` for small text as it only achieves ~3.0:1 contrast.

### Remove Timestamp (delete lines 165-173)

```tsx
// DELETE THIS BLOCK
{timestamp && (
  <div className="text-xs text-gray-500" aria-label="Message timestamp">
    {new Date(timestamp).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    })}
  </div>
)}
```

## Dependencies

- Story 21.1 (font)

## Estimated Effort

Medium-Large (significant restructure, test updates required)
