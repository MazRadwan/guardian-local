# Story 23.1: Add Custom Animations to Global CSS

**Sprint:** 1
**Epic:** 23 - Login Page Redesign
**Agent:** frontend-agent
**Dependencies:** None

---

## Description

### What
Add CSS keyframe animations to support the new login page design: floating animation for the shield logo and pulse-ring effect for the background ring.

### Why
The "Accessible Care" design system uses subtle animations to create visual polish and a professional first impression. These animations enhance the brand identity without impacting accessibility.

---

## Acceptance Criteria

- [ ] `@keyframes float` animation defined (4s ease-in-out infinite, 8px translateY)
- [ ] `@keyframes pulse-ring` animation defined (2s expanding ring with fade)
- [ ] `.animate-float` utility class available
- [ ] `.animate-pulse-ring` utility class available
- [ ] Webkit autofill background prevention CSS added
- [ ] **VERIFY:** No conflicts with existing animations (fadeIn, pulse-subtle, pulse-shield, shimmer)
- [ ] Animations use `prefers-reduced-motion` media query for accessibility

### Animation Conflict Verification (Architect Requirement)

Before adding new animations, verify these existing animations in globals.css:
- `fadeIn` - Used for UI transitions
- `pulse-subtle` - Used for progress messages
- `pulse-shield` - Used for avatar animation
- `shimmer` - Used for text effects

New animation names (`float`, `pulse-ring`) must not conflict with above.

---

## Technical Approach

### Step 1: Add Float Animation

Add to `@layer utilities` section in globals.css:

```css
/* Epic 23: Login page floating animation */
@keyframes float {
  0%, 100% { transform: translateY(0px); }
  50% { transform: translateY(-8px); }
}

.animate-float {
  animation: float 4s ease-in-out infinite;
}
```

### Step 2: Add Pulse Ring Animation

```css
/* Epic 23: Login page pulse ring effect */
@keyframes pulse-ring {
  0% {
    transform: scale(1);
    opacity: 0.4;
  }
  100% {
    transform: scale(1.5);
    opacity: 0;
  }
}

.animate-pulse-ring {
  animation: pulse-ring 2s ease-out infinite;
}
```

### Step 3: Add Autofill Prevention

```css
/* Epic 23: Prevent autofill background color flash */
input:-webkit-autofill,
input:-webkit-autofill:hover,
input:-webkit-autofill:focus {
  -webkit-box-shadow: 0 0 0 1000px white inset;
  transition: background-color 5000s ease-in-out 0s;
}
```

### Step 4: Add Reduced Motion Support

```css
/* Epic 23: Respect user motion preferences */
@media (prefers-reduced-motion: reduce) {
  .animate-float,
  .animate-pulse-ring {
    animation: none;
  }
}
```

---

## Files Touched

- `apps/web/src/app/globals.css` - Add animations to @layer utilities section

---

## Tests Required

No unit tests needed for CSS animations. Verification:

1. **Build verification:** `pnpm --filter @guardian/web build` should complete without errors
2. **Visual verification:** Animations visible on login page (Story 23.7 QA)
3. **A11y verification:** Animations respect `prefers-reduced-motion`

---

## Verification Commands

```bash
# TypeScript/Build check
pnpm --filter @guardian/web build

# Expected: Build succeeds, no CSS errors
```

---

## Notes for Agent

1. **Location:** Add animations AFTER existing animations in `@layer utilities` (after line 76)
2. **Order:** float, pulse-ring, autofill prevention, reduced-motion
3. **No conflicts:** Existing animations: fadeIn, pulse-subtle, pulse-shield, shimmer
4. **Accessibility:** Always include reduced-motion media query for new animations
