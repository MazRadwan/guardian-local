# Story 19.0.2: ModeSelector Warning Removal

**Sprint:** 0
**Track:** Warning Removal
**Phase:** 1 (parallel with 19.0.1, 19.0.3)
**Agent:** frontend-agent
**Estimated Lines:** ~200
**Dependencies:** None

---

## Overview

### What This Story Does

Removes the warning triangle from ModeSelector that currently shows for ANY file in ANY mode. Per behavior-matrix.md, users should be able to switch modes freely without warnings.

### User-Visible Change

**Before:**
```
┌─────────────────────────────┐
│ [Consult icon] Consult ⚠️ ▼ │  ← Warning triangle shows for any file
└─────────────────────────────┘
```

**After:**
```
┌─────────────────────────────┐
│ [Consult icon] Consult ▼    │  ← No warning triangle ever
└─────────────────────────────┘
```

### Why This Matters

Per behavior-matrix.md (lines 207-218):
> **Mode Switch Action**
> Can Switch Mode? Yes for ALL file states
>
> **Note:** No warning triangle on ModeSelector. Users can freely switch modes at any time. The `hasIncompleteFiles` prop has been removed from ModeSelector.

The warning was causing user confusion because:
1. It appeared for ANY file, not just problematic ones
2. It appeared in ALL modes, not just when relevant
3. Document type issues are already handled via chat messages

---

## Codebase Context

### Files to Modify

1. `apps/web/src/components/chat/ModeSelector.tsx` - Remove prop and warning icon
2. `apps/web/src/components/chat/Composer.tsx` - Remove prop computation and passing

### Current ModeSelector Implementation

**File:** `apps/web/src/components/chat/ModeSelector.tsx`

```typescript
// Lines 17-22: Props interface
export interface ModeSelectorProps {
  selectedMode: ConversationMode;
  onModeChange: (mode: ConversationMode) => void;
  disabled?: boolean;
  /** Epic 18 Story 18.3.4: Files in progress (show warning on mode change) */
  hasIncompleteFiles?: boolean;  // ← REMOVE THIS
}

// Lines 45-50: Component destructuring
export function ModeSelector({
  selectedMode,
  onModeChange,
  disabled = false,
  hasIncompleteFiles = false,  // ← REMOVE THIS
}: ModeSelectorProps) {

// Lines 77-78: Button aria-label
aria-label={`Mode: ${selectedOption?.name}${hasIncompleteFiles ? ' (files still processing)' : ''}`}

// Lines 78: Title tooltip
title={hasIncompleteFiles ? 'Files are still processing. Switching modes may affect analysis.' : undefined}

// Lines 82-85: Warning icon rendering
{/* Epic 18 Story 18.3.4: Warning when files incomplete */}
{hasIncompleteFiles && (
  <AlertTriangle className="h-3.5 w-3.5 text-yellow-600" aria-hidden="true" />
)}
```

### Current Composer Implementation

**File:** `apps/web/src/components/chat/Composer.tsx`

```typescript
// Lines 257-263: hasIncompleteFiles computation
// Epic 18 Story 18.3.4: Check for incomplete files (show warning on mode change)
// Files are incomplete if they're not in 'complete' or 'error' terminal states
const hasIncompleteFiles = useMemo(() => {
  return files.some(f =>
    f.stage !== 'complete' && f.stage !== 'error'
  );
}, [files]);

// Lines 341-347: Passing prop to ModeSelector
{onModeChange && (
  <ModeSelector
    selectedMode={currentMode}
    onModeChange={onModeChange}
    disabled={disabled || modeChangeDisabled}
    hasIncompleteFiles={hasIncompleteFiles}  // ← REMOVE THIS
  />
)}
```

---

## Implementation Steps

### Step 1: Update ModeSelector Props Interface

**File:** `apps/web/src/components/chat/ModeSelector.tsx`

**Before (lines 17-22):**
```typescript
export interface ModeSelectorProps {
  selectedMode: ConversationMode;
  onModeChange: (mode: ConversationMode) => void;
  disabled?: boolean;
  /** Epic 18 Story 18.3.4: Files in progress (show warning on mode change) */
  hasIncompleteFiles?: boolean;
}
```

