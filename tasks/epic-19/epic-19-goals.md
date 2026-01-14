# Epic 19 Goals - File Upload Chip Cancel/Remove Refactor

## Context
We need file upload chips in the chat composer to behave like GPT/Claude: users must be able to remove a file at any time, including mid-upload. Today clicking the X can trigger a toast "Cannot remove file during upload" depending on stage. This doc captures the current flow, observed issues, proposed changes, and affected behavior so another agent can pick it up without prior context.

## Current Behavior (Observed)
- Selection -> files enter stage `pending`.
- Composer auto-uploads immediately when `hasPendingFiles` and `conversationId` are present.
- All pending files are uploaded in a single batch request (`POST /api/documents/upload`).
- Upload IDs are returned per file; WebSocket events drive stage transitions.
- File stages: `pending -> uploading -> storing -> attached -> parsing -> complete` (or `error`).
- File chip X is visible for `attached` but removal is blocked in the hook, triggering a toast.

References:
- Auto-upload effect: `apps/web/src/components/chat/Composer.tsx:139`
- File chip disable logic: `apps/web/src/components/chat/Composer.tsx:296`
- Remove logic and toast: `apps/web/src/hooks/useMultiFileUpload.ts:288`
- File chip stage UI: `apps/web/src/components/chat/FileChip.tsx:60`
- Upload endpoint: `packages/backend/src/infrastructure/http/routes/document.routes.ts:109`

## Problems / Gaps
- Cannot cancel mid-upload (batch upload is a single request and only one AbortController).
- `attached` is shown as complete but treated as in-flight for removal and waiters, causing UX mismatch.
- Auto-upload leaves almost no time to remove a mistaken file before uploading starts.
- Stage logic is scattered across multiple files with inconsistent definitions.

Additional issues to address during refactor:
- Tests missing `attached` stage coverage: `apps/web/src/components/chat/__tests__/FileChip.test.tsx:379`.
- `hasIncompleteFiles` treats `attached` as incomplete while UI shows checkmark: `apps/web/src/components/chat/Composer.tsx:259`.
- In-flight lists diverge across Composer/FileChip/hook.
- Send-enable logic edge case: all `error` files can leave send disabled.
- No public document delete endpoint; removal may not clean server-side storage.

Warning indicator issues (UI clutter):
- ModeSelector warning triangle shows for ANY file in ANY mode via `hasIncompleteFiles` prop.
- FileChip amber warning for `detectedDocType === 'document'` duplicates chat-based messaging.
- Document type issues should be communicated via chat messages only (existing `scoring_error` event).

Orphaned file cleanup (storage leaks - verified against live DB):
- Removing `attached`/`complete` files from composer leaves S3 files orphaned (UI only removes local state, no backend call).
- Deleting conversation cascade-deletes DB records but NOT S3 files.
- Deleting user cascade-deletes DB records but NOT S3 files.
- Upload failure after S3 store leaks: `DocumentUploadController.ts:343` stores to S3 before text extraction; on error at :416, no S3 cleanup occurs.
- No cleanup job exists to remove orphaned S3 files.
- `IFileRepository` has no `delete()` method - cannot delete file records programmatically.
- `S3FileStorage.delete()` exists but has no callers.

FK cascade conflict (verified against live DB - BUG):
- `files.conversation_id` → `ON DELETE CASCADE` (conversation delete cascades to files)
- `responses.file_id` → `ON DELETE NO ACTION` (blocks file deletion if responses exist)
- **Bug**: Deleting a conversation with scored files will FAIL due to FK violation.
- Scoring creates `responses` rows referencing `file_id`; cascade delete of `files` is blocked.

## Desired Behavior (Target)
- Users can remove/cancel a file at any time, including mid-upload.
- The X button never triggers an error toast for normal use.
- UI states are consistent (stage meaning matches visuals and behavior).
- Behavior should align with GPT/Claude: cancel mid-upload aborts only that file.
- No warning triangle on ModeSelector dropdown - remove `hasIncompleteFiles` indicator entirely.
- No amber warning on FileChip for document type - remove UI indicator.
- Document type issues communicated via chat messages only (restore previous behavior):
  - "This file doesn't have an assessment ID"
  - "I can't process scanned PDFs"
  - Uses existing `scoring_error` WebSocket event in ChatServer.ts:705
- Cancel (X) must notify backend to stop in-flight processing when possible (upload/parsing/scoring) and attempt cleanup.
- Canceled files should not appear in chat history.

## Chosen Direction (GPT/Claude parity)
- Per-file uploads with per-file AbortControllers.
- Each file is its own HTTP request; canceling aborts only that request.
- Keep the existing upload endpoint, but call it per file.
- Align stage semantics across UI/hook (single source of truth for "removable" and "in-flight" states).
- Decide whether "remove" should also delete server-side file (requires endpoint or cleanup policy).

## Definite Breaks (Must Address)
- Index mapping removal: batch response uses `files[].index`; per-file uploads remove this mapping.
- Total size validation bypass: `validateTotalSize` enforces 50MB per batch; per-file requests skip it.
- `clearAll`/abort tracking: currently one AbortController; per-file requires N controllers.
- Mixed state UX: partial completion (some done, some uploading) needs explicit rules.
- No backend cancel/cleanup path exists today; UI removal does not notify backend.

