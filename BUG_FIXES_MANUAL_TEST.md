# Bug Fixes - Manual Testing Guide

**Date:** 2025-11-14
**Agent:** frontend-agent
**Status:** Ready for manual testing

---

## Overview

Fixed three critical conversation management bugs identified by external LLM review:

1. **Bug 1:** Logout doesn't clear chat state (SECURITY ISSUE)
2. **Bug 2:** Streaming continues when clicking "New Chat" (DATA CORRUPTION)
3. **Bug 3:** Sidebar disappears on page reload (INVESTIGATION)

---

## Bug 1: Logout Security Hole

**Severity:** CRITICAL - User data leakage

### What Was Fixed
- Logout now clears Zustand persisted chat store
- Previously only cleared auth tokens
- Next user would see previous user's conversations

### Files Changed
- `apps/web/src/hooks/useAuth.ts`

### Test Steps

1. **Login as User A**
   ```
   Email: alice@example.com
   Password: (your test password)
   ```

2. **Create 2-3 conversations**
   - Send messages in multiple chats
   - Verify sidebar shows conversations

3. **Logout**
   - Click logout button
   - Verify redirected to login page

4. **Login as User B**
   ```
   Email: bob@example.com
   Password: (your test password)
   ```

5. **Verify Sidebar is Empty**
   - Should show "No conversations yet"
   - Should NOT show User A's conversations

6. **Check localStorage (Dev Tools)**
   - Open Console > Application > Local Storage
   - Verify NO `guardian-chat-store` key exists
   - Verify NO `guardian_conversation_id` key exists
   - Only `guardian_token` and `guardian_user` should exist (for User B)

### Expected Results
- ✅ User B sees empty sidebar
- ✅ No User A conversations visible
- ✅ localStorage is clean (no chat state from User A)

### If Test Fails
- Check console for errors
- Verify logout function called
- Check localStorage still has guardian-chat-store key

---

## Bug 2: Stream Bleed into New Chat

**Severity:** HIGH - Response chunks appear in wrong conversation

### What Was Fixed
- Added `abortStream()` functionality
- Frontend now signals backend to stop streaming
- Backend acknowledges abort request
- New chat doesn't receive old stream chunks

### Files Changed
- `packages/backend/src/infrastructure/websocket/ChatServer.ts`
- `apps/web/src/lib/websocket.ts`
- `apps/web/src/hooks/useWebSocket.ts`
- `apps/web/src/components/chat/ChatInterface.tsx`

### Test Steps

1. **Start a conversation**
   - Send: "Explain quantum computing in detail"
   - This should trigger a long response

2. **Wait for stream to start**
   - See typing indicator disappear
   - See response chunks appearing word-by-word

3. **Click "New Chat" mid-stream**
   - While response is still streaming
   - Before response completes

4. **Verify stream stops immediately**
   - No more chunks appearing
   - New chat interface appears

5. **Verify new chat is empty**
   - Should show welcome message
   - Should NOT have any text from previous stream

6. **Send a new message**
   - Ask: "What is machine learning?"
   - Verify response is correct
   - Verify no contamination from previous stream

### Expected Results
- ✅ Stream stops immediately when clicking "New Chat"
- ✅ New chat starts with empty state
- ✅ No chunks from old stream appear in new chat
- ✅ New questions get correct responses

### Console Logs to Check
```
[ChatInterface] Aborting active stream for new chat
[WebSocketClient] Aborting stream
[ChatServer] Stream abort requested by user <userId>
```

### If Test Fails
- Check if chunks still appearing after "New Chat" clicked
- Check console for abort logs
- Verify finishStreaming() called
- Check if new chat has partial text from old stream

---

## Bug 3: Sidebar Disappears on Reload

**Severity:** MEDIUM - Conversations exist but don't show

### What Was Fixed
- Debug logs added throughout data flow
- Investigation pending based on console output

### Files with Debug Logs
- `apps/web/src/components/chat/ChatInterface.tsx`
- `apps/web/src/lib/websocket.ts`
- `apps/web/src/stores/chatStore.ts`

