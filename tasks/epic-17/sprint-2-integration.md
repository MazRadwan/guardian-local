# Sprint 2: Integration

**Stories:** 17.4.1 - 17.5.2
**Estimated Effort:** ~3-4 hours
**Prerequisites:** Sprint 1 (all tracks) complete and code-reviewed
**Execution:** Sequential

---

## Context

Sprint 1 delivered three independent components:
- **Track A:** Backend multi-file upload endpoint
- **Track B:** FileChip with onRemove and compact variant
- **Track C:** useMultiFileUpload hook

Sprint 2 integrates these into the Composer and validates the full flow.

**Key Files:**
- `apps/web/src/components/chat/Composer.tsx`
- `apps/web/src/components/chat/__tests__/Composer.test.tsx`

---

## Story 17.4.1: Composer Multi-Chip Layout

### Objective
Update Composer to use `useMultiFileUpload` and render multiple FileChips.

### Current Implementation
```tsx
// Composer.tsx (simplified)
const { fileMetadata, uploadProgress } = useFileUpload();

return (
  <div>
    {fileMetadata && (
      <FileChip
        filename={fileMetadata.filename}
        size={fileMetadata.size}
        mimeType={fileMetadata.mimeType}
        progress={uploadProgress}
      />
    )}
    <textarea />
    <button>Send</button>
  </div>
);
```

### Target Implementation
```tsx
// Composer.tsx
import { useMultiFileUpload } from '@/hooks/useMultiFileUpload';
import { FileChip } from './FileChip';

export function Composer({ conversationId, mode, onSend }: ComposerProps) {
  const [text, setText] = useState('');

  const {
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
  } = useMultiFileUpload({
    maxFiles: 10,
    onError: (msg) => toast.error(msg),
  });

  // File input ref
  const fileInputRef = useRef<HTMLInputElement>(null);

  /**
   * Handle file selection
   */
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      addFiles(e.target.files);
    }
    // Reset input to allow re-selecting same file
    e.target.value = '';
  };

  /**
   * Trigger file picker
   */
  const openFilePicker = () => {
    fileInputRef.current?.click();
  };

  /**
   * Handle send
   */
  const handleSend = async () => {
    // Upload pending files first
    if (hasPendingFiles) {
      await uploadAll(conversationId, mode);
    }

    // Get completed file IDs
    const attachments = getCompletedFileIds().map(fileId => ({ fileId }));

    // Send message
    onSend(text, attachments);

    // Clear state
    setText('');
    clearAll();
  };

  // Determine layout based on file count
  const useCompactChips = files.length > 3;

  return (
    <div className="flex flex-col gap-2 p-4 border-t">
      {/* File chips */}
      {hasFiles && (
        <div className="flex flex-wrap gap-2">
          {files.map((file) => (
            <FileChip
              key={file.tempId}
              filename={file.filename}
              size={file.size}
              mimeType={file.mimeType}
              progress={{
                stage: file.status === 'pending' ? 'complete' : file.status,
                percent: file.progress,
              }}
              error={file.error}
              onRemove={() => removeFile(file.tempId)}
              variant={useCompactChips ? 'compact' : 'default'}
              disabled={isUploading}
            />
          ))}
        </div>
      )}

      {/* Input row */}
      <div className="flex items-center gap-2">
        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,.doc,.docx,.txt"
          onChange={handleFileSelect}
          className="hidden"
        />

        {/* Attach button */}
        <button
          type="button"
          onClick={openFilePicker}
          disabled={isUploading || files.length >= 10}
          className="p-2 rounded-lg hover:bg-muted"
          aria-label="Attach files"
        >
          <Paperclip className="w-5 h-5" />
        </button>

        {/* Text input */}
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type a message..."
          className="flex-1 resize-none"
          rows={1}
        />

        {/* Send button */}
        <button
          onClick={handleSend}
          disabled={isUploading || (!text.trim() && !hasFiles)}
          className="p-2 rounded-lg bg-primary text-primary-foreground"
        >
          {isUploading ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <Send className="w-5 h-5" />
          )}
        </button>
      </div>

      {/* Upload progress bar (aggregate) */}
      {isUploading && (
        <div className="h-1 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-primary transition-all"
            style={{ width: `${aggregateProgress}%` }}
          />
        </div>
      )}
    </div>
  );
}
```

