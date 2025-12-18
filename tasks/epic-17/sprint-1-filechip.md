# Sprint 1 - Track B: FileChip Enhancements

**Track:** B (FileChip)
**Stories:** 17.2.1 - 17.2.3
**Estimated Effort:** ~1 hour
**Parallel With:** Track A (Backend), Track C (Hook)
**Dependencies:** None

---

## Context

The FileChip component displays file metadata in the Composer during upload. It already has:
- Filename display with truncation
- Stage-based progress indicator
- X button with `onRemove` callback (ALWAYS visible, can cancel at any stage)
- Error state display

This track adds two new props for multi-file support:
- `disabled` prop to prevent removal during batch operations
- `variant` prop for compact display when showing multiple files

**Key Files:**
- `apps/web/src/components/chat/FileChip.tsx`
- `apps/web/src/components/chat/__tests__/FileChip.test.tsx`

---

## Current Implementation (Actual)

```typescript
// FileChip.tsx - ACTUAL current props
export interface FileChipProps {
  filename: string;
  stage: 'uploading' | 'storing' | 'parsing' | 'complete' | 'error';
  progress: number; // 0-100
  error?: string;
  onRemove: () => void; // REQUIRED - X button always visible
}
```

**Current behavior:**
- X button is ALWAYS visible and clickable (can cancel at any stage)
- Progress bar shown during `uploading`, `storing`, `parsing` stages
- Error message shown in `error` stage
- "Ready" indicator shown in `complete` stage

---

## Story 17.2.1: Add disabled Prop

### Objective
Add `disabled` prop to prevent removal during batch upload operations.

### Rationale
For multi-file uploads, when one file is uploading we may want to prevent removing OTHER files (or all files). The `disabled` prop gives the parent component control over whether removal is allowed.

### Target Props
```typescript
export interface FileChipProps {
  filename: string;
  stage: 'uploading' | 'storing' | 'parsing' | 'complete' | 'error';
  progress: number;
  error?: string;
  onRemove: () => void;
  disabled?: boolean;  // NEW: When true, X button is hidden/disabled
}
```

### Implementation

```tsx
// FileChip.tsx
export function FileChip({
  filename,
  stage,
  progress,
  error,
  onRemove,
  disabled = false,  // NEW
}: FileChipProps) {
  const isActive = ['uploading', 'storing', 'parsing'].includes(stage);
  const isError = stage === 'error';
  const isComplete = stage === 'complete';

  return (
    <div className={cn(/* existing classes */)}>
      {/* ... existing icon + filename ... */}

      {/* X button - only show if not disabled */}
      {!disabled && (
        <button
          type="button"
          onClick={onRemove}
          className="p-0.5 text-gray-400 hover:text-gray-600 rounded flex-shrink-0 transition-colors"
          aria-label="Remove file"
        >
          <X className="h-4 w-4" />
        </button>
      )}

      {/* ... rest of component ... */}
    </div>
  );
}
```

### Acceptance Criteria
- [ ] `disabled` prop is optional, defaults to `false`
- [ ] When `disabled=true`, X button is not rendered
- [ ] When `disabled=false` (default), X button works as before
- [ ] Existing behavior unchanged (backward compatible)

---

## Story 17.2.2: Compact Variant

### Objective
Add `variant` prop with compact mode for tighter layouts when displaying multiple files.

### Target Props Addition
```typescript
export interface FileChipProps {
  // ... existing props
  disabled?: boolean;
  variant?: 'default' | 'compact';  // NEW
}
```

### Implementation

