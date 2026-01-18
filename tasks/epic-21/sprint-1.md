# Epic 21 Sprint 1: Chat Stream Restyling

## Sprint Overview

**Goal:** Restyle the chat UI from ChatGPT-clone aesthetic to distinctive Guardian identity using sky-blue color palette.

**Duration:** Single sprint (8 stories)

**Agent Assignment:** All stories assigned to `frontend-agent`

---

## Stories

### Story 21.1: Add Font and Animations to Global Styles

**Description:** Add Atkinson Hyperlegible font import and custom animations (pulse-shield, shimmer) to globals.css. This is the foundation for all other visual changes.

**Acceptance Criteria:**
- [ ] Atkinson Hyperlegible font imported from Google Fonts
- [ ] Font applied globally to body with sans-serif fallback
- [ ] `pulse-shield` keyframe animation defined (scale 1 to 1.18, sky-blue glow)
- [ ] `shimmer` keyframe animation defined (background sweep 200% to -200%)
- [ ] Utility classes `.animate-pulse-shield` and `.animate-shimmer` available
- [ ] No visual regressions in existing UI

**Technical Approach:**
1. Add Google Fonts import for Atkinson Hyperlegible at top of globals.css
2. Add `font-family: 'Atkinson Hyperlegible', sans-serif` to body in @layer base
3. Add pulse-shield keyframes: scale(1) to scale(1.18), box-shadow with rgba(14, 165, 233, 0.5)
4. Add shimmer keyframes: background-position 200% 0 to -200% 0
5. Add utility classes for both animations

**Files Touched:**
- `apps/web/src/app/globals.css` - Add font import and animations

**Agent Assignment:** frontend-agent

**Tests Required:**
- Visual verification only (CSS changes)
- Snapshot test update if applicable

---

### Story 21.2: Add Shield Icon to Sidebar Header

**Description:** Add Shield icon next to "Guardian" text in the expanded sidebar header to reinforce brand identity.

**Acceptance Criteria:**
- [ ] Shield icon (from lucide-react) displayed next to "Guardian" text
- [ ] Icon uses same color as text (`text-gray-900`)
- [ ] Layout: `flex items-center gap-2` with icon before text
- [ ] Only visible when sidebar is expanded (not minimized)
- [ ] No layout shift or visual regression

**Technical Approach:**
1. Import `Shield` from lucide-react (add to existing imports)
2. Wrap "Guardian" span in a flex container with gap-2
3. Add Shield icon with `h-5 w-5 text-gray-900`
4. Keep existing pl-2 on container

**Files Touched:**
- `apps/web/src/components/chat/Sidebar.tsx` - Add Shield icon to header (line ~97)

**Agent Assignment:** frontend-agent

**Tests Required:**
- Update `Sidebar.test.tsx` to verify Shield icon renders when expanded
- Test that icon is NOT visible when minimized

---

### Story 21.3: Restyle ChatMessage Component

**Description:** Major restructure of ChatMessage component to implement Guardian visual identity with sky-blue containers, right-aligned user messages, and updated avatars.

**Acceptance Criteria:**
- [ ] Guardian messages wrapped in `bg-sky-50 rounded-xl p-5` container
- [ ] User messages right-aligned with `flex-row-reverse`
- [ ] Guardian avatar: `w-10 h-10 bg-sky-500` with ShieldCheck icon (white)
- [ ] User avatar: `w-10 h-10 bg-sky-100` with User icon (sky-600)
- [ ] Guardian label uses `text-sky-600`
- [ ] Timestamps removed from all messages
- [ ] Copy/Regenerate buttons inside sky-50 container (not outside)
- [ ] All existing functionality preserved (copy, regenerate, attachments, components)

**Technical Approach:**
1. Import `ShieldCheck` from lucide-react, keep `User`
2. Update outer container: remove bg-gray-50/bg-white, add flex-row-reverse for user
3. Update avatar sizes from h-8 w-8 to w-10 h-10
4. Guardian avatar: bg-purple-600 -> bg-sky-500, Bot -> ShieldCheck
5. User avatar: bg-blue-600 -> bg-sky-100, icon text-white -> text-sky-600
6. Add content wrapper with conditional sky-50 container for Guardian messages
7. Remove timestamp rendering (lines 165-173)
8. Move Copy/Regenerate buttons inside sky-50 container

