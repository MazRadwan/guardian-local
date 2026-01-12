# Story 18.4.2a: Clarification Event Types and Backend Handler

**Sprint:** 4
**Track:** A (Clarification)
**Phase:** 2 (after Phase 1)
**Agent:** backend-agent
**Estimated Lines:** ~500
**Dependencies:** 18.4.1c (done - detection integrated), 18.4.4 (vendor validation)

---

## Overview

### What This Story Does

Implements WebSocket events and backend handlers for all clarification scenarios:
1. **Wrong document type** - Non-questionnaire uploaded in Scoring mode
2. **Confirm scoring** - Unknown document type needs confirmation
3. **Multiple vendors** - Files from different vendors need user selection
4. **Offer next vendor** - After scoring one vendor, offer to score another

### User-Visible Change

**Before:** Non-questionnaire in Scoring mode → auto-triggers scoring → fails
**After:** Non-questionnaire in Scoring mode → clarification prompt with options

**Before:** Multiple vendor files → undefined behavior
**After:** Multiple vendor files → user chooses which vendor to score first

---

## Design Decisions (From Review)

### 1. Stable Vendor IDs
Option IDs use stable indexed values (`vendor_0`, `vendor_1`), not derived from vendor names.
Server maintains `vendorMap` in pending state for lookup.

### 2. Check Ordering (Explicit)
```
1. Document Type Check → wrong_document_type or confirm_scoring
2. Vendor Validation   → multiple_vendors
3. Trigger Scoring     → proceed
```

### 3. Remove & Re-upload
Emits `clear_composer_files` event (client-side clear). Files remain in storage.

### 4. "Not Scored" Indicator
Plain assistant message after scoring—no new component types.

### 5. Follow-up for Other Vendor
Uses existing `clarification_prompt` event type (`offer_next_vendor`), not new components.

---

## Codebase Context

### Files to Modify/Create

1. `packages/backend/src/domain/events/clarification.ts` (NEW)
2. `packages/backend/src/infrastructure/websocket/ChatServer.ts` (modify)
3. `packages/backend/src/application/services/VendorValidationService.ts` (uses from 18.4.4)

### Current Scoring Handler (ChatServer.ts ~lines 1066-1078)

```typescript
if (mode === 'scoring' && enrichedAttachments && enrichedAttachments.length > 0) {
  const fileIds = enrichedAttachments.map(a => a.fileId);
  await this.triggerScoringOnSend(socket, conversationId, socket.userId!, fileIds);
  return;
}
```

### Socket Data Interface (existing)

```typescript
interface SocketData {
  userId?: string;
  conversationId?: string;
  // Add pending clarification state
}
```

---

## Implementation Steps

### Step 1: Define Event Types

**File:** `packages/backend/src/domain/events/clarification.ts` (NEW)

