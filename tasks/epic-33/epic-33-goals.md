# Epic 33: Consult Search Tool

## Goal

Add consult-mode web search augmentation (Jina Search + Reader) that returns cited answers, with explicit user feedback during search, while preserving assessment/scoring behavior and performance.

## Problem Statement

Consult mode answers are limited to model knowledge and may be out-of-date or lack citations. Users need up-to-date, source-backed answers without disrupting existing assessment workflows or UI state.

## Success Criteria

- [ ] Consult mode can invoke a web search tool and return answers with a numbered **Sources** section of Markdown links.
- [ ] Tool use is consult-only; assessment/scoring tools and flows remain unchanged.
- [ ] Tool status feedback ("Searching the web...") appears during the tool call and clears reliably.
- [ ] Tool-result loop is fully supported (tool_use -> tool_result -> final answer) without double responses.

## Technical Approach

### Architecture

- Introduce a consult-only `web_search` tool and handler; keep `assessmentModeTools` unchanged.
- Add a tool-result loop in consult mode only: initial stream detects tool_use, dispatches handler, sends tool_result in a follow-up LLM call, then streams the final answer.
- Extend Claude client to support content blocks (tool_result) in follow-up calls.
- Emit a lightweight `tool_status` event to drive UI feedback without new message types.

### Data Flow

```
User (Consult) -> send_message
  -> MessageHandler streams Claude (tools enabled: consult only)
    -> tool_use(web_search) in final chunk
      -> ChatServer dispatches WebSearchToolService
        -> emit tool_status(searching)
        -> Jina Search (s.jina.ai) -> top N URLs
        -> Jina Reader (r.jina.ai) -> clean text for N URLs
        -> emit tool_status(idle)
      -> follow-up Claude call with tool_result blocks
        -> stream final answer with citations
      -> assistant_done emitted after final answer only
```

### Key Components

| Component | Layer | Responsibility |
|-----------|-------|----------------|
| `webSearchTool` | Infrastructure (ai/tools) | Tool definition/schema for consult search |
| `WebSearchToolService` | Application | Implements `IToolUseHandler`, calls Jina, returns tool_result + UI status |
| `IClaudeClient` / `ClaudeClient` | Infrastructure | Accepts content blocks and tool_result in follow-up calls |
| `ChatServer` / `MessageHandler` | Infrastructure | Consult-only tool loop and final response gating |
| `tool_status` event | WebSocket | UI feedback during search |
| Chat UI status | Frontend | Swap typing indicator text when tool_status active |

## Scope

**In Scope:**
- Consult-only web search tool with Jina Search + Reader
- Tool-result loop (tool_use -> tool_result -> final answer)
- UI feedback via `tool_status` and citation rendering in Markdown
- Prompt updates to enforce tool use + citation format

**Out of Scope:**
- Assessment/scoring tool changes or additional tools
- Embeddings/reranking or vector search
- Full sources panel UI (optional future enhancement)

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Tool_result not supported by client | Blocking | Extend `IClaudeClient` + `ClaudeClient` to send tool_result blocks |
| Double responses / early assistant_done | High | Gate assistant_done until final answer; consult-only tool loop |
| Jina auth required (401) | Medium | Require `JINA_API_KEY`, clear error handling + fallback message |
| UI status not wired | Medium | Add store field + websocket event + indicator swap |
| Prompt formatting vs Sources footer | Low | Add explicit Sources section rule with blank lines |

## Security Considerations

- Do not send PHI or sensitive data to Jina; sanitize/redact before search.
- Limit fetched content length and domains; enforce timeouts and rate limits.

## Dependencies

- Jina API key and env wiring (`JINA_API_KEY`, optional base URL).
- Claude client changes for tool_result content blocks.

## Sprints

| Sprint | Focus | Stories | Agent |
|--------|-------|---------|-------|
| Sprint 1 | Core tool loop | 33.1.1-33.1.4 (4 stories) | backend-agent |
| Sprint 2 | Consult-only wiring | 33.2.1-33.2.4 (4 stories) | backend-agent |
| Sprint 3 | UI feedback + tests | 33.3.1-33.3.4 (4 stories) | backend-agent, frontend-agent |

**Total Stories:** 12

## Files Touched / Created

**Create:**
- `packages/backend/src/infrastructure/ai/tools/webSearchTool.ts`
- `packages/backend/src/application/services/WebSearchToolService.ts`
- `packages/backend/src/application/interfaces/IJinaClient.ts`
- `packages/backend/src/infrastructure/external/JinaClient.ts`
- `packages/backend/__tests__/integration/consult-web-search.test.ts`

**Update:**
- `packages/backend/src/infrastructure/ai/tools/index.ts`
- `packages/backend/src/application/interfaces/IClaudeClient.ts`
- `packages/backend/src/infrastructure/ai/ClaudeClient.ts`
- `packages/backend/src/infrastructure/websocket/ChatServer.ts`
- `packages/backend/src/infrastructure/websocket/handlers/MessageHandler.ts`
- `packages/backend/src/infrastructure/ai/prompts.ts`
- `apps/web/src/lib/websocket.ts`
- `apps/web/src/hooks/useWebSocketEvents.ts`
- `apps/web/src/stores/chatStore.ts`
- `apps/web/src/components/chat/MessageList.tsx`

**Optional (styling):**
- `apps/web/src/components/chat/ChatMessage.tsx`

---

## References

- `packages/backend/src/infrastructure/ai/prompts.ts`
- `packages/backend/src/infrastructure/websocket/ChatServer.ts`
- `packages/backend/src/infrastructure/websocket/handlers/MessageHandler.ts`
