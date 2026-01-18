# Story 21.4: Restyle Typing Indicator

## Description

Replace bouncing dots with pulsing shield avatar and shimmer "Guardian is thinking..." text.

## Acceptance Criteria

- [ ] Avatar: `w-10 h-10 bg-sky-500` circle with ShieldCheck icon (white)
- [ ] Avatar has `animate-pulse-shield` class for pulsing effect
- [ ] Text: "Guardian is thinking..." with shimmer gradient
- [ ] Shimmer gradient: `from-slate-500 via-sky-400 to-slate-500`
- [ ] Text uses `bg-clip-text text-transparent animate-shimmer`
- [ ] Background size inline style: `200% 100%`
- [ ] Old bouncing dots removed

## Technical Approach

1. Import `ShieldCheck` from lucide-react
2. Replace entire typing indicator div (lines 249-270)
3. New structure: flex container with pulsing avatar + shimmer text
4. Avatar uses animate-pulse-shield class (defined in globals.css)
5. Text uses bg-gradient-to-r with animate-shimmer class
6. Add inline style for backgroundSize

## Files Touched

- `apps/web/src/components/chat/MessageList.tsx` - Replace typing indicator (lines 249-270)

## Agent Assignment

frontend-agent

## Tests Required

- Update `MessageList.test.tsx` for typing indicator changes
- Test that typing indicator has ShieldCheck icon
- Test that text contains "Guardian is thinking..."
- Test that bouncing dots are removed

### Critical: Preserve data-testid

The new typing indicator MUST keep `data-testid="typing-indicator"` - multiple tests rely on this:
- Line 109: `screen.getByTestId('typing-indicator')`
- Line 219: typing indicator inside centered container
- Lines 538-567: typing indicator positioning tests

## Implementation Details

### Import Addition

```tsx
import { ChevronDown, ShieldCheck } from 'lucide-react';
```

### Current Typing Indicator (lines 249-270)

```tsx
{isLoading && (
  <div data-testid="typing-indicator" className="flex gap-3 py-6">
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-purple-600 text-white">
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" />
      </svg>
    </div>
    <div className="flex items-center gap-1 py-2">
      <span
        className="h-2 w-2 rounded-full bg-gray-400 animate-bounce"
        style={{ animationDelay: '0ms', animationDuration: '1s' }}
      ></span>
      <span
        className="h-2 w-2 rounded-full bg-gray-400 animate-bounce"
        style={{ animationDelay: '150ms', animationDuration: '1s' }}
      ></span>
      <span
        className="h-2 w-2 rounded-full bg-gray-400 animate-bounce"
        style={{ animationDelay: '300ms', animationDuration: '1s' }}
      ></span>
    </div>
  </div>
)}
```

### Target Typing Indicator

```tsx
{isLoading && (
  <div data-testid="typing-indicator" className="flex items-center gap-3 py-6">
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
)}
```

## Dependencies

- Story 21.1 (animations: animate-pulse-shield, animate-shimmer)

## Estimated Effort

Small (single file, localized change)