```typescript
import { v4 as uuidv4 } from 'uuid';

// Clarification prompt types
export type ClarificationPromptType =
  | 'wrong_document_type'
  | 'confirm_scoring'
  | 'multiple_vendors'
  | 'offer_next_vendor';

// Option structure
export interface ClarificationOption {
  id: string;
  label: string;
  description: string;
}

// File info included in prompt
export interface ClarificationFileInfo {
  fileId: string;
  filename: string;
  detectedDocType: string | null;
  detectedVendorName: string | null;
}

// Vendor info for multi-vendor prompts
export interface VendorInfo {
  name: string;
  fileCount: number;
  fileIds: string[];
}

// Main prompt event
export interface ClarificationPromptEvent {
  conversationId: string;
  promptId: string;
  type: ClarificationPromptType;
  message: string;
  files: ClarificationFileInfo[];
  options: ClarificationOption[];
}

// Response from client
export interface ClarificationResponseEvent {
  conversationId: string;
  promptId: string;
  optionId: string;
}

// Pending state stored in socket.data
export interface PendingClarification {
  promptId: string;
  conversationId: string;
  fileIds: string[];
  type: ClarificationPromptType;
  vendorMap?: Record<string, string>; // id -> vendor name
  skippedFileIds?: string[];
  skippedVendorName?: string;
}

// Option builders
export const CLARIFICATION_OPTIONS = {
  WRONG_DOCUMENT: [
    { id: 'switch_consult', label: 'Switch to Consult', description: 'Ask questions about this document' },
    { id: 'switch_assessment', label: 'Switch to Assessment', description: 'Use for vendor intake' },
    { id: 'score_anyway', label: 'Score Anyway', description: 'I know this is a questionnaire' },
  ],

  CONFIRM_SCORING: [
    { id: 'score', label: 'Yes, Score It', description: 'Proceed with scoring' },
    { id: 'cancel', label: 'Cancel', description: 'Let me upload a different file' },
  ],

  OFFER_NEXT_VENDOR: (vendorName: string, fileCount: number) => [
    { id: 'score_next', label: `Score ${vendorName}`, description: `Continue with ${fileCount} file${fileCount > 1 ? 's' : ''}` },
    { id: 'skip', label: 'No thanks', description: 'Done for now' },
  ],
};

// Build options for multiple vendors with stable IDs
export function buildVendorOptions(vendors: VendorInfo[]): {
  options: ClarificationOption[];
  vendorMap: Record<string, string>;
} {
  const vendorMap: Record<string, string> = {};

  const options: ClarificationOption[] = vendors.map((vendor, index) => {
    const id = `vendor_${index}`;
    vendorMap[id] = vendor.name;
    return {
      id,
      label: `Score ${vendor.name}`,
      description: `${vendor.fileCount} file${vendor.fileCount > 1 ? 's' : ''}`,
    };
  });

  // Add remove option
  options.push({
    id: 'remove_conflicting',
    label: 'Remove & Re-upload',
    description: 'Clear files and upload one vendor at a time',
  });

  return { options, vendorMap };
}

// Message builders
export function buildWrongDocumentMessage(filename: string): string {
  return `"${filename}" doesn't look like a completed questionnaire.`;
}

export function buildConfirmScoringMessage(filename: string): string {
  return `I'm not sure if "${filename}" is a questionnaire. Proceed with scoring?`;
}

export function buildMultipleVendorsMessage(vendors: VendorInfo[]): string {
  const vendorList = vendors
    .map(v => `  - ${v.name} (${v.fileCount} file${v.fileCount > 1 ? 's' : ''})`)
    .join('\n');

  return `Multiple vendors detected

Your files appear to be from different vendors. Scoring works best with one vendor at a time for accurate assessment.

Detected vendors:
${vendorList}

Which vendor would you like to score first?`;
}

export function buildOfferNextVendorMessage(vendorName: string, fileCount: number, skippedFilenames: string[]): string {
  const fileList = skippedFilenames.join(', ');
  return `Scoring complete.

Note: ${vendorName} files were not scored: ${fileList}

Would you like to score ${vendorName} (${fileCount} file${fileCount > 1 ? 's' : ''})?`;
}
```

### Step 2: Extend Socket Data Type for Pending Clarification

**File:** `ChatServer.ts` - Extend the existing `AuthenticatedSocket` interface.

The codebase currently uses `socket.data.abortRequested`. Add `pendingClarification`
to the interface's `data` type for full type safety.

```typescript
// Update the existing AuthenticatedSocket interface near top of file (around line 38)
interface AuthenticatedSocket extends Socket {
  userId?: string;
  userEmail?: string;
  userRole?: string;
  conversationId?: string;
  // Add data typing for socket.data properties
  data: {
    abortRequested?: boolean;          // Existing (lines 1111, 1138, 1172, 1618)
    pendingClarification?: PendingClarification;  // NEW
  };
}
```

**Usage throughout the code:**

```typescript
// Writing (consistent with existing abortRequested pattern):
socket.data.pendingClarification = {
  promptId,
  conversationId,
  fileIds,
  type: 'wrong_document_type',
};

// Reading:
const pending = socket.data.pendingClarification;

// Clearing:
delete socket.data.pendingClarification;
```

### Step 3: Add Document Type Check Method

**File:** `ChatServer.ts` - Add after triggerScoringOnSend

```typescript
import {
  ClarificationPromptType,
  ClarificationOption,
  ClarificationFileInfo,
  PendingClarification,
  CLARIFICATION_OPTIONS,
  buildWrongDocumentMessage,
  buildConfirmScoringMessage,
} from '../../domain/events/clarification.js';

