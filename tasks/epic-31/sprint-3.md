# Sprint 3: Optional Enhancements

**Goal:** Add bounded queue and metrics for extraction

**Status:** Planning (optional, based on Sprint 1 results)

## Overview

If Sprint 1 doesn't fully resolve performance issues, add:
- Bounded concurrency queue for extraction (prevent resource exhaustion)
- Queue depth metrics for monitoring

## Dependencies

- Requires Sprint 1 complete
- May not be needed if Sprint 1 fully resolves issue

## Stories

### 31.3.1: Add Configurable Concurrency Queue for BackgroundExtractor

**Description:** Limit concurrent extractions to prevent memory pressure when many files uploaded simultaneously. Use a simple in-memory queue with configurable concurrency limit.

**Acceptance Criteria:**
- [ ] Configurable MAX_CONCURRENT_EXTRACTIONS (default: 3)
- [ ] Queue extractions when limit reached
- [ ] Process queued extractions when slots available
- [ ] Log queue depth and wait times

**Technical Approach:**
```typescript
class BackgroundExtractor {
  private readonly queue: ExtractionJob[] = [];
  private activeCount = 0;
  private readonly maxConcurrent: number;

  constructor(
    textExtractionService: ITextExtractionService,
    fileRepository: IFileRepository,
    maxConcurrent = 3
  ) {
    this.maxConcurrent = maxConcurrent;
  }

  queueExtraction(...): void {
    if (this.activeCount < this.maxConcurrent) {
      this.activeCount++;
      this.extractAndUpdate(...).finally(() => {
        this.activeCount--;
        this.processQueue();
      });
    } else {
      this.queue.push({ fileId, buffer, documentType });
      console.log(`[BackgroundExtractor] Queued extraction, depth: ${this.queue.length}`);
    }
  }

  private processQueue(): void {
    if (this.queue.length > 0 && this.activeCount < this.maxConcurrent) {
      const job = this.queue.shift()!;
      this.activeCount++;
      this.extractAndUpdate(job.fileId, job.buffer, job.documentType).finally(() => {
        this.activeCount--;
        this.processQueue();
      });
    }
  }
}
```

**Files Touched:**
- `packages/backend/src/infrastructure/extraction/BackgroundExtractor.ts`

**Agent:** backend-agent

---

### 31.3.2: Add Extraction Metrics and Logging

**Description:** Add metrics for monitoring extraction performance: queue depth, extraction duration, success/failure rate.

**Acceptance Criteria:**
- [ ] Log queue depth on enqueue/dequeue
- [ ] Log extraction duration on completion
- [ ] Track success/failure counts (in-memory, reset on restart)
- [ ] Expose metrics via `/health` or dedicated endpoint (optional)

**Files Touched:**
- `packages/backend/src/infrastructure/extraction/BackgroundExtractor.ts`
- `packages/backend/src/infrastructure/http/routes/health.ts` (optional)

**Agent:** backend-agent

## Definition of Done

- [ ] All stories complete (if needed)
- [ ] Unit tests pass
- [ ] No memory pressure under load
- [ ] Metrics visible for monitoring
