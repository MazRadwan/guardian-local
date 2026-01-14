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

    it('should return false when exactly at limit', () => {
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