/**
 * Step 1 of clarification checks: Document type
 * Returns true if scoring should proceed, false if clarification was emitted
 */
private async checkDocumentType(
  socket: AuthenticatedSocket,
  conversationId: string,
  fileIds: string[]
): Promise<boolean> {
  const files = await Promise.all(
    fileIds.map(id => this.fileRepository.findById(id))
  );
  const validFiles = files.filter(Boolean) as FileRecord[];

  if (validFiles.length === 0) {
    return true; // No files to check, proceed
  }

  const nonQuestionnaires = validFiles.filter(f => f.detectedDocType === 'document');
  const unknownTypes = validFiles.filter(f => !f.detectedDocType || f.detectedDocType === 'unknown');
  const questionnaires = validFiles.filter(f => f.detectedDocType === 'questionnaire');

  // Case 1: At least one questionnaire detected - proceed without clarification
  // (Questionnaire detection is the green light, regardless of other file types)
  if (questionnaires.length > 0) {
    return true;
  }

  // Case 2: All files are explicit non-questionnaires (document type)
  // This is the clearest "wrong file" case
  if (nonQuestionnaires.length === validFiles.length) {
    const promptId = uuidv4();
    const firstFile = nonQuestionnaires[0];

    socket.emit('clarification_prompt', {
      conversationId,
      promptId,
      type: 'wrong_document_type' as ClarificationPromptType,
      message: buildWrongDocumentMessage(firstFile.filename),
      files: nonQuestionnaires.map(f => ({
        fileId: f.id,
        filename: f.filename,
        detectedDocType: f.detectedDocType,
        detectedVendorName: f.detectedVendorName,
      })),
      options: CLARIFICATION_OPTIONS.WRONG_DOCUMENT,
    });

    socket.data.pendingClarification = {
      promptId,
      conversationId,
      fileIds,
      type: 'wrong_document_type',
    };

    return false;
  }

  // Case 3: Mix of explicit non-questionnaires + unknown (no questionnaires)
  // Treat as wrong_document_type since we have explicit evidence of non-questionnaire
  if (nonQuestionnaires.length > 0 && questionnaires.length === 0) {
    const promptId = uuidv4();
    const firstNonQ = nonQuestionnaires[0];

    socket.emit('clarification_prompt', {
      conversationId,
      promptId,
      type: 'wrong_document_type' as ClarificationPromptType,
      message: buildWrongDocumentMessage(firstNonQ.filename),
      files: validFiles.map(f => ({
        fileId: f.id,
        filename: f.filename,
        detectedDocType: f.detectedDocType,
        detectedVendorName: f.detectedVendorName,
      })),
      options: CLARIFICATION_OPTIONS.WRONG_DOCUMENT,
    });

    socket.data.pendingClarification = {
      promptId,
      conversationId,
      fileIds,
      type: 'wrong_document_type',
    };

    return false;
  }

  // Case 4: All files are unknown type (no questionnaires, no explicit non-questionnaires)
  // This is ambiguous - ask user to confirm
  if (unknownTypes.length > 0 && questionnaires.length === 0 && nonQuestionnaires.length === 0) {
    const promptId = uuidv4();
    const firstFile = unknownTypes[0];

    socket.emit('clarification_prompt', {
      conversationId,
      promptId,
      type: 'confirm_scoring' as ClarificationPromptType,
      message: buildConfirmScoringMessage(firstFile.filename),
      files: unknownTypes.map(f => ({
        fileId: f.id,
        filename: f.filename,
        detectedDocType: f.detectedDocType,
        detectedVendorName: f.detectedVendorName,
      })),
      options: CLARIFICATION_OPTIONS.CONFIRM_SCORING,
    });

    socket.data.pendingClarification = {
      promptId,
      conversationId,
      fileIds,
      type: 'confirm_scoring',
    };

    return false;
  }

  // Fallback: proceed (shouldn't reach here with above cases)
  return true;
}
```

### Step 4: Add Vendor Conflict Check Method

**File:** `ChatServer.ts` - Add after checkDocumentType

```typescript
import {
  buildVendorOptions,
  buildMultipleVendorsMessage,
  VendorInfo,
} from '../../domain/events/clarification.js';

