# Sidequest: Prompt Cache Manager (Claude Prompt Caching)

**Version:** 1.0
**Created:** 2025-11-21
**Completed:** 2025-11-21
**Status:** ✅ Complete
**Priority:** High (reduces token cost; stabilizes system prompt delivery)
**Scope:** Integrate Anthropic prompt caching for consult/assessment system prompts, with clean-architecture boundaries and safe fallbacks.

---

## Goals
- Stop resending the full base system prompt per request; cache once and reuse.
- Support both consult and assessment prompts with formatting guardrails intact.
- Provide resilient fallback to plain `systemPrompt` if cache upload fails.
- Preserve existing chat flows and WebSocket/API contracts; zero regressions.

## Constraints / Non-Goals
- Must align with Clean Architecture: cache orchestration in AI infra layer, no leakage into presentation.
- No breaking changes to ChatServer contracts or frontend events.
- Do not hard-tie cache IDs across projects; keep app-level namespacing/versioning.
- No UX changes beyond behavior staying the same (lower latency/token cost).

## Epics & Stories

### Epic A — Prompt Source & Versioning
- **A1: Prompt Payload Definition**  
  - Confirm consult/assessment prompt text (incl. formatting guidelines) in `prompts.ts` is the cache content.
- **A2: Versioning/Hashing**  
  - Compute hash/version per mode; map `mode -> {hash, versionLabel}` to detect changes.
- **A3: Config Flags**  
  - Add config to enable/disable Anthropic prompt caching (env/feature flag); default safe off if misconfigured.

### Epic B — Prompt Cache Manager (Infra)
- **B1: Interface**  
  - Define `PromptCacheManager.ensureCached(mode): { cachedPromptId, hash, mode }` with in-memory dedupe keyed by hash.
- **B2: Anthropic Upload**  
  - Implement upload to Anthropic prompt cache API; handle retries/errors; store returned ID in map.
- **B3: Observability**  
  - Log cache hits/misses/uploads; surface metrics hooks (miss count, upload failures).
- **B4: Fallback Logic**  
  - On upload failure, return `{ cachedPromptId: null }` so caller sends raw `systemPrompt`.

### Epic C — AI Client Integration
- **C1: Client Contract**  
  - Extend `IClaudeClient` and implementation to accept `cachedPromptId` (preferred) and `systemPrompt` (fallback).
- **C2: Call-Site Adoption**  
  - Update ChatServer (and any other callers) to call `ensureCached(mode)` and pass `cachedPromptId`; include `systemPrompt` only when cache unavailable.
- **C3: Tests**  
  - Unit: client called with cache ID when feature flag on; fallback path uses prompt text when off/failed.

### Epic D — Workflow Safety & Architecture
- **D1: Clean Boundaries**  
  - Keep cache manager in AI infra; no direct frontend changes; no domain coupling.
- **D2: Feature Flag Behavior**  
  - Verify behavior is identical with caching off; toggling on/off does not alter API contracts.
- **D3: Multi-Instance Consideration**  
  - Document that cache ID is tied to API key; option to persist `{mode, hash, cacheId}` if multi-instance needs arise.

### Epic E — QA & Validation
- **E1: Unit Tests**  
  - Hash/version tests; ensureCached deduping; fallback on upload error.
- **E2: Integration Smoke**  
  - Consult and assessment chats work with caching enabled/disabled; no mode/assessment regressions.
- **E3: Token/Latency Check (Manual)**  
  - Spot-check request payloads: cache ID present when enabled, prompt text omitted; observe reduced prompt tokens.

---

## Dependencies
- Anthropic prompt caching support enabled for the API key.
- Existing prompts in `packages/backend/src/infrastructure/ai/prompts.ts`.
- Current Claude client wiring in ChatServer.

## Risks / Mitigations
- **Shared API key across projects**: prefix/version cache metadata in app; option to use dedicated key.  
- **Cache upload failures**: fail open with raw prompt; log and alert.  
- **Multi-instance divergence**: consider persisting `{mode, hash, cacheId}` if running >1 instance; document behavior.  
- **Contract drift**: keep WebSocket/events unchanged; add only optional fields to Claude client call.

