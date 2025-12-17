# Story 6.9.5: ChatServer Attachment Validation - Implementation Summary

**Epic:** 16 - Document Upload & Parsing
**Phase:** 2B - File-with-Message Send
**Story:** 6.9.5 - Server-Side Attachment Validation
**Status:** ✅ Complete

---

## Overview

Implemented server-side validation and enrichment of file attachments in the `send_message` WebSocket handler. The client now only sends `fileId` when attaching files to messages, and the server validates ownership, enriches with metadata from the database, and strips sensitive `storagePath` from responses.

---

## Changes Made

### 1. ChatServer.ts Updates

**File:** `packages/backend/src/infrastructure/websocket/ChatServer.ts`

#### Added IFileRepository Dependency
```typescript
import type { IFileRepository } from '../../application/interfaces/IFileRepository.js';

constructor(
  // ... existing params
  private readonly fileRepository: IFileRepository
) {
  // ...
}
```

#### Updated SendMessagePayload Interface
```typescript
interface SendMessagePayload {
  // ...
  // Client now only sends fileId (server validates and enriches)
  attachments?: Array<{ fileId: string }>;
}
```

#### Attachment Validation in send_message Handler

**Location:** Lines 366-400

```typescript
// Epic 16.6.9: Validate and enrich attachments
let enrichedAttachments: MessageAttachment[] | undefined;
if (hasAttachments) {
  enrichedAttachments = [];
  for (const att of attachments) {
    // Validate: file exists AND belongs to this user AND this conversation
    const file = await this.fileRepository.findByIdAndConversation(att.fileId, conversationId);

    if (!file) {
      socket.emit('error', {
        event: 'send_message',
        message: `Invalid attachment: file ${att.fileId} not found or not authorized`,
      });
      return;
    }

    // Verify user owns the file
    if (file.userId !== socket.userId) {
      socket.emit('error', {
        event: 'send_message',
        message: 'Attachment not authorized',
      });
      return;
    }

    // Enrich with server-side metadata (don't trust client)
    enrichedAttachments.push({
      fileId: file.id,
      filename: file.filename,
      mimeType: file.mimeType,
      size: file.size,
      storagePath: file.storagePath, // Stored in DB, but stripped from responses
    });
  }
}
```

#### Strip storagePath from message_sent Event

**Location:** Lines 414-425

```typescript
socket.emit('message_sent', {
  messageId: message.id,
  conversationId: message.conversationId,
  timestamp: message.createdAt,
  attachments: enrichedAttachments ? enrichedAttachments.map(att => ({
    fileId: att.fileId,
    filename: att.filename,
    mimeType: att.mimeType,
    size: att.size,
    // storagePath intentionally omitted for security
  })) : undefined,
});
```

#### Strip storagePath from get_history Handler

**Location:** Lines 598-617

```typescript
socket.emit('history', {
  conversationId: payload.conversationId,
  messages: messages.map((msg) => ({
    id: msg.id,
    conversationId: msg.conversationId,
    role: msg.role,
    content: msg.content,
    createdAt: msg.createdAt,
    // Epic 16.6.9: Strip storagePath from attachments for security
    ...(msg.attachments && msg.attachments.length > 0 && {
      attachments: msg.attachments.map(att => ({
        fileId: att.fileId,
        filename: att.filename,
        mimeType: att.mimeType,
        size: att.size,
        // storagePath intentionally omitted
      })),
    }),
  })),
});
```

### 2. Dependency Injection

**File:** `packages/backend/src/index.ts`

```typescript
// Import DrizzleFileRepository
import { DrizzleFileRepository } from './infrastructure/database/repositories/DrizzleFileRepository.js';

// Initialize repository
const fileRepo = new DrizzleFileRepository();

// Pass to ChatServer
const chatServer = new ChatServer(
  server.getIO(),
  conversationService,
  claudeClient,
  rateLimiter,
  JWT_SECRET,
  promptCacheManager,
  assessmentService,
  vendorService,
  questionnaireReadyService,
  questionnaireGenerationService,
  questionService,
  fileRepo  // New parameter
);
```

### 3. Test Updates

**Updated Test Files:**
1. `__tests__/e2e/websocket-chat.test.ts` - Added mockFileRepository
2. `__tests__/unit/ChatServer.handleGetExportStatus.test.ts` - Added mockFileRepository
3. `__tests__/unit/ChatServer.handleGenerateQuestionnaire.test.ts` - Added mockFileRepository

**New Test File:**
`__tests__/unit/ChatServer.attachmentValidation.test.ts`

Tests verify:
- FileRepository has required method (`findByIdAndConversation`)
- Enrichment structure includes server-side metadata
- `storagePath` is stripped from client responses
- Invalid file rejection scenarios (not found, wrong user, wrong conversation)
- Client payload only requires `fileId`

---

## Security Improvements

### Before (6.9.4)
- Client sent full attachment metadata (filename, mimeType, size, storagePath)
- Server trusted client-supplied data
- storagePath exposed in responses

### After (6.9.5)
- Client only sends `fileId`
- Server validates against database (ownership, conversation match)
- Server enriches with authoritative metadata
- `storagePath` NEVER sent to client (security)

---

## Validation Flow

```
1. Client sends: { fileId: 'uuid-123' }
2. Server validates: fileRepository.findByIdAndConversation(fileId, conversationId)
3. Server checks: file.userId === socket.userId
4. Server enriches: { fileId, filename, mimeType, size, storagePath }
5. Server saves: message with enriched attachments
6. Server responds: { fileId, filename, mimeType, size } (no storagePath)
```

---

## Acceptance Criteria

- [x] FileRepository injected into ChatServer
- [x] Attachments validated against files table
- [x] Invalid fileId rejected with error
- [x] File not in target conversation rejected
- [x] File not owned by user rejected
- [x] Attachment metadata enriched from database
- [x] storagePath NOT in message_sent event
- [x] storagePath NOT in history response
- [x] All existing tests still pass (784/784)
- [x] New tests added for attachment validation (7 tests)

---

## Test Results

```
Test Suites: 50 passed, 50 total
Tests:       784 passed, 784 total
Snapshots:   0 total
Time:        25.527 s
```

All tests passing, including new attachment validation tests.

---

## Files Modified

1. `packages/backend/src/infrastructure/websocket/ChatServer.ts`
2. `packages/backend/src/index.ts`
3. `packages/backend/__tests__/e2e/websocket-chat.test.ts`
4. `packages/backend/__tests__/unit/ChatServer.handleGetExportStatus.test.ts`
5. `packages/backend/__tests__/unit/ChatServer.handleGenerateQuestionnaire.test.ts`

## Files Created

1. `packages/backend/__tests__/unit/ChatServer.attachmentValidation.test.ts`

---

## Next Steps

**Remaining Epic 16 Stories:**
- 6.10.1: Frontend - Attach Uploaded File to Message
- 6.10.2: Frontend - Attachment Display in Chat History
- 6.10.3: Frontend - Loading/Error States for File Upload

**Status:** Phase 2B backend complete. Ready for frontend integration.

---

## Notes

- Client payload now minimal (`{ fileId }`) - reduces network overhead
- Server-side validation prevents unauthorized file access
- Security: storagePath never exposed to client
- All validation happens at WebSocket layer (not in service layer)
- Existing message flow unchanged (backward compatible)
