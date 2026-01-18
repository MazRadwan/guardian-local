---
name: update-diagrams
description: Validate and update C4 architecture diagrams based on codebase changes
---

# Update Architecture Diagrams

Validates architecture diagrams against the codebase and updates them if drift is detected.

## Files

| File | Purpose |
|------|---------|
| `docs/design/architecture/architecture-latest.mmd` | Main Mermaid diagram |
| `docs/design/architecture/diagram-index.yaml` | Tracks last validated commit |
| `docs/design/architecture/architecture-latest.mapping.yaml` | Maps diagram nodes to code paths |

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

3. If no relevant commits, report "Diagrams up to date" and exit.

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

Compare against `not_in_diagram` section of mapping file.

#### Layer 3: Recommendations

| Drift Level | Action |
|-------------|--------|
| None | Update commit hash, report success |
| Minor (<5 items) | Suggest specific updates |
| Major (5+ items) | Recommend manual review |

### Phase 3: Update Files

1. Update `diagram-index.yaml`:
   - Set `last_processed_commit` to current HEAD
   - Set `last_updated` to today's date

2. If new nodes found, add to `architecture-latest.mapping.yaml` under `not_in_diagram`

3. For minor drift, optionally update `architecture-latest.mmd`

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
| useChatController | EXISTS |

### Layer 2: New Items Detected
- Services: ScoringService (new)
- Hooks: useFileUpload (new)

### Recommendations
- Add ScoringService to diagram Services subgraph
- Consider adding useFileUpload to HooksState subgraph

### Files Updated
- diagram-index.yaml
```

## Important Rules

- Preserve diagram's conceptual groupings (subgraphs)
- Don't remove nodes without verification
- For >15 changes, recommend manual review
- Always update commit hash after validation
