# Story 19.0.1: Stage Helper Functions

**Sprint:** 0
**Track:** Foundation
**Phase:** 1 (parallel with 19.0.2, 19.0.3)
**Agent:** frontend-agent
**Estimated Lines:** ~300
**Dependencies:** None

---

## Overview

### What This Story Does

Creates `uploadStageHelpers.ts` - a new file containing centralized helper functions for stage-based logic. This becomes the **single source of truth** for stage categories and checks, replacing scattered inline stage checks throughout the codebase.

### Why This Matters

Per behavior-matrix.md (lines 591-595):
> These functions should be the **single source of truth** for stage-based logic. All components must use these instead of inline stage checks.

Currently, stage logic is duplicated across:
- `useMultiFileUpload.ts:294` (removeFile check)
- `Composer.tsx:153-155` (hasEarlyStageFiles)
- `Composer.tsx:259-262` (hasIncompleteFiles)
- `Composer.tsx:250-254` (canSendWithAttachments)
- `FileChip.tsx:61` (isActive check)

This leads to inconsistent behavior and regression risk.

### User-Visible Change

None directly - this is infrastructure. But it enables correct behavior in subsequent stories.

---

## Codebase Context

### File to Create

**Path:** `apps/web/src/lib/uploadStageHelpers.ts`

### Existing Stage Type Definition

**File:** `apps/web/src/lib/websocket.ts` (lines 142-151)

```typescript
export type FileUploadStage =
  | 'idle'        // EXISTING: No file selected
  | 'selecting'   // EXISTING: File picker open
  | 'pending'     // Not yet started
  | 'uploading'   // HTTP POST in flight
  | 'storing'     // S3 storage in progress
  | 'attached'    // NEW: File stored, ready for display
  | 'parsing'     // Claude enrichment in progress
  | 'complete'    // All done
  | 'error';      // Failed
```

### Behavior Matrix Reference

**Section:** Central Helper Functions (lines 591-743)

The behavior-matrix.md defines the exact implementation. This story copies it verbatim to ensure compliance.

---

## Implementation Steps

### Step 1: Create the Helper File

**File:** `apps/web/src/lib/uploadStageHelpers.ts`

