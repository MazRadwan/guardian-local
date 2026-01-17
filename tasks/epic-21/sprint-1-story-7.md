# Story 21.7: Add Canvas Header Logo

## Description

Add Guardian branding (Shield icon + "Guardian" text) to main canvas when sidebar is minimized.

## Acceptance Criteria

- [ ] Shield icon (NOT ShieldCheck) with `h-6 w-6 text-sky-500`
- [ ] "Guardian" text with `text-lg font-semibold text-gray-900`
- [ ] Layout: `flex items-center gap-2`
- [ ] Position: `absolute top-4 left-4` on main content area
- [ ] Only visible when `isMinimized` is true
- [ ] Hidden when sidebar is expanded

## Technical Approach

1. Import `Shield` from lucide-react
2. Add store selector: `const sidebarMinimized = useChatStore((state) => state.sidebarMinimized);`
3. Add conditional rendering: `{sidebarMinimized && <logo/>}`
4. Position absolute with z-index to not interfere with messages

**Note:** `sidebarMinimized` is already available in `useChatStore` (line 28 in chatStore.ts). No prop threading required.

## Files Touched

- `apps/web/src/components/chat/ChatInterface.tsx` - Add Guardian logo when sidebar minimized (store selector + JSX)

## Agent Assignment

frontend-agent

## Tests Required

- Test that logo is visible when sidebar is minimized
- Test that logo is hidden when sidebar is expanded
- Add to ChatInterface.core.test.tsx or create dedicated test

## Implementation Details

### Import Addition

```tsx
import { AlertCircle, Shield } from 'lucide-react';
```

### Store Selector Addition

```tsx
// Add near other useChatStore selectors (around line 43)
const sidebarMinimized = useChatStore((state) => state.sidebarMinimized);
```

### Target JSX (add after error banner, before content)

```tsx
{/* Guardian logo - visible when sidebar minimized */}
{sidebarMinimized && (
  <div className="absolute top-4 left-4 z-10 flex items-center gap-2">
    <Shield className="h-6 w-6 text-sky-500" />
    <span className="text-lg font-semibold text-gray-900">Guardian</span>
  </div>
)}
```

### Positioning Notes

- `absolute` positioning requires the parent `<div className="flex h-full flex-col relative">` to have `relative` (already present)
- `z-10` ensures logo appears above content but below modals
- `top-4 left-4` positions it in upper-left corner with standard spacing

### Overlay/Click Interception Consideration

The logo uses `absolute` positioning in the header area. To prevent accidental click interception on underlying content:

1. **Preferred approach**: Position within existing header row structure (if one exists) so it flows naturally without overlap
2. **If overlap is possible**: Add `pointer-events-none` to the container, or ensure sufficient spacing (`top-4 left-4` provides 16px margin)
3. **Current implementation**: The `top-4 left-4` positioning places the logo in the corner where no interactive content typically exists, so overlap is unlikely

If testing reveals click issues, add `pointer-events-none` to make the logo non-interactive (it's purely decorative branding).

## Dependencies

- None (independent)

## Estimated Effort

Small (store selector already available, just add JSX)
