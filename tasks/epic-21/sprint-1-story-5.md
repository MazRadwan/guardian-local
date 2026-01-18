# Story 21.5: Restyle File Attachment Chips

## Description

Update FileChipInChat styling to use white/slate/sky color scheme.

## Acceptance Criteria

- [ ] Container: `bg-white border border-slate-200` (not gray)
- [ ] Icon background: `bg-sky-500` (not blue-500)
- [ ] Type label: `text-sky-600` (not gray-500) — sky-600 for WCAG contrast
- [ ] Hover state: `hover:bg-slate-50` or similar subtle effect
- [ ] All existing functionality preserved (click to download)

## Technical Approach

1. Update button className: bg-gray-100 -> bg-white, border-gray-200 -> border-slate-200
2. Update icon div: bg-blue-500 -> bg-sky-500
3. Update type label span: text-gray-500 -> text-sky-600 (sky-600 for WCAG AA contrast on white)
4. Adjust hover state for white background

## Files Touched

- `apps/web/src/components/chat/FileChipInChat.tsx` - Update colors (lines 36-61)

## Agent Assignment

frontend-agent

## Tests Required

- Update `FileChipInChat.test.tsx` for new class names
- Test container has white background
- Test icon has sky-500 background
- Test type label has sky-600 text color

### Existing Tests to Update

| Test (line) | Current | Change To |
|-------------|---------|-----------|
| `'renders with light background'` (28-31) | `expect(button).toHaveClass('bg-gray-100')` | `expect(button).toHaveClass('bg-white')` |
| `'renders document icon with blue background'` (100-104) | `container.querySelector('.bg-blue-500')` | `container.querySelector('.bg-sky-500')` |

## Implementation Details

### Current Code

```tsx
<button
  type="button"
  onClick={onClick}
  className={cn(
    'inline-flex items-center gap-2 px-3 py-2 rounded-lg max-w-xs',
    'bg-gray-100 border border-gray-200',
    'hover:bg-gray-200 transition-colors cursor-pointer',
    'text-left'
  )}
  aria-label={`Download ${filename}`}
>
  {/* Document icon */}
  <div className="flex-shrink-0 w-8 h-8 bg-blue-500 rounded flex items-center justify-center">
    <FileText className="h-4 w-4 text-white" aria-hidden="true" />
  </div>

  {/* Filename and type */}
  <div className="flex flex-col min-w-0">
    <span className="text-sm text-gray-900 truncate max-w-[180px]" title={filename}>
      {filename}
    </span>
    <span className="text-xs text-gray-500">{getTypeLabel()}</span>
  </div>
</button>
```

### Target Code

```tsx
<button
  type="button"
  onClick={onClick}
  className={cn(
    'inline-flex items-center gap-2 px-3 py-2 rounded-lg max-w-xs',
    'bg-white border border-slate-200',
    'hover:bg-slate-50 transition-colors cursor-pointer',
    'text-left'
  )}
  aria-label={`Download ${filename}`}
>
  {/* Document icon */}
  <div className="flex-shrink-0 w-8 h-8 bg-sky-500 rounded flex items-center justify-center">
    <FileText className="h-4 w-4 text-white" aria-hidden="true" />
  </div>

  {/* Filename and type */}
  <div className="flex flex-col min-w-0">
    <span className="text-sm text-gray-900 truncate max-w-[180px]" title={filename}>
      {filename}
    </span>
    <span className="text-xs text-sky-600">{getTypeLabel()}</span>
  </div>
</button>
```

## Dependencies

- None (independent styling)

## Estimated Effort

Small (single file, color changes only)
