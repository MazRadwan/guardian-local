# Sprint 1 - Track C: useMultiFileUpload Hook

**Track:** C (Hook)
**Stories:** 17.3.1 - 17.3.5
**Estimated Effort:** ~3 hours
**Parallel With:** Track A (Backend), Track B (FileChip)
**Dependencies:** None (can develop against mock API)

---

## Context

The existing `useFileUpload` hook handles single-file uploads with:
- HTTP POST multipart upload
- WebSocket progress events correlated by `uploadId`
- "Never adopt" pattern to prevent race conditions
- AbortController for cancellation

This track creates a NEW `useMultiFileUpload` hook that extends this pattern for multiple files.

**Key Files:**
- `apps/web/src/hooks/useMultiFileUpload.ts` (NEW)
- `apps/web/src/hooks/__tests__/useMultiFileUpload.test.tsx` (NEW)

---

## Current Implementation (useFileUpload - Actual)

### Key Patterns to Preserve

```typescript
// From useFileUpload.ts - patterns we MUST maintain

// 1. "Never adopt" pattern via uploadId ref
const currentUploadIdRef = useRef<string | null>(null);

// Only accept WS events for known uploadId
if (!currentUploadIdRef.current) return;
if (data.uploadId !== currentUploadIdRef.current) return;

// 2. AbortController for HTTP cancellation
const abortControllerRef = useRef<AbortController | null>(null);

// 3. Reset clears uploadId to prevent late event adoption
const reset = useCallback(() => {
  abortControllerRef.current?.abort();
  currentUploadIdRef.current = null;  // Ignore future WS events
  // ... clear state
}, []);
```

### Current WS Event Contract (MUST PRESERVE)
```typescript
interface UploadProgressEvent {
  conversationId: string;
  uploadId: string;        // Server-generated correlation ID
  progress: number;
  stage: 'storing' | 'parsing' | 'complete' | 'error';
  message: string;
  error?: string;
}
```

---

## ID Lifecycle (Critical Understanding)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         ID LIFECYCLE                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  CLIENT                           SERVER                                    │
│  ──────                           ──────                                    │
│                                                                             │
│  1. User selects file[0], file[1], file[2]                                  │
│     → Use array index as local identifier: 0, 1, 2                          │
│                                                                             │
│  2. POST /api/documents/upload (multipart FormData)                         │
│                                   ──────────────────                        │
│                                   3. Server generates uploadId per file     │
│                                      upload-abc-0, upload-abc-1, upload-abc-2│
│                                                                             │
│  4. HTTP 202 Response:                                                      │
│     { files: [                                                              │
│       { index: 0, uploadId: 'upload-abc-0', status: 'accepted' },           │
│       { index: 1, uploadId: 'upload-abc-1', status: 'accepted' },           │
│       { index: 2, uploadId: 'upload-abc-2', status: 'accepted' },           │
│     ]}                                                                      │
│                                                                             │
│  5. Client builds uploadIdMap:                                              │
│     Map { 'upload-abc-0' → 0, 'upload-abc-1' → 1, 'upload-abc-2' → 2 }      │
│                                                                             │
│  6. WS events arrive with uploadId                                          │
│     → Look up localIndex via uploadIdMap                                    │
│     → Update files[localIndex] state                                        │
│                                                                             │
│  7. On complete, server sends fileId (database UUID)                        │
│     → Store in files[localIndex].fileId                                     │
│     → Use for message attachments                                           │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Key insight:** We do NOT need client-generated tempId. The array index serves as local identifier, and uploadId (server-generated) correlates WS events.

---

## Story 17.3.1: Multi-File State Interface

### Objective
Define state structure for tracking multiple files.

### State Design

