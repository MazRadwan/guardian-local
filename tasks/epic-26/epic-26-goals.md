# Epic 26: Assessment Mode Title Fallback

## Overview

Ensure Assessment mode conversations get meaningful titles even when the user doesn't complete the expected assessment flow (e.g., accidentally in wrong mode, abandons mid-flow, or doesn't trigger questionnaire generation).

## Problem Statement

Currently in Assessment mode:
- Title only updates when `generate_questionnaire` event fires with vendor/solution name
- If user never triggers questionnaire generation, title stays as "New Chat" indefinitely
- The `titleLoading` shimmer persists with no resolution
- Users accidentally in Assessment mode have poor sidebar UX

**Scenarios affected:**
1. User accidentally switches to Assessment mode, starts chatting casually
2. User starts assessment but abandons before generating questionnaire
3. User provides vendor name verbally but never reaches questionnaire generation
4. User explores Assessment mode without intending to complete full flow

## Goals

1. Provide immediate, meaningful titles for Assessment mode conversations
2. Update to "Assessment: {vendorName}" format when vendor info becomes available
3. Clear `titleLoading` state appropriately (no stuck shimmer)
4. Handle edge cases gracefully (wrong mode, abandoned flow)

## Primary Approach: Two-Phase Title Generation

This is the **recommended core solution** - addresses 90%+ of cases with minimal complexity.

### Phase 1: Immediate LLM Title (Story 26.1)

- After first meaningful Q&A exchange, generate LLM-based title
- Treat Assessment mode like Consult mode for initial title generation
- Example: "AI Vendor Risk Assessment Questions"
- Clears the shimmer immediately, provides meaningful context

### Phase 2: Upgrade to Vendor Title (Story 26.2)

- When `generate_questionnaire` fires with vendorName/solutionName
- Update title to "Assessment: {vendorName}"
- Only if `titleManuallyEdited` is false
- Uses existing infrastructure from Epic 25

### Shimmer Timeout Safety (Story 26.3)

Required safeguards to prevent stuck loading states:

| Trigger | Action |
|---------|--------|
| **5s hard timeout** | Clear `titleLoading`, set fallback title |
| **WebSocket disconnect** | Clear `titleLoading` |
| **Component unmount** | Clear timeout, cleanup state |
| **Conversation delete** | Clear timeout, remove state |
| **Error events** | Clear `titleLoading`, log error |
| **App load (stale state)** | Clear any `titleLoading` older than 10s (2x timeout) |

**Implementation requirements:**
- Store timestamp when `titleLoading` starts
- Run timeout once per conversation (avoid duplicates)
- Clean up timeouts to avoid memory leaks
- On app initialization, clear any loading states with `startTime` older than 10 seconds

## User Stories

| Story | Description | Priority |
|-------|-------------|----------|
| **26.1** | Generate LLM title for Assessment mode after first Q&A | **High** |
| **26.2** | Upgrade title to "Assessment: {vendor}" on `generate_questionnaire` | **Medium** |
| **26.3** | Shimmer timeout + cleanup (5s timeout, clear on disconnect/delete/error) | **Medium** |

## Acceptance Criteria

- [ ] Assessment mode conversations get LLM titles after first exchange (not stuck as "New Chat")
- [ ] Title updates to "Assessment: {vendorName}" when `generate_questionnaire` fires with vendor info
- [ ] `titleLoading` shimmer clears within 5 seconds via hard timeout
- [ ] `titleLoading` clears on disconnect, unmount, delete, and error events
- [ ] Stale `titleLoading` states cleared on app initialization
- [ ] Manual renames are never overwritten
- [ ] No memory leaks from orphaned timeouts

## Technical Considerations

### Backend Changes (Stories 26.1, 26.2)
- Modify title generation logic in `ChatServer.ts` to treat Assessment mode like Consult initially
- Remove or adjust any Assessment-specific title skip logic
- Existing `generate_questionnaire` handler already updates title (Epic 25.3)
- **IMPORTANT:** Do NOT regress the scoring-mode skip guard from Epic 25 Sprint 2 (Story 25.9) - scoring mode must continue to skip ALL assistant messages and only set title from filename

### Frontend Changes (Story 26.3)
- Add timeout tracking with `Map<conversationId, { timeout, startTime }>`
- Clear timeouts on unmount/delete using cleanup functions
- On app load, iterate stored conversations and clear stale `titleLoading`
- Ensure timeout fires only once per conversation

## Files Likely Touched

- `packages/backend/src/infrastructure/websocket/ChatServer.ts` - Remove Assessment skip, treat like Consult
- `apps/web/src/stores/chatStore.ts` - Timeout tracking and cleanup

## Dependencies

- Epic 25 Sprint 1 & 2 complete (title generation infrastructure)
- Existing Assessment mode flow
- Existing `generate_questionnaire` title update logic

## Notes

- This is a UX polish epic, not blocking core functionality
- Two-phase approach (26.1 + 26.2) is simple and covers 90%+ of use cases
- Shimmer timeout (26.3) prevents stuck loading states in all edge cases
