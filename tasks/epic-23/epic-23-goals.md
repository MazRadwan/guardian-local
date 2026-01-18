# Epic 23: Login Page Redesign

## Overview

Modernize the Guardian login page using the "Accessible Care" design system. Features Atkinson Hyperlegible font, sky color palette, floating shield animation, and improved visual hierarchy.

## Problem Statement

**Current State:**
- Basic functional login page with minimal styling
- Gray-50 background, no visual branding
- No animations or visual polish
- Missing: forgot password link, show/hide password toggle
- Inconsistent with chat interface design system

**Desired State:**
- Modern, accessible login aligned with Guardian branding
- Sky-500/600 color palette matching chat interface
- Subtle animations (floating logo, pulse ring)
- Complete feature set (forgot password, password toggle, error states)
- Professional first impression for healthcare organizations

---

## Design System: "Accessible Care"

### Font
- **Atkinson Hyperlegible** (already configured in `globals.css`)
- Designed for maximum readability

### Color Palette

| Element | Tailwind Class |
|---------|---------------|
| Page background | `bg-gradient-to-br from-slate-50 via-sky-50/30 to-slate-50` |
| Card background | `bg-white` |
| Primary accent | `sky-500`, `sky-600` |
| Button (soft muted) | `bg-sky-100 text-sky-700 hover:bg-sky-200` |
| Input border | `border-slate-200` → `focus:border-sky-400` |
| Input background | `bg-slate-50/50` → `focus:bg-white` |
| Text primary | `text-slate-800` |
| Text secondary | `text-slate-500`, `text-slate-400` |
| Links | `text-sky-600 hover:text-sky-700` |

### Custom Animations

```css
@keyframes float {
  0%, 100% { transform: translateY(0px); }
  50% { transform: translateY(-8px); }
}

@keyframes pulse-ring {
  0% { transform: scale(1); opacity: 0.4; }
  100% { transform: scale(1.5); opacity: 0; }
}

.animate-float { animation: float 4s ease-in-out infinite; }
.animate-pulse-ring { animation: pulse-ring 2s ease-out infinite; }
```

### Border Radius
- Inputs/buttons: `rounded-xl` (12px)
- Cards: `rounded-2xl` (16px)

### Shadows
- Cards: `shadow-xl shadow-slate-200/50`

### Focus States
- `focus:border-sky-400 focus:ring-4 focus:ring-sky-50`

---

## Component Structure

```
Login Page
├── Logo Section
│   ├── Pulse ring (animated)
│   └── Shield icon container (floating animation)
├── Card
│   ├── Header ("Sign in to your account")
│   ├── Email input (with Mail icon)
│   ├── Password input (with Lock icon + show/hide toggle)
│   ├── Forgot password link
│   ├── Sign in button (soft muted style)
│   └── Create account link
├── Dev Mode Section (conditional, env-based)
│   └── Quick Login button
└── Footer
    └── Privacy / Terms / Support links
```

---

## Scope

### Files to Modify

| File | Changes |
|------|---------|
| `apps/web/src/app/login/page.tsx` | Complete redesign |
| `apps/web/src/app/globals.css` | Add float and pulse-ring animations |
| `apps/web/src/components/auth/DevModeButton.tsx` | Update styling to match new design |

### Dependencies (Already Installed)

- `lucide-react` icons: `ShieldCheck`, `Mail`, `Lock`, `Eye`, `EyeOff`, `Zap`, `Loader2`

### Preserve Existing Functionality

- `useAuth` hook integration
- `apiLogin` API call
- `AuthAPIError` handling
- `DevModeButton` conditional rendering (`NEXT_PUBLIC_ENABLE_DEV_MODE`)
- Router navigation to `/chat` on success
- Link to `/register`

---

## Stories

### Story 23.1: Add Custom Animations to Global CSS

**Description:** Add float and pulse-ring animations to support the new login page design.

**Acceptance Criteria:**
- [ ] `animate-float` class available (4s ease-in-out infinite)
- [ ] `animate-pulse-ring` class available (2s expanding ring)
- [ ] Autofill background prevention CSS added
- [ ] No conflicts with existing animations

**Files Touched:**
- `apps/web/src/app/globals.css`

**Agent:** frontend-agent

---

### Story 23.2: Redesign Login Page Layout and Styling

