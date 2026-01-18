# Story 21.2: Add Shield Icon to Sidebar Header

## Description

Add Shield icon next to "Guardian" text in the expanded sidebar header to reinforce brand identity.

## Acceptance Criteria

- [ ] Shield icon (from lucide-react) displayed next to "Guardian" text
- [ ] Icon uses same color as text (`text-gray-900`)
- [ ] Layout: `flex items-center gap-2` with icon before text
- [ ] Only visible when sidebar is expanded (not minimized)
- [ ] No layout shift or visual regression

## Technical Approach

1. Import `Shield` from lucide-react (add to existing imports)
2. Wrap "Guardian" span in a flex container with gap-2
3. Add Shield icon with `h-5 w-5 text-gray-900`
4. Keep existing pl-2 on container

## Files Touched

- `apps/web/src/components/chat/Sidebar.tsx` - Add Shield icon to header (line ~97)

## Agent Assignment

frontend-agent

## Tests Required

- Update `Sidebar.test.tsx` to verify Shield icon renders when expanded
- Test that icon is NOT visible when minimized

## Implementation Details

### Current Code (line 97)

```tsx
<span className="font-semibold text-lg text-gray-900 pl-2">Guardian</span>
```

### Target Code

```tsx
<div className="flex items-center gap-2 pl-2">
  <Shield className="h-5 w-5 text-gray-900" />
  <span className="font-semibold text-lg text-gray-900">Guardian</span>
</div>
```

### Import Addition

```tsx
import { SquarePen, LogOut, Search, PanelLeft, Shield } from 'lucide-react';
```

## Dependencies

- Story 21.1 (font)

## Estimated Effort

Small (single file, minor change)