## Definition of Done
- PromptCacheManager returns cache IDs per mode when caching is enabled; dedupes by hash.
- ChatServer (and other callers) use `cachedPromptId` when available; fallback to `systemPrompt` when not.
- No regressions in consult/assessment behavior or message flow; tests updated/passing.
- Feature flag allows safe disable; logging shows cache hits/misses.

## QA Checklist
- **Caching On/Off Parity**: ✅ Chats function identically with flag toggled; only token cost differs.
- **Cache Hit Path**: ✅ Requests include cache_control headers when enabled.
- **Fallback Path**: ✅ When disabled, sends raw prompt without caching.
- **Mode Coverage**: ✅ Both consult and assessment resolve to correct cache IDs/version.
- **Tests**: ✅ Unit tests for cache manager created and passing (8 test cases).

---

## Implementation Summary

### Architecture Implemented (2025-11-21)

**Components:**
- `PromptCacheManager` - Orchestrates caching with hash-based deduplication
- `ClaudeClient.buildSystemPrompt()` - Adds `cache_control: {type: 'ephemeral'}` headers
- `ChatServer.buildConversationContext()` - Calls `ensureCached()` per request
- Config via `CLAUDE_PROMPT_CACHE=true` in `.env`

**Design Deviation from Original Plan:**
- **Original**: Upload prompts to Anthropic server-side cache API
- **Implemented**: Use Anthropic's client-side ephemeral caching via `cache_control` headers
- **Rationale**: Simpler implementation, no separate upload step, Anthropic handles cache lifecycle

**Files Changed:**
- `src/infrastructure/ai/PromptCacheManager.ts` - Core cache manager
- `src/infrastructure/ai/ClaudeClient.ts` - Cache control header integration
- `src/infrastructure/ai/prompts.ts` - Prompt loading with file support
- `src/infrastructure/websocket/ChatServer.ts` - Integration point
- `src/index.ts` - Config wiring
- `__tests__/unit/PromptCacheManager.test.ts` - Unit tests

**Observability:**
```
[Prompts] Loaded custom prompt from file: ./guardian-prompt.md (45786 chars)
```

### Bonus Work (Not in Original Sidequest)

**Prompt Loading Fix:**
- **Issue**: `.env` multi-line variable truncated prompt to ~1.5KB (97% data loss)
- **Fix**: Load from `guardian-prompt.md` file (gitignored for privacy)
- **Config**: `GUARDIAN_PROMPT_FILE=./guardian-prompt.md`
- **Result**: Full 46KB Guardian system prompt now loads correctly

### Test Coverage

**Unit Tests** (`__tests__/unit/PromptCacheManager.test.ts`):
1. Returns cache metadata when enabled
2. Does not return cache ID when disabled
3. Recomputes when prompt content changes
4. Deduplicates by hash for same mode/content
5. Generates different cache IDs for different modes
6. Uses custom prefix in cache ID
7. Defaults to "guardian" prefix when not specified
8. Hashes produce consistent 16-character strings

**Integration Validation:**
- Verified via development server logs (prompt loading + caching enabled)
- Backend successfully sends cache_control headers to Anthropic API
- Both consult and assessment modes working correctly

### Token Cost Reduction (Expected)

With prompt caching enabled:
- **Cached prompt**: ~46KB system prompt billed as cached tokens (~90% discount)
- **Uncached**: First request per cache miss pays full price
- **TTL**: 5 minutes (Anthropic's default for ephemeral caching)
- **ROI**: Significant for multi-turn conversations and concurrent users

### Future Enhancements (Out of Scope)

- Persist cache metadata across server restarts (in-memory only currently)
- Add Prometheus metrics for cache hits/misses
- Support for multi-instance deployments with shared cache state
- Automatic cache warming on startup  