```tsx
export function FileChip({
  filename,
  stage,
  progress,
  error,
  onRemove,
  disabled = false,
  variant = 'default',
}: FileChipProps) {
  const isCompact = variant === 'compact';
  const isActive = ['uploading', 'storing', 'parsing'].includes(stage);
  const isError = stage === 'error';
  const isComplete = stage === 'complete';

  return (
    <div
      className={cn(
        'inline-flex flex-col gap-1 rounded-lg border',
        isCompact ? 'px-2 py-1' : 'px-3 py-2',
        isError ? 'bg-red-50 border-red-200' : 'bg-gray-100 border-gray-200'
      )}
      role="status"
      aria-label={`File ${filename}: ${getStatusText()}`}
    >
      {/* Top row: Icon + Filename + X button */}
      <div className="flex items-center gap-2">
        {/* Icon - smaller in compact */}
        {isActive && (
          <Loader2
            className={cn(
              'text-blue-500 animate-spin flex-shrink-0',
              isCompact ? 'h-3 w-3' : 'h-4 w-4'
            )}
            aria-hidden="true"
          />
        )}
        {isComplete && (
          <CheckCircle
            className={cn(
              'text-green-600 flex-shrink-0',
              isCompact ? 'h-3 w-3' : 'h-4 w-4'
            )}
            aria-hidden="true"
          />
        )}
        {isError && (
          <AlertCircle
            className={cn(
              'text-red-500 flex-shrink-0',
              isCompact ? 'h-3 w-3' : 'h-4 w-4'
            )}
            aria-hidden="true"
          />
        )}

        {/* Filename - narrower max-width in compact */}
        <span
          className={cn(
            'text-gray-900 truncate',
            isCompact ? 'text-xs max-w-[120px]' : 'text-sm max-w-[180px]'
          )}
          title={filename}
        >
          {filename}
        </span>

        {/* X button - smaller in compact */}
        {!disabled && (
          <button
            type="button"
            onClick={onRemove}
            className={cn(
              'text-gray-400 hover:text-gray-600 rounded flex-shrink-0 transition-colors',
              isCompact ? 'p-0' : 'p-0.5'
            )}
            aria-label="Remove file"
          >
            <X className={isCompact ? 'h-3 w-3' : 'h-4 w-4'} />
          </button>
        )}
      </div>

      {/* Progress bar - thinner in compact, hide percentage text */}
      {isActive && (
        <div className="flex items-center gap-2">
          <div
            className={cn(
              'flex-1 bg-gray-300 rounded-full overflow-hidden',
              isCompact ? 'h-0.5' : 'h-0.5'
            )}
          >
            <div
              className="h-full bg-blue-500 transition-all duration-300"
              style={{ width: `${progress}%` }}
              role="progressbar"
              aria-valuenow={progress}
              aria-valuemin={0}
              aria-valuemax={100}
            />
          </div>
          {/* Hide progress text in compact mode */}
          {!isCompact && (
            <span className="text-xs text-gray-500 min-w-[60px] text-right">
              {getStatusText()}
            </span>
          )}
        </div>
      )}

      {/* Error message - icon only in compact */}
      {isError && error && (
        isCompact ? null : (
          <span className="text-xs text-red-600 truncate" title={error}>
            {error}
          </span>
        )
      )}

      {/* Success indicator - hide in compact */}
      {isComplete && !isCompact && (
        <span className="text-xs text-green-600">Ready</span>
      )}
    </div>
  );
}
```

### Visual Comparison

**Default variant:**
```
┌─────────────────────────────────────┐
│ ⟳ document.pdf                    ✕ │
│ ▓▓▓▓▓▓▓▓▓░░░░░░░░░░░░░░░░░░░   45% │
└─────────────────────────────────────┘
```

**Compact variant:**
```
┌──────────────────────┐
│ ⟳ document.pdf     ✕ │
│ ▓▓▓▓▓▓░░░░░░░░░░░░░░ │
└──────────────────────┘
```

### Acceptance Criteria
- [ ] `variant` prop defaults to `'default'`
- [ ] Compact: smaller padding, font, icons
- [ ] Compact: hides progress percentage text
- [ ] Compact: hides error text (icon remains)
- [ ] Compact: hides "Ready" text (icon remains)
- [ ] Both variants maintain full functionality
- [ ] Tailwind `cn()` helper used for conditional classes

---

## Story 17.2.3: FileChip Unit Tests

### Objective
Add tests for new `disabled` and `variant` props.

### Test Cases

