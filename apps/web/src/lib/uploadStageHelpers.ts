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