```typescript
/**
 * uploadStageHelpers.ts - Single source of truth for stage-based logic
 *
 * Epic 19: File Upload Chip Cancel/Remove Refactor
 *
 * IMPORTANT: This file implements behavior-matrix.md Section 11.
 * Any changes must be validated against that document.
 *
 * All components MUST use these helpers instead of inline stage checks.
 */

import type { FileUploadStage } from './websocket';

/**
 * Stages where the file can be removed (X button works)
 * All stages EXCEPT parsing (cannot cancel enrichment)
 *
 * Reference: behavior-matrix.md lines 42-44
 */
export const REMOVABLE_STAGES: FileUploadStage[] = [
  'pending', 'uploading', 'storing', 'attached', 'complete', 'error'
];

/**
 * Stages where cancel triggers HTTP abort
 * 'uploading' = true HTTP abort (request in flight)
 * 'storing' = client-side cancel only; server may already be storing
 *
 * Reference: behavior-matrix.md lines 45-48
 */
export const CANCELABLE_STAGES: FileUploadStage[] = [
  'uploading', 'storing'
];

/**
 * Stages after upload complete, before terminal state
 * Note: 'attached' is pre-enrichment; 'parsing' is during enrichment
 *
 * Reference: behavior-matrix.md lines 49-52
 */
export const POST_UPLOAD_STAGES: FileUploadStage[] = [
  'attached', 'parsing'
];

/**
 * Terminal stages (no further transitions except error)
 *
 * Reference: behavior-matrix.md lines 53-55
 */
export const TERMINAL_STAGES: FileUploadStage[] = [
  'complete', 'error'
];

/**
 * Stages where file has fileId and can be sent
 *
 * Reference: behavior-matrix.md lines 56-58
 */
export const SENDABLE_STAGES: FileUploadStage[] = [
  'attached', 'parsing', 'complete'
];

/**
 * Stages that block send action (must wait)
 *
 * Reference: behavior-matrix.md lines 59-61
 */
export const BLOCKING_STAGES: FileUploadStage[] = [
  'pending', 'uploading', 'storing'
];

/**
 * Check if file can be removed at current stage
 * Returns true for all stages except parsing
 *
 * Reference: behavior-matrix.md lines 650-652
 */
export function isRemovable(stage: FileUploadStage): boolean {
  return REMOVABLE_STAGES.includes(stage);
}

/**
 * Check if file removal requires HTTP abort
 * Only uploading and storing require abort attempt
 *
 * Reference: behavior-matrix.md lines 654-659
 */
export function requiresAbort(stage: FileUploadStage): boolean {
  return CANCELABLE_STAGES.includes(stage);
}

/**
 * Check if file can be included in send payload
 * Must have fileId (attached, parsing, or complete)
 *
 * Reference: behavior-matrix.md lines 661-665
 */
export function isSendable(stage: FileUploadStage): boolean {
  return SENDABLE_STAGES.includes(stage);
}

/**
 * Check if file blocks send action
 * Files in pending/uploading/storing block send
 *
 * Reference: behavior-matrix.md lines 667-672
 */
export function isBlocking(stage: FileUploadStage): boolean {
  return BLOCKING_STAGES.includes(stage);
}

/**
 * Check if X button should be visible
 * Hidden only during parsing (cannot cancel enrichment)
 *
 * Reference: behavior-matrix.md lines 674-681
 */
export function isXButtonVisible(stage: FileUploadStage): boolean {
  return stage !== 'parsing';
}

/**
 * Check if progress bar should be visible
 * Shown during uploading, storing, and parsing
 *
 * Reference: behavior-matrix.md lines 683-688
 */
export function isProgressVisible(stage: FileUploadStage): boolean {
  return ['uploading', 'storing', 'parsing'].includes(stage);
}

/**
 * Check if stage shows "complete" appearance (checkmark)
 * Both attached and complete show checkmark
 *
 * Reference: behavior-matrix.md lines 690-695
 */
export function isCompleteAppearance(stage: FileUploadStage): boolean {
  return ['attached', 'complete'].includes(stage);
}

/**
 * Get status text for stage
 *
 * Reference: behavior-matrix.md lines 701-718
 */
export function getStageStatusText(
  stage: FileUploadStage,
  progress: number
): string {
  switch (stage) {
    case 'pending': return 'Queued';
    case 'uploading': return `${progress}%`;
    case 'storing': return 'Storing...';
    case 'attached': return 'Attached';
    case 'parsing': return 'Analyzing...';
    case 'complete': return 'Ready';
    case 'error': return 'Error';
    default: return '';
  }
}

/**
 * Check if send button should show "Uploading..." aria-label
 * True if ANY file is in a blocking stage
 *
 * Reference: behavior-matrix.md lines 720-726
 */
export function isUploadingAriaLabel(files: { stage: FileUploadStage }[]): boolean {
  return files.some(f => BLOCKING_STAGES.includes(f.stage));
}

/**
 * Check if adding files would exceed total size limit
 * @param currentFiles - Files already in queue
 * @param newFiles - Files to add
 * @param maxTotalBytes - Maximum total size (default 50MB)
 *
 * Reference: behavior-matrix.md lines 728-742
 */
export function wouldExceedTotalSize(
  currentFiles: { size: number }[],
  newFiles: { size: number }[],
  maxTotalBytes: number = 50 * 1024 * 1024
): boolean {
  const currentSize = currentFiles.reduce((sum, f) => sum + f.size, 0);
  const newSize = newFiles.reduce((sum, f) => sum + f.size, 0);
  return (currentSize + newSize) > maxTotalBytes;
}

/**
 * Check if file is in an active (in-progress) stage
 * Used for spinner display
 *
 * Note: 'attached' is NOT active - it shows checkmark
 */
export function isActiveStage(stage: FileUploadStage): boolean {
  return ['uploading', 'storing', 'parsing'].includes(stage);
}

/**
 * Check if stage is terminal (complete or error)
 */
export function isTerminal(stage: FileUploadStage): boolean {
  return TERMINAL_STAGES.includes(stage);
}
```

