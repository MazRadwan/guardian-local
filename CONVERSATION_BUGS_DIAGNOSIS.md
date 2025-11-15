# Conversation Bugs - Root Cause Diagnosis

## Issues Reported

1. **Reload makes chat history disappear** - Sidebar becomes empty after F5
2. **Historical chats don't display on login** - Sidebar stays empty even though conversations exist in database
3. **Sidebar open by default** - Should be closed on login

---

## Root Cause Analysis

### Issues #1 & #2: Same Root Cause - `fetchConversations()` Not Being Called

**Evidence from logs:**
- Backend shows NO "Fetching conversations for user..." logs on login/reload
- Frontend has effect with console.logs that should fire (lines 189-194 in ChatInterface)
- But those logs never appear in console
- **Conclusion:** The useEffect that calls `fetchConversations()` is NOT running

**Why the effect might not run:**

**Hypothesis A: `fetchConversations` is undefined**
```typescript
const { fetchConversations } = useWebSocket({ ... });

useEffect(() => {
  if (isConnected && fetchConversations) {  // fetchConversations might be undefined
    fetchConversations();
  }
}, [isConnected, fetchConversations]);
```

**Check:** Does `useWebSocket` actually return `fetchConversations`?

**Hypothesis B: `isConnected` is false**
- WebSocket connects but `isConnected` state never updates to true
- Effect never fires because condition fails

**Check:** Browser console should show connection status

**Hypothesis C: Effect dependencies stale**
- `fetchConversations` reference changes on every render
- Effect sees it as "different" and doesn't fire
- Or conversely, it's too stable and doesn't trigger

**Check:** `useCallback` memoization in useWebSocket hook

---

### Issue #3: Sidebar Open by Default

**Current behavior:** Sidebar appears open on login

**Expected:** Sidebar closed by default (mobile-first UX)

**Check chatStore default:**
```typescript
// apps/web/src/stores/chatStore.ts
sidebarOpen: false,  // Should be false
```

We already set this to `false` in a previous fix. If sidebar still appears open, possible causes:

**Cause A: localStorage override**
- `sidebarOpen` might be persisted in localStorage as `true`
- On load, persisted value overrides default

**Cause B: Layout automatically opens sidebar**
- Some code opens sidebar on mount
- Check layout.tsx for any `setSidebarOpen(true)` calls

---

## Diagnostic Plan

### Step 1: Check Browser Console Logs

**Expected logs on page load:**
```
[ChatInterface] Fetch conversations effect triggered - isConnected: true, fetchConversations: true
[ChatInterface] Calling fetchConversations NOW
[WebSocketClient] Fetching conversations
```

**If missing → fetchConversations not being called**

### Step 2: Check Backend Logs

**Expected logs after frontend calls fetchConversations:**
```
[ChatServer] Fetching conversations for user <userId>
[ChatServer] Found X conversations for user <userId>
[ChatServer] Emitted conversations_list with X conversations
```

**If missing → Backend not receiving get_conversations event**

### Step 3: Check Network Tab

**WebSocket Frames:**
- Should see `get_conversations` event sent from client
- Should see `conversations_list` event sent from server

**If missing → WebSocket event not being emitted**

---

## Fixes to Implement

### Fix #1 & #2: Ensure fetchConversations() Is Called

**Option A: fetchConversations is undefined**

Check `apps/web/src/hooks/useWebSocket.ts` return statement:
```typescript
return {
  isConnected,
  isConnecting,
  sendMessage,
  requestHistory,
  fetchConversations,  // IS THIS HERE?
  startNewConversation,
  abortStream,
};
```

**Option B: Effect not triggering**

Add `useRef` to track if effect has run:
```typescript
const hasFetchedConversations = useRef(false);

useEffect(() => {
  if (isConnected && fetchConversations && !hasFetchedConversations.current) {
    console.log('[ChatInterface] Fetching conversations (first time)');
    fetchConversations();
    hasFetchedConversations.current = true;
  }
}, [isConnected, fetchConversations]);
```

**Option C: Call in onConnected callback instead of effect**

Move fetchConversations call to the `handleConnected` callback:
```typescript
const handleConnected = useCallback(
  (data: { conversationId: string; resumed: boolean }) => {
    // Existing logic...

    // Fetch conversations immediately on connect
    if (fetchConversations) {
      fetchConversations();
    }
  },
  [fetchConversations]
);
```

---

### Fix #3: Sidebar Closed by Default

**Check localStorage:**
```typescript
// In browser console
localStorage.getItem('guardian-chat-store')
// Look for "sidebarOpen":true
```

**If true in localStorage:**

**Option A: Clear localStorage**
- Clear site data
- Reload

**Option B: Force default on login**

In layout.tsx after successful login:
```typescript
useEffect(() => {
  if (isAuthenticated && user) {
    // Force sidebar closed on login
    setSidebarOpen(false);
  }
}, [isAuthenticated, user, setSidebarOpen]);
```

---

## Testing Instructions

### Test Issue #1 (Reload)

1. Login
2. Create 2 conversations (check sidebar shows them)
3. Reload page (F5)
4. **Check:** Does sidebar repopulate with 2 conversations?
5. **Check:** Browser console for fetchConversations logs
6. **Check:** Network tab for get_conversations/conversations_list events

### Test Issue #2 (Login)

1. Logout
2. Login again
3. **Check:** Does sidebar show previous conversations?
4. **Check:** Browser console for logs
5. **Check:** Backend logs for "Fetching conversations"

### Test Issue #3 (Sidebar Default)

1. Clear localStorage
2. Login
3. **Check:** Is sidebar closed or open?
4. **Expected:** Closed (user must click toggle to open)

---

## Next Steps

1. **User:** Check browser console for fetchConversations logs
2. **User:** Report what logs appear (or don't appear)
3. **Developer:** Implement appropriate fix based on findings
4. **Test:** Verify all 3 issues resolved

---

## Quick Fix Attempt

Since `fetchConversations()` isn't being called reliably via useEffect, try calling it in the `onConnected` callback instead. This is more reliable because it's triggered directly by the WebSocket connection event.

**File:** `apps/web/src/components/chat/ChatInterface.tsx`

Update `handleConnected` callback to call `fetchConversations()` immediately after connection is established.
