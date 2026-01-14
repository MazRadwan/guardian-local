# Epic 19.5: Drag & Drop File Upload

## Summary

Extend the Composer component to support drag-and-drop file upload, complementing the existing click-to-upload via paperclip button.

## Business Value

- **Improved UX**: Industry-standard drag-drop interaction users expect
- **Faster workflow**: Drop files directly without clicking through file picker
- **Accessibility**: Alternative input method for users who prefer drag-drop

## Sprint Overview

| Sprint | Stories | Focus |
|--------|---------|-------|
| Sprint 1 | 2 | Complete drag-drop implementation |

## Stories (Revised per GPT Review)

| ID | Title | Agent | Status |
|----|-------|-------|--------|
| 19.5.1 | Install react-dropzone dependency | frontend-agent | Pending |
| 19.5.2 | Integrate dropzone with Composer (visual + tests) | frontend-agent | Pending |

## Technical Approach

**Library:** react-dropzone (used directly, no wrapper hook)
- Lightweight, no UI opinions
- Well-maintained (10k+ GitHub stars)
- Wraps native HTML5 drag-drop APIs

**Key Implementation Notes (from GPT review):**
- Use `noClick: true`, `noKeyboard: true` to avoid hijacking composer
- Dual file inputs: Dropzone for drag-drop, existing hidden input for paperclip (both coexist)
- Mirror server validation constraints in UI
- Add accessibility: non-color cues, aria-live for rejection
- Dropzone disabled during streaming/loading (mirrors paperclip behavior)
- Hook signature updated: `addFiles(files: FileList | File[])` to support dropzone's File[]

## Dependencies

- Epic 19 complete (file upload infrastructure)
- `useMultiFileUpload` hook at: `apps/web/src/hooks/useMultiFileUpload.ts`
- Composer component at: `apps/web/src/components/chat/Composer.tsx`

## Out of Scope

- Drag-drop reordering of uploaded files
- Drag-drop from external apps (browser clipboard)
- Full-page drop zone (only composer area)
- Wrapper hook abstraction (per GPT recommendation)

## Success Criteria

1. User can drag files onto composer and see visual feedback
2. Dropping files adds them to upload queue (same as paperclip)
3. All existing upload functionality continues to work
4. Tests cover drag-drop scenarios
5. Accessibility: non-color cues, aria-live announcements
6. Works across Chrome, Firefox, Safari

## Review Status

- [x] Initial plan created
- [x] GPT-5.2 review: Approved with conditions
- [x] Plan revised per GPT recommendations
- [x] Ready for implementation

## Estimated Effort

- **Total Stories:** 2
- **Complexity:** Low
- **Risk:** Low (isolated UI change)
- **Estimated Time:** 2-3 hours total
