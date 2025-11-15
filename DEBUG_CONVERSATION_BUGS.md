# Debugging Conversation Bugs

## Issues to Debug

### Issue 1: Old Chat Messages Not Displaying When Switching
**User Report:** "In a session if I create a new chat and then go to an old chat, the chat text does not display even though the agent recalls the last chat"

**Evidence:** Backend logs show history is being fetched, but frontend not displaying messages.

### Issue 2: Sidebar Disappears on Page Reload
**User Report:** "If I reload the page in a session then the chat history in the sidebar disappears"

**Evidence:** Conversations persist in database, but sidebar is empty after reload.

---

## Debug Logs Added

### 1. ChatInterface.tsx
- `handleHistory`: Logs when history received, message count, and setMessages call
- `handleConversationsList`: Logs when conversations list received, count, and setConversations call
- `fetchConversations effect`: Logs when effect triggers and when fetchConversations called
- `conversation switching effect`: Logs activeConversationId changes, clearMessages, and requestHistory calls

### 2. WebSocket Client (websocket.ts)
- `onHistory handler`: Logs when history event received from backend
- `requestHistory`: Logs when get_history event emitted to backend

### 3. chatStore.ts
- `setMessages`: Logs when called and state update
- `setConversations`: Logs when called and state update
- `clearMessages`: Logs when called

### 4. DashboardLayout.tsx
- `conversations effect`: Logs conversations count whenever chatStore.conversations changes

---

## Testing Steps

### Test Issue 1: Message Display on Conversation Switch

1. **Login and create first conversation**
   - Send a few messages
   - Note the conversation ID in sidebar

2. **Create new conversation**
   - Click "New chat" button
   - Send a few messages

3. **Switch back to old conversation**
   - Click on first conversation in sidebar
   - **Expected:** Old messages should display
   - **Check console for:**
     - `[ChatInterface] Switching to conversation: <id>`
     - `[ChatInterface] Messages cleared`
     - `[ChatInterface] Requesting history for conversation: <id>`
     - `[WebSocket] Emitting get_history for conversation: <id>`
     - `[WebSocket] history event received - messages: X`
     - `[ChatInterface] handleHistory called with: X messages`
     - `[chatStore] setMessages called with X messages`
     - `[chatStore] State updated with new messages`

4. **If messages don't display, check for:**
   - Is history event received? (WebSocket log)
   - Is handleHistory called? (ChatInterface log)
   - Is setMessages called? (chatStore log)
   - Are messages being cleared after being set? (clearMessages log)

### Test Issue 2: Sidebar on Page Reload

1. **Login and create some conversations**
   - Create 2-3 conversations
   - Verify they appear in sidebar

2. **Reload the page (Cmd+R)**
   - **Expected:** Sidebar should re-populate with conversations
   - **Check console for:**
     - `[ChatInterface] Fetch conversations effect triggered - isConnected: true`
     - `[ChatInterface] Calling fetchConversations NOW`
     - `[WebSocket] Requesting conversations list`
     - `[WebSocket] Received conversations list: X`
     - `[ChatInterface] handleConversationsList called with: X conversations`
     - `[chatStore] setConversations called with X conversations`
     - `[chatStore] State updated with new conversations`
     - `[DashboardLayout] Conversations from chatStore: X`

3. **If sidebar is empty, check for:**
   - Is isConnected true? (Fetch conversations effect log)
   - Is fetchConversations called? (ChatInterface log)
   - Is conversations_list event received? (WebSocket log)
   - Is handleConversationsList called? (ChatInterface log)
   - Is setConversations called? (chatStore log)
   - Does DashboardLayout receive conversations? (DashboardLayout log)

---

## Expected Log Flow

### Successful Conversation Switch
```
[ChatInterface] Conversation switching effect - activeConversationId: abc123, isConnected: true
[ChatInterface] Switching to conversation: abc123
[chatStore] clearMessages called
[ChatInterface] Messages cleared
[ChatInterface] Requesting history for conversation: abc123
[WebSocket] Emitting get_history for conversation: abc123, limit: 50
[WebSocket] history event received - conversationId: abc123, messages: 5
[WebSocket] Normalized messages: 5
[ChatInterface] handleHistory called with: 5 messages
[ChatInterface] Messages: [Array of 5 messages]
[chatStore] setMessages called with 5 messages
[chatStore] State updated with new messages
[ChatInterface] setMessages called
```

### Successful Page Reload (Conversations)
```
[ChatInterface] Fetch conversations effect triggered - isConnected: true, fetchConversations: true
[ChatInterface] Calling fetchConversations NOW
[WebSocket] Requesting conversations list
[WebSocket] Received conversations list: 3
[ChatInterface] handleConversationsList called with: 3 conversations
[ChatInterface] Conversations data: [Array of 3 conversations]
[chatStore] setConversations called with 3 conversations
[chatStore] State updated with new conversations
[DashboardLayout] Conversations from chatStore: 3
```

---

## Next Steps After Testing

1. **Run the app and reproduce both issues**
2. **Collect console logs**
3. **Identify where the flow breaks:**
   - Is the event not emitted?
   - Is the event not received?
   - Is the handler not called?
   - Is the state not updating?
   - Is the state updating but component not re-rendering?

4. **Based on findings, implement fix:**
   - If event not received: Check backend WebSocket server
   - If handler not called: Check event listener setup in useWebSocket hook
   - If state not updating: Check Zustand store logic
   - If component not re-rendering: Check React dependencies/memo

5. **Remove debug logs after fix** (or keep useful ones)

---

## Files Modified (with debug logs)

- `apps/web/src/components/chat/ChatInterface.tsx` (4 locations)
- `apps/web/src/lib/websocket.ts` (2 locations)
- `apps/web/src/stores/chatStore.ts` (3 locations)
- `apps/web/src/app/(dashboard)/layout.tsx` (1 location)