### Layout Behavior

| Files | Layout |
|-------|--------|
| 1-3 | Default chips, full width |
| 4-10 | Compact chips, flex-wrap |
| 10+ | Not allowed (blocked at add) |

### Acceptance Criteria
- [ ] Uses `useMultiFileUpload` hook
- [ ] Renders FileChip for each file
- [ ] Supports `multiple` on file input
- [ ] Switches to compact variant at 4+ files
- [ ] Attach button disabled when max files reached
- [ ] Send button shows loading during upload
- [ ] Aggregate progress bar shown during upload

---

## Story 17.4.2: Composer File Removal UX

### Objective
Ensure smooth file removal experience with proper state handling.

### Implementation Details

```tsx
// Removal constraints
const canRemoveFile = (file: FileState): boolean => {
  // Can remove if pending or error
  if (file.status === 'pending' || file.status === 'error') return true;
  // Can remove if complete (before sending)
  if (file.status === 'complete') return true;
  // Cannot remove while uploading/parsing
  return false;
};
```

### Edge Cases

1. **Remove during upload:** Disabled (X button not clickable)
2. **Remove after error:** Allowed (lets user remove failed files)
3. **Remove after complete:** Allowed (user changed mind)
4. **Remove all:** Should work via clearAll on send

### Keyboard Navigation

```tsx
// FileChip should support:
// - Tab to focus X button
// - Enter/Space to trigger remove
// - Escape to blur (optional)
```

### Acceptance Criteria
- [ ] X button visible on each FileChip
- [ ] Cannot remove while uploading (disabled state)
- [ ] Can remove pending, error, or complete files
- [ ] Removal updates state immediately
- [ ] Keyboard accessible (Tab + Enter)

---

## Story 17.4.3: Composer Tests

### Objective
Test multi-file Composer behavior.

### Test Cases

```tsx
// Composer.test.tsx

describe('Multi-file upload', () => {
  it('should render multiple file chips', async () => {
    render(<Composer conversationId="123" mode="intake" onSend={jest.fn()} />);

    // Simulate file selection
    const input = screen.getByLabelText(/attach/i).querySelector('input');
    const files = [
      new File(['a'], 'doc1.pdf', { type: 'application/pdf' }),
      new File(['b'], 'doc2.pdf', { type: 'application/pdf' }),
    ];

    await userEvent.upload(input!, files);

    expect(screen.getByText('doc1.pdf')).toBeInTheDocument();
    expect(screen.getByText('doc2.pdf')).toBeInTheDocument();
  });

  it('should remove individual files', async () => {
    render(<Composer conversationId="123" mode="intake" onSend={jest.fn()} />);

    // Add files
    const input = screen.getByLabelText(/attach/i).querySelector('input');
    await userEvent.upload(input!, [
      new File(['a'], 'doc1.pdf', { type: 'application/pdf' }),
      new File(['b'], 'doc2.pdf', { type: 'application/pdf' }),
    ]);

    // Remove first file
    const removeButtons = screen.getAllByRole('button', { name: /remove/i });
    await userEvent.click(removeButtons[0]);

    expect(screen.queryByText('doc1.pdf')).not.toBeInTheDocument();
    expect(screen.getByText('doc2.pdf')).toBeInTheDocument();
  });

  it('should use compact variant for 4+ files', async () => {
    render(<Composer conversationId="123" mode="intake" onSend={jest.fn()} />);

    const input = screen.getByLabelText(/attach/i).querySelector('input');
    const files = Array(4).fill(null).map((_, i) =>
      new File(['x'], `doc${i}.pdf`, { type: 'application/pdf' })
    );

    await userEvent.upload(input!, files);

    // Check for compact styling (implementation-specific)
    // Could check for specific class or data attribute
  });

  it('should disable attach button at max files', async () => {
    render(<Composer conversationId="123" mode="intake" onSend={jest.fn()} />);

    const input = screen.getByLabelText(/attach/i).querySelector('input');
    const files = Array(10).fill(null).map((_, i) =>
      new File(['x'], `doc${i}.pdf`, { type: 'application/pdf' })
    );

    await userEvent.upload(input!, files);

    const attachButton = screen.getByRole('button', { name: /attach/i });
    expect(attachButton).toBeDisabled();
  });

  it('should show aggregate progress during upload', async () => {
    // Mock uploadAll to simulate progress
    // ...
  });

  it('should clear files after successful send', async () => {
    const onSend = jest.fn();
    render(<Composer conversationId="123" mode="intake" onSend={onSend} />);

    // Add file and send
    // ...

    expect(screen.queryByRole('button', { name: /remove/i })).not.toBeInTheDocument();
  });
});
```

