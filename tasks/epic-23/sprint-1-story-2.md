# Story 23.2: Redesign Login Page Layout and Styling

**Sprint:** 1
**Epic:** 23 - Login Page Redesign
**Agent:** frontend-agent
**Dependencies:** Story 23.1 (CSS animations)

---

## Description

### What
Implement the new visual design for the login page with sky color palette, floating shield animation, and improved visual hierarchy. This is the main redesign story.

### Why
Modernize the Guardian login to match the "Accessible Care" design system, creating a professional first impression for healthcare organizations while maintaining all existing authentication functionality.

---

## Acceptance Criteria

- [ ] Gradient background: `bg-gradient-to-br from-slate-50 via-sky-50/30 to-slate-50`
- [ ] Centered card with `rounded-2xl` and `shadow-xl shadow-slate-200/50`
- [ ] Guardian logo with ShieldCheck icon (sky-500)
- [ ] Floating animation applied to logo container
- [ ] Pulse ring effect behind logo (animated ring)
- [ ] "Guardian" title and "AI Governance & Risk Assessment" tagline
- [ ] Email input with Mail icon prefix
- [ ] Password input with Lock icon prefix
- [ ] Show/hide password toggle button (Eye/EyeOff icons)
- [ ] "Forgot password?" link (sky-600, no functionality - link only)
- [ ] Sign in button with soft muted style: `bg-sky-100 text-sky-700 hover:bg-sky-200`
- [ ] "Create an account" link styled with sky-600
- [ ] Footer with Privacy Policy / Terms of Service / Support links
- [ ] Atkinson Hyperlegible font applied via `font-['Atkinson_Hyperlegible']`
- [ ] All existing functionality preserved (form submission, auth flow, routing)

---

## Technical Approach

### Step 1: Update Imports

```typescript
import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { login as apiLogin, AuthAPIError } from '@/lib/api/auth';
import { DevModeButton } from '@/components/auth/DevModeButton';
import {
  ShieldCheck,
  Mail,
  Lock,
  Eye,
  EyeOff,
  AlertCircle,
  Loader2
} from 'lucide-react';
```

### Step 2: Add Password Visibility State

```typescript
const [showPassword, setShowPassword] = useState(false);
```

### Step 3: Implement New Layout Structure

```tsx
<div className="min-h-screen bg-gradient-to-br from-slate-50 via-sky-50/30 to-slate-50 flex items-center justify-center px-4 py-12 font-['Atkinson_Hyperlegible']">
  <div className="w-full max-w-md space-y-8">
    {/* Logo Section */}
    <div className="flex flex-col items-center">
      <div className="relative">
        {/* Pulse ring */}
        <div className="absolute inset-0 bg-sky-200 rounded-full animate-pulse-ring" />
        {/* Shield icon container with float animation */}
        <div className="relative w-16 h-16 bg-sky-100 rounded-full flex items-center justify-center animate-float">
          <ShieldCheck className="h-8 w-8 text-sky-500" />
        </div>
      </div>
      <h1 className="mt-6 text-3xl font-bold text-slate-800">Guardian</h1>
      <p className="mt-2 text-sm text-slate-500">AI Governance & Risk Assessment</p>
    </div>

    {/* Card */}
    <div className="bg-white rounded-2xl shadow-xl shadow-slate-200/50 p-8">
      <h2 className="text-xl font-semibold text-slate-800 text-center mb-6">
        Sign in to your account
      </h2>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Error display - placeholder, styled in Story 23.4 */}

        {/* Email input with icon */}
        <div>
          <label htmlFor="email" className="sr-only">Email address</label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              placeholder="Email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isLoading}
              className="w-full pl-10 pr-4 py-3 bg-slate-50/50 border border-slate-200 rounded-xl text-slate-800 placeholder:text-slate-400 focus:bg-white focus:border-sky-400 focus:ring-4 focus:ring-sky-50 focus:outline-none transition-colors disabled:opacity-50"
            />
          </div>
        </div>

        {/* Password input with icon and toggle */}
        <div>
          <label htmlFor="password" className="sr-only">Password</label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
            <input
              id="password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              required
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isLoading}
              className="w-full pl-10 pr-12 py-3 bg-slate-50/50 border border-slate-200 rounded-xl text-slate-800 placeholder:text-slate-400 focus:bg-white focus:border-sky-400 focus:ring-4 focus:ring-sky-50 focus:outline-none transition-colors disabled:opacity-50"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-none focus:text-sky-500"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {/* Forgot password link */}
        <div className="text-right">
          <Link
            href="#"
            className="text-sm text-sky-600 hover:text-sky-700 hover:underline"
          >
            Forgot password?
          </Link>
        </div>

        {/* Submit button - soft muted style */}
        <button
          type="submit"
          disabled={isLoading}
          className="w-full py-3 bg-sky-100 text-sky-700 font-medium rounded-xl hover:bg-sky-200 focus:outline-none focus:ring-4 focus:ring-sky-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Sign in
        </button>

        {/* Create account link */}
        <p className="text-center text-sm text-slate-500">
          Don't have an account?{' '}
          <Link href="/register" className="text-sky-600 hover:text-sky-700 hover:underline font-medium">
            Create an account
          </Link>
        </p>

        {/* Dev Mode Section - styled in Story 23.3 */}
        {process.env.NEXT_PUBLIC_ENABLE_DEV_MODE === 'true' && (
          <DevModeButton onLogin={(token, user) => {
            login(token, user);
            router.push('/chat');
          }} />
        )}
      </form>
    </div>

    {/* Footer */}
    <div className="text-center text-xs text-slate-400 space-x-4">
      <Link href="#" className="hover:text-slate-600">Privacy Policy</Link>
      <span>·</span>
      <Link href="#" className="hover:text-slate-600">Terms of Service</Link>
      <span>·</span>
      <Link href="#" className="hover:text-slate-600">Support</Link>
    </div>
  </div>
</div>
```

### Step 4: Preserve Existing Logic

Keep existing handleSubmit logic unchanged:
- Form validation
- apiLogin call
- AuthAPIError handling
- Router navigation to /chat
- login() hook call

---

## Files Touched

- `apps/web/src/app/login/page.tsx` - Complete layout redesign

---

## Tests Required

Tests will be written in Story 23.6. This story focuses on visual implementation.

Verification:
1. **Build check:** `pnpm --filter @guardian/web build`
2. **Dev server:** Visual inspection at http://localhost:3000/login
3. **Auth flow:** Login still works, redirects to /chat

---

## Verification Commands

```bash
# Build check
pnpm --filter @guardian/web build

# Start dev server
pnpm --filter @guardian/web dev

# Navigate to http://localhost:3000/login
# Verify: gradient background, card, logo animation, form elements
```

---

## Notes for Agent

1. **Preserve all existing functionality** - form submission, error handling, auth flow must work
2. **Remove Button/Input imports from shadcn** - Use native elements with Tailwind for full control
3. **Keep AlertCircle import** - Used in Story 23.4 for error styling
4. **Keep existing state** - email, password, error, isLoading
5. **Add showPassword state** - New state for password visibility toggle
6. **Footer links are placeholders** - href="#" for now, no functionality required
7. **Forgot password is placeholder** - Link only, no page needed (out of scope)
