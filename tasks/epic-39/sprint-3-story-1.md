# Story 39.3.1: ISO Catalog In-Memory Cache

## Description

Add in-memory caching to `ISOControlRetrievalService.getFullCatalog()` and `getApplicableControls()` to eliminate the 2 sequential DB queries that run on every scoring call. The ISO catalog changes rarely (only when framework versions are updated), so caching with a TTL is safe and effective.

Currently, `getFullCatalog()` calls `mappingRepo.findAllMappings()` and `criteriaRepo.findApprovedByVersion()` sequentially on every scoring run. With caching, these queries run once and are served from memory until TTL expires.

## Acceptance Criteria

- [ ] `getFullCatalog()` caches result in memory after first call
- [ ] Cached value served for subsequent calls within TTL
- [ ] Cache invalidates after TTL expires (default: 5 minutes)
- [ ] `getApplicableControls()` caches per dimension set (key = sorted dimensions joined)
- [ ] Cache key for applicable controls is deterministic (sorted dimensions)
- [ ] `clearCache()` method for manual invalidation (useful for tests and framework updates)
- [ ] Cache respects `criteriaVersion` constructor parameter (different versions = different cache)
- [ ] Under 300 LOC (ISOControlRetrievalService.ts is currently 120 LOC)
- [ ] No TypeScript errors

## Technical Approach

### 1. Add Cache to ISOControlRetrievalService

**File:** `packages/backend/src/application/services/ISOControlRetrievalService.ts`

```typescript
const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

export class ISOControlRetrievalService {
  private fullCatalogCache: CacheEntry<ISOControlForPrompt[]> | null = null;
  private applicableControlsCache = new Map<string, CacheEntry<ISOControlForPrompt[]>>();
  private readonly cacheTTLMs: number;

  constructor(
    private readonly mappingRepo: IDimensionControlMappingRepository,
    private readonly criteriaRepo: IInterpretiveCriteriaRepository,
    private readonly criteriaVersion: string = 'guardian-iso42001-v1.0',
    cacheTTLMs?: number
  ) {
    this.cacheTTLMs = cacheTTLMs ?? DEFAULT_CACHE_TTL_MS;
  }

  async getFullCatalog(): Promise<ISOControlForPrompt[]> {
    if (this.fullCatalogCache && !this.isExpired(this.fullCatalogCache)) {
      return this.fullCatalogCache.data;
    }
    const allMappings = await this.mappingRepo.findAllMappings();
    const result = await this.buildControlList(allMappings);
    this.fullCatalogCache = { data: result, timestamp: Date.now() };
    return result;
  }

  async getApplicableControls(dimensions: string[]): Promise<ISOControlForPrompt[]> {
    const cacheKey = [...dimensions].sort().join(',');
    const cached = this.applicableControlsCache.get(cacheKey);
    if (cached && !this.isExpired(cached)) {
      return cached.data;
    }
    const allMappings = await this.mappingRepo.findByDimensions(dimensions);
    const result = await this.buildControlList(allMappings);
    this.applicableControlsCache.set(cacheKey, { data: result, timestamp: Date.now() });
    return result;
  }

  clearCache(): void {
    this.fullCatalogCache = null;
    this.applicableControlsCache.clear();
  }

  private isExpired(entry: CacheEntry<unknown>): boolean {
    return Date.now() - entry.timestamp > this.cacheTTLMs;
  }
}
```

### 2. Constructor Change

The constructor gets an optional `cacheTTLMs` parameter. This is backward compatible -- existing callers do not need to change.

## Files Touched

- `packages/backend/src/application/services/ISOControlRetrievalService.ts` - MODIFY (add caching, ~40 lines added)

## Tests Affected

Existing tests that may need updates:
- No existing test file found for ISOControlRetrievalService. If one exists at `packages/backend/__tests__/unit/application/services/ISOControlRetrievalService.test.ts`, verify cache behavior does not break existing assertions.

## Agent Assignment

- [x] backend-agent

## Tests Required

- [ ] `packages/backend/__tests__/unit/application/services/ISOControlRetrievalService.test.ts`
  - Test getFullCatalog returns data from DB on first call
  - Test getFullCatalog returns cached data on second call (repo not called again)
  - Test getFullCatalog refreshes after TTL expires
  - Test getApplicableControls caches per dimension set
  - Test getApplicableControls cache key is order-independent (["a","b"] === ["b","a"])
  - Test clearCache forces next call to hit DB
  - Test different criteriaVersion does not share cache (different service instances)
  - Test cache entry with expired TTL is refreshed

## Definition of Done

- [ ] In-memory caching implemented for both methods
- [ ] TTL-based invalidation working
- [ ] clearCache method available
- [ ] Unit tests written and passing with mocked repositories
- [ ] Under 300 LOC
- [ ] No TypeScript errors
- [ ] No lint errors
