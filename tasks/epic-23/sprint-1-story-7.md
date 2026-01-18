# Story 23.7: QA Verification with Chrome DevTools MCP

**Sprint:** 1
**Epic:** 23 - Login Page Redesign
**Agent:** qa-agent
**Dependencies:** Stories 23.1-23.6 (all complete)

---

## Description

### What
Visual QA verification using Chrome DevTools MCP to confirm the login page matches the mockup design and all interactions work correctly.

### Why
Automated visual testing catches styling issues and interaction bugs that unit tests may miss. Screenshots provide documentation for design fidelity.

---

## Acceptance Criteria

### Visual Verification
- [ ] Navigate to login page successfully
- [ ] Guardian logo with shield icon visible
- [ ] Floating animation active on logo
- [ ] Pulse ring animation visible behind logo
- [ ] "AI Governance & Risk Assessment" tagline present
- [ ] Email input with Mail icon visible
- [ ] Password input with Lock icon visible
- [ ] Show/hide password toggle button visible
- [ ] "Forgot password?" link present
- [ ] "Sign in" button with correct sky-100 styling
- [ ] "Create an account" link present
- [ ] Footer links (Privacy/Terms/Support) visible
- [ ] Gradient background applied

### Interaction Testing
- [ ] Fill email field and verify value
- [ ] Fill password field and verify value
- [ ] Click password toggle and verify type changes to text
- [ ] Click Sign in and verify loading state appears

### Technical Verification
- [ ] No console errors on page load
- [ ] No network errors during load
- [ ] All assets load successfully (fonts, icons)

---

## Technical Approach

### Prerequisites

1. Dev server running: `pnpm dev`
2. Chrome DevTools MCP configured
3. Stories 23.1-23.6 complete and merged

### QA Steps (Chrome DevTools MCP)

```
1. browser_navigate → http://localhost:3000/login
2. browser_snapshot → Capture initial accessibility tree
3. browser_take_screenshot → "epic-23-login-initial.png"
4. browser_fill → Email input with "test@guardian.com"
5. browser_fill → Password input with "TestPassword123"
6. browser_take_screenshot → "epic-23-login-filled.png"
7. browser_click → Password visibility toggle button
8. browser_snapshot → Verify password input type changed
9. browser_take_screenshot → "epic-23-login-password-visible.png"
10. browser_click → Sign in button
11. browser_take_screenshot → "epic-23-login-loading.png"
12. browser_console_messages → Check for errors
13. browser_network_requests → Verify no failed requests
```

### Verification Checklist

**Page Structure:**
```
□ Logo section with ShieldCheck icon
□ Card container with white background
□ Form with email and password inputs
□ Submit button
□ Footer links
```

**Styling:**
```
□ Gradient background (slate-50 via sky-50/30)
□ Card shadow (shadow-xl shadow-slate-200/50)
□ Input styling (rounded-xl, slate-50/50 background)
□ Button styling (bg-sky-100, text-sky-700)
□ Link styling (text-sky-600)
```

**Animations:**
```
□ Float animation on shield icon (4s ease-in-out)
□ Pulse ring animation behind logo (2s expanding)
```

**Accessibility:**
```
□ Focus visible on all interactive elements
□ Screen reader labels present
□ Keyboard navigation works
```

---

## Files Touched

None (QA verification only)

---

## Tests Required

No code tests. This story performs manual/automated QA using Chrome DevTools MCP.

**Output Artifacts:**
- `epic-23-login-initial.png` - Initial page state
- `epic-23-login-filled.png` - Form with values
- `epic-23-login-password-visible.png` - Password revealed
- `epic-23-login-loading.png` - Loading state

---

## Verification Commands

```bash
# Start dev server
pnpm dev

# Server should be running on http://localhost:3000

# Use Chrome DevTools MCP tools for verification
# See QA Steps above
```

---

## QA Checklist

### Pass Criteria

| Check | Expected | Status |
|-------|----------|--------|
| Page loads | 200 OK, no errors | |
| Logo visible | ShieldCheck icon in sky-500 | |
| Float animation | Logo moves up/down smoothly | |
| Pulse ring | Ring expands and fades | |
| Form inputs | Mail and Lock icons visible | |
| Password toggle | Eye icon, clickable | |
| Submit button | Sky-100 background | |
| Loading state | Spinner, "Signing in..." text | |
| Console | No errors | |
| Network | All requests succeed | |

### Fail Criteria

- Any console errors (red)
- Missing visual elements
- Broken animations
- Network request failures
- Accessibility violations

---

## Notes for Agent

1. **Prerequisite:** All previous stories must be complete
2. **Dev server required:** pnpm dev must be running
3. **Chrome DevTools MCP:** Use official Google MCP, not deprecated Puppeteer
4. **Screenshots:** Save to project root or designated screenshots folder
5. **Console errors:** Filter out expected warnings (React dev mode, etc.)
6. **Network:** Check for 4xx/5xx errors, not all requests
7. **Report format:** Provide pass/fail summary with any issues found
