# Story 23.4: Error State Styling

**Sprint:** 1
**Epic:** 23 - Login Page Redesign
**Agent:** frontend-agent
**Dependencies:** Story 23.2 (Login page layout)

---

## Description

### What
Implement error state styling for the login form that matches the new design system.

### Why
Error messages should be clearly visible and accessible while maintaining visual consistency with the redesigned login page.

---

## Acceptance Criteria

- [ ] Error message displays below form header, above inputs
- [ ] Red-50 background with rounded corners
- [ ] Red-500 text color for error message
- [ ] AlertCircle icon included
- [ ] Smooth transition on error appearance (fade in)
- [ ] Input borders change to red-300 on error (optional enhancement)
- [ ] Error clears when user starts typing (existing behavior)

---

## Technical Approach

### Step 1: Add Error Display Section

**File:** `apps/web/src/app/login/page.tsx`

Add after the "Sign in to your account" heading, before the form inputs:

```tsx
{/* Error message */}
{error && (
  <div
    className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm animate-fadeIn"
    role="alert"
  >
    <AlertCircle className="h-5 w-5 flex-shrink-0 text-red-500" />
    <span>{error}</span>
  </div>
)}
```

### Step 2: Add Error State to Inputs (Enhancement)

**Email input with error state:**
```tsx
<input
  // ... existing props
  className={`w-full pl-10 pr-4 py-3 bg-slate-50/50 border rounded-xl text-slate-800 placeholder:text-slate-400 focus:bg-white focus:border-sky-400 focus:ring-4 focus:ring-sky-50 focus:outline-none transition-colors disabled:opacity-50 ${
    error ? 'border-red-300' : 'border-slate-200'
  }`}
/>
```

**Password input with error state:**
```tsx
<input
  // ... existing props
  className={`w-full pl-10 pr-12 py-3 bg-slate-50/50 border rounded-xl text-slate-800 placeholder:text-slate-400 focus:bg-white focus:border-sky-400 focus:ring-4 focus:ring-sky-50 focus:outline-none transition-colors disabled:opacity-50 ${
    error ? 'border-red-300' : 'border-slate-200'
  }`}
/>
```

### Step 3: Verify Existing Error Clearing

Existing code clears error on form submit. Optionally add clearing on input change:

```tsx
// In handleSubmit - already exists
setError(null);

// Optional: Clear on input change (add to onChange handlers)
onChange={(e) => {
  setEmail(e.target.value);
  if (error) setError(null);
}}
```

---

## Files Touched

- `apps/web/src/app/login/page.tsx` - Add error display and input error states

---

## Tests Required

Covered in Story 23.6:
- Test: error state displays on auth failure
- Test: error message is accessible (role="alert")
- Test: error clears on new submission

---

## Verification Commands

```bash
# Build check
pnpm --filter @guardian/web build

# Manual test
# 1. Start dev server
# 2. Enter invalid credentials
# 3. Verify error appears with correct styling
```

---

## Notes for Agent

1. **Use animate-fadeIn** - Already exists in globals.css
2. **role="alert"** - Important for screen readers
3. **flex-shrink-0** - Prevents icon from shrinking on long messages
4. **Keep existing error handling** - Just change the display styling
5. **Input border conditional** - Optional but recommended for visual clarity
