# Story 28.7.3: Extract ScoringHandler.ts (vendor clarification flow)

**Sprint:** 4 - Business Logic Handlers
**Agent:** backend-agent
**Estimation:** Medium (1-2 files)

---

## Description

Add `handleVendorSelected()` method to ScoringHandler for the vendor clarification flow. When multiple vendors are detected, the user selects one via `vendor_selected` event, and scoring proceeds for only that vendor's files.

---

## Acceptance Criteria

- [ ] `handleVendorSelected()` implemented
- [ ] Retrieves pending clarification from `socket.data.pendingVendorClarifications` Map by conversationId
- [ ] Validates selected vendor name (non-empty, exists in pending vendors list)
- [ ] Normalizes vendor name comparison (trim, lowercase)
- [ ] Clears pending clarification after selection
- [ ] Emits confirmation message before resuming scoring
- [ ] Calls `triggerScoringOnSend()` with selected vendor's fileIds
- [ ] Unit tests cover selection, validation, and normalization

---

## Technical Approach

```typescript
// Add to ScoringHandler.ts

interface PendingVendorClarification {
  conversationId: string;
  userId: string;
  fileIds: string[];
  userQuery?: string;
  vendors: Array<{ name: string; fileCount: number; fileIds: string[] }>;
}

/**
 * Handle vendor selection after clarification prompt
 *
 * CRITICAL BEHAVIORS TO PRESERVE:
 * 1. Lookup by conversationId in socket.data.pendingVendorClarifications Map
 * 2. Normalize vendor name with trim() and toLowerCase() for comparison
 * 3. Clear pending clarification for this conversation after selection
 * 4. Emit confirmation message before resuming scoring
 */
async handleVendorSelected(
  socket: IAuthenticatedSocket,
  payload: {
    conversationId: string;
    vendorName: string;
  }
): Promise<void> {
  const userId = socket.userId;
  if (!userId) {
    console.error('[ScoringHandler] vendor_selected called without authenticated user');
    socket.emit('error', { event: 'vendor_selected', message: 'Not authenticated' });
    return;
  }

  // Guard: Validate vendorName is present and non-empty
  if (!payload.vendorName || typeof payload.vendorName !== 'string' || payload.vendorName.trim().length === 0) {
    console.warn('[ScoringHandler] vendor_selected called with missing/empty vendorName');
    socket.emit('error', {
      event: 'vendor_selected',
      message: 'Vendor name is required',
    });
    return;
  }

  // Guard: Validate conversationId is present
  if (!payload.conversationId || typeof payload.conversationId !== 'string') {
    console.warn('[ScoringHandler] vendor_selected called with missing conversationId');
    socket.emit('error', {
      event: 'vendor_selected',
      message: 'Conversation ID is required',
    });
    return;
  }

  // Look up pending clarification by conversationId (Map-based storage)
  const pendingMap = socket.data.pendingVendorClarifications as Map<string, PendingVendorClarification> | undefined;
  const pending = pendingMap?.get(payload.conversationId);

  if (!pending) {
    console.warn(`[ScoringHandler] vendor_selected called without pending clarification for conversation ${payload.conversationId}`);
    socket.emit('error', {
      event: 'vendor_selected',
      message: 'No pending vendor clarification for this conversation',
    });
    return;
  }

  // Find the selected vendor's files (normalize with trim() for comparison)
  const normalizedVendorName = payload.vendorName.trim().toLowerCase();
  const selectedVendor = pending.vendors.find(
    v => v.name.trim().toLowerCase() === normalizedVendorName
  );

  if (!selectedVendor) {
    console.warn(`[ScoringHandler] Unknown vendor selected: ${payload.vendorName}`);
    socket.emit('error', {
      event: 'vendor_selected',
      message: `Unknown vendor: ${payload.vendorName}`,
    });
    return;
  }

  console.log(
    `[ScoringHandler] User selected vendor "${selectedVendor.name}" with ${selectedVendor.fileIds.length} files`
  );

  // Clear pending clarification for this conversation
  pendingMap?.delete(payload.conversationId);

  // Emit confirmation message
  socket.emit('message', {
    role: 'assistant',
    content: `Starting scoring for ${selectedVendor.name}...`,
    conversationId: pending.conversationId,
  });

  // Resume scoring with only the selected vendor's files
  await this.triggerScoringOnSend(
    socket,
    pending.conversationId,
    pending.userId,
    selectedVendor.fileIds,
    pending.userQuery
  );
}
```

