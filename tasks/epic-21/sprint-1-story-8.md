# Story 21.8: Update Related Component Avatars

## Description

Update VendorClarificationCard and vendor clarification container in MessageList to use sky-blue avatar styling for consistency.

## Acceptance Criteria

- [ ] VendorClarificationCard container uses sky-500 avatar with ShieldCheck
- [ ] MessageList vendor clarification div (lines 273-288) uses new avatar style
- [ ] Consistent w-10 h-10 sizing
- [ ] No functional changes to clarification behavior

## Technical Approach

1. MessageList vendor clarification container (lines 277-280): Update avatar from purple-600 to sky-500, add ShieldCheck icon
2. Review if VendorClarificationCard uses its own avatar or inherits
3. Ensure consistency across all Guardian-branded avatars

## Files Touched

- `apps/web/src/components/chat/MessageList.tsx` - Update vendor clarification avatar (lines 273-288)

**Note:** VendorClarificationCard.tsx does NOT have its own avatar - the avatar is rendered in the MessageList wrapper. No changes needed to VendorClarificationCard itself.

## Agent Assignment

frontend-agent

## Tests Required

- Update MessageList.test.tsx if vendor clarification tests exist
- Visual verification of consistency

## Implementation Details

### MessageList Vendor Clarification (lines 273-288)

#### Current Code

```tsx
{/* Epic 18.4.2b: Vendor clarification card - shows when multiple vendors detected */}
{vendorClarification && (
  <div className="py-4" data-testid="vendor-clarification-container">
    <div className="flex gap-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-purple-600 text-white">
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" />
        </svg>
      </div>
      <VendorClarificationCard
        payload={vendorClarification.payload}
        onSelectVendor={vendorClarification.onSelectVendor}
      />
    </div>
  </div>
)}
```

#### Target Code

```tsx
{/* Epic 18.4.2b: Vendor clarification card - shows when multiple vendors detected */}
{vendorClarification && (
  <div className="py-4" data-testid="vendor-clarification-container">
    <div className="flex gap-3">
      <div className="flex w-10 h-10 shrink-0 items-center justify-center rounded-full bg-sky-500">
        <ShieldCheck className="h-5 w-5 text-white" />
      </div>
      <VendorClarificationCard
        payload={vendorClarification.payload}
        onSelectVendor={vendorClarification.onSelectVendor}
      />
    </div>
  </div>
)}
```

### Changes Summary

| Element | Before | After |
|---------|--------|-------|
| Avatar size | `h-8 w-8` | `w-10 h-10` |
| Avatar bg | `bg-purple-600` | `bg-sky-500` |
| Avatar icon | SVG circle | `ShieldCheck` component |

### VendorClarificationCard Review

Check if `VendorClarificationCard.tsx` renders its own avatar or relies on the wrapper. If it has internal avatar styling, update for consistency.

## Dependencies

- Story 21.3 (ChatMessage patterns) - for consistency
- Story 21.4 (MessageList already has ShieldCheck import after this story)

## Estimated Effort

Small (localized change, pattern already established)
