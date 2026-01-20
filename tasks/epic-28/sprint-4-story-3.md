# Story 28.7.3: Extract ScoringHandler.ts (vendor clarification flow)

**Sprint:** 4 - Business Logic Handlers
**Agent:** backend-agent
**Estimation:** Medium (1-2 files)

---

## Description

Add `handleVendorSelected()` method to ScoringHandler for the vendor clarification flow. When multiple vendors are detected, the user selects one, and scoring proceeds for that vendor only.

---

## Acceptance Criteria

- [ ] `handleVendorSelected()` implemented
- [ ] Validates selected vendor is in the list
- [ ] Filters files to selected vendor
- [ ] Proceeds with scoring for selected vendor
- [ ] Unit tests cover selection and validation

---

## Technical Approach

```typescript
// Add to ScoringHandler.ts

/**
 * Handle vendor selection after clarification prompt
 *
 * @param socket - Client socket
 * @param payload - Contains conversationId, selectedVendor
 */
async handleVendorSelected(
  socket: IAuthenticatedSocket,
  payload: {
    conversationId: string;
    selectedVendor: string;
  }
): Promise<void> {
  try {
    const { conversationId, selectedVendor } = payload;

    console.log(`[ScoringHandler] Vendor selected: ${selectedVendor} for ${conversationId}`);

    // Get files for conversation
    const files = await this.fileRepository.findByConversation(conversationId);

    // Filter to selected vendor's files
    const vendorFiles = files.filter(f => {
      const vendorName = f.intakeContext?.vendorName;
      return vendorName === selectedVendor || !vendorName;
    });

    if (vendorFiles.length === 0) {
      socket.emit('error', {
        event: 'vendor_selected',
        message: 'No files found for selected vendor',
      });
      return;
    }

    const fileIds = vendorFiles.map(f => f.id);

    // Proceed with scoring
    socket.emit('scoring_progress', {
      conversationId,
      status: 'vendor_confirmed',
      message: `Proceeding with scoring for ${selectedVendor}`,
    });

    await this.triggerScoring(socket, conversationId, fileIds);
  } catch (error) {
    console.error('[ScoringHandler] Error handling vendor selection:', error);
    socket.emit('error', {
      event: 'vendor_selected',
      message: sanitizeErrorForClient(error, 'Failed to process vendor selection'),
    });
  }
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
  it('should filter files to selected vendor and trigger scoring', async () => {
    mockFileRepository.findByConversation.mockResolvedValue([
      { id: 'f1', intakeContext: { vendorName: 'Vendor A' } },
      { id: 'f2', intakeContext: { vendorName: 'Vendor B' } },
      { id: 'f3', intakeContext: { vendorName: 'Vendor A' } },
    ]);
    mockScoringService.scoreConversation.mockResolvedValue({ score: 85 });

    await handler.handleVendorSelected(mockSocket, {
      conversationId: 'conv-1',
      selectedVendor: 'Vendor A',
    });

    // Should have called scoring with only Vendor A files
    expect(mockSocket.emit).toHaveBeenCalledWith('scoring_progress', expect.objectContaining({
      status: 'vendor_confirmed',
      message: expect.stringContaining('Vendor A'),
    }));
  });

  it('should include files with no vendor (unknown)', async () => {
    mockFileRepository.findByConversation.mockResolvedValue([
      { id: 'f1', intakeContext: { vendorName: 'Vendor A' } },
      { id: 'f2', intakeContext: null },
    ]);

    await handler.handleVendorSelected(mockSocket, {
      conversationId: 'conv-1',
      selectedVendor: 'Vendor A',
    });

    // Both files should be included (vendor match + unknown)
    expect(mockSocket.emit).toHaveBeenCalledWith('scoring_progress', expect.objectContaining({
      status: 'vendor_confirmed',
    }));
  });

  it('should emit error if no files for vendor', async () => {
    mockFileRepository.findByConversation.mockResolvedValue([
      { id: 'f1', intakeContext: { vendorName: 'Vendor B' } },
    ]);

    await handler.handleVendorSelected(mockSocket, {
      conversationId: 'conv-1',
      selectedVendor: 'Vendor A',
    });

    expect(mockSocket.emit).toHaveBeenCalledWith('error', expect.objectContaining({
      event: 'vendor_selected',
    }));
  });
});
```

---

## Definition of Done

- [ ] handleVendorSelected implemented
- [ ] File filtering by vendor works
- [ ] Unit tests passing