### Step 2: Create Unit Tests

**File:** `apps/web/src/lib/__tests__/uploadStageHelpers.test.ts`

```typescript
/**
 * uploadStageHelpers.test.ts - Unit tests for stage helper functions
 *
 * Epic 19 Story 19.0.1
 *
 * Tests validate behavior-matrix.md compliance.
 */

import {
  REMOVABLE_STAGES,
  CANCELABLE_STAGES,
  SENDABLE_STAGES,
  BLOCKING_STAGES,
  TERMINAL_STAGES,
  POST_UPLOAD_STAGES,
  isRemovable,
  requiresAbort,
  isSendable,
  isBlocking,
  isXButtonVisible,
  isProgressVisible,
  isCompleteAppearance,
  getStageStatusText,
  isUploadingAriaLabel,
  wouldExceedTotalSize,
  isActiveStage,
  isTerminal,
} from '../uploadStageHelpers';
import type { FileUploadStage } from '../websocket';

describe('uploadStageHelpers', () => {
  describe('Stage Category Arrays', () => {
    it('REMOVABLE_STAGES should include all stages except parsing', () => {
      expect(REMOVABLE_STAGES).toContain('pending');
      expect(REMOVABLE_STAGES).toContain('uploading');
      expect(REMOVABLE_STAGES).toContain('storing');
      expect(REMOVABLE_STAGES).toContain('attached');
      expect(REMOVABLE_STAGES).toContain('complete');
      expect(REMOVABLE_STAGES).toContain('error');
      expect(REMOVABLE_STAGES).not.toContain('parsing');
    });

    it('CANCELABLE_STAGES should only include uploading and storing', () => {
      expect(CANCELABLE_STAGES).toEqual(['uploading', 'storing']);
    });

    it('SENDABLE_STAGES should include attached, parsing, complete', () => {
      expect(SENDABLE_STAGES).toContain('attached');
      expect(SENDABLE_STAGES).toContain('parsing');
      expect(SENDABLE_STAGES).toContain('complete');
      expect(SENDABLE_STAGES).not.toContain('pending');
      expect(SENDABLE_STAGES).not.toContain('error');
    });

    it('BLOCKING_STAGES should include pending, uploading, storing', () => {
      expect(BLOCKING_STAGES).toEqual(['pending', 'uploading', 'storing']);
    });

    it('TERMINAL_STAGES should include complete and error', () => {
      expect(TERMINAL_STAGES).toEqual(['complete', 'error']);
    });

    it('POST_UPLOAD_STAGES should include attached and parsing', () => {
      expect(POST_UPLOAD_STAGES).toEqual(['attached', 'parsing']);
    });
  });

  describe('isRemovable', () => {
    it('should return true for all stages except parsing', () => {
      expect(isRemovable('pending')).toBe(true);
      expect(isRemovable('uploading')).toBe(true);
      expect(isRemovable('storing')).toBe(true);
      expect(isRemovable('attached')).toBe(true);
      expect(isRemovable('complete')).toBe(true);
      expect(isRemovable('error')).toBe(true);
    });

    it('should return false for parsing', () => {
      expect(isRemovable('parsing')).toBe(false);
    });
  });

  describe('requiresAbort', () => {
    it('should return true only for uploading and storing', () => {
      expect(requiresAbort('uploading')).toBe(true);
      expect(requiresAbort('storing')).toBe(true);
    });

    it('should return false for other stages', () => {
      expect(requiresAbort('pending')).toBe(false);
      expect(requiresAbort('attached')).toBe(false);
      expect(requiresAbort('parsing')).toBe(false);
      expect(requiresAbort('complete')).toBe(false);
      expect(requiresAbort('error')).toBe(false);
    });
  });

  describe('isSendable', () => {
    it('should return true for attached, parsing, complete', () => {
      expect(isSendable('attached')).toBe(true);
      expect(isSendable('parsing')).toBe(true);
      expect(isSendable('complete')).toBe(true);
    });

    it('should return false for early stages and error', () => {
      expect(isSendable('pending')).toBe(false);
      expect(isSendable('uploading')).toBe(false);
      expect(isSendable('storing')).toBe(false);
      expect(isSendable('error')).toBe(false);
    });
  });

  describe('isBlocking', () => {
    it('should return true for pending, uploading, storing', () => {
      expect(isBlocking('pending')).toBe(true);
      expect(isBlocking('uploading')).toBe(true);
      expect(isBlocking('storing')).toBe(true);
    });

    it('should return false for post-upload and terminal stages', () => {
      expect(isBlocking('attached')).toBe(false);
      expect(isBlocking('parsing')).toBe(false);
      expect(isBlocking('complete')).toBe(false);
      expect(isBlocking('error')).toBe(false);
    });
  });

  describe('isXButtonVisible', () => {
    it('should return true for all stages except parsing', () => {
      expect(isXButtonVisible('pending')).toBe(true);
      expect(isXButtonVisible('uploading')).toBe(true);
      expect(isXButtonVisible('storing')).toBe(true);
      expect(isXButtonVisible('attached')).toBe(true);
      expect(isXButtonVisible('complete')).toBe(true);
      expect(isXButtonVisible('error')).toBe(true);
    });

    it('should return false for parsing', () => {
      expect(isXButtonVisible('parsing')).toBe(false);
    });
  });

  describe('isProgressVisible', () => {
    it('should return true for uploading, storing, parsing', () => {
      expect(isProgressVisible('uploading')).toBe(true);
      expect(isProgressVisible('storing')).toBe(true);
      expect(isProgressVisible('parsing')).toBe(true);
    });

    it('should return false for other stages', () => {
      expect(isProgressVisible('pending')).toBe(false);
      expect(isProgressVisible('attached')).toBe(false);
      expect(isProgressVisible('complete')).toBe(false);
      expect(isProgressVisible('error')).toBe(false);
    });
  });

  describe('isCompleteAppearance', () => {
    it('should return true for attached and complete', () => {
      expect(isCompleteAppearance('attached')).toBe(true);
      expect(isCompleteAppearance('complete')).toBe(true);
    });

    it('should return false for other stages', () => {
      expect(isCompleteAppearance('pending')).toBe(false);
      expect(isCompleteAppearance('uploading')).toBe(false);
      expect(isCompleteAppearance('storing')).toBe(false);
      expect(isCompleteAppearance('parsing')).toBe(false);
      expect(isCompleteAppearance('error')).toBe(false);
    });
  });

  describe('getStageStatusText', () => {
    it('should return correct text for each stage', () => {
      expect(getStageStatusText('pending', 0)).toBe('Queued');
      expect(getStageStatusText('uploading', 50)).toBe('50%');
      expect(getStageStatusText('storing', 0)).toBe('Storing...');
      expect(getStageStatusText('attached', 0)).toBe('Attached');
      expect(getStageStatusText('parsing', 0)).toBe('Analyzing...');
      expect(getStageStatusText('complete', 100)).toBe('Ready');
      expect(getStageStatusText('error', 0)).toBe('Error');
    });

    it('should use progress value for uploading stage', () => {
      expect(getStageStatusText('uploading', 0)).toBe('0%');
      expect(getStageStatusText('uploading', 75)).toBe('75%');
      expect(getStageStatusText('uploading', 100)).toBe('100%');
    });
  });

  describe('isUploadingAriaLabel', () => {
    it('should return true if any file is in blocking stage', () => {
      const files = [
        { stage: 'complete' as FileUploadStage },
        { stage: 'uploading' as FileUploadStage },
      ];
      expect(isUploadingAriaLabel(files)).toBe(true);
    });

    it('should return false if no files in blocking stage', () => {
      const files = [
        { stage: 'attached' as FileUploadStage },
        { stage: 'complete' as FileUploadStage },
      ];
      expect(isUploadingAriaLabel(files)).toBe(false);
    });

    it('should return false for empty array', () => {
      expect(isUploadingAriaLabel([])).toBe(false);
    });
  });

  describe('wouldExceedTotalSize', () => {
    const MB = 1024 * 1024;

    it('should return false when under limit', () => {
      const current = [{ size: 10 * MB }];
      const newFiles = [{ size: 10 * MB }];
      expect(wouldExceedTotalSize(current, newFiles)).toBe(false);
    });

    it('should return true when over default 50MB limit', () => {
      const current = [{ size: 40 * MB }];
      const newFiles = [{ size: 20 * MB }];
      expect(wouldExceedTotalSize(current, newFiles)).toBe(true);
    });

    it('should return true when exactly at limit', () => {
      const current = [{ size: 25 * MB }];
      const newFiles = [{ size: 25 * MB }];
      // 50MB exactly is NOT over, so should be false
      expect(wouldExceedTotalSize(current, newFiles)).toBe(false);
    });

    it('should respect custom limit', () => {
      const current = [{ size: 5 * MB }];
      const newFiles = [{ size: 5 * MB }];
      expect(wouldExceedTotalSize(current, newFiles, 8 * MB)).toBe(true);
    });
  });

  describe('isActiveStage', () => {
    it('should return true for uploading, storing, parsing', () => {
      expect(isActiveStage('uploading')).toBe(true);
      expect(isActiveStage('storing')).toBe(true);
      expect(isActiveStage('parsing')).toBe(true);
    });

    it('should return false for attached (shows checkmark, not spinner)', () => {
      expect(isActiveStage('attached')).toBe(false);
    });

    it('should return false for terminal and pending stages', () => {
      expect(isActiveStage('pending')).toBe(false);
      expect(isActiveStage('complete')).toBe(false);
      expect(isActiveStage('error')).toBe(false);
    });
  });

  describe('isTerminal', () => {
    it('should return true for complete and error', () => {
      expect(isTerminal('complete')).toBe(true);
      expect(isTerminal('error')).toBe(true);
    });

    it('should return false for non-terminal stages', () => {
      expect(isTerminal('pending')).toBe(false);
      expect(isTerminal('uploading')).toBe(false);
      expect(isTerminal('storing')).toBe(false);
      expect(isTerminal('attached')).toBe(false);
      expect(isTerminal('parsing')).toBe(false);
    });
  });
});
```