/**
 * Step 2 of clarification checks: Vendor conflicts
 * Returns true if scoring should proceed, false if clarification was emitted
 */
private async checkVendorConflict(
  socket: AuthenticatedSocket,
  conversationId: string,
  fileIds: string[]
): Promise<boolean> {
  // Use VendorValidationService from 18.4.4
  const validation = await this.vendorValidationService.validateSingleVendor(fileIds);

  if (validation.valid) {
    return true; // Single vendor or all unknown - proceed
  }

  // Multiple vendors detected
  const vendors = validation.vendors!;
  const promptId = uuidv4();
  const { options, vendorMap } = buildVendorOptions(vendors);

  const files = await Promise.all(
    fileIds.map(id => this.fileRepository.findById(id))
  );
  const validFiles = files.filter(Boolean) as FileRecord[];

  socket.emit('clarification_prompt', {
    conversationId,
    promptId,
    type: 'multiple_vendors' as ClarificationPromptType,
    message: buildMultipleVendorsMessage(vendors),
    files: validFiles.map(f => ({
      fileId: f.id,
      filename: f.filename,
      detectedDocType: f.detectedDocType,
      detectedVendorName: f.detectedVendorName,
    })),
    options,
  });

  socket.data.pendingClarification = {
    promptId,
    conversationId,
    fileIds,
    type: 'multiple_vendors',
    vendorMap,
  };

  return false;
}
```

### Step 5: Add Response Handler

**File:** `ChatServer.ts` - In setupSocketHandlers method

```typescript
import { buildOfferNextVendorMessage } from '../../domain/events/clarification.js';

// Add after existing socket.on handlers
socket.on('clarification_response', async (data: ClarificationResponseEvent) => {
  try {
    const pending = socket.data.pendingClarification;

    // Validate response matches pending prompt
    if (!pending || pending.promptId !== data.promptId) {
      console.warn('[ChatServer] Received clarification_response for unknown prompt:', data.promptId);
      return;
    }

    const { fileIds, conversationId, type, vendorMap } = pending;
    delete socket.data.pendingClarification;

    switch (data.optionId) {
      // Document type responses
      case 'switch_consult':
        // NOTE: switchMode() is the correct method (not updateMode)
        await this.conversationService.switchMode(conversationId, 'consult');
        // NOTE: Event name is conversation_mode_updated (not mode_switched)
        socket.emit('conversation_mode_updated', { conversationId, mode: 'consult' });
        socket.emit('message', {
          role: 'assistant',
          content: 'Switched to Consult mode. How can I help you with this document?',
          conversationId,
        });
        break;

      case 'switch_assessment':
        await this.conversationService.switchMode(conversationId, 'assessment');
        socket.emit('conversation_mode_updated', { conversationId, mode: 'assessment' });
        socket.emit('message', {
          role: 'assistant',
          content: 'Switched to Assessment mode. Ready to help with vendor assessment.',
          conversationId,
        });
        break;

      case 'score_anyway':
      case 'score':
        // Proceed with scoring all files
        await this.triggerScoringOnSend(socket, conversationId, socket.userId!, fileIds);
        break;

      case 'cancel':
        socket.emit('message', {
          role: 'assistant',
          content: 'No problem. Upload a different file when ready.',
          conversationId,
        });
        break;

      // Vendor selection responses
      case 'remove_conflicting':
        // Clear composer files (client-side only)
        socket.emit('clear_composer_files', { conversationId });
        socket.emit('message', {
          role: 'assistant',
          content: 'Composer cleared. Upload files for one vendor to continue.',
          conversationId,
        });
        break;

      // Offer next vendor responses
      case 'score_next':
        if (pending.skippedFileIds && pending.skippedFileIds.length > 0) {
          await this.triggerScoringOnSend(
            socket,
            conversationId,
            socket.userId!,
            pending.skippedFileIds
          );
        }
        break;

      case 'skip':
        socket.emit('message', {
          role: 'assistant',
          content: 'Got it. Let me know if you need anything else.',
          conversationId,
        });
        break;

      default:
        // Check if it's a vendor selection (vendor_0, vendor_1, etc.)
        if (data.optionId.startsWith('vendor_') && vendorMap) {
          const selectedVendor = vendorMap[data.optionId];
          if (selectedVendor) {
            await this.handleVendorSelection(
              socket,
              conversationId,
              fileIds,
              selectedVendor,
              vendorMap
            );
          }
        } else {
          console.warn('[ChatServer] Unknown clarification option:', data.optionId);
        }
    }
  } catch (error) {
    console.error('[ChatServer] Error handling clarification_response:', error);
    socket.emit('error', {
      event: 'clarification_response',
      message: 'Failed to process your selection. Please try again.'
    });
  }
});
```

### Step 6: Add Vendor Selection Handler

**File:** `ChatServer.ts` - Add new private method

```typescript
/**
 * Handle vendor selection from multiple_vendors clarification
 *
 * IMPORTANT: Files with null/unknown vendor names are included with
 * the selected vendor (they're compatible with any vendor).
 */
