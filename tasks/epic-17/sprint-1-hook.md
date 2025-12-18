# Sprint 1 - Track C: Multi-File Upload Hook

**Track:** C (Hook)
**Stories:** 17.3.1 - 17.3.5
**Estimated Effort:** ~4 hours
**Parallel With:** Track A (Backend), Track B (FileChip)
**Dependencies:** None (uses existing WebSocket infrastructure)

---

## Context

The current `useFileUpload` hook manages single-file state. This track creates a new `useMultiFileUpload` hook with multi-file state management. The old hook remains for backward compatibility.

**Key Files:**
- `apps/web/src/hooks/useMultiFileUpload.ts` (NEW)
- `apps/web/src/hooks/__tests__/useMultiFileUpload.test.tsx` (NEW)

**Reference Files (read-only):**
- `apps/web/src/hooks/useFileUpload.ts` (existing pattern)
- `apps/web/src/hooks/useWebSocket.ts` (WebSocket integration)

---

## Story 17.3.1: Multi-File State Interface

### Objective
Define TypeScript interfaces for multi-file state management.

### Interface Definitions

```typescript
// useMultiFileUpload.ts

/**
 * Unique identifier for tracking files before they have a server-assigned fileId.
 * Generated client-side when file is selected.
 */
type TempFileId = string;

/**
 * Individual file state
 */
interface FileState {
  tempId: TempFileId;
  file: File;                         // Original File object
  filename: string;
  size: number;
  mimeType: string;
  status: 'pending' | 'uploading' | 'parsing' | 'complete' | 'error';
  progress: number;                   // 0-100
  fileId?: string;                    // Server-assigned ID (set on complete)
  error?: string;                     // Error message if failed
}

/**
 * Aggregate upload state
 */
interface MultiFileUploadState {
  files: Map<TempFileId, FileState>;
  isUploading: boolean;               // Any file currently uploading
  aggregateProgress: number;          // Overall progress 0-100
  completedCount: number;
  failedCount: number;
  totalCount: number;
}

/**
 * Hook return type
 */
interface UseMultiFileUploadReturn {
  // State
  files: FileState[];                 // Array for easy iteration
  isUploading: boolean;
  aggregateProgress: number;
  completedCount: number;
  failedCount: number;

  // Actions
  addFiles: (files: FileList | File[]) => void;
  removeFile: (tempId: TempFileId) => void;
  retryFile: (tempId: TempFileId) => void;
  clearAll: () => void;
  uploadAll: (conversationId: string, mode: 'intake' | 'scoring') => Promise<void>;

  // Getters
  getCompletedFileIds: () => string[];  // For sending with message
  hasFiles: boolean;
  hasPendingFiles: boolean;
  hasErrors: boolean;
}

/**
 * Hook options
 */
interface UseMultiFileUploadOptions {
  maxFiles?: number;                  // Default: 10
  maxFileSize?: number;               // Default: 20MB
  maxTotalSize?: number;              // Default: 50MB
  allowedTypes?: string[];            // MIME types, default: all supported
  onUploadComplete?: (fileIds: string[]) => void;
  onError?: (error: string) => void;
}
```

### Acceptance Criteria
- [ ] All interfaces exported from hook file
- [ ] TempFileId is string type (UUID)
- [ ] FileState tracks all necessary metadata
- [ ] Hook return type includes all actions and getters
- [ ] Options allow customization of limits

---

## Story 17.3.2: Core Operations

### Objective
Implement `addFiles`, `removeFile`, `retryFile`, and `clearAll` operations.

### Implementation

