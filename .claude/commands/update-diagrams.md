---
description: Validate and update C4 architecture diagrams based on codebase changes
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

# Update Architecture Diagrams

Validate architecture diagrams against the codebase and update them if drift is detected.

## Files

- **Diagram:** `docs/design/architecture/architecture-latest.mmd`
- **Index:** `docs/design/architecture/diagram-index.yaml`
- **Mapping:** `docs/design/architecture/architecture-latest.mapping.yaml`

## Workflow

### Phase 1: Check for Changes

1. Read `diagram-index.yaml` to get `last_processed_commit`
2. Find architecture-relevant commits since then:

```bash
git log <last_commit>..HEAD --oneline -- \
  'apps/web/src/**/*.ts' \
  'apps/web/src/**/*.tsx' \
  'packages/backend/src/**/*.ts' \
  ':!**/*.test.ts' \
  ':!**/__tests__/**' \
  ':!tasks/**' \
  ':!.claude/**' \
  ':!docs/**'
```

3. If no relevant commits, still run validation (Phase 2) to catch any missed items.

### Phase 2: Three-Layer Validation

#### Layer 1: Structural Check

For each node in `architecture-latest.mapping.yaml`:
1. Verify the mapped file(s) exist
2. Record: EXISTS | MISSING | RENAMED

Output as table:
```markdown
| Node | Status | Path |
|------|--------|------|
| ChatInterface | EXISTS | apps/web/src/components/chat/ChatInterface.tsx |
```

#### Layer 2: Completeness Check

Find new files that might belong in diagram:
- Services: `packages/backend/src/application/services/*.ts`
- Hooks: `apps/web/src/hooks/*.ts`
- Components: `apps/web/src/components/chat/*.tsx`

Compare against both `nodes` and `not_in_diagram` sections.

#### Layer 3: Significance Classification

Classify each new item as **Significant** or **Minor**:

**SIGNIFICANT (auto-add to diagram):**
| Category | Pattern | Examples |
|----------|---------|----------|
| Services | `*Service.ts` (not Validation/Cleanup/Helper) | ScoringService, ExportService |
| Core Hooks | `use*Controller.ts`, `use*Adapter.ts`, `use*Progress.ts` | useChatController, useScoringProgress |
| Feature Components | `*Dashboard.tsx`, `*Card.tsx` (with data logic), `*Message.tsx` (core) | ScoreDashboard, ScoringResultCard |
| Data Flow | Components that connect to stores or services | Any component using chatStore |

**MINOR (track only in not_in_diagram):**
| Category | Pattern | Examples |
|----------|---------|----------|
| UI Helpers | `Skeleton*.tsx`, `*Badge.tsx`, `*Icon.tsx`, `Rotating*.tsx` | SkeletonMessage, RecommendationBadge |
| Child Components | `*Item.tsx`, `*ListItem.tsx` (children of mapped parents) | ConversationListItem |
| Modals/Dialogs | `*Modal.tsx`, `*Dialog.tsx` (unless core feature) | ConversationSearchModal |
| Utility Services | `*ValidationService.ts`, `*CleanupService.ts`, `*HelperService.ts` | FileValidationService |
| File Utilities | `*Chip.tsx`, `*Upload*.tsx` | FileChip, FileChipInChat |

### Phase 3: Auto-Add Significant Items

For each **significant** new item:

1. **Add to diagram** (`architecture-latest.mmd`):
   - Determine correct subgraph based on file path
   - Add node with descriptive label
   - Add edges based on imports/dependencies

2. **Add to mapping** (`architecture-latest.mapping.yaml`):
   - Add to `nodes` section with proper validation config
   - Set `status: EXISTS`

3. **Subgraph mapping:**
   | Path Pattern | Subgraph |
   |--------------|----------|
   | `apps/web/src/components/**` | Presentation |
   | `apps/web/src/hooks/**` | HooksState |
   | `apps/web/src/stores/**` | HooksState |
   | `apps/web/src/services/**` | HooksState |
   | `packages/backend/src/application/services/**` | Services |
   | `packages/backend/src/domain/**` | Domain |
   | `packages/backend/src/infrastructure/ai/**` | AI |
   | `packages/backend/src/infrastructure/database/**` | Data |

4. **Edge inference:**
   - Components → hooks they import (grep for `use[A-Z]`)
   - Components → chatStore if importing from stores
   - Services → repositories they use
   - Services → ClaudeClient if using AI

### Phase 4: Track Minor Items

For each **minor** new item:
1. Add to `not_in_diagram` section in mapping file
2. Do NOT add to diagram

### Phase 5: Update Tracking

1. Update `diagram-index.yaml`:
   - Set `last_processed_commit` to current HEAD
   - Set `last_updated` to today's date

2. Update mapping file header with update note

## Output Format

```markdown
## Diagram Validation Report

**Last validated:** abc123
**Current commit:** def456
**Commits analyzed:** 12

### Layer 1: Structural Check
| Node | Status |
|------|--------|
| ChatInterface | EXISTS |

### Layer 2: New Items Detected
- Services: (list)
- Hooks: (list)
- Components: (list)

### Layer 3: Significance Classification
**Significant (added to diagram):**
- ScoringService (Services)
- ScoreDashboard (Presentation)

**Minor (tracked only):**
- SkeletonMessage
- FileChip

### Files Updated
- architecture-latest.mmd (added X nodes, Y edges)
- architecture-latest.mapping.yaml (added X to nodes, Y to not_in_diagram)
- diagram-index.yaml (updated commit hash)
```

## Important Rules

- Preserve diagram's conceptual groupings (subgraphs)
- Don't remove nodes without verification
- For >15 significant additions, recommend manual review before auto-adding
- Always update commit hash after validation
- When adding edges, prefer explicit connections over implicit
- Use descriptive labels that match existing diagram style
