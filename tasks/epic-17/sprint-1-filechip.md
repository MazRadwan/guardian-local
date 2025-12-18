# Sprint 1 - Track B: FileChip Enhancements

**Track:** B (FileChip)
**Stories:** 17.2.1 - 17.2.3
**Estimated Effort:** ~1 hour
**Parallel With:** Track A (Backend), Track C (Hook)
**Dependencies:** None

---

## Context

The FileChip component displays file metadata in the Composer. Currently it shows a single file with no removal capability. This track adds an `onRemove` callback and a compact variant for multi-file display.

**Key Files:**
- `apps/web/src/components/chat/FileChip.tsx`
- `apps/web/src/components/chat/__tests__/FileChip.test.tsx`

---

## Story 17.2.1: Add onRemove Callback

### Objective
Add an optional `onRemove` prop that renders an X button to remove the file.

### Current Props
```typescript
interface FileChipProps {
  filename: string;
  size: number;
  mimeType: string;
  progress?: {
    stage: 'uploading' | 'parsing' | 'complete' | 'error';
    percent: number;
  };
  error?: string;
}
```

### Target Props
```typescript
interface FileChipProps {
  filename: string;
  size: number;
  mimeType: string;
  progress?: {
    stage: 'uploading' | 'parsing' | 'complete' | 'error';
    percent: number;
  };
  error?: string;
  onRemove?: () => void;  // NEW: Optional remove callback
  disabled?: boolean;     // NEW: Disable during upload
}
```

### Implementation

```tsx
// FileChip.tsx
import { X } from 'lucide-react';

export function FileChip({
  filename,
  size,
  mimeType,
  progress,
  error,
  onRemove,
  disabled = false,
}: FileChipProps) {
  const isUploading = progress && progress.stage !== 'complete' && progress.stage !== 'error';

  return (
    <div className="relative flex items-center gap-2 px-3 py-2 bg-muted rounded-lg border">
      {/* File icon */}
      <FileIcon mimeType={mimeType} className="w-4 h-4 text-muted-foreground" />

      {/* File info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{filename}</p>
        <p className="text-xs text-muted-foreground">
          {formatFileSize(size)}
          {progress && progress.stage !== 'complete' && (
            <span className="ml-2">{progress.stage}... {progress.percent}%</span>
          )}
        </p>
      </div>

      {/* Error indicator */}
      {error && (
        <span className="text-xs text-destructive">{error}</span>
      )}

      {/* Remove button */}
      {onRemove && !disabled && (
        <button
          type="button"
          onClick={onRemove}
          disabled={isUploading}
          className="p-1 rounded-full hover:bg-muted-foreground/20 transition-colors
                     disabled:opacity-50 disabled:cursor-not-allowed"
          aria-label={`Remove ${filename}`}
        >
          <X className="w-4 h-4" />
        </button>
      )}

      {/* Upload progress bar */}
      {isUploading && (
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-muted-foreground/20 rounded-b-lg overflow-hidden">
          <div
            className="h-full bg-primary transition-all duration-300"
            style={{ width: `${progress.percent}%` }}
          />
        </div>
      )}
    </div>
  );
}
```

### Acceptance Criteria
- [ ] `onRemove` prop is optional
- [ ] X button only renders when `onRemove` provided
- [ ] X button disabled during upload (stage !== 'complete')
- [ ] `disabled` prop prevents removal entirely
- [ ] Accessible: has `aria-label` for screen readers
- [ ] Keyboard accessible: button is focusable

---

## Story 17.2.2: Compact Variant

### Objective
Add a `compact` variant for tighter layouts when displaying multiple files.

### Target Props Addition
```typescript
interface FileChipProps {
  // ... existing props
  variant?: 'default' | 'compact';  // NEW
}
```

### Implementation