### Test Steps

1. **Create 3 conversations**
   - Send messages in 3 different chats
   - Verify all 3 appear in sidebar

2. **Open Developer Console**
   - Press F12 (or Cmd+Option+I on Mac)
   - Go to Console tab
   - Clear console log

3. **Reload page**
   - Press F5 (or Cmd+R on Mac)
   - Watch console logs

4. **Expected Console Log Sequence:**
   ```
   [ChatInterface] Fetch conversations effect triggered - isConnected: true, fetchConversations: true
   [ChatInterface] Calling fetchConversations NOW
   [WebSocket] Requesting conversations list
   [ChatServer] Fetching conversations for user <userId>
   [ChatServer] Found 3 conversations for user <userId>
   [ChatServer] Emitted conversations_list with 3 conversations
   [WebSocket] Received conversations list: 3
   [chatStore] setConversations called with 3 conversations
   [chatStore] State updated with new conversations
   ```

5. **Check Sidebar**
   - Should show 3 conversations
   - Click each to verify they load correctly

### Expected Results
- ✅ Console shows full fetch sequence
- ✅ Sidebar shows 3 conversations after reload
- ✅ Clicking conversations loads history correctly

### If Test Fails - Analyze Console Logs

**Scenario A: No connection**
```
Console shows: isConnected: false
Fix: Check autoConnect logic in ChatInterface.tsx
Change: autoConnect: Boolean(token) && savedConversationId !== null
To: autoConnect: Boolean(token)
```

**Scenario B: Connected but no fetch**
```
Console shows: isConnected: true, fetchConversations: false
Fix: Check useWebSocket return value includes fetchConversations
Verify: fetchConversations callback defined
```

**Scenario C: Fetch sent but no response**
```
Console shows: Requesting conversations list
But NO: Received conversations list
Fix: Check WebSocket event listener registration
Verify: conversations_list event handler in WebSocketClient
```

**Scenario D: Response received but sidebar empty**
```
Console shows: Received conversations list: 3
But sidebar empty
Fix: Check chatStore.setConversations implementation
Verify: ConversationList component reads from chatStore
```

---

## Testing Checklist

Before marking bugs as fixed:

### Bug 1: Logout
- [ ] User A creates conversations
- [ ] User A logs out
- [ ] User B logs in
- [ ] User B sees empty sidebar (not User A's conversations)
- [ ] localStorage is clean (no guardian-chat-store)

### Bug 2: Stream Abort
- [ ] Send long question (triggers streaming)
- [ ] Click "New Chat" mid-stream
- [ ] Stream stops immediately
- [ ] New chat is empty
- [ ] New questions work correctly

### Bug 3: Reload
- [ ] Create 3 conversations
- [ ] Reload page (F5)
- [ ] Console shows full fetch sequence
- [ ] Sidebar shows 3 conversations
- [ ] Conversations load correctly when clicked

---

## Post-Testing Actions

Once all tests pass:

1. **Document results** in implementation log
2. **Invoke code-reviewer** for final approval
3. **Update task-overview.md** with bug fix status
4. **Create git commit** with clear message:
   ```
   fix(conversations): Fix 3 critical conversation management bugs

   Bug 1: Logout now clears chat state (security fix)
   - Clear guardian-chat-store on logout
   - Prevents user data leakage across sessions

   Bug 2: Abort streaming on "New Chat" (data corruption fix)
   - Add abortStream() to WebSocket client
   - Call on conversation switch
   - Prevents chunks bleeding into new chat

   Bug 3: Investigation with debug logs (pending)
   - Added comprehensive logging
   - Ready for manual testing analysis

   🤖 Generated with Claude Code
   Co-Authored-By: Claude <noreply@anthropic.com>
   ```

---

## Notes for Tester

- All 3 bugs identified by external LLM review
- Bugs 1 & 2 are implemented and ready to test
- Bug 3 needs console log analysis to determine root cause
- Pre-existing test failures in DrizzleQuestionRepository (unrelated to these changes)
- No new TypeScript errors introduced

---