private async handleVendorSelection(
  socket: AuthenticatedSocket,
  conversationId: string,
  allFileIds: string[],
  selectedVendor: string,
  vendorMap: Record<string, string>
): Promise<void> {
  // Get all files and partition by vendor
  const files = await Promise.all(
    allFileIds.map(id => this.fileRepository.findById(id))
  );
  const validFiles = files.filter(Boolean) as FileRecord[];

  // Include files that match selected vendor OR have null/unknown vendor
  // (Unknown vendor files are compatible with any selected vendor)
  const selectedFileIds = validFiles
    .filter(f => f.detectedVendorName === selectedVendor || !f.detectedVendorName)
    .map(f => f.id);

  // Skipped files are only those with a DIFFERENT explicit vendor name
  const skippedFiles = validFiles.filter(
    f => f.detectedVendorName && f.detectedVendorName !== selectedVendor
  );
  const skippedFileIds = skippedFiles.map(f => f.id);

  // Trigger scoring for selected vendor
  await this.triggerScoringOnSend(socket, conversationId, socket.userId!, selectedFileIds);

  // After scoring completes, offer to score remaining vendors (if any)
  if (skippedFileIds.length > 0) {
    // Group skipped files by vendor for 3+ vendor support
    const remainingVendorGroups = this.groupFilesByVendor(skippedFiles);
    const remainingVendors = Array.from(remainingVendorGroups.entries())
      .filter(([name]) => name !== null && name !== '')
      .map(([name, files]) => ({
        name: name!,
        fileCount: files.length,
        fileIds: files.map(f => f.id),
        filenames: files.map(f => f.filename),
      }));

    if (remainingVendors.length === 1) {
      // Single remaining vendor - simple offer
      const vendor = remainingVendors[0];
      const promptId = uuidv4();

      socket.emit('clarification_prompt', {
        conversationId,
        promptId,
        type: 'offer_next_vendor' as ClarificationPromptType,
        message: buildOfferNextVendorMessage(vendor.name, vendor.fileCount, vendor.filenames),
        files: skippedFiles.map(f => ({
          fileId: f.id,
          filename: f.filename,
          detectedDocType: f.detectedDocType,
          detectedVendorName: f.detectedVendorName,
        })),
        options: CLARIFICATION_OPTIONS.OFFER_NEXT_VENDOR(vendor.name, vendor.fileCount),
      });

      socket.data.pendingClarification = {
        promptId,
        conversationId,
        fileIds: vendor.fileIds,
        type: 'offer_next_vendor',
        skippedFileIds: vendor.fileIds,
        skippedVendorName: vendor.name,
      };
    } else if (remainingVendors.length > 1) {
      // Multiple remaining vendors - re-prompt with vendor selection
      // This handles the 3+ vendor case
      const promptId = uuidv4();
      const vendorInfos: VendorInfo[] = remainingVendors.map(v => ({
        name: v.name,
        fileCount: v.fileCount,
        fileIds: v.fileIds,
      }));
      const { options, vendorMap } = buildVendorOptions(vendorInfos);

      socket.emit('clarification_prompt', {
        conversationId,
        promptId,
        type: 'multiple_vendors' as ClarificationPromptType,
        message: `${remainingVendors.length} vendors remaining. Which would you like to score next?`,
        files: skippedFiles.map(f => ({
          fileId: f.id,
          filename: f.filename,
          detectedDocType: f.detectedDocType,
          detectedVendorName: f.detectedVendorName,
        })),
        options,
      });

      socket.data.pendingClarification = {
        promptId,
        conversationId,
        fileIds: skippedFileIds,
        type: 'multiple_vendors',
        vendorMap,
      };
    }
  }
}

