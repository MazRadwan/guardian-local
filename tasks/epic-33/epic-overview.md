# Epic 33: Consult Mode Search Tool

**Status:** Planning
**Branch:** `epic/33-consult-search-tool`
**Created:** 2026-01-29

---

## Goal

Add search capabilities to Consult mode, allowing Guardian to retrieve real-time information when answering user questions.

---

## Problem Statement

Currently, Guardian in Consult mode can only answer based on:
1. Claude's training data (knowledge cutoff)
2. Uploaded documents in the conversation

Users asking about current regulations, recent vendor news, or up-to-date compliance requirements get stale or incomplete answers.

---

## Proposed Solution

Integrate a search tool that Guardian can invoke during Consult mode conversations to:
- Look up current information
- Verify facts
- Find recent regulatory updates
- Research vendor-specific information

---

## Open Questions

### 1. Search Scope
- [ ] **Web search** (Brave Search API, Tavily, SerpAPI)?
- [ ] **Document search** (RAG over uploaded files)?
- [ ] **Healthcare-specific** (PubMed, FDA, Health Canada)?
- [ ] **All of the above**?

### 2. Implementation Approach
- [ ] **Claude tool_use** - Let Claude decide when to search
- [ ] **User-triggered** - User explicitly asks to search
- [ ] **Hybrid** - Both options available

### 3. Search Provider
| Provider | Free Tier | Notes |
|----------|-----------|-------|
| Brave Search API | 2,000 queries/month | Privacy-focused |
| Tavily | 1,000 queries/month | AI-optimized results |
| SerpAPI | 100 queries/month | Google results |
| Perplexity API | Paid only | High quality |

### 4. UX Considerations
- Show search indicator while searching?
- Display sources/citations in response?
- Allow user to see raw search results?

---

## Success Criteria

- [ ] Guardian can answer questions about current events/regulations
- [ ] Sources are cited in responses
- [ ] Search is fast (<3 seconds)
- [ ] Works within existing chat UX
- [ ] Cost stays within free tier for demo

---

## Technical Considerations

### Claude Tool Use
```typescript
// Example tool definition
{
  name: "web_search",
  description: "Search the web for current information",
  input_schema: {
    type: "object",
    properties: {
      query: { type: "string", description: "Search query" }
    },
    required: ["query"]
  }
}
```

### Affected Files (Estimated)
- `packages/backend/src/infrastructure/ai/ClaudeClient.ts` - Add tool handling
- `packages/backend/src/infrastructure/ai/tools/` - New search tool
- `packages/backend/src/infrastructure/websocket/handlers/MessageHandler.ts` - Tool execution
- `apps/web/src/components/chat/` - Citation display (optional)

---

## Dependencies

- Search API account and keys
- Claude tool_use support (already in ClaudeClient)

---

## Sprints (TBD)

Will be defined after scope is clarified.

---

## Notes

- Keep scope minimal for demo
- Prioritize web search over RAG initially
- Can expand to document search in future epic