```typescript
import { useState, useCallback, useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid';

const DEFAULT_MAX_FILES = 10;
const DEFAULT_MAX_FILE_SIZE = 20 * 1024 * 1024;  // 20MB
const DEFAULT_MAX_TOTAL_SIZE = 50 * 1024 * 1024; // 50MB

export function useMultiFileUpload(
  options: UseMultiFileUploadOptions = {}
): UseMultiFileUploadReturn {
  const {
    maxFiles = DEFAULT_MAX_FILES,
    maxFileSize = DEFAULT_MAX_FILE_SIZE,
    maxTotalSize = DEFAULT_MAX_TOTAL_SIZE,
    onError,
  } = options;

  const [filesMap, setFilesMap] = useState<Map<TempFileId, FileState>>(new Map());

  // Convert Map to array for easy iteration
  const files = useMemo(() => Array.from(filesMap.values()), [filesMap]);

  /**
   * Add files to the queue
   */
  const addFiles = useCallback((newFiles: FileList | File[]) => {
    const fileArray = Array.from(newFiles);

    setFilesMap((prev) => {
      const updated = new Map(prev);
      let currentTotalSize = Array.from(prev.values())
        .reduce((sum, f) => sum + f.size, 0);

      for (const file of fileArray) {
        // Check max files
        if (updated.size >= maxFiles) {
          onError?.(`Maximum ${maxFiles} files allowed`);
          break;
        }

        // Check individual file size
        if (file.size > maxFileSize) {
          onError?.(`${file.name} exceeds ${maxFileSize / 1024 / 1024}MB limit`);
          continue;
        }

        // Check total size
        if (currentTotalSize + file.size > maxTotalSize) {
          onError?.(`Total size would exceed ${maxTotalSize / 1024 / 1024}MB limit`);
          break;
        }

        const tempId = uuidv4();
        updated.set(tempId, {
          tempId,
          file,
          filename: file.name,
          size: file.size,
          mimeType: file.type || 'application/octet-stream',
          status: 'pending',
          progress: 0,
        });

        currentTotalSize += file.size;
      }

      return updated;
    });
  }, [maxFiles, maxFileSize, maxTotalSize, onError]);

  /**
   * Remove a file from the queue
   */
  const removeFile = useCallback((tempId: TempFileId) => {
    setFilesMap((prev) => {
      const updated = new Map(prev);
      updated.delete(tempId);
      return updated;
    });
  }, []);

  /**
   * Retry a failed file
   */
  const retryFile = useCallback((tempId: TempFileId) => {
    setFilesMap((prev) => {
      const updated = new Map(prev);
      const file = updated.get(tempId);

      if (file && file.status === 'error') {
        updated.set(tempId, {
          ...file,
          status: 'pending',
          progress: 0,
          error: undefined,
        });
      }

      return updated;
    });
  }, []);

  /**
   * Clear all files
   */
  const clearAll = useCallback(() => {
    setFilesMap(new Map());
  }, []);

  // ... continued in next story
}
```

### Acceptance Criteria
- [ ] `addFiles` accepts FileList or File[]
- [ ] `addFiles` validates max files limit
- [ ] `addFiles` validates individual file size
- [ ] `addFiles` validates total size
- [ ] `addFiles` generates unique tempId per file
- [ ] `removeFile` removes by tempId
- [ ] `retryFile` resets error state to pending
- [ ] `clearAll` removes all files
- [ ] Validation errors trigger `onError` callback

---

## Story 17.3.3: Progress Tracking

### Objective
Implement progress tracking and aggregate calculations.

### Implementation

```typescript
// Continuing useMultiFileUpload...

  /**
   * Update file progress (called from WebSocket handler)
   */
  const updateFileProgress = useCallback((
    tempId: TempFileId,
    update: Partial<Pick<FileState, 'status' | 'progress' | 'fileId' | 'error'>>
  ) => {
    setFilesMap((prev) => {
      const updated = new Map(prev);
      const file = updated.get(tempId);

      if (file) {
        updated.set(tempId, { ...file, ...update });
      }

      return updated;
    });
  }, []);

  /**
   * Derived state calculations
   */
  const isUploading = useMemo(
    () => files.some(f => f.status === 'uploading' || f.status === 'parsing'),
    [files]
  );

  const completedCount = useMemo(
    () => files.filter(f => f.status === 'complete').length,
    [files]
  );

  const failedCount = useMemo(
    () => files.filter(f => f.status === 'error').length,
    [files]
  );

  const totalCount = files.length;

  /**
   * Aggregate progress: weighted by file size
   */
  const aggregateProgress = useMemo(() => {
    if (files.length === 0) return 0;

    const totalSize = files.reduce((sum, f) => sum + f.size, 0);
    if (totalSize === 0) return 0;

    const weightedProgress = files.reduce((sum, f) => {
      const weight = f.size / totalSize;
      return sum + (f.progress * weight);
    }, 0);

    return Math.round(weightedProgress);
  }, [files]);

  /**
   * Get completed file IDs for message sending
   */
  const getCompletedFileIds = useCallback(
    () => files
      .filter(f => f.status === 'complete' && f.fileId)
      .map(f => f.fileId!),
    [files]
  );

  const hasFiles = files.length > 0;
  const hasPendingFiles = files.some(f => f.status === 'pending');
  const hasErrors = failedCount > 0;
```

### Acceptance Criteria
- [ ] `updateFileProgress` updates individual file state
- [ ] `isUploading` true when any file uploading/parsing
- [ ] `completedCount` counts successful uploads
- [ ] `failedCount` counts failed uploads
- [ ] `aggregateProgress` weighted by file size
- [ ] `getCompletedFileIds` returns server-assigned IDs
- [ ] Derived states update reactively