```tsx
export function FileChip({
  filename,
  size,
  mimeType,
  progress,
  error,
  onRemove,
  disabled = false,
  variant = 'default',
}: FileChipProps) {
  const isCompact = variant === 'compact';
  const isUploading = progress && progress.stage !== 'complete' && progress.stage !== 'error';

  return (
    <div
      className={cn(
        'relative flex items-center gap-2 bg-muted rounded-lg border',
        isCompact ? 'px-2 py-1' : 'px-3 py-2'
      )}
    >
      {/* File icon - smaller in compact */}
      <FileIcon
        mimeType={mimeType}
        className={cn(
          'text-muted-foreground',
          isCompact ? 'w-3 h-3' : 'w-4 h-4'
        )}
      />

      {/* File info */}
      <div className="flex-1 min-w-0">
        <p className={cn(
          'font-medium truncate',
          isCompact ? 'text-xs' : 'text-sm'
        )}>
          {filename}
        </p>
        {!isCompact && (
          <p className="text-xs text-muted-foreground">
            {formatFileSize(size)}
            {progress && progress.stage !== 'complete' && (
              <span className="ml-2">{progress.stage}...</span>
            )}
          </p>
        )}
      </div>

      {/* Error indicator - icon only in compact */}
      {error && (
        isCompact ? (
          <AlertCircle className="w-3 h-3 text-destructive" />
        ) : (
          <span className="text-xs text-destructive">{error}</span>
        )
      )}

      {/* Remove button - smaller in compact */}
      {onRemove && !disabled && (
        <button
          type="button"
          onClick={onRemove}
          disabled={isUploading}
          className={cn(
            'rounded-full hover:bg-muted-foreground/20 transition-colors',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            isCompact ? 'p-0.5' : 'p-1'
          )}
          aria-label={`Remove ${filename}`}
        >
          <X className={isCompact ? 'w-3 h-3' : 'w-4 h-4'} />
        </button>
      )}

      {/* Progress bar - thinner in compact */}
      {isUploading && (
        <div className={cn(
          'absolute bottom-0 left-0 right-0 bg-muted-foreground/20 rounded-b-lg overflow-hidden',
          isCompact ? 'h-0.5' : 'h-1'
        )}>
          <div
            className="h-full bg-primary transition-all duration-300"
            style={{ width: `${progress?.percent ?? 0}%` }}
          />
        </div>
      )}
    </div>
  );
}
```

### Visual Comparison

**Default variant:**
```
┌─────────────────────────────────────┐
│ 📄 document.pdf                   ✕ │
│    1.2 MB · uploading... 45%        │
│ ▓▓▓▓▓▓▓▓▓░░░░░░░░░░░░░░░░░░░░░░░░░ │
└─────────────────────────────────────┘
```

**Compact variant:**
```
┌────────────────────────┐
│ 📄 document.pdf      ✕ │
│ ▓▓▓▓▓▓░░░░░░░░░░░░░░░░ │
└────────────────────────┘
```

### Acceptance Criteria
- [ ] `variant` prop defaults to `'default'`
- [ ] Compact: smaller padding, font, icons
- [ ] Compact: hides file size text
- [ ] Compact: shows error as icon only
- [ ] Both variants maintain functionality
- [ ] Tailwind `cn()` helper used for conditional classes

---

## Story 17.2.3: FileChip Unit Tests

### Objective
Add tests for new functionality.

### Test Cases

