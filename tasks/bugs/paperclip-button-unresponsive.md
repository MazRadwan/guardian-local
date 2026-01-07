# Bug Report: Paperclip Button Unresponsive

## Status: FIXED

## Summary
The paperclip (file attach) button in the Composer component does not open the file picker dialog when manually clicked by the user.

## Resolution
**Root Cause:** Browser security blocking programmatic `input.click()` when triggered indirectly from a button's onClick handler.

**Fix:** Replaced the `<Button onClick={openFilePicker}>` with a native `<label htmlFor="composer-file-input">` that directly triggers the file input via native browser behavior (no JavaScript click() needed).

**Files Changed:**
- `apps/web/src/components/chat/Composer.tsx`
  - Added `id="composer-file-input"` to the hidden file input
  - Replaced Button with label using `htmlFor` attribute
  - Styled label to look like the original button
  - Added keyboard accessibility (Enter/Space triggers file picker)

## Environment
- Browser: Chrome (localhost:3000)
- Mode: Scoring mode (but likely affects all modes)
- Page: `/chat?conversation=<id>`

## Symptoms
1. User clicks the paperclip button
2. No file picker dialog opens
3. Button appears interactive (not disabled, not grayed out)
4. No console errors visible

## Investigation Findings

### What Works
- **DevTools programmatic upload works**: Using Chrome DevTools `upload_file` tool successfully uploads files
- **File input exists**: The hidden `<input type="file">` is present in DOM
- **Button is not disabled**: `disabled: false`, `pointer-events: auto`
- **React handlers are bound**: Both button onClick and input onChange have React props attached
- **Click events fire**: Debug listeners confirmed both button click AND file input click events fire

### What Doesn't Work
- Manual user clicks do not trigger the native file picker dialog
- DevTools programmatic clicks (via `.click()`) also don't open the dialog (expected - browser security)

### Key Debug Output
```
[DEBUG] Paperclip button clicked! Count: 1
[DEBUG] File input received click!
```
The click IS propagating from button → file input, but the browser isn't opening the file dialog.

## Relevant Files

### Primary Files to Review
1. **`apps/web/src/components/chat/Composer.tsx`** (lines 214-216, 229-237, 301-311)
   - `openFilePicker()` function (line 214-216)
   - Hidden file input (lines 229-237)
   - Paperclip button with onClick (lines 301-311)

2. **`apps/web/src/hooks/useMultiFileUpload.ts`**
   - `addFiles()` function that processes selected files
   - Hook state that might affect button behavior

### Recent Changes (potential regression)
```diff
# From git diff HEAD~5 -- Composer.tsx

# Added clearFiles to useImperativeHandle (lines 112-119)
+ useImperativeHandle(ref, () => ({
+   focus: () => { textareaRef.current?.focus(); },
+   clearFiles: () => { clearAll(); },
+ }));

# Changed uploadMode to be dynamic based on currentMode
- const uploadMode: UploadMode = 'intake';
+ const uploadMode: UploadMode = currentMode === 'scoring' ? 'scoring' : 'intake';
```

### Button Disabled Conditions (line 306)
```tsx
disabled={disabled || !uploadEnabled || isUploading || files.length >= 10}
```
- `disabled`: from props (was false)
- `uploadEnabled`: `!!wsAdapter && !!conversationId` (was true)
- `isUploading`: from useMultiFileUpload (was false)
- `files.length >= 10`: (was false)

## Code Flow
```
User clicks paperclip button
  → React onClick handler fires
    → openFilePicker() called
      → fileInputRef.current?.click()
        → Browser should open file picker (BUT DOESN'T)
```

## Hypotheses to Investigate

1. **Stale ref issue**: Is `fileInputRef.current` pointing to the correct DOM node?
   - Check: Add `console.log(fileInputRef.current)` in `openFilePicker`

2. **useImperativeHandle side effect**: Missing dependency array might cause re-renders
   ```tsx
   useImperativeHandle(ref, () => ({...})); // No deps array!
   ```
   - Fix attempt: Add `[clearAll]` dependency array

3. **Event timing**: Is there a re-render between click and handler execution?
   - Check: Wrap `openFilePicker` in `useCallback` with proper deps

4. **Browser security context**: Is the click being treated as "untrusted"?
   - The button click → input.click() pattern is standard and should work
   - Check if any event.preventDefault() or event.stopPropagation() is interfering

5. **Hidden input positioning**: Some browsers require the input to be in viewport
   - Check: Temporarily make input visible and try clicking it directly

## Suggested Debug Steps

1. Add logging to `openFilePicker`:
```tsx
const openFilePicker = () => {
  console.log('[Composer] openFilePicker called');
  console.log('[Composer] fileInputRef.current:', fileInputRef.current);
  console.log('[Composer] fileInputRef.current tagName:', fileInputRef.current?.tagName);
  fileInputRef.current?.click();
  console.log('[Composer] click() called');
};
```

2. Add dependency array to useImperativeHandle:
```tsx
useImperativeHandle(ref, () => ({
  focus: () => { textareaRef.current?.focus(); },
  clearFiles: () => { clearAll(); },
}), [clearAll]);
```

3. Test in incognito mode (rule out browser extensions)

4. Test in different browser (rule out Chrome-specific issue)

## User Report
> "the paperclip icon is unresponsive it won't open the file selector finder window"

Note: User was previously able to upload files (mentioned "accidentally started uploading the document in consult mode"), so this may be a regression or intermittent issue.

## Priority
High - Core functionality for Epic 15 scoring workflow is blocked.