```typescript
// useMultiFileUpload.ts

/** Per-file state */
export interface FileState {
  /** Local array index (stable identifier for this session) */
  localIndex: number;
  /** Original File object (for upload) */
  file: File;
  /** Original filename */
  filename: string;
  /** File size in bytes */
  size: number;
  /** MIME type */
  mimeType: string;
  /** Server-generated correlation ID (set after HTTP 202) */
  uploadId: string | null;
  /** Database UUID (set on complete) */
  fileId: string | null;
  /** Current stage */
  stage: 'pending' | 'uploading' | 'storing' | 'parsing' | 'complete' | 'error';
  /** Progress 0-100 */
  progress: number;
  /** Error message if failed */
  error?: string;
}

/** Hook options */
export interface UseMultiFileUploadOptions {
  /** Max files allowed (default: 10) */
  maxFiles?: number;
  /** WebSocket adapter for progress events */
  wsAdapter: {
    isConnected: boolean;
    subscribeUploadProgress: (handler: (data: UploadProgressEvent) => void) => () => void;
    subscribeIntakeContextReady: (handler: (data: IntakeContextResult) => void) => () => void;
    subscribeScoringParseReady: (handler: (data: ScoringParseResult) => void) => () => void;
  };
  /** Called on validation/upload errors */
  onError?: (message: string) => void;
  /** Called when intake context ready */
  onContextReady?: (data: IntakeContextResult, localIndex: number) => void;
  /** Called when scoring parse ready */
  onScoringReady?: (data: ScoringParseResult, localIndex: number) => void;
}

/** Hook return value */
export interface UseMultiFileUploadReturn {
  /** Array of file states */
  files: FileState[];
  /** True if any file is uploading/storing/parsing */
  isUploading: boolean;
  /** Aggregate progress (0-100) across all files */
  aggregateProgress: number;
  /** Add files to queue (validates, doesn't upload yet) */
  addFiles: (fileList: FileList) => void;
  /** Remove file by localIndex */
  removeFile: (localIndex: number) => void;
  /** Clear all files */
  clearAll: () => void;
  /** Upload all pending files */
  uploadAll: (conversationId: string, mode: UploadMode) => Promise<void>;
  /** Get completed file IDs for message attachments */
  getCompletedFileIds: () => string[];
  /** True if any files added */
  hasFiles: boolean;
  /** True if any files pending upload */
  hasPendingFiles: boolean;
}
```

### Acceptance Criteria
- [ ] FileState interface defined with all required fields
- [ ] Options interface matches existing useFileUpload pattern
- [ ] Return interface provides all needed operations
- [ ] Types exported for consumers

---

## Story 17.3.2: Core Operations

### Objective
Implement addFiles, removeFile, clearAll.

### Implementation

```typescript
// useMultiFileUpload.ts

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

/** Valid file types (matches backend) */
const VALID_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/png',
  'image/jpeg',
];

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB per file

export function useMultiFileUpload(options: UseMultiFileUploadOptions): UseMultiFileUploadReturn {
  const {
    maxFiles = 10,
    wsAdapter,
    onError,
    onContextReady,
    onScoringReady,
  } = options;

  const { token } = useAuth();

  // File state array
  const [files, setFiles] = useState<FileState[]>([]);

  // Counter for generating stable localIndex
  const nextIndexRef = useRef(0);

  // Refs for callback stability
  const onErrorRef = useRef(onError);
  const onContextReadyRef = useRef(onContextReady);
  const onScoringReadyRef = useRef(onScoringReady);
  onErrorRef.current = onError;
  onContextReadyRef.current = onContextReady;
  onScoringReadyRef.current = onScoringReady;

  // Track known uploadIds for "never adopt" pattern
  const knownUploadIdsRef = useRef<Set<string>>(new Set());

  // AbortController for batch upload
  const abortControllerRef = useRef<AbortController | null>(null);

  /**
   * Add files to queue (validates but doesn't upload)
   */
  const addFiles = useCallback((fileList: FileList) => {
    const currentCount = files.length;

    for (let i = 0; i < fileList.length; i++) {
      if (currentCount + i >= maxFiles) {
        onErrorRef.current?.(`Maximum ${maxFiles} files allowed`);
        break;
      }

      const file = fileList[i];

      // Validate file type
      if (!VALID_TYPES.includes(file.type)) {
        onErrorRef.current?.(`${file.name}: Unsupported file type`);
        continue;
      }

      // Validate file size
      if (file.size > MAX_FILE_SIZE) {
        onErrorRef.current?.(`${file.name}: File too large (max 20MB)`);
        continue;
      }

      const localIndex = nextIndexRef.current++;

      setFiles(prev => [...prev, {
        localIndex,
        file,
        filename: file.name,
        size: file.size,
        mimeType: file.type,
        uploadId: null,
        fileId: null,
        stage: 'pending',
        progress: 0,
      }]);
    }
  }, [files.length, maxFiles]);

  /**
   * Remove file by localIndex
   * Only allowed for pending/error/complete files (not during upload)
   */
  const removeFile = useCallback((localIndex: number) => {
    setFiles(prev => {
      const file = prev.find(f => f.localIndex === localIndex);
      if (!file) return prev;

      // Can't remove during active upload
      if (['uploading', 'storing', 'parsing'].includes(file.stage)) {
        onErrorRef.current?.('Cannot remove file during upload');
        return prev;
      }

      // Clear uploadId from known set
      if (file.uploadId) {
        knownUploadIdsRef.current.delete(file.uploadId);
      }

      return prev.filter(f => f.localIndex !== localIndex);
    });
  }, []);

  /**
   * Clear all files
   */
  const clearAll = useCallback(() => {
    // Abort any in-progress upload
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;

    // Clear known uploadIds
    knownUploadIdsRef.current.clear();

    // Reset state
    setFiles([]);
    nextIndexRef.current = 0;
  }, []);

  // ... continued in Story 17.3.3
}
```