---

## Story 17.3.4: WebSocket Integration

### Objective
Integrate with WebSocket for upload and progress events.

### Implementation

```typescript
// Continuing useMultiFileUpload...

  /**
   * Upload all pending files
   */
  const uploadAll = useCallback(async (
    conversationId: string,
    mode: 'intake' | 'scoring'
  ): Promise<void> => {
    const pendingFiles = files.filter(f => f.status === 'pending');
    if (pendingFiles.length === 0) return;

    // Build FormData with all pending files
    const formData = new FormData();
    formData.append('conversationId', conversationId);
    formData.append('mode', mode);

    // Track tempIds for progress correlation
    const tempIdMap: Record<string, TempFileId> = {};

    pendingFiles.forEach((fileState, index) => {
      formData.append('files', fileState.file);
      // Include tempId in a parallel array for correlation
      tempIdMap[fileState.filename] = fileState.tempId;

      // Mark as uploading
      updateFileProgress(fileState.tempId, {
        status: 'uploading',
        progress: 0,
      });
    });

    try {
      const response = await fetch('/api/documents/upload', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${getAuthToken()}`,
        },
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Upload failed');
      }

      // Response includes per-file results, but actual progress
      // comes via WebSocket events (see useEffect below)
    } catch (error) {
      // Mark all uploading files as failed
      pendingFiles.forEach((fileState) => {
        updateFileProgress(fileState.tempId, {
          status: 'error',
          error: error instanceof Error ? error.message : 'Upload failed',
        });
      });
    }
  }, [files, updateFileProgress]);

  /**
   * Subscribe to WebSocket progress events
   */
  useEffect(() => {
    // Subscribe to upload_progress events
    const unsubscribe = subscribeUploadProgress((event) => {
      const { tempId, fileId, stage, progress, error } = event;

      if (!tempId) return; // Ignore events without tempId

      updateFileProgress(tempId, {
        status: stage === 'complete' ? 'complete' :
                stage === 'error' ? 'error' :
                stage === 'parsing' ? 'parsing' : 'uploading',
        progress: progress ?? 0,
        fileId: fileId,
        error: error,
      });

      // Call onUploadComplete when all files done
      if (stage === 'complete' || stage === 'error') {
        // Check if all files finished
        // (handled in parent via getCompletedFileIds)
      }
    });

    return unsubscribe;
  }, [updateFileProgress]);

  // Return hook interface
  return {
    files,
    isUploading,
    aggregateProgress,
    completedCount,
    failedCount,
    addFiles,
    removeFile,
    retryFile,
    clearAll,
    uploadAll,
    getCompletedFileIds,
    hasFiles,
    hasPendingFiles,
    hasErrors,
  };
}
```

### WebSocket Event Handling

The hook subscribes to `upload_progress` events which include:
```typescript
interface UploadProgressEvent {
  tempId: string;      // Client-generated ID
  fileId?: string;     // Server ID (on complete)
  filename: string;
  stage: 'uploading' | 'parsing' | 'complete' | 'error';
  progress?: number;
  error?: string;
}
```

### Acceptance Criteria
- [ ] `uploadAll` sends FormData with all pending files
- [ ] `uploadAll` marks files as 'uploading' immediately
- [ ] WebSocket subscription handles progress updates
- [ ] Progress events update correct file by tempId
- [ ] Error events set error state on correct file
- [ ] Complete events set fileId on correct file
- [ ] Cleanup unsubscribes on unmount

---

## Story 17.3.5: Hook Unit Tests

### Objective
Comprehensive tests for multi-file hook.

### Test Cases

```tsx
// useMultiFileUpload.test.tsx
import { renderHook, act } from '@testing-library/react';
import { useMultiFileUpload } from '../useMultiFileUpload';

const createMockFile = (name: string, size: number = 1024): File => {
  return new File(['x'.repeat(size)], name, { type: 'application/pdf' });
};

