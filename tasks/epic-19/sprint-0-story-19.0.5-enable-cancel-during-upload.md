# Story 19.0.5: Enable Cancel During Upload

**Sprint:** 0
**Track:** UI Gating Fix
**Phase:** 2 (AFTER 19.0.1 - uses helper created there)
**Agent:** frontend-agent
**Estimated Lines:** ~250
**Dependencies:** 19.0.1 (uses `isXButtonVisible` helper)

---

## Overview

### What This Story Does

Enables the X (cancel/remove) button during `uploading` and `storing` stages. Currently, the UI disables or hides the X button during these stages, making mid-upload cancel impossible.

### User-Visible Change

**Before:**
```
User uploads file → File shows "Uploading..."
X button is DISABLED or HIDDEN
User cannot cancel mid-upload ❌
```

**After:**
```
User uploads file → File shows "Uploading..."
X button is VISIBLE and ENABLED
User clicks X → File removed immediately ✓
```

### Why This Matters

Per behavior-matrix.md (lines 166-179, Action Matrix):
> | Stage | X Button | Click Behavior |
> |-------|----------|----------------|
> | `uploading` | **Visible** | Abort HTTP + remove from UI |
> | `storing` | **Visible** | Remove from UI + notify backend |
> | `parsing` | **Hidden** | N/A (cannot cancel enrichment) |

The current code incorrectly disables/hides X during uploading and storing stages.

---

## Codebase Context

### Files to Modify

1. `apps/web/src/components/chat/Composer.tsx` - X button disabled logic (PRIMARY CHANGE)
2. `apps/web/src/lib/uploadStageHelpers.ts` - Add helper function (if not exists)

**Note:** FileChip does NOT need modification - it correctly respects the `disabled` prop.
The gating happens in Composer, which passes `disabled` to FileChip.

### Current Composer Implementation

**File:** `apps/web/src/components/chat/Composer.tsx` (lines 294-310)

```typescript
{files.map((file) => {
  // Epic 17 UX Fix: Per-file disable for remove button
  // Only disable on files currently in-flight, not globally
  const isFileInFlight = ['uploading', 'storing', 'parsing'].includes(file.stage);
  return (
    <FileChip
      key={file.localIndex}
      filename={file.filename}
      stage={file.stage}
      progress={file.progress}
      error={file.error}
      onRemove={() => removeFile(file.localIndex)}
      disabled={isFileInFlight}  // <-- THIS controls X button visibility
      variant={useCompactChips ? 'compact' : 'default'}
      ...
    />
  );
})}
```

**Issue:** `isFileInFlight` includes `uploading` and `storing`, but per behavior-matrix.md,
X should be visible during these stages (only hidden during `parsing`).

### Current FileChip Implementation

**File:** `apps/web/src/components/chat/FileChip.tsx` (line 172)

```typescript
{/* X button - only show if not disabled */}
{!disabled && (
  <button
    type="button"
    onClick={onRemove}
    ...
  >
    <X className={...} />
  </button>
)}
```

**Note:** FileChip simply honors the `disabled` prop passed by Composer.
It does NOT have its own stage-based gating logic. The fix is in Composer.

### Behavior Matrix Reference

**Section:** Action Matrix - Remove/Cancel (lines 166-179)

| Stage | X Button | Click Behavior |
|-------|----------|----------------|
| `pending` | Visible | Remove from queue |
| `uploading` | **Visible** | Abort HTTP + remove from UI |
| `storing` | **Visible** | Remove from UI + notify backend |
| `attached` | Visible | Remove from UI + notify backend |
| `parsing` | **Hidden** | N/A (cannot cancel enrichment) |
| `complete` | Visible | Remove from UI + notify backend |
| `error` | Visible | Remove from UI |

---

## Implementation Steps

### Step 1: Verify uploadStageHelpers.ts Has Required Helper (NO CHANGES)

**File:** `apps/web/src/lib/uploadStageHelpers.ts`

**IMPORTANT:** Story 19.0.1 creates this file with `isXButtonVisible()`. Do NOT create a duplicate helper.