**Files Touched:**
- `apps/web/src/components/chat/ChatMessage.tsx` - Major restructure (lines 79-215)

**Agent Assignment:** frontend-agent

**Tests Required:**
- Update `ChatMessage.test.tsx` for new class names and structure
- Test Guardian message has sky-50 container
- Test user message is right-aligned
- Test timestamps are not rendered
- Test avatars have correct colors and icons

---

### Story 21.4: Restyle Typing Indicator

**Description:** Replace bouncing dots with pulsing shield avatar and shimmer "Guardian is thinking..." text.

**Acceptance Criteria:**
- [ ] Avatar: `w-10 h-10 bg-sky-500` circle with ShieldCheck icon (white)
- [ ] Avatar has `animate-pulse-shield` class for pulsing effect
- [ ] Text: "Guardian is thinking..." with shimmer gradient
- [ ] Shimmer gradient: `from-slate-500 via-sky-400 to-slate-500`
- [ ] Text uses `bg-clip-text text-transparent animate-shimmer`
- [ ] Background size inline style: `200% 100%`
- [ ] Old bouncing dots removed

**Technical Approach:**
1. Import `ShieldCheck` from lucide-react
2. Replace entire typing indicator div (lines 249-270)
3. New structure: flex container with pulsing avatar + shimmer text
4. Avatar uses animate-pulse-shield class (defined in globals.css)
5. Text uses bg-gradient-to-r with animate-shimmer class
6. Add inline style for backgroundSize

**Files Touched:**
- `apps/web/src/components/chat/MessageList.tsx` - Replace typing indicator (lines 249-270)

**Agent Assignment:** frontend-agent

**Tests Required:**
- Update `MessageList.test.tsx` for typing indicator changes
- Test that typing indicator has ShieldCheck icon
- Test that text contains "Guardian is thinking..."
- Test that bouncing dots are removed

---

### Story 21.5: Restyle File Attachment Chips

**Description:** Update FileChipInChat styling to use white/slate/sky color scheme.

**Acceptance Criteria:**
- [ ] Container: `bg-white border border-slate-200` (not gray)
- [ ] Icon background: `bg-sky-500` (not blue-500)
- [ ] Type label: `text-sky-500` (not gray-500)
- [ ] Hover state: `hover:bg-slate-50` or similar subtle effect
- [ ] All existing functionality preserved (click to download)

**Technical Approach:**
1. Update button className: bg-gray-100 -> bg-white, border-gray-200 -> border-slate-200
2. Update icon div: bg-blue-500 -> bg-sky-500
3. Update type label span: text-gray-500 -> text-sky-500
4. Adjust hover state for white background

**Files Touched:**
- `apps/web/src/components/chat/FileChipInChat.tsx` - Update colors (lines 36-61)

**Agent Assignment:** frontend-agent

**Tests Required:**
- Update `FileChipInChat.test.tsx` for new class names
- Test container has white background
- Test icon has sky-500 background
- Test type label has sky-500 text color

---

### Story 21.6: Restyle Progress Spinner

**Description:** Update RotatingStatus spinner and container to use sky-blue theme.

**Acceptance Criteria:**
- [ ] Spinner color: `text-sky-600` (not purple-600)
- [ ] Container background: `bg-sky-50` (not gray-50)
- [ ] Consistent with Guardian message styling
- [ ] All existing functionality preserved (rotating messages, status states)

**Technical Approach:**
1. Update Loader2 className: text-purple-600 -> text-sky-600
2. Update container div: bg-gray-50 -> bg-sky-50
3. Optionally add rounded-xl for consistency with message containers

**Files Touched:**
- `apps/web/src/components/chat/RotatingStatus.tsx` - Update colors (line 64-66)

**Agent Assignment:** frontend-agent

**Tests Required:**
- No dedicated test file exists; add basic test or visual verification
- Verify spinner has sky-600 color
- Verify container has sky-50 background

---

### Story 21.7: Add Canvas Header Logo

**Description:** Add Guardian branding (Shield icon + "Guardian" text) to main canvas when sidebar is minimized.

