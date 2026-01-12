# Story 18.4.4: Vendor Validation Service

**Sprint:** 4
**Track:** A (Clarification support)
**Phase:** 1 (independent, runs in parallel with 18.4.3 and 18.4.5)
**Agent:** backend-agent
**Estimated Lines:** ~250
**Dependencies:** None (uses existing file repository)

---

## Overview

### What This Story Does

Creates a validation service that detects when uploaded files belong to
multiple different vendors. This supports the single-vendor scoring
enforcement added in 18.4.2a.

### User-Visible Change

None directly—this is a supporting service. The visible change is in 18.4.2a
where the `multiple_vendors` clarification prompt is shown.

---

## Design Decisions (From Review)

### Single-Vendor Scoring

Multi-vendor parallel scoring was rejected to reduce complexity. Instead:
- Detect when files have different `detectedVendorName` values
- Return vendor info for the clarification UI to display
- Let user choose which vendor to score

### Unknown Vendors

Files with `null` or `undefined` `detectedVendorName` are treated as
**compatible** with each other. Only different *explicit* vendor names
trigger the `multiple_vendors` clarification.

**Example scenarios:**

| Files | Vendor Names | Result |
|-------|--------------|--------|
| A, B | "Acme", "Acme" | Valid (single vendor) |
| A, B | null, null | Valid (all unknown = compatible) |
| A, B | "Acme", null | Valid (one explicit + unknown = OK) |
| A, B | "Acme", "CloudSec" | Invalid (multiple vendors) |

---

## Codebase Context

### Files to Create/Modify

1. `packages/backend/src/application/services/VendorValidationService.ts` (NEW)
2. `packages/backend/src/application/interfaces/IFileRepository.ts` (add findByIds)
3. `packages/backend/src/infrastructure/database/repositories/DrizzleFileRepository.ts` (implement findByIds)

### Existing File Schema

```typescript
// packages/backend/src/infrastructure/database/schema/files.ts
export const files = pgTable('files', {
  id: uuid('id').primaryKey().defaultRandom(),
  filename: varchar('filename', { length: 255 }).notNull(),
  // ... other fields ...
  detectedDocType: varchar('detected_doc_type', { length: 50 }),
  detectedVendorName: varchar('detected_vendor_name', { length: 255 }),
});
```

### Existing Repository Interface

```typescript
// packages/backend/src/application/interfaces/IFileRepository.ts
export interface IFileRepository {
  findById(id: string): Promise<FileRecord | null>;
  create(data: CreateFileData): Promise<FileRecord>;
  // ... other methods ...
}
```

---

## Implementation Steps

### Step 1: Add VendorInfo Type

**File:** `packages/backend/src/domain/events/clarification.ts` (if not already added in 18.4.2a)

```typescript
export interface VendorInfo {
  name: string;
  fileCount: number;
  fileIds: string[];
}
```

### Step 2: Add findByIds to Repository Interface

**File:** `packages/backend/src/application/interfaces/IFileRepository.ts`

```typescript
export interface IFileRepository {
  findById(id: string): Promise<FileRecord | null>;
  findByIds(ids: string[]): Promise<FileRecord[]>;  // NEW
  create(data: CreateFileData): Promise<FileRecord>;
  // ... other methods ...
}
```

### Step 3: Implement findByIds in Repository

**File:** `packages/backend/src/infrastructure/database/repositories/DrizzleFileRepository.ts`

```typescript
import { inArray } from 'drizzle-orm';

async findByIds(ids: string[]): Promise<FileRecord[]> {
  if (ids.length === 0) return [];

  const results = await this.db
    .select()
    .from(files)
    .where(inArray(files.id, ids));

  return results.map(this.mapToFileRecord);
}
```

### Step 4: Create VendorValidationService

**File:** `packages/backend/src/application/services/VendorValidationService.ts` (NEW)

**NOTE:** No DI decorators needed - this codebase uses manual construction.

