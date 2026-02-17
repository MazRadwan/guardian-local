# Story 37.4.1: Create ComplianceFramework Repository (Interface + Drizzle)

## Description

Create the repository interface and Drizzle ORM implementation for `compliance_frameworks` and `framework_versions` tables. Combined into one repository because frameworks and versions are always queried together (a version belongs to a framework).

Follows the pattern from `IDimensionScoreRepository` + `DrizzleDimensionScoreRepository`.

## Acceptance Criteria

- [ ] `IComplianceFrameworkRepository.ts` created in `application/interfaces/`
- [ ] `DrizzleComplianceFrameworkRepository.ts` created in `infrastructure/database/repositories/`
- [ ] Interface has methods: `findAll()`, `findByName()`, `create()`, `createVersion()`, `findVersionsByFrameworkId()`, `findLatestVersion()`
- [ ] Drizzle implementation uses `db` from `../client.js` (same pattern as existing repos)
- [ ] `toDTO()` and `versionToDTO()` private mappers present
- [ ] Each file under 150 LOC
- [ ] No TypeScript errors

## Technical Approach

### 1. Interface

**File:** `packages/backend/src/application/interfaces/IComplianceFrameworkRepository.ts`

```typescript
import { ComplianceFrameworkDTO, CreateComplianceFrameworkDTO,
         FrameworkVersionDTO, CreateFrameworkVersionDTO } from '../../domain/compliance/dtos.js';

export interface IComplianceFrameworkRepository {
  findAll(): Promise<ComplianceFrameworkDTO[]>;
  findByName(name: string): Promise<ComplianceFrameworkDTO | null>;
  create(data: CreateComplianceFrameworkDTO): Promise<ComplianceFrameworkDTO>;

  // Version operations
  createVersion(data: CreateFrameworkVersionDTO): Promise<FrameworkVersionDTO>;
  findVersionsByFrameworkId(frameworkId: string): Promise<FrameworkVersionDTO[]>;
  findLatestVersion(frameworkId: string): Promise<FrameworkVersionDTO | null>;
}
```

### 2. Drizzle Implementation

**File:** `packages/backend/src/infrastructure/database/repositories/DrizzleComplianceFrameworkRepository.ts`

```typescript
import { eq, desc } from 'drizzle-orm';
import { db } from '../client.js';
import { complianceFrameworks } from '../schema/complianceFrameworks.js';
import { frameworkVersions } from '../schema/frameworkVersions.js';
import type { IComplianceFrameworkRepository } from '../../../application/interfaces/IComplianceFrameworkRepository.js';
import type { ComplianceFrameworkDTO, CreateComplianceFrameworkDTO,
              FrameworkVersionDTO, CreateFrameworkVersionDTO } from '../../../domain/compliance/dtos.js';
import type { FrameworkStatus } from '../../../domain/compliance/types.js';

export class DrizzleComplianceFrameworkRepository implements IComplianceFrameworkRepository {
  async findAll(): Promise<ComplianceFrameworkDTO[]> {
    const rows = await db.select().from(complianceFrameworks);
    return rows.map(this.toDTO);
  }

  async findByName(name: string): Promise<ComplianceFrameworkDTO | null> {
    const [row] = await db.select().from(complianceFrameworks)
      .where(eq(complianceFrameworks.name, name)).limit(1);
    return row ? this.toDTO(row) : null;
  }

  async create(data: CreateComplianceFrameworkDTO): Promise<ComplianceFrameworkDTO> {
    const [row] = await db.insert(complianceFrameworks).values({
      name: data.name,
      description: data.description,
    }).returning();
    return this.toDTO(row);
  }

  async createVersion(data: CreateFrameworkVersionDTO): Promise<FrameworkVersionDTO> {
    const [row] = await db.insert(frameworkVersions).values({
      frameworkId: data.frameworkId,
      versionLabel: data.versionLabel,
      status: data.status ?? 'active',
      publishedAt: data.publishedAt,
    }).returning();
    return this.versionToDTO(row);
  }

  async findVersionsByFrameworkId(frameworkId: string): Promise<FrameworkVersionDTO[]> {
    const rows = await db.select().from(frameworkVersions)
      .where(eq(frameworkVersions.frameworkId, frameworkId))
      .orderBy(desc(frameworkVersions.createdAt));
    return rows.map(this.versionToDTO);
  }

  async findLatestVersion(frameworkId: string): Promise<FrameworkVersionDTO | null> {
    const [row] = await db.select().from(frameworkVersions)
      .where(eq(frameworkVersions.frameworkId, frameworkId))
      .orderBy(desc(frameworkVersions.createdAt)).limit(1);
    return row ? this.versionToDTO(row) : null;
  }

  private toDTO(row: typeof complianceFrameworks.$inferSelect): ComplianceFrameworkDTO {
    return { id: row.id, name: row.name, description: row.description ?? undefined, createdAt: row.createdAt };
  }

  private versionToDTO(row: typeof frameworkVersions.$inferSelect): FrameworkVersionDTO {
    return {
      id: row.id, frameworkId: row.frameworkId, versionLabel: row.versionLabel,
      status: row.status as FrameworkStatus, publishedAt: row.publishedAt ?? undefined,
      createdAt: row.createdAt,
    };
  }
}
```

## Files Touched

- `packages/backend/src/application/interfaces/IComplianceFrameworkRepository.ts` - CREATE (~15 LOC)
- `packages/backend/src/infrastructure/database/repositories/DrizzleComplianceFrameworkRepository.ts` - CREATE (~80 LOC)

## Tests Affected

- None (pure creation)

## Agent Assignment

- [x] backend-agent

## Tests Required

- None for this story (integration tests in 37.4.5)

## Definition of Done

- [ ] Interface and implementation created
- [ ] Follows existing Drizzle repository patterns
- [ ] No TypeScript errors
- [ ] Under 150 LOC each
