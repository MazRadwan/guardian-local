# Story 19.0.3: FileChip Warning Removal

**Sprint:** 0
**Track:** Warning Removal
**Phase:** 1 (parallel with 19.0.1, 19.0.2)
**Agent:** frontend-agent
**Estimated Lines:** ~250
**Dependencies:** None

---

## Overview

### What This Story Does

Removes the amber warning styling from FileChip that currently shows when `detectedDocType === 'document'` in Scoring mode. Document type issues are now communicated via chat messages only.

### User-Visible Change

**Before (in Scoring mode with non-questionnaire):**
```
┌─────────────────────────────────────────────┐
│ ⚠️ whitepaper.pdf              [X]          │  ← Amber warning icon
│ ┌────────────────────────────────────────┐ │  ← Amber background/border
│ │ Not a questionnaire?                   │ │  ← Warning text
│ └────────────────────────────────────────┘ │
└─────────────────────────────────────────────┘
```

**After (same file, same mode):**
```
┌─────────────────────────────────────────────┐
│ ✓ whitepaper.pdf               [X]          │  ← Normal checkmark
│ ┌────────────────────────────────────────┐ │  ← Normal gray background
│ │ Attached                               │ │  ← Normal status text
│ └────────────────────────────────────────┘ │
└─────────────────────────────────────────────┘
```

Document type issues will be shown in chat:
```
┌─────────────────────────────────────────────────────────────────────────┐
│ 🤖 This appears to be a general document (like a product brief or       │
│    marketing material), not a completed questionnaire. Try uploading    │
│    in Consult mode to discuss this document, or Assessment mode to      │
│    start a new vendor assessment.                                       │
└─────────────────────────────────────────────────────────────────────────┘
```

### Why This Matters

Per behavior-matrix.md (lines 295-317):
> **Document Type Handling (Chat-Based)**
> Document type issues are communicated via **chat messages from the backend**, not UI indicators on FileChip or ModeSelector.

The backend already emits `scoring_error` at `ChatServer.ts:703-708` for wrong document types.

---

## Codebase Context

### Files to Modify

1. `apps/web/src/components/chat/FileChip.tsx` - Remove warning logic and styling

### Current FileChip Implementation

**File:** `apps/web/src/components/chat/FileChip.tsx`

```typescript
// Lines 43-47: Props that enable warning
export interface FileChipProps {
  // ... other props ...
  /** Epic 18: Document type classification for wrong-mode warnings */
  detectedDocType?: DetectedDocType | null;
  /** Epic 18: Current mode - used to show warnings for wrong document types */
  mode?: 'consult' | 'assessment' | 'scoring';
}

// Lines 67-71: hasDocTypeMismatch calculation
// Epic 18: Check if document type doesn't match the mode
// Show warning when: in Scoring mode but document is NOT a questionnaire
const hasDocTypeMismatch = mode === 'scoring' &&
  detectedDocType === 'document' &&
  (isAttached || isComplete);

// Lines 97-104: Amber styling when hasDocTypeMismatch
className={cn(
  'inline-flex flex-col gap-1 rounded-lg max-w-xs border',
  isCompact ? 'px-2 py-1' : 'px-3 py-2',
  isError
    ? 'bg-red-50 border-red-200'
    : hasDocTypeMismatch                    // ← REMOVE THIS BRANCH
      ? 'bg-amber-50 border-amber-300'      // ← REMOVE
      : 'bg-gray-100 border-gray-200'
)}

// Lines 107: Aria-label includes warning
aria-label={`File ${filename}: ${getStatusText()}${hasDocTypeMismatch ? ' - Warning: may not be a questionnaire' : ''}`}

// Lines 131-148: Warning icon instead of checkmark
{/* Epic 18: Show checkmark for 'attached'/'complete', OR warning if doc type mismatch */}
{(isComplete || isAttached) && !hasDocTypeMismatch && (
  <CheckCircle ... />
)}
{/* Epic 18: Warning icon for document type mismatch */}
{hasDocTypeMismatch && (
  <AlertTriangle className={cn('text-amber-500 flex-shrink-0', ...)} />
)}

// Lines 222-227: Status text displays warning
{isAttached && !isCompact && !hasDocTypeMismatch && (
  <span className="text-xs text-green-600">Attached</span>
)}

// Lines 231-235: Warning text
{/* Epic 18: Warning for document type mismatch in Scoring mode */}
{hasDocTypeMismatch && !isCompact && (
  <span className="text-xs text-amber-600" title="...">
    Not a questionnaire?
  </span>
)}
```

