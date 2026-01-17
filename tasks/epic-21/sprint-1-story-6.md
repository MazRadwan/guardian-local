# Story 21.6: Restyle Progress Spinner

## Description

Update RotatingStatus spinner and container to use sky-blue theme.

## Acceptance Criteria

- [ ] Spinner color: `text-sky-600` (not purple-600)
- [ ] Container background: `bg-sky-50` (not gray-50)
- [ ] Consistent with Guardian message styling
- [ ] All existing functionality preserved (rotating messages, status states)

## Technical Approach

1. Update Loader2 className: text-purple-600 -> text-sky-600
2. Update container div: bg-gray-50 -> bg-sky-50
3. Optionally add rounded-xl for consistency with message containers

## Files Touched

- `apps/web/src/components/chat/RotatingStatus.tsx` - Update colors (line 64-66)

## Agent Assignment

frontend-agent

## Tests Required

- No dedicated test file exists; add basic test or visual verification
- Verify spinner has sky-600 color
- Verify container has sky-50 background

## Implementation Details

### Current Code (lines 63-70)

```tsx
return (
  <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-lg">
    {isLoading && (
      <Loader2 className="h-5 w-5 text-purple-600 animate-spin flex-shrink-0" />
    )}
    <span className="text-gray-700">{displayMessage}</span>
  </div>
);
```

### Target Code

```tsx
return (
  <div className="flex items-center gap-3 p-4 bg-sky-50 rounded-xl">
    {isLoading && (
      <Loader2 className="h-5 w-5 text-sky-600 animate-spin flex-shrink-0" />
    )}
    <span className="text-gray-700">{displayMessage}</span>
  </div>
);
```

### Changes Summary

| Property | Before | After |
|----------|--------|-------|
| Container bg | `bg-gray-50` | `bg-sky-50` |
| Container rounded | `rounded-lg` | `rounded-xl` |
| Spinner color | `text-purple-600` | `text-sky-600` |

## Dependencies

- None (independent styling)

## Estimated Effort

Small (single file, 2 line changes)
