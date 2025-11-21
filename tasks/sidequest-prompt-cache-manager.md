# Sidequest: Prompt Cache Manager (Claude Prompt Caching)

**Version:** 0.1  
**Created:** 2025-11-21  
**Status:** Planning  
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
- **Caching On/Off Parity**: Chats function identically with flag toggled; only token cost differs.  
- **Cache Hit Path**: Requests include `cachedPromptId`, omit prompt text.  
- **Fallback Path**: Upload failure results in raw prompt sent, with warning logged.  
- **Mode Coverage**: Both consult and assessment resolve to correct cache IDs/version.  
- **Tests**: New unit tests for cache manager and client selection logic are passing.  