**Description:** Implement the new visual design for the login page with sky color palette and improved hierarchy.

**Acceptance Criteria:**
- [ ] Gradient background (slate-50 via sky-50/30)
- [ ] Centered card with rounded-2xl and shadow
- [ ] Guardian logo with ShieldCheck icon
- [ ] Floating animation on logo
- [ ] Pulse ring effect behind logo
- [ ] "AI Governance & Risk Assessment" tagline
- [ ] Email input with Mail icon prefix
- [ ] Password input with Lock icon prefix
- [ ] Show/hide password toggle (Eye/EyeOff)
- [ ] Forgot password link (sky-600)
- [ ] Soft muted sign in button (sky-100/sky-700)
- [ ] Create account link
- [ ] Footer with Privacy/Terms/Support links
- [ ] Atkinson Hyperlegible font applied to container

**Files Touched:**
- `apps/web/src/app/login/page.tsx`

**Agent:** frontend-agent

---

### Story 23.3: Update Dev Mode Section Styling

**Description:** Update the DevModeButton component to match the new design system.

**Acceptance Criteria:**
- [ ] Dev mode section has slate-50 background
- [ ] Dashed border style (`border-dashed border-slate-300`)
- [ ] Hover state: `hover:border-sky-400 hover:text-sky-600 hover:bg-sky-50`
- [ ] Zap icon with "Development Mode" label
- [ ] Consistent with card styling

**Files Touched:**
- `apps/web/src/components/auth/DevModeButton.tsx`
- `apps/web/src/app/login/page.tsx` (dev mode section wrapper)

**Agent:** frontend-agent

---

### Story 23.4: Error State Styling

**Description:** Implement error state styling that matches the new design system.

**Acceptance Criteria:**
- [ ] Error message displays below form
- [ ] Red-500 text color for errors
- [ ] Input border changes to red-400 on error
- [ ] Error icon (AlertCircle) included
- [ ] Smooth transition on error appearance

**Files Touched:**
- `apps/web/src/app/login/page.tsx`

**Agent:** frontend-agent

---

### Story 23.5: Loading State and Accessibility

**Description:** Implement loading states and ensure accessibility compliance.

**Acceptance Criteria:**
- [ ] Loader2 spinner with animation during submit
- [ ] "Signing in..." text during loading
- [ ] Button disabled during loading
- [ ] Inputs disabled during loading
- [ ] Focus states visible (ring-4 ring-sky-50)
- [ ] Labels present (can be visually hidden)
- [ ] Form is keyboard navigable
- [ ] Color contrast meets WCAG AA

**Files Touched:**
- `apps/web/src/app/login/page.tsx`

**Agent:** frontend-agent

---

### Story 23.6: Tests for Login Page

**Description:** Add/update tests for the redesigned login page.

**Acceptance Criteria:**
- [ ] Test: renders all form elements
- [ ] Test: email input accepts input
- [ ] Test: password input accepts input
- [ ] Test: password visibility toggle works
- [ ] Test: form submission calls API
- [ ] Test: error state displays on auth failure
- [ ] Test: loading state during submission
- [ ] Test: successful login redirects to /chat
- [ ] Test: dev mode button appears when env enabled

**Files Touched:**
- `apps/web/src/app/login/__tests__/page.test.tsx` (new or update)

**Agent:** frontend-agent

---

### Story 23.7: QA Verification with Chrome DevTools MCP

**Description:** Visual QA verification using Chrome DevTools MCP to confirm the login page matches the mockup design and all interactions work correctly.

**Acceptance Criteria:**
- [ ] Navigate to login page and take screenshot
- [ ] Verify visual elements present:
  - [ ] Guardian logo with shield icon visible
  - [ ] Floating animation active on logo
  - [ ] Pulse ring animation visible
  - [ ] "AI Governance & Risk Assessment" tagline
  - [ ] Email input with Mail icon
  - [ ] Password input with Lock icon
  - [ ] Show/hide password toggle button
  - [ ] "Forgot password?" link
  - [ ] "Sign in" button with correct styling
  - [ ] "Create an account" link
  - [ ] Footer links (Privacy/Terms/Support)
- [ ] Test interactions:
  - [ ] Fill email field and verify value
  - [ ] Fill password field and verify value
  - [ ] Click password toggle and verify type changes
  - [ ] Click Sign in and verify loading state