```typescript
import type { IFileRepository, FileRecord } from '../interfaces/IFileRepository.js';
import type { VendorInfo } from '../../domain/events/clarification.js';

export interface VendorValidationResult {
  valid: boolean;
  vendorName?: string;       // If single vendor, the name
  vendors?: VendorInfo[];    // If multiple vendors, the list
}

export class VendorValidationService {
  constructor(
    private readonly fileRepository: IFileRepository
  ) {}

  /**
   * Validates that all files belong to a single vendor.
   *
   * Rules:
   * - All files with same explicit vendorName = valid (single vendor)
   * - All files with null/undefined vendorName = valid (all unknown)
   * - Mix of explicit + null = valid (treat null as belonging to explicit)
   * - Different explicit vendorNames = invalid (multiple vendors)
   *
   * @param fileIds - Array of file IDs to validate
   * @returns Validation result with vendor info
   */
  async validateSingleVendor(fileIds: string[]): Promise<VendorValidationResult> {
    if (fileIds.length === 0) {
      return { valid: true };
    }

    const files = await this.fileRepository.findByIds(fileIds);

    if (files.length === 0) {
      return { valid: true };
    }

    // Group files by vendor name
    const vendorGroups = this.groupByVendor(files);

    // Filter to only explicit vendor names (non-null)
    const explicitVendors = Array.from(vendorGroups.entries())
      .filter(([name]) => name !== null && name !== undefined && name !== '');

    // Case 1: No explicit vendors (all unknown) - valid
    if (explicitVendors.length === 0) {
      return { valid: true };
    }

    // Case 2: Single explicit vendor - valid
    if (explicitVendors.length === 1) {
      const [vendorName] = explicitVendors[0];
      return { valid: true, vendorName };
    }

    // Case 3: Multiple explicit vendors - invalid
    const vendors: VendorInfo[] = explicitVendors.map(([name, fileList]) => ({
      name: name!,
      fileCount: fileList.length,
      fileIds: fileList.map(f => f.id),
    }));

    // Sort by file count descending (most files first)
    vendors.sort((a, b) => b.fileCount - a.fileCount);

    return { valid: false, vendors };
  }

  /**
   * Groups files by their detected vendor name.
   * FileRecord type is imported from IFileRepository interface.
   */
  private groupByVendor(files: FileRecord[]): Map<string | null, FileRecord[]> {
    const groups = new Map<string | null, FileRecord[]>();

    for (const file of files) {
      const vendorName = file.detectedVendorName || null;
      const existing = groups.get(vendorName) || [];
      existing.push(file);
      groups.set(vendorName, existing);
    }

    return groups;
  }
}
```

### Step 5: Construct Service in index.ts (Manual DI)

**IMPORTANT:** This codebase does NOT use a DI container (no tsyringe). Services are
manually constructed in `index.ts` and passed to constructors.

**File:** `packages/backend/src/index.ts`

Find the section where services are constructed (around lines 40-60):

```typescript
import { VendorValidationService } from './application/services/VendorValidationService.js';

// ... existing service constructions ...

// Add after fileRepo is created (around line 91):
const vendorValidationService = new VendorValidationService(fileRepo);
```

Then pass to ChatServer constructor:

```typescript
const chatServer = new ChatServer(
  server.getIO(),
  conversationService,
  claudeClient,
  rateLimiter,
  // ... existing args ...
  vendorValidationService,  // NEW
);
```

### Step 6: Accept Service in ChatServer Constructor

**File:** `packages/backend/src/infrastructure/websocket/ChatServer.ts`

Add to constructor parameters:

```typescript
import { VendorValidationService } from '../../application/services/VendorValidationService.js';

export class ChatServer {
  // Add private field
  private vendorValidationService: VendorValidationService;

  constructor(
    io: SocketIOServer,
    conversationService: ConversationService,
    claudeClient: IClaudeClient,
    rateLimiter: RateLimiter,
    jwtSecret: string,
    promptCacheManager: PromptCacheManager,
    // ... existing parameters ...
    vendorValidationService: VendorValidationService,  // NEW - add at end
  ) {
    // ... existing assignments ...
    this.vendorValidationService = vendorValidationService;
  }
}
```

**NOTE:** The ChatServer constructor has 13+ parameters already. Adding one more
follows the existing pattern. See `index.ts` for the full parameter list.

---

## Tests to Write

**File:** `packages/backend/__tests__/unit/application/services/VendorValidationService.test.ts`