### Acceptance Criteria
- [ ] addFiles validates type and size
- [ ] addFiles enforces maxFiles limit
- [ ] addFiles generates stable localIndex
- [ ] addFiles reports errors via onError callback
- [ ] removeFile only works for pending/error/complete
- [ ] removeFile cleans up uploadId tracking
- [ ] clearAll aborts in-progress and clears state

---

## Story 17.3.3: Upload Implementation

### Objective
Implement uploadAll with proper HTTP handling and uploadId correlation.

### Implementation

```typescript
/**
 * Upload all pending files
 */
const uploadAll = useCallback(async (conversationId: string, mode: UploadMode) => {
  if (!token) {
    onErrorRef.current?.('Not authenticated');
    return;
  }

  const pendingFiles = files.filter(f => f.stage === 'pending');
  if (pendingFiles.length === 0) return;

  // Create AbortController for this batch
  abortControllerRef.current = new AbortController();

  // Mark as uploading
  setFiles(prev => prev.map(f =>
    f.stage === 'pending'
      ? { ...f, stage: 'uploading' as const, progress: 10 }
      : f
  ));

  try {
    // Build FormData
    const formData = new FormData();
    formData.append('conversationId', conversationId);
    formData.append('mode', mode);

    // Add files in order (server returns uploadIds in same order)
    const pendingIndices = pendingFiles.map(f => f.localIndex);
    pendingFiles.forEach(fileState => {
      formData.append('files', fileState.file);  // Field name is 'files' (plural)
    });

    // POST upload
    const response = await fetch(`${API_BASE_URL}/api/documents/upload`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
      body: formData,
      signal: abortControllerRef.current.signal,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Upload failed' }));
      throw new Error(errorData.error || `Upload failed: ${response.status}`);
    }

    // Parse response to get uploadIds
    const result = await response.json();
    // result.files: [{ index, filename, uploadId, status, error? }]

    // Map uploadIds to our files by index
    setFiles(prev => {
      const updated = [...prev];

      result.files.forEach((serverFile: any) => {
        // serverFile.index corresponds to position in FormData
        const localIndex = pendingIndices[serverFile.index];
        const fileIndex = updated.findIndex(f => f.localIndex === localIndex);

        if (fileIndex !== -1) {
          if (serverFile.status === 'accepted') {
            // Store uploadId and register for WS tracking
            updated[fileIndex] = {
              ...updated[fileIndex],
              uploadId: serverFile.uploadId,
              stage: 'storing',
              progress: 30,
            };
            knownUploadIdsRef.current.add(serverFile.uploadId);
          } else {
            // Server rejected file during validation
            updated[fileIndex] = {
              ...updated[fileIndex],
              stage: 'error',
              progress: 0,
              error: serverFile.error || 'Rejected by server',
            };
          }
        }
      });

      return updated;
    });

    // Progress continues via WebSocket

  } catch (error) {
    // Handle abort gracefully
    if (error instanceof Error && error.name === 'AbortError') {
      setFiles(prev => prev.map(f =>
        f.stage === 'uploading'
          ? { ...f, stage: 'pending' as const, progress: 0, uploadId: null }
          : f
      ));
      return;
    }

    // Mark all uploading as error
    const errorMsg = error instanceof Error ? error.message : 'Upload failed';
    setFiles(prev => prev.map(f =>
      f.stage === 'uploading'
        ? { ...f, stage: 'error' as const, progress: 0, error: errorMsg }
        : f
    ));
    onErrorRef.current?.(errorMsg);

  } finally {
    abortControllerRef.current = null;
  }
}, [files, token]);
```