## Design Decisions Required
- `isUploading` meaning with mixed states (any in-flight vs all in-flight).
- Send enablement rules when some files complete and others error/upload.
- File picker availability during uploads (allow add vs block).
- `waitForCompletion` semantics (all files vs only in-flight at send time).
- Error toast strategy (aggregate vs per-file).
- Client-side concurrency limit (recommended 2-3).

## Affected Areas
Front-end:
- `apps/web/src/hooks/useMultiFileUpload.ts` (upload control, stages, per-file aborts)
- `apps/web/src/components/chat/Composer.tsx` (auto-upload, remove button behavior, remove `hasIncompleteFiles`)
- `apps/web/src/components/chat/FileChip.tsx` (stage UI, X visibility, remove amber warning)
- `apps/web/src/components/chat/ModeSelector.tsx` (remove `hasIncompleteFiles` prop and warning triangle)
- `apps/web/src/components/chat/__tests__/FileChip.test.tsx` (add `attached` stage coverage)

Back-end (if server cleanup/cancel is required):
- `packages/backend/src/infrastructure/http/routes/document.routes.ts`
- `packages/backend/src/infrastructure/http/controllers/DocumentUploadController.ts` (if adding cancel)
- `packages/backend/src/infrastructure/storage/*` (delete handling)

Back-end (orphaned file cleanup - future sprint):
- `packages/backend/src/application/services/ConversationService.ts` (delete S3 files on conversation delete)
- `packages/backend/src/infrastructure/storage/S3FileStorage.ts` (already has `delete()` method)
- `packages/backend/src/application/interfaces/IFileRepository.ts` (add `delete()` method)
- `packages/backend/src/infrastructure/database/repositories/DrizzleFileRepository.ts` (implement `delete()`)
- New: Scheduled cleanup job to find and remove orphaned S3 files (files in S3 with no DB record)

Database (FK cascade fix - required before conversation delete works):
- `packages/backend/src/infrastructure/database/schema/responses.ts` (change `file_id` FK to `ON DELETE SET NULL` or `CASCADE`)
- New migration: `ALTER TABLE responses DROP CONSTRAINT responses_file_id_files_id_fk; ALTER TABLE responses ADD CONSTRAINT responses_file_id_files_id_fk FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE SET NULL;`

## Behavior Changes to Validate
- X cancels mid-upload without affecting other files.
- X removes `attached` files without toast.
- Send button enabled/disabled logic still correct when files error.
- Mode-switch warnings align with visual file readiness.
- WebSocket progress updates do not regress when uploads are per-file.
- Cancel triggers backend abort/cleanup when possible (upload, parsing, scoring).
- Canceled files do not appear in chat history.

## Edge Cases (Must Handle)
- Multi-tab same conversation: cancel in one tab must not resurrect chips in another; ignore late WS events for canceled uploadIds.
- Cancel vs scoring scope: file-level cancel must not abort scoring for unrelated files in the same conversation.
- Send + cancel race: canceled files must be excluded from send payload and not parsed/scored.
- Conversation delete during upload: in-flight uploads/parsing should cancel or be ignored.
- Reconnect/WS drop: avoid stuck `uploading/storing` chips; apply timeouts.
- Vendor clarification pending: cancel should remove file from pending clarification flow.
- Cross-tab size limits: backend must not assume client enforces 50MB globally.
- Partial artifacts on cancel: ensure parseStatus/responses are cleaned up or marked ignored.

## Risks
- Changing upload request pattern may impact throughput and rate limits (mitigate via concurrency limit).
- Total size constraints (50MB per batch) may need new enforcement logic.
- In-flight stage definitions may diverge if not centralized.
- Canceling may leave server-side partial files if no cleanup is implemented.
- ChatServer.ts and DocumentUploadController.ts are very large; broad refactors increase regression risk.

## Refactor Scope Guardrails (LLM Error Reduction)
- Do NOT do a full ChatServer.ts decomposition as part of Epic 19.
- Do a small surgical extraction ONLY if it directly supports Epic-19/20 changes:
  - File context building used during Send.
  - Scoring trigger/cancel flow (per-file cancel semantics).
  - Upload progress/WS event wiring referenced by per-file upload changes.
- Defer the full ChatServer.ts decomposition to a separate tech-debt epic AFTER Epic-20.
- Rationale: reduce LLM mistakes by shrinking the local change surface without stacking a full rewrite on top of behavior changes.

## Open Questions
- Should "remove" always delete server-side files, or only remove from UI?
- Is a temporary local-only removal acceptable if server cleanup is deferred?
- Do we need to preserve batch upload API for other clients?
- Is upload-on-send acceptable as a short-term fix, or do we require full parity now?

## Follow-Up (Post Epic-19): Drag-and-Drop Upload
- Add drag-and-drop file upload to the composer after Epic-19 stabilizes.
- Reuse `addFiles()` for validation and limits (single source of truth).
- Respect the same picker enable/disable rules (e.g., if uploads are blocked, drop should be blocked).
- Prevent default browser behavior on drop (avoid opening the file).
- Add visual drop target state + tests for drag/drop interactions.

## Testing / Verification Needs
- Unit tests for `attached` stage UI, remove behavior, and X visibility.
- Integration tests for cancel mid-upload (per-file abort).
- Manual QA: multiple files, mixed stages, slow network, cancel mid-upload, cancel after attached.
- Integration tests: cancel triggers backend abort for scoring/parsing when in progress.
