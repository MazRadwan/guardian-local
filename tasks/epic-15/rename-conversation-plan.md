# Feature: Rename Conversation in Sidebar

## Current State

**Titles are NOT stored in the database.** They're dynamically generated from the first user message (first 60 chars) on every fetch. The `conversations` table has no `title` column.

## Files to Modify

### Database Layer (2 files)
| File | Change |
|------|--------|
| `packages/backend/src/infrastructure/database/schema/conversations.ts` | Add `title` column (nullable varchar) |
| New migration file | `ALTER TABLE conversations ADD COLUMN title VARCHAR(100)` |

### Backend (4 files)
| File | Change |
|------|--------|
| `packages/backend/src/application/interfaces/IConversationRepository.ts` | Add `updateTitle(id, title)` method |
| `packages/backend/src/infrastructure/database/repositories/DrizzleConversationRepository.ts` | Implement `updateTitle()` |
| `packages/backend/src/application/services/ConversationService.ts` | Add `updateConversationTitle()` + modify `getConversationTitle()` to prefer stored title |
| `packages/backend/src/infrastructure/websocket/ChatServer.ts` | Add `rename_conversation` event handler |

### Frontend (6 files)
| File | Change |
|------|--------|
| `apps/web/src/lib/websocket.ts` | Add `renameConversation(conversationId, title)` emit method |
| `apps/web/src/hooks/useWebSocket.ts` | Expose `renameConversation()` passthrough |
| `apps/web/src/hooks/useWebSocketAdapter.ts` | Add `renameConversation(id, title)` method |
| `apps/web/src/services/ConversationService.ts` | Add `renameConversation()` wrapper |
| `apps/web/src/components/chat/ConversationListItem.tsx` | Add Shadcn DropdownMenu (Rename + Delete), inline edit mode, remove standalone delete button |
| `apps/web/src/components/chat/ConversationList.tsx` | Pass rename handler down |

### Tests (4 files)
| File | Change |
|------|--------|
| `packages/backend/src/application/services/__tests__/ConversationService.test.ts` | Test rename logic |
| `packages/backend/src/infrastructure/websocket/__tests__/ChatServer.test.ts` | Test WebSocket event |
| `apps/web/src/components/chat/__tests__/ConversationListItem.test.tsx` | Test edit mode UI |
| `apps/web/src/hooks/__tests__/useWebSocketAdapter.test.ts` | Test rename method |

## Implementation Summary

**Total: ~16 files** (10 source + 4 tests + 1 migration + 1 schema)

### Data Flow (After Implementation)
```
User double-clicks title → Edit mode → Types new name → Enter
  ↓
ConversationListItem emits onRename(id, newTitle)
  ↓
WebSocket: emit 'rename_conversation' { conversationId, title }
  ↓
ChatServer handler → ConversationService.updateConversationTitle()
  ↓
Repository.updateTitle() → DB UPDATE
  ↓
WebSocket: emit 'conversation_title_updated' { conversationId, title }
  ↓
Zustand store.updateConversationTitle() → UI re-renders
```

### Key Design Decisions
1. **Nullable title column** - If null, fall back to auto-generated from first message
2. **Max length 100 chars** - Reasonable limit for UI display
3. **Right-click context menu** - Using Shadcn DropdownMenu with options: Rename, Delete (consolidates existing delete button)
4. **Inline edit mode** - When "Rename" selected, title becomes editable input
5. **Escape to cancel, Enter to save** - Standard keyboard UX
6. **Optimistic update** - Update UI immediately, revert on error
7. **Extensible menu** - Easy to add future options (archive, duplicate, export)
8. **Reuse existing server event** - Emit `conversation_title_updated` to avoid adding a new “renamed” event type

## Effort Estimate
- Small-medium feature (~3-4 hours implementation)
- Low risk - additive change, no breaking modifications
- Bonus: Consolidates delete into context menu (cleaner UI)