### Key Design Points

1. **Field name is `'files'` (plural)** - matches Track A backend change
2. **Index-based correlation** - server returns `index` matching FormData order
3. **uploadId stored after HTTP 202** - used for WS event correlation
4. **knownUploadIdsRef gates WS events** - "never adopt" pattern

### Acceptance Criteria
- [ ] Builds FormData with field name 'files' (plural)
- [ ] Includes conversationId and mode
- [ ] Handles HTTP errors gracefully
- [ ] Maps server response uploadIds via index
- [ ] Handles partial acceptance (some rejected)
- [ ] Registers uploadIds in knownUploadIdsRef
- [ ] AbortController allows cancellation

---

## Story 17.3.4: WebSocket Progress Handling

### Objective
Handle WS events with per-file "never adopt" pattern.

### Implementation

```typescript
// WebSocket event subscriptions
useEffect(() => {
  if (!wsAdapter.isConnected) return;

  // Upload progress events
  const unsubProgress = wsAdapter.subscribeUploadProgress((data) => {
    // "Never adopt" - only accept events for known uploadIds
    if (!knownUploadIdsRef.current.has(data.uploadId)) return;

    setFiles(prev => prev.map(f => {
      if (f.uploadId !== data.uploadId) return f;

      return {
        ...f,
        stage: data.stage as FileState['stage'],
        progress: data.progress,
        error: data.error,
      };
    }));

    if (data.stage === 'error') {
      onErrorRef.current?.(data.error || 'Upload failed');
    }
  });

  // Intake context ready
  const unsubIntake = wsAdapter.subscribeIntakeContextReady((data) => {
    if (!knownUploadIdsRef.current.has(data.uploadId)) return;

    setFiles(prev => {
      const updated = prev.map(f => {
        if (f.uploadId !== data.uploadId) return f;

        if (data.success && data.fileMetadata) {
          return {
            ...f,
            stage: 'complete' as const,
            progress: 100,
            fileId: data.fileMetadata.fileId,
          };
        } else {
          return {
            ...f,
            stage: 'error' as const,
            progress: 0,
            error: data.error || 'Failed to process',
          };
        }
      });

      // Find the file that was updated for callback
      const updatedFile = updated.find(f => f.uploadId === data.uploadId);
      if (updatedFile && data.success) {
        onContextReadyRef.current?.(data, updatedFile.localIndex);
      }

      return updated;
    });
  });

  // Scoring parse ready (similar pattern)
  const unsubScoring = wsAdapter.subscribeScoringParseReady((data) => {
    if (!knownUploadIdsRef.current.has(data.uploadId)) return;

    setFiles(prev => {
      const updated = prev.map(f => {
        if (f.uploadId !== data.uploadId) return f;

        if (data.success && data.fileMetadata) {
          return {
            ...f,
            stage: 'complete' as const,
            progress: 100,
            fileId: data.fileMetadata.fileId,
          };
        } else {
          return {
            ...f,
            stage: 'error' as const,
            progress: 0,
            error: data.error || 'Failed to parse',
          };
        }
      });

      const updatedFile = updated.find(f => f.uploadId === data.uploadId);
      if (updatedFile && data.success) {
        onScoringReadyRef.current?.(data, updatedFile.localIndex);
      }

      return updated;
    });
  });

  return () => {
    unsubProgress();
    unsubIntake();
    unsubScoring();
  };
}, [
  wsAdapter.isConnected,
  wsAdapter.subscribeUploadProgress,
  wsAdapter.subscribeIntakeContextReady,
  wsAdapter.subscribeScoringParseReady
]);
```

### Acceptance Criteria
- [ ] Filters events by uploadId via knownUploadIdsRef
- [ ] Updates correct file state on progress
- [ ] Stores fileId on completion
- [ ] Calls onContextReady/onScoringReady with localIndex
- [ ] Handles errors per-file
- [ ] Cleanup on unmount

---

## Story 17.3.5: Computed Values and Tests

### Objective
Implement computed properties and unit tests.

### Computed Properties

