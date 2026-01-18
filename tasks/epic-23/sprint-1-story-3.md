# Story 23.3: Update Dev Mode Section Styling

**Sprint:** 1
**Epic:** 23 - Login Page Redesign
**Agent:** frontend-agent
**Dependencies:** Story 23.2 (Login page layout)

---

## Description

### What
Update the DevModeButton component styling to match the new "Accessible Care" design system.

### Why
The dev mode section should be visually consistent with the redesigned login page while remaining clearly distinguishable as a development-only feature.

---

## Acceptance Criteria

- [ ] Dev mode section has `bg-slate-50` background
- [ ] Dashed border style: `border-dashed border-slate-300`
- [ ] Rounded corners: `rounded-xl`
- [ ] Hover state: `hover:border-sky-400 hover:bg-sky-50`
- [ ] Zap icon with "Development Mode" label
- [ ] Button styled to match new design
- [ ] Error text uses `text-red-500`
- [ ] Consistent spacing with card

---

## Technical Approach

### Step 1: Update DevModeButton Component

**File:** `apps/web/src/components/auth/DevModeButton.tsx`

```tsx
'use client';

import { useState } from 'react';
import { devLogin as apiDevLogin } from '@/lib/api/auth';
import { User } from '@/hooks/useAuth';
import { Zap, Loader2 } from 'lucide-react';

interface DevModeButtonProps {
  onLogin: (token: string, user: User) => void;
}

export function DevModeButton({ onLogin }: DevModeButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDevLogin = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await apiDevLogin();
      onLogin(response.token, response.user);
    } catch (err) {
      setError('Dev login failed. Make sure backend is running in development mode.');
      console.error('[DevModeButton] Login failed:', err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="mt-6 pt-6 border-t border-dashed border-slate-300">
      <div className="p-4 bg-slate-50 rounded-xl border border-dashed border-slate-300 hover:border-sky-400 hover:bg-sky-50 transition-colors">
        <div className="flex items-center gap-2 text-xs text-slate-500 mb-3">
          <Zap className="h-3.5 w-3.5" />
          <span className="font-medium">Development Mode</span>
        </div>
        <button
          type="button"
          onClick={handleDevLogin}
          disabled={isLoading}
          className="w-full py-2.5 bg-white border border-slate-200 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 hover:border-slate-300 focus:outline-none focus:ring-4 focus:ring-sky-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {isLoading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Logging in...</span>
            </>
          ) : (
            <span>Quick Login (test@guardian.com)</span>
          )}
        </button>
        {error && (
          <p className="mt-2 text-xs text-red-500">{error}</p>
        )}
      </div>
    </div>
  );
}
```

### Step 2: Add Loader2 Import

Add `Loader2` to lucide-react imports for loading spinner.

---

## Files Touched

- `apps/web/src/components/auth/DevModeButton.tsx` - Complete restyling

---

## Tests Required

Tests covered in Story 23.6. Verification:

1. **Build check:** Component compiles without errors
2. **Visual check:** Dev mode section matches design system
3. **Functionality:** Quick login still works

---

## Verification Commands

```bash
# Build check
pnpm --filter @guardian/web build

# Dev server with dev mode enabled
NEXT_PUBLIC_ENABLE_DEV_MODE=true pnpm --filter @guardian/web dev

# Navigate to http://localhost:3000/login
# Verify: Dev mode section visible, styled correctly
```

---

## Notes for Agent

1. **Remove Button import** - Use native button with Tailwind
2. **Add Loader2 import** - For loading spinner consistency
3. **Keep existing logic** - handleDevLogin, state management unchanged
4. **Error styling** - Use text-red-500 to match design system
5. **Spacing** - mt-6 pt-6 creates visual separation from form