---

## Acceptance Criteria

- [ ] `apps/web/src/lib/uploadStageHelpers.ts` created
- [ ] All stage category arrays defined (REMOVABLE_STAGES, etc.)
- [ ] All helper functions implemented (isRemovable, requiresAbort, etc.)
- [ ] Each function has JSDoc with behavior-matrix.md line reference
- [ ] Unit tests created for all exports
- [ ] All tests passing (`pnpm --filter @guardian/web test:unit`)
- [ ] No changes to existing files in this story

---

## Verification

```bash
# Create the files
# (Implementation steps above)

# Run tests
pnpm --filter @guardian/web test:unit -- uploadStageHelpers

# Expected output:
# PASS apps/web/src/lib/__tests__/uploadStageHelpers.test.ts
# All XX tests pass
```

**Manual Verification:**

1. Verify file exists at correct path
2. Verify all exports match behavior-matrix.md Section 11
3. Verify JSDoc comments reference correct line numbers

---

## Dependencies

### Uses

- `FileUploadStage` type from `websocket.ts`

### Provides For

- Story 19.0.4: `isRemovable()` for removeFile fix
- Sprint 1: All helpers for refactored upload logic
- Sprint 2: `requiresAbort()` for cancel behavior

---

## Notes for Agent

1. **Copy behavior-matrix.md verbatim** - The helper functions in behavior-matrix.md (lines 591-743) are the authoritative implementation. Copy them exactly.

2. **Do NOT modify existing files** - This story only creates new files. Other stories will update existing code to use these helpers.

3. **Line number references** - The JSDoc comments should reference behavior-matrix.md line numbers. These may shift if the document is updated, but they help with traceability.

4. **Test coverage** - Every exported function and array must have tests. The tests validate behavior-matrix.md compliance.
