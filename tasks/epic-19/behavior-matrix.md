# File Upload Behavior Matrix

> **Single Source of Truth** for upload UI behavior across all modes and stages.
> All code implementations and tests should reference this document.

---

## Table of Contents

1. [Stage Definitions](#stage-definitions)
2. [Mode Definitions](#mode-definitions)
3. [Stage Transitions (State Machine)](#stage-transitions-state-machine)
4. [Action Matrix by Stage](#action-matrix-by-stage)
5. [Concurrency Limits](#concurrency-limits)
6. [Mode-Specific Behaviors](#mode-specific-behaviors)
7. [Send Button Rules](#send-button-rules)
8. [UI Affordances](#ui-affordances)
9. [Drag & Drop Upload](#drag--drop-upload)
10. [Cross-Session Persistence](#cross-session-persistence)
11. [Error Handling](#error-handling)
12. [Central Helper Functions](#central-helper-functions)
13. [Test Mapping](#test-mapping)

---

## Stage Definitions

**Scope note:** Stages in this document describe **composer state only**. Once a message is sent, attachments move into the **chat stream** and are governed by the persistence rules below. Composer stages do not persist across sessions.

| Stage | Description | Duration | User-Visible State |
|-------|-------------|----------|-------------------|
| `pending` | File selected, queued for upload | Instant (auto-upload) or user-controlled | Clock icon, "Queued" |
| `uploading` | HTTP POST in flight | 1-10s depending on size | Spinner, progress % |
| `storing` | Server storing to S3 | 1-3s | Spinner, "Storing..." |
| `attached` | File stored, awaiting enrichment | Until send clicked | Checkmark, "Attached" |
| `parsing` | Claude enrichment in progress | 5-30s | Spinner, "Analyzing..." |
| `complete` | All processing done | Terminal | Checkmark, "Ready" |
| `error` | Upload or processing failed | Terminal | Alert icon, error text |

### Stage Categories

```
REMOVABLE_STAGES    = ['pending', 'uploading', 'storing', 'attached', 'complete', 'error']
                      // All stages EXCEPT parsing (cannot cancel enrichment)

CANCELABLE_STAGES   = ['uploading', 'storing']
                      // 'uploading' = true HTTP abort (request in flight)
                      // 'storing' = client-side cancel only; server may already be storing

POST_UPLOAD_STAGES  = ['attached', 'parsing']
                      // After upload complete, before terminal state
                      // Note: 'attached' is pre-enrichment; 'parsing' is during enrichment

TERMINAL_STAGES     = ['complete', 'error']
                      // No further transitions (except any → error on failure)

SENDABLE_STAGES     = ['attached', 'parsing', 'complete']
                      // Have fileId, can be included in send

BLOCKING_STAGES     = ['pending', 'uploading', 'storing']
                      // Block send action until resolved
```

### Key Clarifications

- **Parsing begins only when user clicks Send** (trigger-on-send pattern), not automatically after attach
- **Errored files do NOT block send** - they are excluded from the attachment list but don't prevent sending other files
- **Cancel is explicit user intent** - clicking X should trigger backend cancel/cleanup (best-effort) in addition to UI removal
- **Cancel removes file from UI** - `uploading` cancels HTTP; `storing` is UI-only (best-effort cleanup if available)

---

## Mode Definitions

| Mode | Purpose | Upload Behavior | Enrichment Type |
|------|---------|-----------------|-----------------|
| `consult` | General Q&A about AI governance | Optional context | Intake parsing (vendor extraction) |
| `assessment` | Structured vendor assessment | Optional context | Intake parsing (vendor extraction) |
| `scoring` | Score completed questionnaires | Required (questionnaire) | Scoring parsing (response extraction) |

### Mode-Specific Upload Expectations

| Mode | Expected Document Type | Wrong Type Handling |
|------|----------------------|---------------------|
| `consult` | Any | None needed |
| `assessment` | Vendor materials (PRDs, etc.) | None needed |
| `scoring` | Guardian questionnaire | Chat message (not UI indicator) |

**Note:** Document type issues are communicated via **chat messages**, not UI warnings. See [Document Type Handling](#document-type-handling-chat-based) section.

---

## Stage Transitions (State Machine)

```
                    FILE UPLOAD STATE MACHINE

    ┌─────────────────────────────────────────────────────────────┐
    │                                                             │
    │  [User selects file]                                        │
    │         │                                                   │
    │         ▼                                                   │
    │    ┌─────────┐                                              │
    │    │ pending │ ◄─── X removes from queue                    │
    │    └────┬────┘                                              │
    │         │                                                   │
    │         │ [Upload starts - per-file HTTP POST]              │
    │         ▼                                                   │
    │   ┌───────────┐                                             │
    │   │ uploading │ ◄─── X aborts request, REMOVES file         │
    │   └─────┬─────┘                                             │
    │         │                                                   │
    │         │ [HTTP 202 received, server storing]               │
    │         ▼                                                   │
    │    ┌─────────┐                                              │
    │    │ storing │ ◄─── X cancels, REMOVES file (server may store)│
    │    └────┬────┘                                              │
    │         │                                                   │
    │         │ [file_attached event received]                    │
    │         ▼                                                   │
    │   ┌──────────┐                                              │
    │   │ attached │ ◄─── X removes from UI (backend cleanup req) │
    │   └────┬─────┘      Send enabled from here                  │
    │         │                                                   │
    │         │ [User clicks Send, enrichment starts]             │
    │         ▼                                                   │
    │    ┌─────────┐                                              │
    │    │ parsing │ ◄─── X HIDDEN (cannot cancel enrichment)     │
    │    └────┬────┘      Send still enabled                      │
    │         │                                                   │
    │         │ [Enrichment complete]                             │
    │         ▼                                                   │
    │   ┌──────────┐                                              │
    │   │ complete │ ◄─── X removes from UI                       │
    │   └──────────┘                                              │
    │                                                             │
    │   ┌─────────┐                                               │
    │   │  error  │ ◄─── X removes from UI (from any stage)       │
    │   └─────────┘                                               │
    │                                                             │
    └─────────────────────────────────────────────────────────────┘

    TRANSITION RULES:
    - Forward only (except → error from any stage on failure)
    - Monotonic guards prevent backward transitions
    - Error is terminal (no recovery, must remove and retry)
    - Cancel in uploading removes file (HTTP abort); cancel in storing removes file (server may continue)
    - Cancel should notify backend to stop parsing/scoring if already running
```

### Stage Transition on Cancel

| Current Stage | Cancel Action | Result |
|---------------|--------------|--------|
| `pending` | Remove from queue | File removed from UI |
| `uploading` | Abort HTTP + notify backend | File removed from UI |
| `storing` | Cancel UI + notify backend | File removed from UI |
| `attached` | Notify backend cleanup | File removed from UI |

**Design decision:** Cancel always removes the file entirely. We do NOT transition to `error` state because:
1. User explicitly chose to cancel - they don't want to see an error
2. Matches GPT/Claude behavior (cancel = gone)
3. Cleaner UX - no lingering error chips for intentional cancellations

---

## Action Matrix by Stage

### Remove/Cancel Action

| Stage | X Button | Click Behavior | Server Impact |
|-------|----------|----------------|---------------|
| `pending` | Visible | Remove from queue | None |
| `uploading` | Visible | Abort HTTP + notify backend | Request cancelled |
| `storing` | Visible | Remove from UI + notify backend | May leave orphan (accepted) |
| `attached` | Visible | Remove from UI + notify backend | File remains on server* |
| `parsing` | **Hidden** | N/A | Cannot cancel enrichment |
| `complete` | Visible | Remove from UI + notify backend | File remains on server* |
| `error` | Visible | Remove from UI | Depends on when error occurred |

*Server cleanup is **best-effort** and may be deferred. For MVP, cancel/remove may still leave orphans; a cleanup job is required for full lifecycle correctness.

### Add Files Action

| Current State | Can Add More Files? | Notes |
|---------------|---------------------|-------|
| No files | Yes | Up to max (10) |
| Some pending | Yes | Up to max |
| Some uploading | Yes | Respects concurrency limit |
| Some complete | Yes | Up to max |
| Some error | Yes | Up to max |
| At max (10) | No | File picker disabled |

### Send Action

| Stage Mix | Send Enabled? | Behavior |
|-----------|---------------|----------|
| All `pending` | No | Must wait for upload |
| All `uploading` | No | Must wait for upload |
| All `storing` | No | Must wait for attach |
| Any `attached`+ | Yes | Send triggers enrichment |
| All `complete` | Yes | Send with attachments |
| Mix with errors | **Yes** | Errored files excluded, others sent |
| All `error` | No | Nothing to send |

**Explicit rule:** Errored files are **excluded** from the send payload but do **not block** the send action. If you have 3 complete files and 2 errored files, clicking Send sends the 3 complete files.

### Mode Switch Action

| File State | Can Switch Mode? |
|------------|------------------|
| No files | Yes |
| All `pending` | Yes |
| Any `uploading`/`storing` | Yes |
| Any `attached`/`parsing` | Yes |
| All `complete` | Yes |
| Any `error` | Yes |

**Note:** No warning triangle on ModeSelector. Users can freely switch modes at any time. The `hasIncompleteFiles` prop has been removed from ModeSelector.

---

## Concurrency Limits

### Upload Concurrency

| Setting | Value | Rationale |
|---------|-------|-----------|
| Max concurrent uploads | **2-3** | Balance speed vs server load |
| Max files total | 10 | Existing limit |
| Max file size | 20MB | Existing limit |
| Max total size | 50MB | Must enforce client-side |

### Concurrency Behavior

```
User selects 5 files:
  → Files 1-3 start uploading immediately (concurrent)
  → Files 4-5 remain in 'pending' until slot opens
  → As each upload completes, next pending file starts
```

### Client-Side Total Size Enforcement

Since per-file uploads bypass the server's batch size validation middleware, the client must enforce the 50MB total limit:

```typescript
const canAddFiles = (currentFiles: FileState[], newFiles: File[]): boolean => {
  const currentSize = currentFiles.reduce((sum, f) => sum + f.size, 0);
  const newSize = newFiles.reduce((sum, f) => sum + f.size, 0);
  return (currentSize + newSize) <= 50 * 1024 * 1024; // 50MB
};
```

### Add Files During Upload

| Scenario | Allowed? | Behavior |
|----------|----------|----------|
| 2 files uploading, user adds 3 more | Yes | New files queue as `pending` |
| At concurrency limit | Yes | New files wait in queue |
| At max files (10) | No | File picker disabled |
| Would exceed 50MB total | No | Show error toast |

---

## Mode-Specific Behaviors

### Consult Mode

| Behavior | Rule |
|----------|------|
| File required | No |
| Doc type warning | None |
| Enrichment type | Intake (vendor extraction) |
| Send without text | Yes (if files attached) |

### Assessment Mode

| Behavior | Rule |
|----------|------|
| File required | No |
| Doc type warning | None |
| Enrichment type | Intake (vendor extraction) |
| Send without text | Yes (if files attached) |

### Scoring Mode

| Behavior | Rule |
|----------|------|
| File required | Yes (for scoring to work) |
| Doc type warning | **None** - handled via chat message |
| Enrichment type | Scoring (response extraction) |
| Send without text | Yes (triggers scoring) |
| Non-questionnaire behavior | Chat error message, suggest other modes |

### Document Type Handling (Chat-Based)

Document type issues are communicated via **chat messages from the backend**, not UI indicators on FileChip or ModeSelector. This provides:
- Clearer, actionable guidance for users
- Consistent experience across all modes
- No visual clutter in the composer

**Backend Implementation:** `ChatServer.ts:703-708` emits `scoring_error` event when `detectedDocType === 'document'`

| Scenario | Chat Response |
|----------|---------------|
| Non-questionnaire in scoring | "This appears to be a general document (like a product brief or marketing material), not a completed questionnaire. Try uploading in Consult mode to discuss this document, or Assessment mode to start a new vendor assessment." |
| Missing assessment ID | "This file doesn't appear to have a Guardian assessment ID. Please upload a questionnaire exported from Guardian." |
| Scanned/image-only PDF | "I couldn't extract text from this PDF - it appears to be scanned. Please upload a text-based document." |

**FileChip appearance:** Always shows stage-based status only (no amber warning for document type).

| `detectedDocType` | FileChip UI |
|-------------------|-------------|
| `questionnaire` | Normal stage appearance |
| `document` | Normal stage appearance (error shown in chat when scoring attempted) |
| `unknown` | Normal stage appearance |

### Existing Behaviors (Unchanged by This Refactor)

The following behaviors exist from previous epics and are **out of scope** for Epic 19:

| Behavior | Mode | Description | Status |
|----------|------|-------------|--------|
| Auto-summarize | Consult | Summarize file when sent without text | Unchanged |
| Auto-score | Scoring | Trigger scoring when questionnaire sent | Unchanged |

---

## Send Button Rules

### Enable/Disable Logic

```typescript
const isSendEnabled = (
  hasText: boolean,
  files: FileState[],
  mode: ConversationMode
): boolean => {
  // No files case
  if (files.length === 0) {
    return hasText; // Need text if no files
  }

  // Check if any files are in blocking stages (must wait)
  const hasBlockingFiles = files.some(f =>
    BLOCKING_STAGES.includes(f.stage)
  );
  if (hasBlockingFiles) {
    return false;
  }

  // Get sendable files (excluding errors)
  const sendableFiles = files.filter(f =>
    SENDABLE_STAGES.includes(f.stage)
  );

  // Can send if we have text OR at least one sendable file
  // Note: Errored files are ignored - they don't block send
  return hasText || sendableFiles.length > 0;
};
```

### Send Button States

| State | Appearance | Aria Label |
|-------|------------|------------|
| Disabled (no content) | Gray, not clickable | "Send message" |
| Disabled (uploading) | Gray, not clickable | "Uploading files..." |
| Enabled | Purple, clickable | "Send message" |
| Sending | Spinner | "Sending..." |

### Aria Label in Mixed States

When files are in mixed stages, the aria-label follows this priority:

| Condition | Aria Label |
|-----------|------------|
| Any file in `pending`/`uploading`/`storing` | "Uploading files..." |
| All files in `attached`/`parsing`/`complete`/`error` | "Send message" |

**Rule:** "Uploading files..." wins if ANY file is in a blocking stage.

---

## UI Affordances

### File Chip Appearance by Stage

| Stage | Icon | Background | Border | Status Text |
|-------|------|------------|--------|-------------|
| `pending` | Clock (gray) | Gray-100 | Gray-200 | "Queued" |
| `uploading` | Spinner (blue) | Gray-100 | Gray-200 | "XX%" |
| `storing` | Spinner (blue) | Gray-100 | Gray-200 | "Storing..." |
| `attached` | Checkmark (green) | Gray-100 | Gray-200 | "Attached" |
| `parsing` | Spinner (blue) | Gray-100 | Gray-200 | "Analyzing..." |
| `complete` | Checkmark (green) | Gray-100 | Gray-200 | "Ready" |
| `error` | Alert (red) | Red-50 | Red-200 | "Error" |

### Progress Bar

**Note:** Progress values are driven by WebSocket `upload_progress` events, not only by the initial HTTP POST. The bar may represent server-side stages (uploading/storing/parsing) and can be indeterminate or jumpy; do not assume it is strictly “bytes uploaded.”

| Stage | Progress Bar Visible | Progress Value |
|-------|---------------------|----------------|
| `pending` | No | N/A |
| `uploading` | Yes | 0-100% from HTTP |
| `storing` | Yes | Indeterminate or fixed |
| `attached` | No | N/A |
| `parsing` | Yes | Indeterminate |
| `complete` | No | N/A |
| `error` | No | N/A |

### X Button Visibility

| Stage | X Visible | Click Result |
|-------|-----------|--------------|
| `pending` | Yes | File removed |
| `uploading` | Yes | Abort + file removed |
| `storing` | Yes | Cancel UI only + file removed |
| `attached` | Yes | File removed from UI |
| `parsing` | **No** | N/A |
| `complete` | Yes | File removed from UI |
| `error` | Yes | File removed from UI |

---

## Drag & Drop Upload

> **Epic 19.5:** Drag-and-drop file upload complements the existing paperclip click-to-upload.

### Overview

Users can add files to the composer via two methods:
1. **Paperclip button** - Click to open file picker (existing)
2. **Drag & drop** - Drag files onto composer area (Epic 19.5)

Both methods call the same `addFiles()` hook and follow identical validation rules.

### Implementation Details

| Aspect | Implementation |
|--------|----------------|
| Library | `react-dropzone` v14.3.8 |
| Hook signature | `addFiles(files: FileList \| File[])` |
| Dropzone config | `noClick: true`, `noKeyboard: true` |
| File inputs | Dual: dropzone input + paperclip input (coexist) |

### Visual Feedback

| Drag State | Border | Background | Overlay Text |
|------------|--------|------------|--------------|
| Not dragging | `border-gray-200` | `bg-white` | None |
| Dragging valid files | `border-blue-400 border-2` | `bg-blue-50/30` | "Drop files here" (blue) |
| Dragging invalid files | `border-red-500 border-2` | `bg-red-50/30` | "Invalid file type" (red) |

### Disabled States

Dropzone is disabled (no visual feedback, drops ignored) when:

| Condition | Disabled? | Rationale |
|-----------|-----------|-----------|
| `disabled` prop is true | Yes | Component-level disable |
| `uploadEnabled` is false | Yes | No wsAdapter or conversationId |
| `files.length >= 10` | Yes | At max file limit |
| `isStreaming` is true | Yes | Mirrors paperclip behavior |
| `isLoading` is true | Yes | Mirrors paperclip behavior |

```typescript
const dropzoneDisabled = disabled || !uploadEnabled || files.length >= 10 || isBusy;
```

### Accepted File Types

| MIME Type | Extensions |
|-----------|------------|
| `application/pdf` | `.pdf` |
| `application/vnd.openxmlformats-officedocument.wordprocessingml.document` | `.docx` |
| `image/png` | `.png` |
| `image/jpeg` | `.jpg`, `.jpeg` |

**Max file size:** 20MB per file (matches server validation)
**Max files:** `Math.max(0, 10 - files.length)` (dynamic based on current count)

### Rejection Handling

| Rejection Reason | User Feedback |
|------------------|---------------|
| Invalid file type | Toast error: "File type must be..." |
| File too large | Toast error: "File is larger than 20MB" |
| Too many files | Toast error: "Too many files" |

### Accessibility

| Feature | Implementation |
|---------|----------------|
| Drag overlay | `role="status"` `aria-live="polite"` |
| Rejection feedback | Sonner toast (built-in aria-live) |
| Non-color cues | Text overlay ("Drop files here" / "Invalid file type") |
| Keyboard nav | `noKeyboard: true` - doesn't interfere with textarea |

### Coexistence with Paperclip

- Dropzone and paperclip operate independently
- Both call the same `addFiles()` hook
- Both respect the same validation rules (type, size, count, total size)
- Files from either source are indistinguishable in the queue

---

## Cross-Session Persistence

Files persist across browser sessions **only after they are sent** and appear in the chat stream. Composer attachments (`pending` → `attached`) are session-scoped and do not persist across reloads.

### History Loading

| Data | Persisted? | Storage |
|------|------------|---------|
| Messages | Yes | PostgreSQL `messages` table |
| Attachments metadata (sent) | Yes | PostgreSQL `messages.attachments` (jsonb) |
| File records (sent or uploaded) | Yes | PostgreSQL `files` table |
| Actual files | Yes | S3 (no expiration) |

### Download Availability

| Scenario | Files Downloadable? |
|----------|---------------------|
| Same session | Yes |
| New session (same conversation) | Yes |
| Days/weeks later | Yes (no TTL) |
| After conversation deleted | **No** - DB record gone, S3 orphaned |

**Composer behavior on reload:** Unsent composer chips do not rehydrate. Only sent attachments are shown (via message history).
**Canceled files:** Should not appear in chat history and should be eligible for backend cleanup.

### Cascade Delete Behavior

| Action | DB Records | S3 Files |
|--------|------------|----------|
| Delete conversation | Cascade deleted | **Orphaned** ⚠️ |
| Delete user | Cascade deleted | **Orphaned** ⚠️ |
| Remove file from composer | Removed from state | **Orphaned** (if already uploaded) |

**Note:** S3 cleanup is deferred to a future sprint. Orphaned files accumulate until a cleanup job is implemented.

### Storage Lifecycle / Retention (Verified Against Live DB)

This section documents when files are created, leaked, and (not) deleted.

#### File Creation Points

| Trigger | DB Record | S3 Object | Notes |
|---------|-----------|-----------|-------|
| User uploads file | Created at `DocumentUploadController.ts:371` | Created at `:343` | S3 stored BEFORE DB record |
| Upload succeeds | ✅ Created | ✅ Created | Normal flow |
| Upload fails after S3 store | ❌ Not created | ⚠️ **LEAKED** | Error at :416 doesn't cleanup S3 |

#### File Deletion Scenarios (Current Behavior)

| Trigger | DB Record | S3 Object | Responses | Result |
|---------|-----------|-----------|-----------|--------|
| UI remove (composer) | ❌ Not deleted | ❌ Not deleted | N/A | **Both leaked** |
| Conversation delete (no scoring) | ✅ Cascade deleted | ❌ Not deleted | N/A | S3 orphaned |
| Conversation delete (with scoring) | ❌ **FK VIOLATION** | ❌ Not deleted | Blocks delete | **BUG - Delete fails** |
| User delete | ✅ Cascade deleted | ❌ Not deleted | May block | S3 orphaned (or FK fail) |

#### FK Constraint Issue (Verified)

```
conversations ──(CASCADE)──► files ◄──(NO ACTION)── responses
                              │
                         DELETE BLOCKED
                         if responses exist
```

**Affected constraints (from live DB):**
- `files_conversation_id_conversations_id_fk`: `ON DELETE CASCADE`
- `responses_file_id_files_id_fk`: `ON DELETE NO ACTION`

**Impact:** Any conversation with scored files cannot be deleted.

#### Missing Infrastructure

| Component | Status | Needed For |
|-----------|--------|------------|
| `IFileRepository.delete()` | ❌ Missing | Programmatic file deletion |
| File delete API endpoint | ❌ Missing | UI-triggered deletion |
| S3 cleanup on conversation delete | ❌ Missing | Prevent orphans |
| S3 cleanup on upload failure | ❌ Missing | Prevent orphans |
| Scheduled orphan cleanup job | ❌ Missing | Garbage collection |
| FK migration (`SET NULL`) | ❌ Missing | Allow conversation delete |

### Visual Flow

```
SESSION 1                         SESSION 2 (days later)
┌─────────────────────────┐       ┌─────────────────────────┐
│ User uploads file.pdf   │       │ User returns            │
│ Sends message           │       │ Opens same conversation │
│                         │       │                         │
│ File stored:            │       │ History loaded:         │
│ - S3: ✓ (permanent)     │  ──►  │ - Message: ✓            │
│ - DB files: ✓           │       │ - Attachments: ✓        │
│ - DB messages: ✓        │       │ - Download works: ✓     │
└─────────────────────────┘       └─────────────────────────┘
```

---

## Error Handling

### Error Toast Strategy

| Scenario | Toast Behavior |
|----------|----------------|
| Single file fails | Show error toast with filename |
| Multiple files fail (same error) | Single aggregated toast |
| Multiple files fail (different errors) | Show first error + "and N others failed" |
| Network timeout | "Upload timed out. Please try again." |
| File too large | "File exceeds 20MB limit" |
| Invalid file type | "Unsupported file type" |
| Total size exceeded | "Total size exceeds 50MB limit" |
| Server error | "Upload failed. Please try again." |

### Error Toast Timing

| Trigger | Toast Duration |
|---------|----------------|
| Validation error (instant) | 5 seconds |
| Upload failure | 5 seconds |
| Timeout | 5 seconds |
| Scoring error | 5 seconds |

### Error Recovery

| Error Type | Recovery Action |
|------------|-----------------|
| Validation (type/size) | Remove file, select valid file |
| Network error | Remove file, retry |
| Server error | Remove file, retry |
| Timeout | Remove file, retry |
| Scoring parse error | Remove file, try different file or mode |

---

## Edge Cases (Must Handle)

### Multi-Tab / Multi-Session

- **Same conversation open in multiple tabs:** Each tab has independent upload state and concurrency. Cancel in one tab must not resurrect chips in another; WS events arriving after cancel should be ignored if the uploadId was canceled locally.
- **Cancel in one tab, send in another:** Ensure canceled files are excluded from send payload (avoid re-adding by late WS events).

### Cancel vs Parsing/Scoring

- **Conversation-level abort:** Current `abort_stream` aborts scoring for the whole conversation. File-level cancel must not accidentally abort scoring for other files unless explicitly intended.
- **Late events after cancel:** `file_attached` / `upload_progress` may arrive after cancel; UI must drop updates for canceled uploadIds.
- **Send + cancel race:** If user clicks Send then X quickly, ensure canceled file is not parsed/scored and not included in chat attachments.

### Conversation Lifecycle

- **Delete conversation while uploads in flight:** Cancel in-flight uploads and ignore late WS events for deleted conversations.
- **Reconnect / WS drop:** Ensure in-flight uploads resolve to `error` or `complete` after timeout; avoid stuck `uploading/storing` chips.

### Limits and Validation

- **Cross-tab size limits:** 50MB total limit is client-enforced per tab; backend should not assume total size is globally enforced.
- **Vendor clarification pending:** If a file is canceled while vendor selection is pending, remove it from pending clarification state.

### Data Integrity

- **Partial artifacts on cancel:** If parsing/scoring started, responses or parseStatus may already be written. Cancel should mark them ignored or clean up where possible.

---

## Central Helper Functions

These functions should be the **single source of truth** for stage-based logic. All components must use these instead of inline stage checks.

```typescript
// File: apps/web/src/lib/uploadStageHelpers.ts

import { FileUploadStage } from './websocket';
import { ConversationMode } from '@/components/chat/ModeSelector';

/**
 * Stages where the file can be removed (X button works)
 * All stages EXCEPT parsing (cannot cancel enrichment)
 */
export const REMOVABLE_STAGES: FileUploadStage[] = [
  'pending', 'uploading', 'storing', 'attached', 'complete', 'error'
];

/**
 * Stages where cancel is allowed
 * 'uploading' = HTTP abort; 'storing' = UI cancel only (server may already be storing)
 * Cancel REMOVES the file (does not transition to error)
 */
export const CANCELABLE_STAGES: FileUploadStage[] = [
  'uploading', 'storing'
];

/**
 * Stages where file has fileId and can be sent
 */
export const SENDABLE_STAGES: FileUploadStage[] = [
  'attached', 'parsing', 'complete'
];

/**
 * Stages that block send action (must wait)
 */
export const BLOCKING_STAGES: FileUploadStage[] = [
  'pending', 'uploading', 'storing'
];

/**
 * Terminal stages (no further transitions except error)
 */
export const TERMINAL_STAGES: FileUploadStage[] = [
  'complete', 'error'
];

/**
 * Post-upload stages (after upload, before terminal)
 * Note: 'attached' is pre-enrichment, 'parsing' is during enrichment
 */
export const POST_UPLOAD_STAGES: FileUploadStage[] = [
  'attached', 'parsing'
];

/**
 * Check if file can be removed at current stage
 */
export function isRemovable(stage: FileUploadStage): boolean {
  return REMOVABLE_STAGES.includes(stage);
}

/**
 * Check if file removal requires HTTP abort
 */
export function requiresAbort(stage: FileUploadStage): boolean {
  return CANCELABLE_STAGES.includes(stage);
}

/**
 * Check if file can be included in send
 */
export function isSendable(stage: FileUploadStage): boolean {
  return SENDABLE_STAGES.includes(stage);
}

/**
 * Check if file blocks send action
 */
export function isBlocking(stage: FileUploadStage): boolean {
  return BLOCKING_STAGES.includes(stage);
}

/**
 * Check if X button should be visible
 * Hidden only during parsing (cannot cancel enrichment)
 */
export function isXButtonVisible(stage: FileUploadStage): boolean {
  return stage !== 'parsing';
}

/**
 * Check if progress bar should be visible
 */
export function isProgressVisible(stage: FileUploadStage): boolean {
  return ['uploading', 'storing', 'parsing'].includes(stage);
}

/**
 * Check if stage shows "complete" appearance (checkmark)
 */
export function isCompleteAppearance(stage: FileUploadStage): boolean {
  return ['attached', 'complete'].includes(stage);
}

// NOTE: shouldShowDocTypeWarning() has been REMOVED
// Document type issues are now handled via chat messages (scoring_error event)
// See: Document Type Handling (Chat-Based) section above

/**
 * Get status text for stage
 */
export function getStageStatusText(
  stage: FileUploadStage,
  progress: number
): string {
  switch (stage) {
    case 'pending': return 'Queued';
    case 'uploading': return `${progress}%`;
    case 'storing': return 'Storing...';
    case 'attached': return 'Attached';
    case 'parsing': return 'Analyzing...';
    case 'complete': return 'Ready';
    case 'error': return 'Error';
    default: return '';
  }
}

/**
 * Check if send button should show "Uploading..." aria-label
 * True if ANY file is in a blocking stage
 */
export function isUploadingAriaLabel(files: { stage: FileUploadStage }[]): boolean {
  return files.some(f => BLOCKING_STAGES.includes(f.stage));
}

/**
 * Check if adding files would exceed total size limit
 * @param currentFiles - Files already in queue
 * @param newFiles - Files to add
 * @param maxTotalBytes - Maximum total size (default 50MB)
 */
export function wouldExceedTotalSize(
  currentFiles: { size: number }[],
  newFiles: { size: number }[],
  maxTotalBytes: number = 50 * 1024 * 1024
): boolean {
  const currentSize = currentFiles.reduce((sum, f) => sum + f.size, 0);
  const newSize = newFiles.reduce((sum, f) => sum + f.size, 0);
  return (currentSize + newSize) > maxTotalBytes;
}
```

---

## Test Mapping

### Unit Tests Required

| Helper Function | Test Cases |
|-----------------|------------|
| `isRemovable()` | All stages return expected boolean (parsing = false, others = true) |
| `requiresAbort()` | Only uploading/storing return true |
| `isSendable()` | Only attached/parsing/complete return true |
| `isBlocking()` | Only pending/uploading/storing return true |
| `isXButtonVisible()` | All stages except parsing return true |
| `isUploadingAriaLabel()` | Returns true if any blocking file |
| `wouldExceedTotalSize()` | Correctly calculates size limits |

### Component Tests Required

| Component | Test Cases |
|-----------|------------|
| `FileChip` | All 7 stages render correct icon/text/colors |
| `FileChip` | X button visible for all stages except parsing |
| `FileChip` | No amber warning for detectedDocType (removed) |
| `FileChip` | Cancel removes file (not error state) |
| `Composer` | Send enabled/disabled per stage mix |
| `Composer` | Send enabled with mix of complete + error files |
| `Composer` | File picker disabled at max (10) |
| `Composer` | File picker disabled when would exceed 50MB |
| `Composer` | No hasIncompleteFiles prop passed to ModeSelector |
| `Composer` | Aria-label shows "Uploading..." when any blocking |
| `ModeSelector` | No warning triangle (hasIncompleteFiles prop removed) |

### Drag & Drop Tests Required (Epic 19.5)

| Test Category | Test Cases |
|---------------|------------|
| Visual Feedback | Drag feedback (blue border) on dragEnter |
| Visual Feedback | Red border for invalid files (isDragReject) |
| Visual Feedback | Clear feedback when drag ends |
| File Drop | addFiles called on valid file drop |
| File Drop | Toast error on invalid file type |
| File Drop | Reject files when at max count |
| Disabled States | Disabled when uploadEnabled=false |
| Disabled States | Disabled when isStreaming=true |
| Disabled States | Disabled when isLoading=true |
| Disabled States | Disabled when disabled=true |
| Coexistence | Paperclip upload still works |
| Coexistence | Both drop and paperclip can add files |
| File Types | Accept PDF files |
| File Types | Accept DOCX files |
| File Types | Accept PNG files |
| File Types | Accept JPEG files |

**Test file:** `apps/web/src/components/chat/__tests__/Composer.dragdrop.test.tsx`

### Integration Tests Required

| Flow | Test Cases |
|------|------------|
| Upload → Cancel (pending) | File removed from queue |
| Upload → Cancel (uploading) | HTTP aborted, file removed |
| Upload → Cancel (storing) | Canceled, file removed |
| Upload → Complete → Remove | Full happy path |
| Upload → Error → Remove | Error recovery |
| Multi-file: some complete, some error | Send works with complete files |
| Multi-file: cancel one while others upload | Only cancelled file removed |
| Concurrency: 5 files with limit 3 | 3 upload, 2 queue |
| Mode switch with files | No warning, files preserved |
| Total size: add files exceeding 50MB | Error toast, files rejected |

### E2E Tests Required

| Scenario | Test Cases |
|----------|------------|
| Upload and send (consult) | File attached, message sent |
| Upload and send (scoring) | Questionnaire scored |
| Upload wrong doc (scoring) | Chat error message shown (not UI warning) |
| Cancel mid-upload | File removed, no error chip |
| Multiple files concurrent | All complete, send works |
| Cancel one of multiple | Others continue |

---

## Revision History

| Date | Version | Changes |
|------|---------|---------|
| 2024-01-13 | 1.0 | Initial behavior matrix |
| 2024-01-13 | 1.1 | Fixed REMOVABLE_STAGES consistency, added concurrency section, clarified abort behavior, marked out-of-scope items, added aria-label rules |
| 2024-01-13 | 1.2 | Removed ModeSelector warning triangle (hasIncompleteFiles), removed FileChip amber warning for detectedDocType, document type issues now handled via chat messages only |
| 2024-01-13 | 1.3 | Added Cross-Session Persistence section documenting history loading, download availability, and orphaned file cleanup gap |
| 2024-01-13 | 1.4 | Added Storage Lifecycle/Retention section with verified DB findings: upload failure leak, FK cascade conflict bug, missing infrastructure inventory |
| 2026-01-14 | 1.5 | **Epic 19.5:** Added Drag & Drop Upload section - react-dropzone integration, visual feedback (blue/red borders), disabled states, accessibility, test mapping |

---

## References

- Epic 19 Goals: `tasks/epic-19/epic-19-goals.md`
- Epic 19.5 Goals: `tasks/epic-19.5/epic-19.5-goals.md`
- Current Implementation: `apps/web/src/hooks/useMultiFileUpload.ts`
- Composer (with dropzone): `apps/web/src/components/chat/Composer.tsx`
- Stage Types: `apps/web/src/lib/websocket.ts` (`FileUploadStage`)
- Drag-Drop Tests: `apps/web/src/components/chat/__tests__/Composer.dragdrop.test.tsx`