/**
 * Helper: Group files by vendor name
 */
private groupFilesByVendor(files: FileRecord[]): Map<string | null, FileRecord[]> {
  const groups = new Map<string | null, FileRecord[]>();
  for (const file of files) {
    const vendorName = file.detectedVendorName || null;
    const existing = groups.get(vendorName) || [];
    existing.push(file);
    groups.set(vendorName, existing);
  }
  return groups;
}
```

### Step 7: Integrate into Scoring Flow

**File:** `ChatServer.ts` - Modify scoring handler (~lines 1066-1078)

```typescript
if (mode === 'scoring' && enrichedAttachments && enrichedAttachments.length > 0) {
  const fileIds = enrichedAttachments.map(a => a.fileId);

  // Step 1: Check document type (takes precedence)
  const docTypeOk = await this.checkDocumentType(socket, conversationId, fileIds);
  if (!docTypeOk) return;

  // Step 2: Check vendor conflicts
  const vendorOk = await this.checkVendorConflict(socket, conversationId, fileIds);
  if (!vendorOk) return;

  // Step 3: Proceed with scoring
  // NOTE: triggerScoringOnSend has 4 args: (socket, conversationId, userId, fileIds)
  // messageText is NOT passed - scoring handles file content directly
  await this.triggerScoringOnSend(socket, conversationId, socket.userId!, fileIds);
  return;
}
```

---

## Tests to Write

**File:** `packages/backend/__tests__/unit/ChatServer.clarification.test.ts`

```typescript
import { describe, it, expect, beforeEach, jest } from '@jest/globals';

