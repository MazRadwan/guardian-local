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

## Proposed Approach

### Two-Phase Title Generation for Assessment Mode

**Phase 1: Immediate LLM Title (like Consult mode)**
- After first meaningful Q&A exchange, generate LLM-based title
- Example: "AI Vendor Risk Assessment Questions"
- Clears the shimmer, provides context

**Phase 2: Upgrade to Vendor Title (when available)**
- When `generate_questionnaire` fires with vendorName/solutionName
- Update title to "Assessment: {vendorName}"
- Only if `titleManuallyEdited` is false

### Alternative: Tool-Based Vendor Capture

Add a tool the LLM can call when it captures vendor info during Q&A:
```typescript
{
  name: "register_vendor_info",
  description: "Register vendor/solution name captured during assessment conversation",
  parameters: {
    vendorName: string,
    solutionName?: string
  }
}
```

When called:
1. Store vendor info in conversation context
2. Update title to "Assessment: {vendorName}"
3. Emit `conversation_title_updated` WebSocket event

## User Stories

| Story | Description | Priority |
|-------|-------------|----------|
| 26.1 | Generate LLM title for Assessment mode after first Q&A | High |
| 26.2 | Upgrade title to "Assessment: {vendor}" when vendor captured | Medium |
| 26.3 | Add `register_vendor_info` tool for explicit capture (optional) | Low |
| 26.4 | Clear titleLoading state with timeout fallback | Medium |

## Acceptance Criteria

- [ ] Assessment mode conversations get titles after first exchange (not stuck as "New Chat")
- [ ] Title updates to "Assessment: {vendorName}" when vendor info is captured
- [ ] `titleLoading` shimmer clears within 5 seconds (timeout fallback)
- [ ] Manual renames are never overwritten
- [ ] Users in wrong mode still get meaningful titles

## Technical Considerations

### Backend Changes
- Modify title generation logic in `ChatServer.ts` to treat Assessment mode like Consult initially
- Add hook in `generate_questionnaire` to upgrade title with vendor name
- Optionally add `register_vendor_info` tool to assessment mode tools

### Frontend Changes
- Ensure `titleLoading` timeout (5s) is implemented
- Handle title upgrade smoothly (no flicker)

## Files Likely Touched

- `packages/backend/src/infrastructure/websocket/ChatServer.ts`
- `packages/backend/src/application/services/TitleGenerationService.ts`
- `packages/backend/src/infrastructure/ai/tools/index.ts` (if adding tool)
- `apps/web/src/stores/chatStore.ts` (timeout handling)

## Dependencies

- Epic 25 Sprint 1 & 2 complete (title generation infrastructure)
- Existing Assessment mode flow

## Notes

- This is a UX polish epic, not blocking core functionality
- Can be implemented incrementally (Phase 1 first, Phase 2 later)
- Tool-based approach (Story 26.3) is optional enhancement