describe('useMultiFileUpload', () => {
  describe('addFiles', () => {
    it('should add files to state', () => {
      const { result } = renderHook(() => useMultiFileUpload());

      act(() => {
        result.current.addFiles([
          createMockFile('doc1.pdf'),
          createMockFile('doc2.pdf'),
        ]);
      });

      expect(result.current.files).toHaveLength(2);
      expect(result.current.files[0].filename).toBe('doc1.pdf');
      expect(result.current.files[1].filename).toBe('doc2.pdf');
    });

    it('should generate unique tempId for each file', () => {
      const { result } = renderHook(() => useMultiFileUpload());

      act(() => {
        result.current.addFiles([
          createMockFile('doc1.pdf'),
          createMockFile('doc2.pdf'),
        ]);
      });

      const tempIds = result.current.files.map(f => f.tempId);
      expect(new Set(tempIds).size).toBe(2);
    });

    it('should reject files exceeding max count', () => {
      const onError = jest.fn();
      const { result } = renderHook(() =>
        useMultiFileUpload({ maxFiles: 2, onError })
      );

      act(() => {
        result.current.addFiles([
          createMockFile('doc1.pdf'),
          createMockFile('doc2.pdf'),
          createMockFile('doc3.pdf'),
        ]);
      });

      expect(result.current.files).toHaveLength(2);
      expect(onError).toHaveBeenCalledWith(expect.stringContaining('Maximum'));
    });

    it('should reject files exceeding size limit', () => {
      const onError = jest.fn();
      const { result } = renderHook(() =>
        useMultiFileUpload({ maxFileSize: 1000, onError })
      );

      act(() => {
        result.current.addFiles([createMockFile('big.pdf', 2000)]);
      });

      expect(result.current.files).toHaveLength(0);
      expect(onError).toHaveBeenCalledWith(expect.stringContaining('exceeds'));
    });

    it('should set initial status to pending', () => {
      const { result } = renderHook(() => useMultiFileUpload());

      act(() => {
        result.current.addFiles([createMockFile('doc.pdf')]);
      });

      expect(result.current.files[0].status).toBe('pending');
      expect(result.current.files[0].progress).toBe(0);
    });
  });

  describe('removeFile', () => {
    it('should remove file by tempId', () => {
      const { result } = renderHook(() => useMultiFileUpload());

      act(() => {
        result.current.addFiles([
          createMockFile('doc1.pdf'),
          createMockFile('doc2.pdf'),
        ]);
      });

      const tempIdToRemove = result.current.files[0].tempId;

      act(() => {
        result.current.removeFile(tempIdToRemove);
      });

      expect(result.current.files).toHaveLength(1);
      expect(result.current.files[0].filename).toBe('doc2.pdf');
    });
  });

  describe('clearAll', () => {
    it('should remove all files', () => {
      const { result } = renderHook(() => useMultiFileUpload());

      act(() => {
        result.current.addFiles([
          createMockFile('doc1.pdf'),
          createMockFile('doc2.pdf'),
        ]);
      });

      act(() => {
        result.current.clearAll();
      });

      expect(result.current.files).toHaveLength(0);
    });
  });

  describe('aggregateProgress', () => {
    it('should calculate weighted progress', () => {
      const { result } = renderHook(() => useMultiFileUpload());

      // Manually set up files with different sizes and progress
      // (In real usage, this comes from WebSocket events)
      // ... test implementation
    });
  });

  describe('derived state', () => {
    it('should track hasFiles correctly', () => {
      const { result } = renderHook(() => useMultiFileUpload());

      expect(result.current.hasFiles).toBe(false);

      act(() => {
        result.current.addFiles([createMockFile('doc.pdf')]);
      });

      expect(result.current.hasFiles).toBe(true);
    });

    it('should track hasPendingFiles correctly', () => {
      const { result } = renderHook(() => useMultiFileUpload());

      act(() => {
        result.current.addFiles([createMockFile('doc.pdf')]);
      });

      expect(result.current.hasPendingFiles).toBe(true);
    });
  });
});
```

### Acceptance Criteria
- [ ] Test: addFiles adds to state
- [ ] Test: addFiles generates unique tempIds
- [ ] Test: addFiles respects maxFiles
- [ ] Test: addFiles respects maxFileSize
- [ ] Test: removeFile removes correct file
- [ ] Test: clearAll removes all
- [ ] Test: derived states (hasFiles, hasPendingFiles)
- [ ] Test: aggregateProgress calculation
- [ ] All tests pass

---

## Completion Checklist

Before requesting code review:

- [ ] All 5 stories implemented
- [ ] `npm test` passes in `apps/web`
- [ ] No TypeScript errors
- [ ] Hook exports all documented types
- [ ] Memory cleanup on unmount verified
- [ ] Existing `useFileUpload` unchanged

---

## Handoff Notes

After this track completes:
- Composer (Sprint 2) will import and use this hook
- Backend (Track A) must emit `tempId` in progress events for correlation
- Old `useFileUpload` can be deprecated in future (not this epic)