describe('Clarification (Epic 18.4.2a)', () => {
  describe('Document Type Check', () => {
    it('should emit wrong_document_type for all non-questionnaires', async () => {
      // Setup: files with detectedDocType: 'document'
      // Assert: clarification_prompt emitted with type 'wrong_document_type'
      // Assert: returns false (do not proceed)
    });

    it('should emit confirm_scoring for unknown types', async () => {
      // Setup: files with detectedDocType: 'unknown' or null
      // Assert: clarification_prompt with type 'confirm_scoring'
    });

    it('should proceed for questionnaires without clarification', async () => {
      // Setup: files with detectedDocType: 'questionnaire'
      // Assert: no clarification_prompt emitted
      // Assert: returns true (proceed)
    });

    it('should proceed if at least one questionnaire present', async () => {
      // Setup: mix of questionnaire and document
      // Assert: returns true (questionnaire takes priority)
    });
  });

  describe('Vendor Conflict Check', () => {
    it('should emit multiple_vendors for different vendor names', async () => {
      // Setup: files with different detectedVendorName
      // Assert: clarification_prompt with type 'multiple_vendors'
      // Assert: options include vendor_0, vendor_1, remove_conflicting
    });

    it('should proceed for single vendor', async () => {
      // Setup: all files have same detectedVendorName
      // Assert: no clarification_prompt
      // Assert: returns true
    });

    it('should treat null vendors as compatible', async () => {
      // Setup: files with detectedVendorName: null
      // Assert: returns true (all unknown = compatible)
    });

    it('should use stable vendor IDs not derived from names', async () => {
      // Setup: vendor name with special characters
      // Assert: option ID is 'vendor_0' not 'score_special-name!'
    });
  });

  describe('Response Handler', () => {
    it('should handle switch_consult response', async () => {
      // Assert: conversationService.switchMode() called with 'consult'
      // Assert: conversation_mode_updated event emitted (NOT mode_switched)
    });

    it('should handle switch_assessment response', async () => {
      // Assert: conversationService.switchMode() called with 'assessment'
      // Assert: conversation_mode_updated event emitted
    });

    it('should handle score_anyway response', async () => {
      // Assert: triggerScoringOnSend called with all files
    });

    it('should handle cancel response', async () => {
      // Assert: message emitted, no scoring triggered
    });

    it('should handle remove_conflicting response', async () => {
      // Assert: clear_composer_files event emitted
      // Assert: message emitted
    });

    it('should handle vendor_X selection', async () => {
      // Assert: triggerScoringOnSend called with selected vendor files + unknown-vendor files
      // Assert: offer_next_vendor prompt emitted for other vendor files (not unknowns)
    });

    it('should include unknown-vendor files with selected vendor', async () => {
      // Assert: Files with null detectedVendorName are scored with selected vendor
      // Assert: They are NOT in the skipped files for offer_next_vendor
    });

    it('should handle score_next response', async () => {
      // Assert: triggerScoringOnSend called with skipped files
    });

    it('should handle skip response', async () => {
      // Assert: message emitted, no further scoring
    });

    it('should handle 3+ vendors correctly', async () => {
      // Setup: files from 3 different vendors
      // Select vendor_0 → scoring triggers
      // After scoring: should re-prompt with multiple_vendors (2 remaining)
      // Assert: options include vendor_0, vendor_1 for remaining vendors
    });

    it('should show simple offer for single remaining vendor', async () => {
      // Setup: 2 vendors, score one
      // After scoring: should show offer_next_vendor (not multiple_vendors)
    });

    it('should ignore response with wrong promptId', async () => {
      // Assert: no action taken
    });
  });

  describe('Check Ordering', () => {
    it('should check document type before vendor conflict', async () => {
      // Setup: non-questionnaire + multiple vendors
      // Assert: wrong_document_type emitted (not multiple_vendors)
    });
  });
});
```

---

## Acceptance Criteria

- [ ] ClarificationPromptEvent/ResponseEvent types defined in domain/events
- [ ] clarification_prompt emitted for non-questionnaires (wrong_document_type)
- [ ] clarification_prompt emitted for unknown types (confirm_scoring)
- [ ] clarification_prompt emitted for multiple vendors (multiple_vendors)
- [ ] Vendor options use stable IDs (vendor_0, vendor_1) with server-side map
- [ ] clarification_response handler processes all option types
- [ ] Mode switch works from clarification (switch_consult, switch_assessment)
- [ ] Score anyway bypasses detection (for doc type only)
- [ ] Vendor selection triggers scoring for selected vendor only
- [ ] After vendor scoring, offer_next_vendor prompt offered for remaining files
- [ ] clear_composer_files event emitted for remove_conflicting
- [ ] Check ordering enforced: document type → vendor conflict → scoring
- [ ] Unit tests pass

---

## Verification

```bash
# Run unit tests
pnpm --filter @guardian/backend test:unit -- --grep "Clarification"

# Run specific test file
pnpm --filter @guardian/backend test -- ChatServer.clarification.test.ts
```

**Manual Testing:**

1. Upload non-questionnaire PDF in Scoring mode → verify wrong_document_type prompt
2. Select "Switch to Consult" → verify mode switches
3. Upload questionnaire → verify no prompt, scoring starts
4. Upload files from 2 different vendors → verify multiple_vendors prompt
5. Select one vendor → verify that vendor scores, then offer_next_vendor appears
6. Select "Remove & Re-upload" → verify clear_composer_files event fires

---

## Dependencies

### Uses from 18.4.4 (Vendor Validation)

```typescript
// VendorValidationService interface
interface VendorValidationResult {
  valid: boolean;
  vendorName?: string;
  vendors?: VendorInfo[]; // If multiple vendors detected
}

// Method signature
validateSingleVendor(fileIds: string[]): Promise<VendorValidationResult>
```

### Provides to 18.4.2b (UI)

Events that frontend must handle:
- `clarification_prompt` - Render inline buttons
- `conversation_mode_updated` - Update UI mode (NOT mode_switched)
- `clear_composer_files` - Clear file chips from composer
- `message` - Display assistant messages

**NOTE:** The event `conversation_mode_updated` already exists in the codebase
(see `useWebSocket.ts` line 23 and `useChatController.ts`). Frontend only needs
to add handlers for the NEW events: `clarification_prompt`, `clear_composer_files`.
