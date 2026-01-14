# Story 19.5.2: Integrate dropzone with Composer (visual + tests)

## Description

Integrate react-dropzone with the Composer component to enable drag-and-drop file upload. Add visual feedback during drag operations and comprehensive tests. This story combines integration, visual feedback, and testing per GPT review recommendation.

## Acceptance Criteria

### Core Functionality
- [ ] Composer component wraps content with dropzone
- [ ] Dropping files calls addFiles() (same as paperclip)
- [ ] Drop rejection shows toast error
- [ ] File count limit (10) enforced across drag-drop and paperclip
- [ ] Drop disabled when upload disabled (no wsAdapter or conversationId)
- [ ] Drop disabled when streaming or loading (mirrors paperclip behavior)
- [ ] Drop disabled when `disabled` prop is true
- [ ] Existing click-to-upload via paperclip still works

### Hook Signature Update (Required)
- [ ] `addFiles` signature updated to accept `FileList | File[]`
- [ ] Existing FileList callers continue to work unchanged

### Visual Feedback
- [ ] Border changes to purple (border-2) when dragging valid files
- [ ] Border changes to red when dragging invalid files (isDragReject)
- [ ] Subtle background tint during drag
- [ ] "Drop files here" text overlay during drag
- [ ] Transitions are smooth (200ms)
- [ ] Visual feedback clears immediately when drag ends

### Accessibility
- [ ] Non-color cue (text) for drag state
- [ ] aria-live region announces drag state changes (overlay has role="status" aria-live="polite")
- [ ] Toast errors for rejections (Sonner provides built-in aria-live announcements)
- [ ] No interference with textarea keyboard navigation

### Tests
- [ ] Dropping valid files calls addFiles
- [ ] Dropping invalid file types shows error toast
- [ ] Dropping over max file count shows error
- [ ] Visual feedback classes applied during drag
- [ ] Paperclip button still works
- [ ] Drop disabled when isStreaming=true (no overlay, addFiles not called)
- [ ] Drop disabled when isLoading=true (no overlay, addFiles not called)
- [ ] Drop disabled when disabled=true

## Technical Approach

### 0. Update hook signature (REQUIRED FIRST)

In `apps/web/src/hooks/useMultiFileUpload.ts`, update `addFiles` to accept both types:

```typescript
// Line ~182: Update interface
addFiles: (files: FileList | File[]) => void;

// Line ~341: Update implementation (no logic change needed - Array.from handles both)
const addFiles = useCallback(
  (files: FileList | File[]) => {
    // Convert to array (works for both FileList and File[])
    const filesToAdd = Array.from(files);
    // ... rest unchanged
```

### 1. Import and configure dropzone

```typescript
import { useDropzone } from 'react-dropzone';

// Compute disabled state (mirrors paperclip behavior)
const isBusy = isStreaming || isLoading;
const dropzoneDisabled = disabled || !uploadEnabled || files.length >= 10 || isBusy;

const { getRootProps, getInputProps, isDragActive, isDragReject } = useDropzone({
  accept: {
    'application/pdf': ['.pdf'],
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
    'image/png': ['.png'],
    'image/jpeg': ['.jpg', '.jpeg'],
  },
  maxSize: 20 * 1024 * 1024,  // 20MB per file (matches server)
  maxFiles: 10 - files.length,
  disabled: dropzoneDisabled,  // All conditions: disabled, !uploadEnabled, max files, streaming/loading
  noClick: true,      // Paperclip handles click
  noKeyboard: true,   // Don't hijack textarea shortcuts
  onDrop: (acceptedFiles) => {
    addFiles(acceptedFiles);  // Works because hook now accepts File[]
  },
  onDropRejected: (fileRejections) => {
    fileRejections.forEach(({ errors }) => {
      errors.forEach(e => toast.error(e.message));
    });
  },
});
```

### 2. Wrap composer container

```tsx
<div
  {...getRootProps()}
  className={cn(
    'border border-gray-200 rounded-2xl shadow-lg bg-white overflow-hidden transition-all duration-200 relative',
    isDragActive && !isDragReject && 'border-purple-500 border-2 bg-purple-50/30',
    isDragReject && 'border-red-500 border-2 bg-red-50/30'
  )}
>
  {/* Drag overlay */}
  {isDragActive && (
    <div
      className="absolute inset-0 flex items-center justify-center bg-purple-500/10 rounded-2xl pointer-events-none z-10"
      role="status"
      aria-live="polite"
    >
      <span className={cn(
        'font-medium',
        isDragReject ? 'text-red-600' : 'text-purple-600'
      )}>
        {isDragReject ? 'Invalid file type' : 'Drop files here'}
      </span>
    </div>
  )}

  {/* Hidden dropzone input */}
  <input {...getInputProps()} />

  {/* Rest of composer content */}
</div>
```

### 3. Keep existing file input for paperclip
The dropzone input is separate - both coexist. Paperclip uses existing hidden input.

## Files Touched

- `apps/web/src/hooks/useMultiFileUpload.ts` - Update addFiles signature to accept `FileList | File[]`
- `apps/web/src/components/chat/Composer.tsx` - Add dropzone integration + visual feedback
- `apps/web/src/components/chat/__tests__/Composer.dragdrop.test.tsx` - NEW: Drag-drop tests

## Agent Assignment

- [x] frontend-agent

## Tests Required

Create `Composer.dragdrop.test.tsx`:

```typescript
// Helper for creating mock DataTransfer
const createMockDataTransfer = (files: File[]) => ({
  files,
  types: ['Files'],
  items: files.map(f => ({ kind: 'file', type: f.type, getAsFile: () => f })),
});

describe('Composer Drag & Drop', () => {
  it('should show drag feedback on dragEnter', async () => {
    // Test isDragActive adds visual classes
  });

  it('should call addFiles on valid file drop', async () => {
    // Test files are added to upload queue
  });

  it('should show error toast on invalid file type', async () => {
    // Test rejection handling
  });

  it('should reject files when at max count', async () => {
    // Test maxFiles enforcement
  });

  it('should be disabled when uploadEnabled is false', async () => {
    // Test disabled state
  });

  it('should not interfere with paperclip upload', async () => {
    // Test existing functionality preserved
  });

  // NEW: Streaming/loading disabled tests (mirrors paperclip behavior)
  it('should not show drag overlay when isStreaming=true', async () => {
    // Render with isStreaming=true
    // Fire dragEnter event
    // Assert overlay NOT visible
    // Assert addFiles NOT called on drop
  });

  it('should not show drag overlay when isLoading=true', async () => {
    // Render with isLoading=true
    // Fire dragEnter event
    // Assert overlay NOT visible
    // Assert addFiles NOT called on drop
  });

  it('should not accept drops when disabled=true', async () => {
    // Render with disabled=true
    // Fire drop event with valid file
    // Assert addFiles NOT called
  });
});
```

## Definition of Done

- [ ] All acceptance criteria met
- [ ] Drag-drop and click-upload both functional
- [ ] Visual feedback polished and accessible
- [ ] Tests written and passing
- [ ] No TypeScript errors
- [ ] No lint errors
- [ ] Manual testing in Chrome, Firefox, Safari

## Estimated Time

~2 hours

## Design Notes

- Purple (#7c3aed / purple-600) matches existing button colors
- Subtle background tint (bg-purple-50/30) maintains readability
- Border goes from 1px to 2px (noticeable but not jarring)
- Transition 200ms feels responsive but smooth
- Red for rejection provides clear error state

## Security Notes (from GPT review)

- File type/size constraints mirror server validation
- Filenames treated as untrusted (React escaping)
- No file content parsing on drop
