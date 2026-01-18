---
description: Validate and update architecture diagrams based on codebase changes
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

# Update Architecture Diagrams

You are running the **diagram validation and update workflow**.

This command checks for codebase changes since the last diagram validation and updates the architecture diagrams if drift is detected.

## Files You'll Work With

- **Diagram:** `docs/design/architecture/architecture-latest.mmd`
- **Index:** `docs/design/architecture/diagram-index.yaml`
- **Mapping:** `docs/design/architecture/architecture-latest.mapping.yaml`

## Workflow

### Phase 1: Check for Changes

1. Read `diagram-index.yaml` to get `last_processed_commit`
2. Run git log to find commits since then, filtering to architecture-relevant paths:

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

3. If no relevant commits, report "Diagrams are up to date" and exit.

### Phase 2: Three-Layer Validation

#### Layer 1: Structural Check (Fast)

For each node in `architecture-latest.mapping.yaml`:
1. Check if the mapped file(s) exist
2. Record status: EXISTS | MISSING | RENAMED?

Report results in a table.

#### Layer 2: Completeness Check

Look for new significant files not in the diagram:
- New services in `packages/backend/src/application/services/`
- New hooks in `apps/web/src/hooks/`
- New components in `apps/web/src/components/chat/`

Flag items with 3+ dependents as candidates for diagram addition.

#### Layer 3: Recommendations

Based on findings:
- **No drift:** Update index commit hash, report success
- **Minor drift (<5 items):** Suggest specific updates
- **Major drift (5+ items):** Recommend manual review

### Phase 3: Update Files

If changes are needed:
1. Update `diagram-index.yaml` with current commit hash and date
2. Update `architecture-latest.mapping.yaml` with any new nodes
3. Optionally update `architecture-latest.mmd` for minor changes

## Output Format

```markdown
## Diagram Validation Report

**Last validated:** <previous_commit_short>
**Current commit:** <current_commit_short>
**Commits analyzed:** <count>

### Layer 1: Structural Check
| Node | Status |
|------|--------|
| ... | ✅/❌ |

### Layer 2: New Items Detected
- Services: <list>
- Hooks: <list>
- Components: <list>

### Recommendations
<action items or "No updates needed">

### Files Updated
- diagram-index.yaml (commit hash updated)
```

## Important Rules

- Always preserve the diagram's conceptual groupings (subgraphs)
- Don't remove nodes without verification — could be abstraction, not deletion
- For major drift (>15 changes), recommend manual review instead of auto-updating
- Update the commit hash in `diagram-index.yaml` after every validation run
