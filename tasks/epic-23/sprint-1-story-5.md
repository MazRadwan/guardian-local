# Story 23.5: Loading State and Accessibility

**Sprint:** 1
**Epic:** 23 - Login Page Redesign
**Agent:** frontend-agent
**Dependencies:** Story 23.2 (Login page layout)

---

## Description

### What
Implement loading states during form submission and ensure the login page meets WCAG AA accessibility standards.

### Why
Loading feedback prevents user confusion during authentication. Accessibility ensures the login page is usable by all users, including those using assistive technologies.

---

## Acceptance Criteria

### Loading States
- [ ] Loader2 spinner displays during form submission
- [ ] "Signing in..." text replaces "Sign in" during loading
- [ ] Button is disabled during loading
- [ ] Inputs are disabled during loading (already implemented)
- [ ] Cursor changes to not-allowed when disabled

### Accessibility
- [ ] Focus states visible on all interactive elements (ring-4 ring-sky-50)
- [ ] Labels present for all inputs (sr-only for visual hidden)
- [ ] Form is fully keyboard navigable
- [ ] Color contrast meets WCAG AA (4.5:1 for text, 3:1 for UI)
- [ ] Error messages announced to screen readers (role="alert")
- [ ] Password toggle has aria-label
- [ ] Reduced motion respected (prefers-reduced-motion)

---

## Technical Approach

### Step 1: Update Submit Button with Loading State

**File:** `apps/web/src/app/login/page.tsx`

```tsx
<button
  type="submit"
  disabled={isLoading}
  className="w-full py-3 bg-sky-100 text-sky-700 font-medium rounded-xl hover:bg-sky-200 focus:outline-none focus:ring-4 focus:ring-sky-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
>
  {isLoading ? (
    <>
      <Loader2 className="h-5 w-5 animate-spin" />
      <span>Signing in...</span>
    </>
  ) : (
    <span>Sign in</span>
  )}
</button>
```

### Step 2: Ensure Loader2 is Imported

Already included in Story 23.2 imports:
```tsx
import { ..., Loader2 } from 'lucide-react';
```

### Step 3: Add Form Accessibility Attributes

```tsx
<form
  onSubmit={handleSubmit}
  className="space-y-5"
  aria-label="Sign in form"
>
```

### Step 4: Verify Input Labels

Ensure sr-only labels are present (from Story 23.2):
```tsx
<label htmlFor="email" className="sr-only">Email address</label>
<label htmlFor="password" className="sr-only">Password</label>
```

### Step 5: Verify Password Toggle Accessibility

From Story 23.2:
```tsx
<button
  type="button"
  onClick={() => setShowPassword(!showPassword)}
  aria-label={showPassword ? 'Hide password' : 'Show password'}
  // ...
>
```

### Step 6: Add Skip Link (Optional Enhancement)

Add before main content for keyboard users:
```tsx
<a
  href="#main-content"
  className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:bg-white focus:px-4 focus:py-2 focus:rounded-lg focus:shadow-lg focus:text-sky-600"
>
  Skip to main content
</a>

<main id="main-content" className="...">
```

---

## Files Touched

- `apps/web/src/app/login/page.tsx` - Loading states and accessibility improvements

---

## Tests Required

Covered in Story 23.6:
- Test: loading state during submission
- Test: button disabled during loading
- Test: form is keyboard navigable
- Test: labels present for inputs

---

## Verification Commands

```bash
# Build check
pnpm --filter @guardian/web build

# Accessibility audit (manual)
# 1. Use keyboard only to navigate form
# 2. Use browser accessibility inspector
# 3. Check color contrast with DevTools

# Lighthouse audit
# 1. Open DevTools > Lighthouse
# 2. Run accessibility audit
# 3. Target: 90+ score
```

---

## Accessibility Checklist

| Element | Requirement | Status |
|---------|-------------|--------|
| Email input | label, id, required | From 23.2 |
| Password input | label, id, required | From 23.2 |
| Password toggle | aria-label | From 23.2 |
| Submit button | disabled state, loading text | This story |
| Error message | role="alert" | From 23.4 |
| Focus indicators | visible ring | All elements |
| Keyboard nav | Tab order correct | Verify |
| Color contrast | 4.5:1 minimum | Verify |

---

## Notes for Agent

1. **flex items-center justify-center gap-2** - Button needs flex for spinner alignment
2. **animate-spin** - Tailwind class for Loader2 rotation
3. **aria-label dynamic** - Changes based on password visibility state
4. **Skip link optional** - Nice to have for keyboard users
5. **Focus states already set** - ring-4 ring-sky-50 in all interactive elements