```tsx
// FileChip.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { FileChip } from '../FileChip';

describe('FileChip', () => {
  const defaultProps = {
    filename: 'document.pdf',
    stage: 'complete' as const,
    progress: 100,
    onRemove: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('disabled prop', () => {
    it('should render X button by default (disabled=false)', () => {
      render(<FileChip {...defaultProps} />);

      expect(screen.getByRole('button', { name: /remove/i })).toBeInTheDocument();
    });

    it('should hide X button when disabled=true', () => {
      render(<FileChip {...defaultProps} disabled />);

      expect(screen.queryByRole('button', { name: /remove/i })).not.toBeInTheDocument();
    });

    it('should call onRemove when X clicked and not disabled', () => {
      const onRemove = jest.fn();
      render(<FileChip {...defaultProps} onRemove={onRemove} />);

      fireEvent.click(screen.getByRole('button', { name: /remove/i }));

      expect(onRemove).toHaveBeenCalledTimes(1);
    });

    it('should default disabled to false', () => {
      render(<FileChip {...defaultProps} />);

      // X button should be present (default is not disabled)
      expect(screen.getByRole('button', { name: /remove/i })).toBeInTheDocument();
    });
  });

  describe('variant prop', () => {
    it('should render default variant by default', () => {
      render(
        <FileChip
          {...defaultProps}
          stage="uploading"
          progress={45}
        />
      );

      // Default shows progress percentage text
      expect(screen.getByText('45%')).toBeInTheDocument();
    });

    it('should hide progress text in compact variant', () => {
      render(
        <FileChip
          {...defaultProps}
          stage="uploading"
          progress={45}
          variant="compact"
        />
      );

      // Compact hides progress text
      expect(screen.queryByText('45%')).not.toBeInTheDocument();
    });

    it('should render filename in both variants', () => {
      const { rerender } = render(<FileChip {...defaultProps} />);
      expect(screen.getByText('document.pdf')).toBeInTheDocument();

      rerender(<FileChip {...defaultProps} variant="compact" />);
      expect(screen.getByText('document.pdf')).toBeInTheDocument();
    });

    it('should hide error text in compact variant', () => {
      render(
        <FileChip
          {...defaultProps}
          stage="error"
          progress={0}
          error="Upload failed"
          variant="compact"
        />
      );

      // Error text hidden in compact (icon still shows via AlertCircle)
      expect(screen.queryByText('Upload failed')).not.toBeInTheDocument();
    });

    it('should show error text in default variant', () => {
      render(
        <FileChip
          {...defaultProps}
          stage="error"
          progress={0}
          error="Upload failed"
        />
      );

      expect(screen.getByText('Upload failed')).toBeInTheDocument();
    });

    it('should hide Ready text in compact variant', () => {
      render(
        <FileChip
          {...defaultProps}
          stage="complete"
          progress={100}
          variant="compact"
        />
      );

      expect(screen.queryByText('Ready')).not.toBeInTheDocument();
    });

    it('should show Ready text in default variant', () => {
      render(
        <FileChip
          {...defaultProps}
          stage="complete"
          progress={100}
        />
      );

      expect(screen.getByText('Ready')).toBeInTheDocument();
    });
  });

  describe('accessibility', () => {
    it('should have accessible remove button label', () => {
      render(<FileChip {...defaultProps} />);

      expect(screen.getByRole('button', { name: 'Remove file' })).toBeInTheDocument();
    });

    it('should have status role with file info', () => {
      render(<FileChip {...defaultProps} />);

      expect(screen.getByRole('status')).toHaveAttribute(
        'aria-label',
        expect.stringContaining('document.pdf')
      );
    });

    it('should be keyboard accessible when not disabled', () => {
      const onRemove = jest.fn();
      render(<FileChip {...defaultProps} onRemove={onRemove} />);

      const button = screen.getByRole('button', { name: /remove/i });
      button.focus();

      fireEvent.keyDown(button, { key: 'Enter' });
      // Note: fireEvent.keyDown on button doesn't trigger click
      // but the button is focusable which is the accessibility requirement
      expect(document.activeElement).toBe(button);
    });
  });

  describe('backward compatibility', () => {
    it('should work with minimal props (existing usage)', () => {
      // This test ensures existing Composer code still works
      render(
        <FileChip
          filename="test.pdf"
          stage="uploading"
          progress={50}
          onRemove={() => {}}
        />
      );

      expect(screen.getByText('test.pdf')).toBeInTheDocument();
      expect(screen.getByText('50%')).toBeInTheDocument();
    });
  });
});
```

### Acceptance Criteria
- [ ] Test: disabled hides X button
- [ ] Test: disabled=false (default) shows X button
- [ ] Test: onRemove fires when enabled
- [ ] Test: compact hides progress text
- [ ] Test: compact hides error text
- [ ] Test: compact hides Ready text
- [ ] Test: default shows all text
- [ ] Test: backward compatibility (existing usage works)
- [ ] All existing tests still pass

---

## Completion Checklist

Before requesting code review:

- [ ] All 3 stories implemented
- [ ] `pnpm --filter @guardian/web test` passes
- [ ] No TypeScript errors
- [ ] Component renders correctly in both variants
- [ ] Existing Composer usage unaffected (backward compatible)

---

## Handoff Notes

After this track completes:
- Composer (Sprint 2) will use `disabled` to prevent removal during batch upload
- Composer will use `variant="compact"` when displaying 4+ files
- Existing single-file usage continues to work unchanged