**Verify this helper exists (from 19.0.1):**
```typescript
/**
 * Check if X button should be visible
 * Hidden only during parsing (cannot cancel enrichment)
 *
 * Reference: behavior-matrix.md lines 674-681
 */
export function isXButtonVisible(stage: FileUploadStage): boolean {
  return stage !== 'parsing';
}
```

**Do NOT add `shouldDisableRemoveButton` or any similar helper.** Use `isXButtonVisible` from 19.0.1.
The disabled prop is the inverse: `disabled={!isXButtonVisible(stage)}`.

### Step 2: Update Composer.tsx - Disabled Prop Calculation

**File:** `apps/web/src/components/chat/Composer.tsx`

**This is the PRIMARY change.** The gating happens here, not in FileChip.

**Add import:**
```typescript
import { isXButtonVisible } from '@/lib/uploadStageHelpers';
```

**Before (lines 294-296):**
```typescript
{files.map((file) => {
  // Epic 17 UX Fix: Per-file disable for remove button
  // Only disable on files currently in-flight, not globally
  const isFileInFlight = ['uploading', 'storing', 'parsing'].includes(file.stage);
```

**After:**
```typescript
{files.map((file) => {
  // Epic 19 Story 19.0.5: X button visible during uploading/storing, hidden only during parsing
  // Uses isXButtonVisible from 19.0.1 - single source of truth
  // Reference: behavior-matrix.md lines 166-179
  const isRemoveDisabled = !isXButtonVisible(file.stage);
```

**Then update the prop:**
```typescript
  <FileChip
    ...
    disabled={isRemoveDisabled}  // Changed from isFileInFlight
    ...
  />
```

### Step 3: Verify FileChip - NO CHANGES NEEDED

**File:** `apps/web/src/components/chat/FileChip.tsx`

FileChip correctly uses `{!disabled && ...}` to show/hide the X button.
It honors the `disabled` prop passed by Composer.

**Verify this code exists (no modification needed):**
```typescript
{!disabled && (
  <button
    type="button"
    onClick={onRemove}
    ...
  >
    <X className={...} />
  </button>
)}
```

**DO NOT add stage-based logic to FileChip.** The gating should remain in Composer
to keep FileChip a simple presentational component.

---

## Tests to Write

**Note:** The `isXButtonVisible` helper tests are in Story 19.0.1 (already has comprehensive tests).
This story only adds Composer integration tests.

**File:** `apps/web/src/components/chat/__tests__/Composer.test.tsx`

```typescript
describe('Story 19.0.5: Composer X Button Visibility', () => {
  it('should pass disabled=false to FileChip during uploading stage', () => {
    // Setup mock files with uploading stage
    // Render Composer
    // Verify FileChip receives disabled={false}
    // (X button visible during upload)
  });

  it('should pass disabled=false to FileChip during storing stage', () => {
    // Setup mock files with storing stage
    // Render Composer
    // Verify FileChip receives disabled={false}
    // (X button visible during storing)
  });

  it('should pass disabled=true to FileChip during parsing stage', () => {
    // Setup mock files with parsing stage
    // Render Composer
    // Verify FileChip receives disabled={true}
    // (X button hidden during parsing)
  });
});
```

**File:** `apps/web/src/components/chat/__tests__/FileChip.test.tsx`

```typescript
describe('Story 19.0.5: FileChip X Button Visibility', () => {
  it('should show X button during uploading stage', () => {
    render(
      <FileChip
        file={{ ...mockFile, stage: 'uploading' }}
        onRemove={jest.fn()}
      />
    );

    expect(screen.getByRole('button', { name: /remove/i })).toBeInTheDocument();
  });

  it('should show X button during storing stage', () => {
    render(
      <FileChip
        file={{ ...mockFile, stage: 'storing' }}
        onRemove={jest.fn()}
      />
    );

    expect(screen.getByRole('button', { name: /remove/i })).toBeInTheDocument();
  });

  it('should hide X button during parsing stage', () => {
    render(
      <FileChip
        file={{ ...mockFile, stage: 'parsing' }}
        onRemove={jest.fn()}
      />
    );

    expect(screen.queryByRole('button', { name: /remove/i })).not.toBeInTheDocument();
  });

  it('should show X button during attached stage', () => {
    render(
      <FileChip
        file={{ ...mockFile, stage: 'attached' }}
        onRemove={jest.fn()}
      />
    );

    expect(screen.getByRole('button', { name: /remove/i })).toBeInTheDocument();
  });
});
```

