# Sprint 1: Login Page Redesign

**Epic:** 23 - Login Page Redesign
**Focus:** Modernize login page with "Accessible Care" design system
**Stories:** 23.1 - 23.7 (7 stories)
**Dependencies:** None (standalone epic)
**Agents:** `frontend-agent` (Stories 1-6), `qa-agent` (Story 7)

---

## Context

Sprint 1 implements a complete visual redesign of the Guardian login page using the "Accessible Care" design system. Features sky color palette, floating shield animation, and improved visual hierarchy.

**Current State:**
- Basic functional login with minimal styling
- Gray-50 background, no visual branding
- No animations or visual polish
- Missing: forgot password link, show/hide password toggle

**Target State:**
- Modern, accessible login aligned with Guardian branding
- Sky-500/600 color palette matching chat interface
- Subtle animations (floating logo, pulse ring)
- Complete feature set (forgot password, password toggle, error states)

---

## Prerequisites

- `lucide-react` installed (already available)
- Tailwind CSS v4 configured (already available)
- Atkinson Hyperlegible font configured in globals.css (already available)

---

## Stories

| Story | Name | Focus | Agent | Dependencies |
|-------|------|-------|-------|--------------|
| **23.1** | Add Custom Animations to Global CSS | CSS animations | frontend-agent | None |
| **23.2** | Redesign Login Page Layout | Main layout and styling | frontend-agent | 23.1 |
| **23.3** | Update Dev Mode Section Styling | DevModeButton redesign | frontend-agent | 23.2 |
| **23.4** | Error State Styling | Error display styling | frontend-agent | 23.2 |
| **23.5** | Loading State and Accessibility | Loading states, a11y | frontend-agent | 23.2 |
| **23.6** | Tests for Login Page | Component tests | frontend-agent | 23.2-23.5 |
| **23.7** | QA Verification with Chrome DevTools MCP | Visual QA | qa-agent | 23.1-23.6 |

---

## Dependency Graph

```
                    SPRINT 1 DEPENDENCIES

    Story 23.1: CSS Animations (globals.css)
        │
        ▼
    Story 23.2: Login Page Layout (page.tsx) ◄── Main work
        │
        ├──► Story 23.3: Dev Mode Styling (DevModeButton.tsx)
        │
        ├──► Story 23.4: Error State Styling (page.tsx)
        │
        └──► Story 23.5: Loading State & A11y (page.tsx)
                │
                ▼
    Story 23.6: Tests (page.test.tsx)
        │
        ▼
    Story 23.7: QA Verification (Chrome DevTools MCP)
```

---

## Parallel Execution Strategy

### Phase 1: Foundation (Sequential)
- **23.1** → CSS animations (globals.css)
- **23.2** → Main layout (page.tsx) - depends on 23.1

### Phase 2: Enhancements (Mixed)
After 23.2 completes:
- **23.3** → DevModeButton.tsx (separate file) - CAN run parallel
- **23.4** → Error states in page.tsx - SEQUENTIAL
- **23.5** → Loading states in page.tsx - SEQUENTIAL (after 23.4)

**Architect Note:** Stories 23.4 and 23.5 both modify page.tsx - run sequentially to avoid merge conflicts.

### Phase 3: Verification (Sequential)
- **23.6** → Tests (after 23.2-23.5 complete)
- **23.7** → QA verification (after all stories complete)

---

## Story Files

| Story | File | Agent |
|-------|------|-------|
| 23.1 | `sprint-1-story-1.md` | frontend-agent |
| 23.2 | `sprint-1-story-2.md` | frontend-agent |
| 23.3 | `sprint-1-story-3.md` | frontend-agent |
| 23.4 | `sprint-1-story-4.md` | frontend-agent |
| 23.5 | `sprint-1-story-5.md` | frontend-agent |
| 23.6 | `sprint-1-story-6.md` | frontend-agent |
| 23.7 | `sprint-1-story-7.md` | qa-agent |

---

## Files to Modify

| File | Stories | Changes |
|------|---------|---------|
| `apps/web/src/app/globals.css` | 23.1 | Add float and pulse-ring animations |
| `apps/web/src/app/login/page.tsx` | 23.2, 23.4, 23.5 | Complete redesign |
| `apps/web/src/components/auth/DevModeButton.tsx` | 23.3 | Update styling |
| `apps/web/src/app/login/__tests__/page.test.tsx` | 23.6 | New test file |

---

## Success Criteria

- [ ] Login page matches mockup design
- [ ] Floating animation on shield logo
- [ ] Pulse ring effect behind logo
- [ ] Sky color palette applied
- [ ] Show/hide password toggle works
- [ ] Forgot password link present
- [ ] Error states styled correctly
- [ ] Loading states with spinner
- [ ] DevModeButton matches new design
- [ ] All tests pass
- [ ] WCAG AA accessibility compliance
- [ ] No console errors

---

## Exit Criteria

Sprint 1 is complete when:

- [ ] Story 23.1: Animations in globals.css
- [ ] Story 23.2: Login page redesigned
- [ ] Story 23.3: DevModeButton styled
- [ ] Story 23.4: Error states implemented
- [ ] Story 23.5: Loading and accessibility complete
- [ ] Story 23.6: All tests passing
- [ ] Story 23.7: QA verification passed
- [ ] All existing auth functionality preserved
- [ ] No regressions in auth flow