**After:**
```typescript
export interface ModeSelectorProps {
  selectedMode: ConversationMode;
  onModeChange: (mode: ConversationMode) => void;
  disabled?: boolean;
  // NOTE: hasIncompleteFiles removed in Epic 19 Story 19.0.2
  // Per behavior-matrix.md, no warning triangle on ModeSelector
}
```

### Step 2: Update ModeSelector Component Destructuring

**File:** `apps/web/src/components/chat/ModeSelector.tsx`

**Before (lines 45-50):**
```typescript
export function ModeSelector({
  selectedMode,
  onModeChange,
  disabled = false,
  hasIncompleteFiles = false,
}: ModeSelectorProps) {
```

**After:**
```typescript
export function ModeSelector({
  selectedMode,
  onModeChange,
  disabled = false,
}: ModeSelectorProps) {
```

### Step 3: Update Button Aria-Label

**File:** `apps/web/src/components/chat/ModeSelector.tsx`

**Before (line 77):**
```typescript
aria-label={`Mode: ${selectedOption?.name}${hasIncompleteFiles ? ' (files still processing)' : ''}`}
```

**After:**
```typescript
aria-label={`Mode: ${selectedOption?.name}`}
```

### Step 4: Remove Title Tooltip

**File:** `apps/web/src/components/chat/ModeSelector.tsx`

**Before (line 78):**
```typescript
title={hasIncompleteFiles ? 'Files are still processing. Switching modes may affect analysis.' : undefined}
```

**After:**
```typescript
// Remove entire title prop (or keep as undefined if needed for other purposes)
```

### Step 5: Remove Warning Icon Rendering

**File:** `apps/web/src/components/chat/ModeSelector.tsx`

**Remove lines 82-85 entirely:**
```typescript
{/* Epic 18 Story 18.3.4: Warning when files incomplete */}
{hasIncompleteFiles && (
  <AlertTriangle className="h-3.5 w-3.5 text-yellow-600" aria-hidden="true" />
)}
```

### Step 6: Remove AlertTriangle Import (if no longer used)

**File:** `apps/web/src/components/chat/ModeSelector.tsx`

**Before (line 4):**
```typescript
import { ChevronDown, Check, MessageSquare, ClipboardList, BarChart3, AlertTriangle } from 'lucide-react';
```

**After:**
```typescript
import { ChevronDown, Check, MessageSquare, ClipboardList, BarChart3 } from 'lucide-react';
```

### Step 7: Remove hasIncompleteFiles Computation from Composer

**File:** `apps/web/src/components/chat/Composer.tsx`

**Remove lines 257-263:**
```typescript
// Epic 18 Story 18.3.4: Check for incomplete files (show warning on mode change)
// Files are incomplete if they're not in 'complete' or 'error' terminal states
const hasIncompleteFiles = useMemo(() => {
  return files.some(f =>
    f.stage !== 'complete' && f.stage !== 'error'
  );
}, [files]);
```

### Step 8: Remove Prop from ModeSelector Call

**File:** `apps/web/src/components/chat/Composer.tsx`

**Before (lines 341-347):**
```typescript
{onModeChange && (
  <ModeSelector
    selectedMode={currentMode}
    onModeChange={onModeChange}
    disabled={disabled || modeChangeDisabled}
    hasIncompleteFiles={hasIncompleteFiles}
  />
)}
```

**After:**
```typescript
{onModeChange && (
  <ModeSelector
    selectedMode={currentMode}
    onModeChange={onModeChange}
    disabled={disabled || modeChangeDisabled}
  />
)}
```

---

## Tests to Update

**File:** `apps/web/src/components/chat/__tests__/ModeSelector.test.tsx`

If tests exist for the warning triangle, they should be updated or removed:

```typescript
// REMOVE any tests like:
// it('should show warning icon when hasIncompleteFiles is true', ...)
// it('should include warning in aria-label when files incomplete', ...)

// ADD test for no warning:
describe('ModeSelector', () => {
  it('should not show warning triangle regardless of file state', () => {
    render(
      <ModeSelector
        selectedMode="consult"
        onModeChange={jest.fn()}
      />
    );

    // Verify no AlertTriangle icon
    expect(screen.queryByRole('img', { hidden: true })).not.toHaveClass('text-yellow-600');
    // Or more directly:
    const container = screen.getByRole('button');
    expect(container.querySelector('.text-yellow-600')).not.toBeInTheDocument();
  });

  it('should have clean aria-label without warning text', () => {
    render(
      <ModeSelector
        selectedMode="consult"
        onModeChange={jest.fn()}
      />
    );

    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('aria-label', 'Mode: Consult');
    expect(button.getAttribute('aria-label')).not.toContain('processing');
  });
});
```

---

## Acceptance Criteria

- [ ] `hasIncompleteFiles` prop removed from ModeSelectorProps interface
- [ ] `hasIncompleteFiles` parameter removed from ModeSelector function
- [ ] Warning triangle rendering removed
- [ ] Aria-label no longer includes warning text
- [ ] Title tooltip removed
- [ ] AlertTriangle import removed (if no longer used)
- [ ] `hasIncompleteFiles` computation removed from Composer
- [ ] Prop no longer passed from Composer to ModeSelector
- [ ] Existing tests updated (warning-related tests removed/modified)
- [ ] All tests passing

---

## Verification

```bash
# Run tests
pnpm --filter @guardian/web test:unit -- ModeSelector
pnpm --filter @guardian/web test:unit -- Composer

# TypeScript check
pnpm --filter @guardian/web tsc --noEmit

# Expected: No errors, all tests pass
```

**Manual Testing:**

1. Start dev server: `pnpm dev`
2. Navigate to chat interface
3. Upload any file
4. Verify ModeSelector dropdown shows NO warning triangle
5. Verify mode can be switched freely
6. Verify aria-label says "Mode: [ModeName]" only

---

## Manual QA with Chrome DevTools MCP

After implementation, verify changes using Chrome DevTools MCP:

### Test 1: Screenshot Baseline (Before Upload)

```
1. Navigate to chat page: mcp__chrome-devtools__navigate_page
2. Take screenshot of composer area: mcp__chrome-devtools__take_screenshot
3. Note: ModeSelector should show mode name with dropdown arrow, NO warning triangle
```

### Test 2: Verify No Warning During Upload

```
1. Take page snapshot: mcp__chrome-devtools__take_snapshot
2. Find file input element and upload a file via mcp__chrome-devtools__upload_file
3. Take screenshot while file is uploading: mcp__chrome-devtools__take_screenshot
4. VERIFY: ModeSelector shows "Consult ▼" or similar - NO yellow warning triangle
```

### Test 3: Verify Mode Switch Works Freely

```
1. While file is uploading, take snapshot: mcp__chrome-devtools__take_snapshot
2. Click ModeSelector dropdown: mcp__chrome-devtools__click (uid of dropdown button)
3. Take screenshot of dropdown menu: mcp__chrome-devtools__take_screenshot
4. Click different mode option: mcp__chrome-devtools__click
5. Take screenshot after mode change: mcp__chrome-devtools__take_screenshot
6. VERIFY: Mode changed successfully, no warnings shown
```

### Expected Results

| Check | Expected |
|-------|----------|
| ModeSelector button | Mode name + chevron only, NO AlertTriangle icon |
| During upload | Same as above (no change during upload) |
| After mode switch | Mode changes without any warning UI |

---

## Dependencies

### Uses

- None (this is a removal story)

### Provides For

- Cleaner UI per behavior-matrix.md
- Removes user confusion about mode switching

---

## Notes for Agent

1. **This is a REMOVAL story** - The goal is to DELETE code, not add. Be thorough in removing all traces of `hasIncompleteFiles`.

2. **Check for TypeScript errors** - After removing the prop, TypeScript will error if any code still references it. This is helpful for finding all usages.

3. **Test file may not exist** - If `ModeSelector.test.tsx` doesn't exist or doesn't test the warning, that's fine. The key tests are that the component renders and mode switching works.

4. **Behavior matrix reference** - Section 4 (Mode Switch Action) lines 207-218 explicitly states no warning triangle.