---

## Acceptance Criteria

- [ ] Composer imports `isXButtonVisible` from uploadStageHelpers (from 19.0.1)
- [ ] Composer calculates `disabled={!isXButtonVisible(stage)}` for FileChip
- [ ] FileChip shows X button during `uploading` stage
- [ ] FileChip shows X button during `storing` stage
- [ ] FileChip hides X button during `parsing` stage only
- [ ] No duplicate helper functions created (uses 19.0.1's `isXButtonVisible`)
- [ ] All Composer tests passing
- [ ] All FileChip tests passing

---

## Verification

```bash
# Run tests
pnpm --filter @guardian/web test:unit -- uploadStageHelpers FileChip

# TypeScript check
pnpm --filter @guardian/web tsc --noEmit
```

**Manual Testing:**

1. Start dev server: `pnpm dev`
2. Upload a large file (10MB+)
3. While showing "Uploading..."
4. Verify: X button is VISIBLE
5. Click X
6. Verify: File is removed immediately
7. Repeat for "Storing..." state

---

## Manual QA with Chrome DevTools MCP

After implementation, verify X button visibility using Chrome DevTools MCP:

### Test 1: X Button Visible During Upload

```
1. Navigate to chat: mcp__chrome-devtools__navigate_page
2. Upload a large PDF (10MB+): mcp__chrome-devtools__upload_file
3. IMMEDIATELY take screenshot: mcp__chrome-devtools__take_screenshot
4. VERIFY: FileChip shows "Uploading..." with X button VISIBLE
```

### Test 2: X Button Clickable During Upload

```
1. Start uploading large file
2. Take snapshot to find X button: mcp__chrome-devtools__take_snapshot
3. Click X button: mcp__chrome-devtools__click
4. Take screenshot: mcp__chrome-devtools__take_screenshot
5. VERIFY: FileChip is REMOVED (not stuck, not showing error)
```

### Test 3: X Button Hidden During Parsing Only

```
1. Upload small file and click Send
2. Wait for "Analyzing..." state (parsing)
3. Take screenshot: mcp__chrome-devtools__take_screenshot
4. VERIFY: X button is NOT visible during parsing
```

### Expected Results

| Stage | X Button Visible | X Button Enabled | Click X Result |
|-------|------------------|------------------|----------------|
| pending | Yes | Yes | File removed |
| uploading | **Yes** | **Yes** | File removed (abort in Sprint 1) |
| storing | **Yes** | **Yes** | File removed |
| attached | Yes | Yes | File removed |
| parsing | **No** | N/A | N/A (button hidden) |
| complete | Yes | Yes | File removed |
| error | Yes | Yes | File removed |

---

## Dependencies

### Requires (MUST complete first)

- **Story 19.0.1** - Creates `uploadStageHelpers.ts` with `isXButtonVisible()`

### Uses

- `isXButtonVisible()` from `uploadStageHelpers.ts` (created by 19.0.1)

### Provides For

- Sprint 1: X button exists for mid-upload cancel
- Sprint 2: X button clickable during send race

---

## Notes for Agent

1. **Single source of truth** - Story 19.0.1 defines `isXButtonVisible()`. Do NOT create duplicate helpers like `shouldDisableRemoveButton`. Use the existing helper with negation: `disabled={!isXButtonVisible(stage)}`.

2. **Composer is the gating location** - FileChip just honors the `disabled` prop. The gating logic is in Composer only.

3. **Parsing is the only hidden state** - Only parsing stage should hide X. All other stages show X. The helper `isXButtonVisible('parsing')` returns `false`, all others return `true`.

4. **Abort logic is Sprint 1** - This story just makes the button visible/clickable. The actual abort controller logic is in Sprint 1 (19.1.1, 19.1.2).

5. **Test with large files** - Use 10MB+ files to have time to see "Uploading..." state and click X.

6. **Execution order** - This story MUST run AFTER 19.0.1 because it imports the helper that 19.0.1 creates.