```typescript
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { VendorValidationService } from '../../../../src/application/services/VendorValidationService.js';

describe('VendorValidationService', () => {
  let service: VendorValidationService;
  let mockFileRepository: jest.Mocked<IFileRepository>;

  beforeEach(() => {
    mockFileRepository = {
      findByIds: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
    };
    service = new VendorValidationService(mockFileRepository);
  });

  describe('validateSingleVendor', () => {
    it('should return valid for empty file list', async () => {
      const result = await service.validateSingleVendor([]);
      expect(result.valid).toBe(true);
    });

    it('should return valid for single vendor', async () => {
      mockFileRepository.findByIds.mockResolvedValue([
        { id: '1', detectedVendorName: 'Acme Corp' },
        { id: '2', detectedVendorName: 'Acme Corp' },
      ]);

      const result = await service.validateSingleVendor(['1', '2']);

      expect(result.valid).toBe(true);
      expect(result.vendorName).toBe('Acme Corp');
    });

    it('should return valid for all unknown vendors', async () => {
      mockFileRepository.findByIds.mockResolvedValue([
        { id: '1', detectedVendorName: null },
        { id: '2', detectedVendorName: null },
      ]);

      const result = await service.validateSingleVendor(['1', '2']);

      expect(result.valid).toBe(true);
    });

    it('should return valid for explicit vendor + unknown', async () => {
      mockFileRepository.findByIds.mockResolvedValue([
        { id: '1', detectedVendorName: 'Acme Corp' },
        { id: '2', detectedVendorName: null },
      ]);

      const result = await service.validateSingleVendor(['1', '2']);

      expect(result.valid).toBe(true);
      expect(result.vendorName).toBe('Acme Corp');
    });

    it('should return invalid for multiple vendors', async () => {
      mockFileRepository.findByIds.mockResolvedValue([
        { id: '1', detectedVendorName: 'Acme Corp' },
        { id: '2', detectedVendorName: 'Acme Corp' },
        { id: '3', detectedVendorName: 'CloudSec Inc' },
      ]);

      const result = await service.validateSingleVendor(['1', '2', '3']);

      expect(result.valid).toBe(false);
      expect(result.vendors).toHaveLength(2);
      expect(result.vendors![0].name).toBe('Acme Corp');
      expect(result.vendors![0].fileCount).toBe(2);
      expect(result.vendors![1].name).toBe('CloudSec Inc');
      expect(result.vendors![1].fileCount).toBe(1);
    });

    it('should sort vendors by file count descending', async () => {
      mockFileRepository.findByIds.mockResolvedValue([
        { id: '1', detectedVendorName: 'CloudSec Inc' },
        { id: '2', detectedVendorName: 'Acme Corp' },
        { id: '3', detectedVendorName: 'Acme Corp' },
        { id: '4', detectedVendorName: 'Acme Corp' },
      ]);

      const result = await service.validateSingleVendor(['1', '2', '3', '4']);

      expect(result.valid).toBe(false);
      expect(result.vendors![0].name).toBe('Acme Corp'); // 3 files
      expect(result.vendors![1].name).toBe('CloudSec Inc'); // 1 file
    });

    it('should treat empty string vendor as unknown', async () => {
      mockFileRepository.findByIds.mockResolvedValue([
        { id: '1', detectedVendorName: '' },
        { id: '2', detectedVendorName: null },
      ]);

      const result = await service.validateSingleVendor(['1', '2']);

      expect(result.valid).toBe(true);
    });

    it('should include correct fileIds in vendor info', async () => {
      mockFileRepository.findByIds.mockResolvedValue([
        { id: 'file-1', detectedVendorName: 'Acme Corp' },
        { id: 'file-2', detectedVendorName: 'CloudSec Inc' },
      ]);

      const result = await service.validateSingleVendor(['file-1', 'file-2']);

      expect(result.valid).toBe(false);
      const acme = result.vendors!.find(v => v.name === 'Acme Corp');
      const cloudsec = result.vendors!.find(v => v.name === 'CloudSec Inc');
      expect(acme!.fileIds).toEqual(['file-1']);
      expect(cloudsec!.fileIds).toEqual(['file-2']);
    });
  });
});
```

**File:** `packages/backend/__tests__/integration/repositories/DrizzleFileRepository.findByIds.test.ts`

```typescript
describe('DrizzleFileRepository.findByIds', () => {
  it('should return empty array for empty input', async () => {
    const result = await repository.findByIds([]);
    expect(result).toEqual([]);
  });

  it('should return files matching IDs', async () => {
    // Create test files
    const file1 = await repository.create({ filename: 'test1.pdf', ... });
    const file2 = await repository.create({ filename: 'test2.pdf', ... });

    const result = await repository.findByIds([file1.id, file2.id]);

    expect(result).toHaveLength(2);
    expect(result.map(f => f.id)).toContain(file1.id);
    expect(result.map(f => f.id)).toContain(file2.id);
  });

  it('should skip non-existent IDs', async () => {
    const file1 = await repository.create({ filename: 'test1.pdf', ... });

    const result = await repository.findByIds([file1.id, 'non-existent-id']);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(file1.id);
  });
});
```

---

## Acceptance Criteria

- [ ] VendorValidationService created (no DI decorators)
- [ ] validateSingleVendor method implemented
- [ ] Returns valid=true for single vendor
- [ ] Returns valid=true for all unknown vendors
- [ ] Returns valid=true for explicit vendor + unknown mix
- [ ] Returns valid=false with vendors array for multiple vendors
- [ ] Vendors sorted by file count descending
- [ ] findByIds added to IFileRepository interface
- [ ] findByIds implemented in DrizzleFileRepository
- [ ] Service constructed manually in index.ts
- [ ] Service passed to ChatServer constructor
- [ ] Unit tests pass
- [ ] Integration tests pass

---

## Verification

```bash
# Run unit tests
pnpm --filter @guardian/backend test:unit -- --grep "VendorValidationService"

# Run integration tests
pnpm --filter @guardian/backend test:integration -- --grep "findByIds"
```

**Manual Testing:**

Not directly testable in isolation—verified through 18.4.2a integration.

---

## Dependencies

### Uses

- `IFileRepository.findByIds` - Batch file lookup
- `FileRecord.detectedVendorName` - Vendor detection result

### Provides to 18.4.2a

```typescript
// Method signature
validateSingleVendor(fileIds: string[]): Promise<VendorValidationResult>

// Result interface
interface VendorValidationResult {
  valid: boolean;
  vendorName?: string;
  vendors?: VendorInfo[];
}
```