- [ ] Check console for errors (should be none)
- [ ] Verify no network errors on page load
- [ ] Take final screenshot for documentation
- [ ] Compare against mockup for design fidelity

**QA Steps (Chrome DevTools MCP):**
```
1. navigate_page → http://localhost:3000/login
2. browser_snapshot → Capture initial state
3. browser_take_screenshot → "login-page-initial.png"
4. browser_fill → Email input with test value
5. browser_fill → Password input with test value
6. browser_click → Password visibility toggle
7. browser_take_screenshot → "login-page-filled.png"
8. browser_click → Sign in button
9. browser_take_screenshot → "login-page-loading.png"
10. browser_console_messages → Check for errors
11. browser_network_requests → Verify API calls
```

**Files Touched:**
- None (QA verification only)

**Agent:** qa-agent (manual or Chrome DevTools MCP)

**Prerequisites:**
- Dev server running (`pnpm dev`)
- Stories 23.1-23.5 completed

---

## Non-Goals (Out of Scope)

- Forgot password functionality (link only, no implementation)
- Create account page redesign (separate epic)
- OAuth/SSO integration
- Remember me checkbox
- Multi-factor authentication UI

---

## Dependencies

- Existing `useAuth` hook
- Existing `apiLogin` function
- Existing `DevModeButton` component
- lucide-react (already installed)
- Tailwind CSS v4 (already configured)
- Atkinson Hyperlegible font (already in globals.css)

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Animation performance on low-end devices | CSS animations only, no JS |
| Autofill styling inconsistency | Webkit autofill override CSS |
| Font loading flash | Font already preloaded in layout |
| Breaking existing auth flow | Preserve all existing logic, only change UI |

---

## Architect Review Concerns (2026-01-17)

**Status:** APPROVED WITH WARNINGS

The following concerns were raised during architect review. They are documented here for awareness but do not block implementation given the limited scope of a login page redesign.

### Concerns Noted

| Issue | Description | Decision |
|-------|-------------|----------|
| **Story 23.2 scope** | Contains logo, form, inputs, footer (~150 lines JSX) | Acceptable - single file component, splitting adds coordination overhead |
| **Story 23.6 verbosity** | Full test code embedded (280 lines) | Acceptable - provides clear implementation guidance |
| **Parallelization limits** | Stories 23.4/23.5 both modify `page.tsx` | Run sequentially or coordinate sections manually |
| **Animation conflicts** | No explicit verification against existing animations | Add verification step: check globals.css for fadeIn, pulse-subtle, pulse-shield, shimmer |

### Recommended Improvements (Optional)

1. **Story 23.1:** Add verification step to check animation name conflicts
2. **Stories 23.4/23.5:** Run sequentially (not parallel) since both modify `page.tsx`
3. **Story 23.6:** Consider reducing to skeleton + test categories only
4. **Story 23.7:** Add optional early visual gate after Story 23.2 completes

### Rationale for Proceeding

- Login page is a single ~130 line component
- Splitting into more stories adds coordination overhead without benefit
- Test code in specs provides clear agent guidance
- Sequential execution of 23.4/23.5 is acceptable for this scope

---

## Success Criteria

1. Login page matches mockup design
2. All existing functionality preserved
3. Animations smooth at 60fps
4. Accessible (WCAG AA compliant)
5. Responsive on mobile
6. All tests pass
7. No regressions in auth flow

---

## Sprint Specification

**Sprint file:** `tasks/epic-23/sprint-1.md`

**Story files:**
- `sprint-1-story-1.md` - Add Custom Animations (frontend-agent)
- `sprint-1-story-2.md` - Redesign Login Page Layout (frontend-agent)
- `sprint-1-story-3.md` - Update Dev Mode Section (frontend-agent)
- `sprint-1-story-4.md` - Error State Styling (frontend-agent)
- `sprint-1-story-5.md` - Loading State and Accessibility (frontend-agent)
- `sprint-1-story-6.md` - Tests for Login Page (frontend-agent)
- `sprint-1-story-7.md` - QA Verification with Chrome DevTools MCP (qa-agent)

---

## References

- Mockup: Claude.ai handoff (2026-01-17)
- Design system: "Accessible Care" theme
- Current login: `apps/web/src/app/login/page.tsx`
- Chat interface styling: Reference for consistency
