# Epic 19.5: Drag & Drop File Upload

## Overview
Extend the Composer component to support drag-and-drop file upload, complementing the existing click-to-upload via paperclip button.

## Business Value
- **Improved UX**: Industry-standard drag-drop interaction users expect
- **Faster workflow**: Drop files directly without clicking through file picker
- **Accessibility**: Alternative input method for users who prefer drag-drop

## Current State
- Composer has file upload via hidden `<input type="file">` triggered by paperclip button
- `useMultiFileUpload` hook handles file processing, validation, and upload
- No drag-drop support - users must click paperclip to select files

## Goals
1. Add drag-drop zone to Composer area
2. Visual feedback when dragging files over the composer
3. Integrate with existing `addFiles()` from `useMultiFileUpload`
4. Maintain existing click-to-upload behaviour
5. Support same file types as current upload (.pdf, .docx, .png, .jpg, .jpeg)
6. Respect existing file limits (max 10 files, 50MB total)

## Technical Approach
**Recommended:** `react-dropzone` library
- Lightweight, no UI opinions
- Wraps native HTML5 drag-drop APIs
- Handles edge cases (nested drops, browser quirks)
- Easy integration with existing hook

## Out of Scope
- Drag-drop reordering of uploaded files
- Drag-drop from external apps (browser clipboard)
- Full-page drop zone (only composer area)

## Success Criteria
1. User can drag files onto composer and see visual feedback
2. Dropping files adds them to upload queue (same as paperclip)
3. All existing upload functionality continues to work
4. Tests cover drag-drop scenarios
5. Works across Chrome, Firefox, Safari

## Dependencies
- Epic 19 complete (file upload infrastructure)
- `react-dropzone` package

## Estimated Scope
- **Stories:** 2-3
- **Complexity:** Low-Medium
- **Risk:** Low (isolated UI change)