### Composer Prop Passing

**File:** `apps/web/src/components/chat/Composer.tsx` (lines 307-309)

```typescript
// Epic 18: Pass document type for wrong-mode warnings
detectedDocType={file.metadata?.detectedDocType}
mode={currentMode}
```

These props can remain (they don't cause harm), but the FileChip will no longer use them for warnings.

---

## Implementation Steps

### Step 1: Remove hasDocTypeMismatch Calculation

**File:** `apps/web/src/components/chat/FileChip.tsx`

**Remove lines 67-71:**
```typescript
// Epic 18: Check if document type doesn't match the mode
// Show warning when: in Scoring mode but document is NOT a questionnaire
const hasDocTypeMismatch = mode === 'scoring' &&
  detectedDocType === 'document' &&
  (isAttached || isComplete);
```

### Step 2: Simplify Background/Border Styling

**File:** `apps/web/src/components/chat/FileChip.tsx`

**Before (lines 97-104):**
```typescript
className={cn(
  'inline-flex flex-col gap-1 rounded-lg max-w-xs border',
  isCompact ? 'px-2 py-1' : 'px-3 py-2',
  isError
    ? 'bg-red-50 border-red-200'
    : hasDocTypeMismatch
      ? 'bg-amber-50 border-amber-300'
      : 'bg-gray-100 border-gray-200'
)}
```

**After:**
```typescript
className={cn(
  'inline-flex flex-col gap-1 rounded-lg max-w-xs border',
  isCompact ? 'px-2 py-1' : 'px-3 py-2',
  isError
    ? 'bg-red-50 border-red-200'
    : 'bg-gray-100 border-gray-200'
)}
```

### Step 3: Simplify Aria-Label

**File:** `apps/web/src/components/chat/FileChip.tsx`

**Before (line 107):**
```typescript
aria-label={`File ${filename}: ${getStatusText()}${hasDocTypeMismatch ? ' - Warning: may not be a questionnaire' : ''}`}
```

**After:**
```typescript
aria-label={`File ${filename}: ${getStatusText()}`}
```

### Step 4: Simplify Checkmark Icon Rendering

**File:** `apps/web/src/components/chat/FileChip.tsx`

**Before (lines 131-148):**
```typescript
{/* Epic 18: Show checkmark for 'attached'/'complete', OR warning if doc type mismatch */}
{(isComplete || isAttached) && !hasDocTypeMismatch && (
  <CheckCircle
    className={cn(
      'text-green-600 flex-shrink-0',
      isCompact ? 'h-3 w-3' : 'h-4 w-4'
    )}
    aria-hidden="true"
  />
)}
{/* Epic 18: Warning icon for document type mismatch */}
{hasDocTypeMismatch && (
  <AlertTriangle
    className={cn(
      'text-amber-500 flex-shrink-0',
      isCompact ? 'h-3 w-3' : 'h-4 w-4'
    )}
    aria-hidden="true"
  />
)}
```

**After:**
```typescript
{/* Show checkmark for attached/complete stages */}
{(isComplete || isAttached) && (
  <CheckCircle
    className={cn(
      'text-green-600 flex-shrink-0',
      isCompact ? 'h-3 w-3' : 'h-4 w-4'
    )}
    aria-hidden="true"
  />
)}
```

### Step 5: Simplify Attached Status Text

**File:** `apps/web/src/components/chat/FileChip.tsx`

**Before (lines 221-227):**
```typescript
{/* Epic 18: Attached indicator - file is stored and ready */}
{isAttached && !isCompact && !hasDocTypeMismatch && (
  <span className="text-xs text-green-600">Attached</span>
)}
```

**After:**
```typescript
{/* Attached indicator - file is stored and ready */}
{isAttached && !isCompact && (
  <span className="text-xs text-green-600">Attached</span>
)}
```

### Step 6: Simplify Complete Status Text

**File:** `apps/web/src/components/chat/FileChip.tsx`

**Before (lines 226-228):**
```typescript
{/* Success indicator - only when complete, hidden in compact (icon remains) */}
{isComplete && !isCompact && !hasDocTypeMismatch && (
  <span className="text-xs text-green-600">Ready</span>
)}
```

**After:**
```typescript
{/* Success indicator - only when complete, hidden in compact (icon remains) */}
{isComplete && !isCompact && (
  <span className="text-xs text-green-600">Ready</span>
)}
```

### Step 7: Remove Warning Text Block

**File:** `apps/web/src/components/chat/FileChip.tsx`

**Remove lines 231-235 entirely:**
```typescript
{/* Epic 18: Warning for document type mismatch in Scoring mode */}
{hasDocTypeMismatch && !isCompact && (
  <span className="text-xs text-amber-600" title="This doesn't look like a questionnaire. Consider using Consult or Assessment mode.">
    Not a questionnaire?
  </span>
)}
```

### Step 8: Remove AlertTriangle Import (if no longer used)

**File:** `apps/web/src/components/chat/FileChip.tsx`

**Before (line 31):**
```typescript
import { Loader2, CheckCircle, AlertCircle, Clock, X, AlertTriangle } from 'lucide-react';
```

**After:**
```typescript
import { Loader2, CheckCircle, AlertCircle, Clock, X } from 'lucide-react';
```

### Step 9: Props Can Remain (Optional Cleanup)

The `detectedDocType` and `mode` props in FileChipProps can remain for now - they don't cause harm and may be useful for future features. However, if you want to clean up:

**Optional - Remove from props interface:**
```typescript
export interface FileChipProps {
  filename: string;
  stage: 'pending' | 'uploading' | 'storing' | 'attached' | 'parsing' | 'complete' | 'error';
  progress: number;
  error?: string;
  onRemove: () => void;
  disabled?: boolean;
  variant?: 'default' | 'compact';
  // NOTE: detectedDocType and mode removed - warnings now via chat
}
```

**Optional - Remove from Composer.tsx:**
```typescript
<FileChip
  key={file.localIndex}
  filename={file.filename}
  stage={file.stage}
  progress={file.progress}
  error={file.error}
  onRemove={() => removeFile(file.localIndex)}
  disabled={isFileInFlight}
  variant={useCompactChips ? 'compact' : 'default'}
  // detectedDocType and mode props removed
/>
```

---

## Tests to Update

**File:** `apps/web/src/components/chat/__tests__/FileChip.test.tsx`

```typescript
// REMOVE or UPDATE tests like:
// - 'should show amber warning when detectedDocType is document in scoring mode'
// - 'should show AlertTriangle icon for document type mismatch'

// ADD test confirming NO warning:
describe('FileChip - Document Type (No Warning)', () => {
  it('should NOT show amber styling regardless of detectedDocType', () => {
    render(
      <FileChip
        filename="whitepaper.pdf"
        stage="attached"
        progress={100}
        onRemove={jest.fn()}
        detectedDocType="document"
        mode="scoring"
      />
    );

    const chip = screen.getByRole('status');
    // Should have gray styling, NOT amber
    expect(chip).toHaveClass('bg-gray-100');
    expect(chip).not.toHaveClass('bg-amber-50');
  });

  it('should show checkmark icon for attached stage regardless of docType', () => {
    render(
      <FileChip
        filename="whitepaper.pdf"
        stage="attached"
        progress={100}
        onRemove={jest.fn()}
        detectedDocType="document"
        mode="scoring"
      />
    );

    // Should show green checkmark, not amber warning
    const checkIcon = document.querySelector('.text-green-600');
    expect(checkIcon).toBeInTheDocument();

    const warningIcon = document.querySelector('.text-amber-500');
    expect(warningIcon).not.toBeInTheDocument();
  });

  it('should NOT show "Not a questionnaire?" text', () => {
    render(
      <FileChip
        filename="whitepaper.pdf"
        stage="attached"
        progress={100}
        onRemove={jest.fn()}
        detectedDocType="document"
        mode="scoring"
      />
    );

    expect(screen.queryByText(/not a questionnaire/i)).not.toBeInTheDocument();
  });

  it('should have clean aria-label without warning text', () => {
    render(
      <FileChip
        filename="whitepaper.pdf"
        stage="attached"
        progress={100}
        onRemove={jest.fn()}
        detectedDocType="document"
        mode="scoring"
      />
    );

    const chip = screen.getByRole('status');
    expect(chip.getAttribute('aria-label')).not.toContain('Warning');
    expect(chip.getAttribute('aria-label')).not.toContain('questionnaire');
  });
});
```

---

## Acceptance Criteria

- [ ] `hasDocTypeMismatch` calculation removed
- [ ] Amber background/border styling removed
- [ ] Aria-label no longer includes warning text
- [ ] AlertTriangle icon no longer renders for document type
- [ ] Checkmark always shows for attached/complete (no conditional)
- [ ] "Not a questionnaire?" text removed
- [ ] AlertTriangle import removed
- [ ] Existing tests updated
- [ ] All tests passing

---

## Verification

```bash
# Run tests
pnpm --filter @guardian/web test:unit -- FileChip

# TypeScript check
pnpm --filter @guardian/web tsc --noEmit

# Expected: No errors, all tests pass
```

**Manual Testing:**

1. Start dev server: `pnpm dev`
2. Switch to Scoring mode
3. Upload a non-questionnaire file (e.g., any PDF)
4. Verify FileChip shows:
   - Green checkmark (not amber warning)
   - Gray background (not amber)
   - "Attached" text (not "Not a questionnaire?")
5. Click Send
6. Verify chat shows document type message from backend

---

## Manual QA with Chrome DevTools MCP

After implementation, verify changes using Chrome DevTools MCP:

### Test 1: Upload Non-Questionnaire in Scoring Mode

```
1. Navigate to chat: mcp__chrome-devtools__navigate_page
2. Take snapshot: mcp__chrome-devtools__take_snapshot
3. Switch to Scoring mode: mcp__chrome-devtools__click (mode selector)
4. Upload any PDF via mcp__chrome-devtools__upload_file
5. Wait for file to reach 'attached' stage
6. Take screenshot of FileChip: mcp__chrome-devtools__take_screenshot
```

### Test 2: Verify No Amber Warning Styling

```
1. After upload completes, take screenshot: mcp__chrome-devtools__take_screenshot
2. VERIFY in screenshot:
   - FileChip has GRAY background (bg-gray-100), NOT amber (bg-amber-50)
   - FileChip shows GREEN checkmark icon, NOT amber warning triangle
   - Status text says "Attached" or "Ready", NOT "Not a questionnaire?"
```

### Test 3: Verify Chat-Based Error Handling

```
1. Click Send button: mcp__chrome-devtools__click
2. Wait for response in chat
3. Take screenshot: mcp__chrome-devtools__take_screenshot
4. VERIFY: Chat shows message about document type (backend handles this)
```

### Expected Results

| Check | Expected |
|-------|----------|
| FileChip background | Gray (bg-gray-100), NOT amber |
| FileChip icon | Green checkmark, NOT amber triangle |
| FileChip text | "Attached"/"Ready", NOT "Not a questionnaire?" |
| After send | Chat message explains document type issue |

---

## Dependencies

### Uses

- None (this is a removal story)

### Provides For

- Cleaner UI per behavior-matrix.md
- Document type issues now handled solely via chat

---

## Notes for Agent

1. **This is a REMOVAL story** - Delete all hasDocTypeMismatch-related code.

2. **Backend already handles this** - The `scoring_error` event at `ChatServer.ts:703-708` emits chat messages for wrong document types. This story just removes the redundant UI warning.

3. **Props can stay** - The `detectedDocType` and `mode` props don't cause harm. Removing them is optional cleanup.

4. **Behavior matrix reference** - Section 6 (Document Type Handling) lines 295-317 explicitly states chat-based handling only.

5. **Test coverage for attached stage** - Per behavior-matrix.md, FileChip.test.tsx at line 379 needs `attached` stage coverage. While removing warning tests, add coverage for `attached` stage showing checkmark.