```typescript
// Computed values
const isUploading = files.some(f =>
  ['uploading', 'storing', 'parsing'].includes(f.stage)
);

const aggregateProgress = files.length === 0 ? 0 : Math.round(
  files.reduce((sum, f) => sum + f.progress, 0) / files.length
);

const hasFiles = files.length > 0;

const hasPendingFiles = files.some(f => f.stage === 'pending');

const getCompletedFileIds = useCallback(() => {
  return files
    .filter(f => f.stage === 'complete' && f.fileId)
    .map(f => f.fileId!);
}, [files]);

return {
  files,
  isUploading,
  aggregateProgress,
  addFiles,
  removeFile,
  clearAll,
  uploadAll,
  getCompletedFileIds,
  hasFiles,
  hasPendingFiles,
};
```

### Test Cases

```typescript
// useMultiFileUpload.test.tsx
import { renderHook, act } from '@testing-library/react';
import { useMultiFileUpload } from '../useMultiFileUpload';

describe('useMultiFileUpload', () => {
  const mockWsAdapter = {
    isConnected: true,
    subscribeUploadProgress: jest.fn(() => jest.fn()),
    subscribeIntakeContextReady: jest.fn(() => jest.fn()),
    subscribeScoringParseReady: jest.fn(() => jest.fn()),
  };

  const defaultOptions = {
    wsAdapter: mockWsAdapter,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('addFiles', () => {
    it('should add valid files to state', () => {
      const { result } = renderHook(() => useMultiFileUpload(defaultOptions));

      const fileList = createMockFileList([
        { name: 'doc.pdf', type: 'application/pdf', size: 1024 },
      ]);

      act(() => {
        result.current.addFiles(fileList);
      });

      expect(result.current.files).toHaveLength(1);
      expect(result.current.files[0].filename).toBe('doc.pdf');
      expect(result.current.files[0].stage).toBe('pending');
    });

    it('should generate unique localIndex for each file', () => {
      const { result } = renderHook(() => useMultiFileUpload(defaultOptions));

      act(() => {
        result.current.addFiles(createMockFileList([
          { name: 'doc1.pdf', type: 'application/pdf', size: 1024 },
        ]));
        result.current.addFiles(createMockFileList([
          { name: 'doc2.pdf', type: 'application/pdf', size: 1024 },
        ]));
      });

      expect(result.current.files[0].localIndex).not.toBe(
        result.current.files[1].localIndex
      );
    });

    it('should reject files exceeding maxFiles', () => {
      const onError = jest.fn();
      const { result } = renderHook(() =>
        useMultiFileUpload({ ...defaultOptions, maxFiles: 2, onError })
      );

      const fileList = createMockFileList([
        { name: 'doc1.pdf', type: 'application/pdf', size: 1024 },
        { name: 'doc2.pdf', type: 'application/pdf', size: 1024 },
        { name: 'doc3.pdf', type: 'application/pdf', size: 1024 },
      ]);

      act(() => {
        result.current.addFiles(fileList);
      });

      expect(result.current.files).toHaveLength(2);
      expect(onError).toHaveBeenCalledWith('Maximum 2 files allowed');
    });

    it('should reject invalid file types', () => {
      const onError = jest.fn();
      const { result } = renderHook(() =>
        useMultiFileUpload({ ...defaultOptions, onError })
      );

      act(() => {
        result.current.addFiles(createMockFileList([
          { name: 'script.exe', type: 'application/x-msdownload', size: 1024 },
        ]));
      });

      expect(result.current.files).toHaveLength(0);
      expect(onError).toHaveBeenCalledWith('script.exe: Unsupported file type');
    });

    it('should reject files over 20MB', () => {
      const onError = jest.fn();
      const { result } = renderHook(() =>
        useMultiFileUpload({ ...defaultOptions, onError })
      );

      act(() => {
        result.current.addFiles(createMockFileList([
          { name: 'huge.pdf', type: 'application/pdf', size: 25 * 1024 * 1024 },
        ]));
      });

      expect(result.current.files).toHaveLength(0);
      expect(onError).toHaveBeenCalledWith('huge.pdf: File too large (max 20MB)');
    });
  });

  describe('removeFile', () => {
    it('should remove pending files by localIndex', () => {
      const { result } = renderHook(() => useMultiFileUpload(defaultOptions));

      act(() => {
        result.current.addFiles(createMockFileList([
          { name: 'doc1.pdf', type: 'application/pdf', size: 1024 },
          { name: 'doc2.pdf', type: 'application/pdf', size: 1024 },
        ]));
      });

      const firstIndex = result.current.files[0].localIndex;

      act(() => {
        result.current.removeFile(firstIndex);
      });

      expect(result.current.files).toHaveLength(1);
      expect(result.current.files[0].filename).toBe('doc2.pdf');
    });
  });

  describe('clearAll', () => {
    it('should remove all files', () => {
      const { result } = renderHook(() => useMultiFileUpload(defaultOptions));

      act(() => {
        result.current.addFiles(createMockFileList([
          { name: 'doc1.pdf', type: 'application/pdf', size: 1024 },
          { name: 'doc2.pdf', type: 'application/pdf', size: 1024 },
        ]));
      });

      act(() => {
        result.current.clearAll();
      });

      expect(result.current.files).toHaveLength(0);
    });
  });

  describe('computed values', () => {
    it('should compute isUploading correctly', () => {
      const { result } = renderHook(() => useMultiFileUpload(defaultOptions));

      expect(result.current.isUploading).toBe(false);

      act(() => {
        result.current.addFiles(createMockFileList([
          { name: 'doc.pdf', type: 'application/pdf', size: 1024 },
        ]));
      });

      // Pending is not uploading
      expect(result.current.isUploading).toBe(false);
    });

    it('should compute aggregateProgress correctly', () => {
      const { result } = renderHook(() => useMultiFileUpload(defaultOptions));

      // No files = 0%
      expect(result.current.aggregateProgress).toBe(0);

      act(() => {
        result.current.addFiles(createMockFileList([
          { name: 'doc.pdf', type: 'application/pdf', size: 1024 },
        ]));
      });

      // Pending = 0% progress
      expect(result.current.aggregateProgress).toBe(0);
    });

    it('should compute hasFiles correctly', () => {
      const { result } = renderHook(() => useMultiFileUpload(defaultOptions));

      expect(result.current.hasFiles).toBe(false);

      act(() => {
        result.current.addFiles(createMockFileList([
          { name: 'doc.pdf', type: 'application/pdf', size: 1024 },
        ]));
      });

      expect(result.current.hasFiles).toBe(true);
    });

    it('should compute hasPendingFiles correctly', () => {
      const { result } = renderHook(() => useMultiFileUpload(defaultOptions));

      expect(result.current.hasPendingFiles).toBe(false);

      act(() => {
        result.current.addFiles(createMockFileList([
          { name: 'doc.pdf', type: 'application/pdf', size: 1024 },
        ]));
      });

      expect(result.current.hasPendingFiles).toBe(true);
    });
  });

  describe('getCompletedFileIds', () => {
    it('should return empty array when no completed files', () => {
      const { result } = renderHook(() => useMultiFileUpload(defaultOptions));

      act(() => {
        result.current.addFiles(createMockFileList([
          { name: 'doc.pdf', type: 'application/pdf', size: 1024 },
        ]));
      });

      expect(result.current.getCompletedFileIds()).toEqual([]);
    });
  });
});

// Helper to create mock FileList
function createMockFileList(
  files: Array<{ name: string; type: string; size: number }>
): FileList {
  const mockFiles = files.map(f => ({
    name: f.name,
    type: f.type,
    size: f.size,
  } as File));

  return {
    length: mockFiles.length,
    item: (i: number) => mockFiles[i] || null,
    [Symbol.iterator]: function* () {
      for (const file of mockFiles) yield file;
    },
    ...mockFiles.reduce((acc, f, i) => ({ ...acc, [i]: f }), {}),
  } as unknown as FileList;
}
```

### Acceptance Criteria
- [ ] isUploading computed from stages
- [ ] aggregateProgress averages all file progress
- [ ] hasFiles returns true if any files
- [ ] hasPendingFiles returns true if any pending
- [ ] getCompletedFileIds returns only complete fileIds
- [ ] Tests cover addFiles validation
- [ ] Tests cover removeFile behavior
- [ ] Tests cover clearAll
- [ ] Tests cover computed values

---

## Completion Checklist

Before requesting code review:

- [ ] All 5 stories implemented
- [ ] `pnpm --filter @guardian/web test` passes
- [ ] No TypeScript errors
- [ ] "Never adopt" pattern preserved (via uploadId)
- [ ] uploadId correlation works correctly
- [ ] NO filename-based mapping
- [ ] AbortController cleanup on unmount

---

## Handoff Notes

After this track completes:
- Composer (Sprint 2) will use this hook for multi-file uploads
- FileChip (Track B) provides per-file UI
- Backend (Track A) provides uploadId array in HTTP 202 response