### Acceptance Criteria
- [ ] Test: Multiple chips render
- [ ] Test: Individual file removal
- [ ] Test: Compact variant at 4+ files
- [ ] Test: Max files disables attach button
- [ ] Test: Progress shown during upload
- [ ] Test: Files cleared after send
- [ ] All existing Composer tests pass

---

## Story 17.5.1: E2E Multi-File Flow

### Objective
Validate complete flow from file selection to message send.

### Test Scenario

```typescript
// e2e/multi-file-upload.test.ts

describe('Multi-file upload E2E', () => {
  it('should upload multiple files and send message', async () => {
    // 1. Login and navigate to chat
    await loginAsTestUser();
    await navigateToConversation('intake');

    // 2. Select multiple files
    const fileInput = await page.$('input[type="file"]');
    await fileInput.uploadFile([
      './fixtures/test-doc-1.pdf',
      './fixtures/test-doc-2.pdf',
    ]);

    // 3. Verify chips appear
    await expect(page.getByText('test-doc-1.pdf')).toBeVisible();
    await expect(page.getByText('test-doc-2.pdf')).toBeVisible();

    // 4. Type message and send
    await page.fill('textarea', 'Here are the documents');
    await page.click('button:has-text("Send")');

    // 5. Wait for upload to complete
    await page.waitForSelector('[data-testid="message-sent"]');

    // 6. Verify message appears in chat with attachments
    const message = await page.getByTestId('chat-message').last();
    await expect(message).toContainText('Here are the documents');
    await expect(message).toContainText('test-doc-1.pdf');
    await expect(message).toContainText('test-doc-2.pdf');
  });

  it('should handle partial upload failure', async () => {
    // Upload one valid and one invalid file
    // Verify error state on failed file
    // Verify successful file still works
  });

  it('should allow removing files before send', async () => {
    // Upload files
    // Remove one
    // Send
    // Verify only remaining files in message
  });
});
```

### Acceptance Criteria
- [ ] Full flow works: select → upload → send → appears in chat
- [ ] Partial failures show error per file
- [ ] Files can be removed before sending
- [ ] Progress indicators visible during upload
- [ ] Chat message shows all attached files

---

## Story 17.5.2: Error Handling Polish

### Objective
Ensure graceful error handling and user feedback.

### Error Scenarios

| Scenario | Handling |
|----------|----------|
| File too large | Toast error, file not added |
| Invalid type | Toast error, file not added |
| Max files reached | Toast error, excess files rejected |
| Upload network error | File shows error state, retry available |
| Parsing failure | File shows error state, retry available |
| Partial batch failure | Success files work, failed files show error |

### Implementation

```tsx
// Error toast handling
const {
  addFiles,
  // ...
} = useMultiFileUpload({
  onError: (message) => {
    toast.error(message, {
      duration: 4000,
    });
  },
});

// Retry button in FileChip (optional enhancement)
{file.status === 'error' && (
  <button onClick={() => retryFile(file.tempId)}>
    Retry
  </button>
)}
```

### Acceptance Criteria
- [ ] Validation errors show toast
- [ ] Upload errors show on individual FileChip
- [ ] Retry is available for failed files
- [ ] Partial failures don't block successful files
- [ ] Error messages are user-friendly

---

## Completion Checklist

Before requesting code review:

- [ ] All Sprint 2 stories implemented
- [ ] Full E2E flow tested manually
- [ ] All tests pass (`npm test`)
- [ ] No TypeScript errors
- [ ] Single-file flow still works (backward compatibility)
- [ ] Error handling covers all scenarios

---

## Epic 17 Definition of Done

When Sprint 2 is complete and code-reviewed:

- [ ] User can select up to 10 files at once
- [ ] Each file shows individual progress
- [ ] Files can be removed before sending
- [ ] Partial failures handled gracefully
- [ ] Message appears in chat with all attachments
- [ ] Backward compatible with single-file usage
- [ ] All tests pass
- [ ] Code review approved