---

## Files Touched

- `packages/backend/src/infrastructure/websocket/handlers/ScoringHandler.ts` - Add method
- `packages/backend/__tests__/unit/infrastructure/websocket/handlers/ScoringHandler.test.ts` - Add tests

---

## Tests Required

```typescript
describe('handleVendorSelected', () => {
  beforeEach(() => {
    // Setup pending clarification in socket.data
    mockSocket.data.pendingVendorClarifications = new Map([
      ['conv-1', {
        conversationId: 'conv-1',
        userId: 'user-1',
        fileIds: ['f1', 'f2', 'f3'],
        userQuery: 'How risky is this?',
        vendors: [
          { name: 'Vendor A', fileCount: 2, fileIds: ['f1', 'f2'] },
          { name: 'Vendor B', fileCount: 1, fileIds: ['f3'] },
        ],
      }],
    ]);
  });

  it('should filter files to selected vendor and trigger scoring', async () => {
    const triggerSpy = jest.spyOn(handler, 'triggerScoringOnSend').mockResolvedValue();

    await handler.handleVendorSelected(mockSocket, {
      conversationId: 'conv-1',
      vendorName: 'Vendor A',
    });

    expect(mockSocket.emit).toHaveBeenCalledWith('message', expect.objectContaining({
      content: expect.stringContaining('Vendor A'),
    }));
    expect(triggerSpy).toHaveBeenCalledWith(
      mockSocket,
      'conv-1',
      'user-1',
      ['f1', 'f2'],  // Only Vendor A's files
      'How risky is this?'  // User query preserved
    );
  });

  it('should normalize vendor name (case insensitive, trimmed)', async () => {
    const triggerSpy = jest.spyOn(handler, 'triggerScoringOnSend').mockResolvedValue();

    await handler.handleVendorSelected(mockSocket, {
      conversationId: 'conv-1',
      vendorName: '  VENDOR a  ',  // Different case, extra whitespace
    });

    expect(triggerSpy).toHaveBeenCalledWith(
      mockSocket,
      'conv-1',
      'user-1',
      ['f1', 'f2'],
      'How risky is this?'
    );
  });

  it('should clear pending clarification after selection', async () => {
    jest.spyOn(handler, 'triggerScoringOnSend').mockResolvedValue();

    await handler.handleVendorSelected(mockSocket, {
      conversationId: 'conv-1',
      vendorName: 'Vendor A',
    });

    expect(mockSocket.data.pendingVendorClarifications.has('conv-1')).toBe(false);
  });

  it('should emit error if no pending clarification exists', async () => {
    mockSocket.data.pendingVendorClarifications = new Map();

    await handler.handleVendorSelected(mockSocket, {
      conversationId: 'conv-1',
      vendorName: 'Vendor A',
    });

    expect(mockSocket.emit).toHaveBeenCalledWith('error', expect.objectContaining({
      event: 'vendor_selected',
      message: expect.stringContaining('No pending vendor clarification'),
    }));
  });

  it('should emit error if vendor name is empty', async () => {
    await handler.handleVendorSelected(mockSocket, {
      conversationId: 'conv-1',
      vendorName: '   ',
    });

    expect(mockSocket.emit).toHaveBeenCalledWith('error', expect.objectContaining({
      event: 'vendor_selected',
      message: 'Vendor name is required',
    }));
  });

  it('should emit error if selected vendor not in list', async () => {
    await handler.handleVendorSelected(mockSocket, {
      conversationId: 'conv-1',
      vendorName: 'Unknown Vendor',
    });

    expect(mockSocket.emit).toHaveBeenCalledWith('error', expect.objectContaining({
      event: 'vendor_selected',
      message: expect.stringContaining('Unknown vendor'),
    }));
  });

  it('should emit error if user not authenticated', async () => {
    mockSocket.userId = undefined;

    await handler.handleVendorSelected(mockSocket, {
      conversationId: 'conv-1',
      vendorName: 'Vendor A',
    });

    expect(mockSocket.emit).toHaveBeenCalledWith('error', expect.objectContaining({
      event: 'vendor_selected',
      message: 'Not authenticated',
    }));
  });
});
```

---

## Definition of Done

- [ ] handleVendorSelected implemented
- [ ] Lookup by conversationId in socket.data Map
- [ ] Vendor name normalization (trim, lowercase)
- [ ] Pending clarification cleared after selection
- [ ] Confirmation message emitted
- [ ] Unit tests passing
