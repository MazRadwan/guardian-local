# Epic 33: Consult Mode Search Tool

**Status:** In Progress
**Branch:** `epic/33-consult-search-tool`
**Created:** 2026-01-29
**Planned:** 2026-02-03

> **⚠️ SESSION HANDOFF:** See `.session-handoff.md` in this folder for current implementation status, bugs, and context for continuing work.

---

## Summary

Add web search capabilities to Consult mode using Jina Search + Reader APIs. Guardian can invoke a `web_search` tool to retrieve current information and cite sources in responses.

---

## Goals Document

See `epic-33-goals.md` for complete goals, success criteria, technical approach, and risks.

---

## Sprints

| Sprint | Focus | Stories | Status |
|--------|-------|---------|--------|
| Sprint 1 | Core Tool Loop | 33.1.1-33.1.4 (4 stories) | Planned |
| Sprint 2 | Consult-Only Wiring | 33.2.1-33.2.4 (4 stories) | Planned |
| Sprint 3 | UI Feedback + Tests | 33.3.1-33.3.4 (4 stories) | Planned |

**Total:** 12 stories across 3 sprints

---

## Sprint Files

- `sprint-1-overview.md` - Core tool loop (tool definition, Jina client, Claude tool_result)
- `sprint-2-overview.md` - Consult-only wiring (mode gating, ChatServer flow, prompts)
- `sprint-3-overview.md` - UI feedback (tool_status event, typing indicator, integration tests)

---

## Story Files

### Sprint 1: Core Tool Loop
- `sprint-1-story-1.md` - Web Search Tool Definition
- `sprint-1-story-2.md` - Jina Client Service
- `sprint-1-story-3.md` - WebSearchToolService
- `sprint-1-story-4.md` - Claude Client Tool Result Support

### Sprint 2: Consult-Only Wiring
- `sprint-2-story-1.md` - Register WebSearchToolService
- `sprint-2-story-2.md` - Consult Mode Tool Loop
- `sprint-2-story-3.md` - Consult Prompt Update
- `sprint-2-story-4.md` - Assistant Done Gating

### Sprint 3: UI Feedback + Tests
- `sprint-3-story-1.md` - Tool Status WebSocket Event
- `sprint-3-story-2.md` - Frontend Tool Status Handler
- `sprint-3-story-3.md` - Typing Indicator Swap
- `sprint-3-story-4.md` - Integration Tests

---

## Key Decisions

1. **Search Provider:** Jina AI (Search + Reader APIs)
   - Free tier available
   - Clean text extraction from URLs
   - No complex result parsing needed

2. **Tool Invocation:** Claude tool_use
   - Claude decides when to search
   - Fits existing tool pattern (questionnaire_ready)

3. **Citation Format:** Markdown Sources section
   - Numbered links at end of response
   - Consistent with academic citation style

4. **Mode Isolation:** Consult-only
   - Assessment/scoring modes unchanged
   - New `consultModeTools` array separate from `assessmentModeTools`

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `JINA_API_KEY` | Yes | Jina AI API key for search + reader |
| `ENABLE_WEB_SEARCH` | No | Feature flag (default: true) |

---

## Notes

- Requires Jina API key for testing (free tier available)
- Integration tests mock Jina API for CI
- Feature can be disabled via `ENABLE_WEB_SEARCH=false`
