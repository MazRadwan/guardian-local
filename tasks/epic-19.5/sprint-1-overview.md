# Sprint 1: Drag & Drop Implementation

## Goal

Implement drag-and-drop file upload for the Composer component using react-dropzone, with visual feedback, accessibility, and comprehensive tests.

## Stories

- [ ] 19.5.1 - Install react-dropzone dependency
- [ ] 19.5.2 - Integrate dropzone with Composer (visual + tests)

## Dependencies

- Epic 19 complete (useMultiFileUpload hook available)
- Sequential execution (19.5.2 depends on 19.5.1)

## Acceptance Criteria

- [ ] react-dropzone installed as dependency
- [ ] Composer accepts dragged files
- [ ] Visual feedback shown during drag-over (border + text)
- [ ] Dropped files processed same as paperclip selection
- [ ] File validation (type, size, count) enforced
- [ ] Accessibility: aria-live announcements, non-color cues
- [ ] Tests cover drag-drop happy path and edge cases
- [ ] No regression in existing click-to-upload functionality

## Technical Notes (from GPT review)

- Use `noClick: true`, `noKeyboard: true` to avoid hijacking textarea
- Consider single input path (dropzone for both drag-drop and paperclip)
- Mirror server validation constraints in UI
- Test with DataTransfer helper, focus on critical paths

## Files Changed (Sprint Total)

| File | Changes |
|------|---------|
| `apps/web/package.json` | Add react-dropzone dependency |
| `apps/web/src/components/chat/Composer.tsx` | Integrate dropzone + visual feedback |
| `apps/web/src/components/chat/__tests__/Composer.dragdrop.test.tsx` | NEW: Drag-drop tests |

## Review Status

- [x] GPT-5.2 approved with conditions
- [x] Recommendations incorporated