```tsx
// FileChip.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { FileChip } from '../FileChip';

describe('FileChip', () => {
  const defaultProps = {
    filename: 'document.pdf',
    size: 1024 * 1024, // 1MB
    mimeType: 'application/pdf',
  };

  describe('onRemove callback', () => {
    it('should not render X button when onRemove not provided', () => {
      render(<FileChip {...defaultProps} />);

      expect(screen.queryByRole('button', { name: /remove/i })).not.toBeInTheDocument();
    });

    it('should render X button when onRemove provided', () => {
      const onRemove = jest.fn();
      render(<FileChip {...defaultProps} onRemove={onRemove} />);

      expect(screen.getByRole('button', { name: /remove document\.pdf/i })).toBeInTheDocument();
    });

    it('should call onRemove when X button clicked', () => {
      const onRemove = jest.fn();
      render(<FileChip {...defaultProps} onRemove={onRemove} />);

      fireEvent.click(screen.getByRole('button', { name: /remove/i }));

      expect(onRemove).toHaveBeenCalledTimes(1);
    });

    it('should disable X button during upload', () => {
      const onRemove = jest.fn();
      render(
        <FileChip
          {...defaultProps}
          onRemove={onRemove}
          progress={{ stage: 'uploading', percent: 50 }}
        />
      );

      const button = screen.getByRole('button', { name: /remove/i });
      expect(button).toBeDisabled();

      fireEvent.click(button);
      expect(onRemove).not.toHaveBeenCalled();
    });

    it('should enable X button when upload complete', () => {
      const onRemove = jest.fn();
      render(
        <FileChip
          {...defaultProps}
          onRemove={onRemove}
          progress={{ stage: 'complete', percent: 100 }}
        />
      );

      const button = screen.getByRole('button', { name: /remove/i });
      expect(button).not.toBeDisabled();
    });

    it('should not render X button when disabled prop is true', () => {
      const onRemove = jest.fn();
      render(<FileChip {...defaultProps} onRemove={onRemove} disabled />);

      expect(screen.queryByRole('button', { name: /remove/i })).not.toBeInTheDocument();
    });
  });

  describe('compact variant', () => {
    it('should render default variant by default', () => {
      render(<FileChip {...defaultProps} />);

      // File size should be visible in default
      expect(screen.getByText(/1.*MB/i)).toBeInTheDocument();
    });

    it('should hide file size in compact variant', () => {
      render(<FileChip {...defaultProps} variant="compact" />);

      // File size should NOT be visible in compact
      expect(screen.queryByText(/1.*MB/i)).not.toBeInTheDocument();
    });

    it('should render filename in both variants', () => {
      const { rerender } = render(<FileChip {...defaultProps} />);
      expect(screen.getByText('document.pdf')).toBeInTheDocument();

      rerender(<FileChip {...defaultProps} variant="compact" />);
      expect(screen.getByText('document.pdf')).toBeInTheDocument();
    });

    it('should show error icon instead of text in compact variant', () => {
      render(<FileChip {...defaultProps} variant="compact" error="Upload failed" />);

      // Should NOT show error text
      expect(screen.queryByText('Upload failed')).not.toBeInTheDocument();
      // Should show error icon (AlertCircle has role="img" or similar)
    });
  });

  describe('accessibility', () => {
    it('should have accessible remove button label', () => {
      render(<FileChip {...defaultProps} onRemove={() => {}} />);

      expect(screen.getByRole('button', { name: 'Remove document.pdf' })).toBeInTheDocument();
    });

    it('should be keyboard accessible', () => {
      const onRemove = jest.fn();
      render(<FileChip {...defaultProps} onRemove={onRemove} />);

      const button = screen.getByRole('button', { name: /remove/i });
      button.focus();

      fireEvent.keyDown(button, { key: 'Enter' });
      expect(onRemove).toHaveBeenCalled();
    });
  });
});
```

### Acceptance Criteria
- [ ] Test: X button renders conditionally
- [ ] Test: onRemove callback fires on click
- [ ] Test: X button disabled during upload
- [ ] Test: X button enabled when complete
- [ ] Test: disabled prop hides X button
- [ ] Test: compact variant hides file size
- [ ] Test: accessibility labels present
- [ ] All existing tests still pass

---

## Completion Checklist

Before requesting code review:

- [ ] All 3 stories implemented
- [ ] `npm test` passes in `apps/web`
- [ ] No TypeScript errors
- [ ] Component renders correctly in both variants
- [ ] Existing FileChip usage unaffected (backward compatible)

---

## Handoff Notes

After this track completes:
- Composer (Sprint 2) will use `onRemove` to let users remove files
- Composer will use `variant="compact"` when displaying multiple files
- No changes needed to FileChipInChat (chat message display)