**Acceptance Criteria:**
- [ ] Shield icon (NOT ShieldCheck) with `h-6 w-6 text-sky-500`
- [ ] "Guardian" text with `text-lg font-semibold text-gray-900`
- [ ] Layout: `flex items-center gap-2`
- [ ] Position: `absolute top-4 left-4` on main content area
- [ ] Only visible when `isMinimized` is true
- [ ] Hidden when sidebar is expanded

**Technical Approach:**
1. Import `Shield` from lucide-react
2. ChatInterface needs access to isMinimized state (check if already available via props/context)
3. Add conditional rendering: `{isMinimized && <logo/>}`
4. Position absolute with z-index to not interfere with messages

**Files Touched:**
- `apps/web/src/components/chat/ChatInterface.tsx` - Add Guardian logo when sidebar minimized
- May need to pass `isMinimized` prop if not already available

**Agent Assignment:** frontend-agent

**Tests Required:**
- Test that logo is visible when sidebar is minimized
- Test that logo is hidden when sidebar is expanded
- Add to ChatInterface.core.test.tsx or create dedicated test

---

### Story 21.8: Update Related Component Avatars

**Description:** Update VendorClarificationCard and vendor clarification container in MessageList to use sky-blue avatar styling for consistency.

**Acceptance Criteria:**
- [ ] VendorClarificationCard container uses sky-500 avatar with ShieldCheck
- [ ] MessageList vendor clarification div (lines 273-288) uses new avatar style
- [ ] Consistent w-10 h-10 sizing
- [ ] No functional changes to clarification behavior

**Technical Approach:**
1. MessageList vendor clarification container (lines 277-280): Update avatar from purple-600 to sky-500, add ShieldCheck icon
2. Review if VendorClarificationCard uses its own avatar or inherits
3. Ensure consistency across all Guardian-branded avatars

**Files Touched:**
- `apps/web/src/components/chat/MessageList.tsx` - Update vendor clarification avatar (lines 273-288)
- `apps/web/src/components/chat/VendorClarificationCard.tsx` - Update if needed

**Agent Assignment:** frontend-agent

**Tests Required:**
- Update MessageList.test.tsx if vendor clarification tests exist
- Visual verification of consistency

---

## Dependencies

```
Story 21.1 (globals.css)
    |
    v
Story 21.2 (Sidebar) ----+
    |                    |
    v                    |
Story 21.3 (ChatMessage) |
    |                    |
    v                    v
Story 21.4 (MessageList typing) <-- depends on 21.1 animations
    |
    v
Story 21.5 (FileChipInChat) -- independent
    |
    v
Story 21.6 (RotatingStatus) -- independent
    |
    v
Story 21.7 (ChatInterface) -- independent
    |
    v
Story 21.8 (Related components) -- depends on 21.3 patterns
```

**Parallelization:**
- Stories 21.5, 21.6, 21.7 can run in parallel (no file conflicts)
- **Important:** Stories 21.4 and 21.8 both modify MessageList.tsx (different sections, but same file)
  - Run 21.4 first (typing indicator), then 21.8 (vendor clarification)
  - Both need `ShieldCheck` import - second story can reuse the import
- Story 21.8 should run after 21.3 and 21.4 to ensure pattern consistency

---

## Risk Considerations

1. **Test Breakage:** Tests assert on specific class names - all must be updated
2. **Accessibility:** Ensure color contrast ratios (sky-500 on white, white on sky-500)
3. **Shimmer Animation:** Complex gradient animation - verify browser compatibility
4. **ChatInterface isMinimized:** May need prop threading from parent layout

---

## Success Criteria

- [ ] All chat messages use new sky-blue color palette
- [ ] Guardian messages have rounded sky-50 containers
- [ ] User messages are right-aligned with avatar on right
- [ ] Timestamps removed from all messages
- [ ] Copy/Regenerate buttons inside Guardian message container
- [ ] File attachments use white/slate/sky styling
- [ ] Typing indicator uses pulsing shield + shimmer text
- [ ] Progress spinner uses sky-blue
- [ ] Expanded sidebar header shows Shield icon + "Guardian" text
- [ ] Canvas shows Shield + "Guardian" logo when sidebar is minimized
- [ ] Atkinson Hyperlegible font applied globally
- [ ] All existing tests pass (updated as needed)
- [ ] No accessibility regressions

---

*Sprint created: 2026-01-17*
