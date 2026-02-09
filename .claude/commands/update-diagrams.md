---
description: Validate and update C4 architecture diagrams based on codebase changes
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

# Update Architecture Diagrams

Validate architecture diagrams against the codebase and update them when drift is detected.
Handles additions, deletions, renames, layer moves, and stale edges.

## Files

- **Diagram:** `docs/design/architecture/architecture-latest.mmd`
- **Index:** `docs/design/architecture/diagram-index.yaml`
- **Mapping:** `docs/design/architecture/architecture-latest.mapping.yaml`

---

## Phase 1: Detect Changes

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

3. Also detect deleted and renamed files:

```bash
# Deleted files (were in mapping but no longer exist)
git log <last_commit>..HEAD --diff-filter=D --name-only -- \
  'apps/web/src/**/*.ts' 'apps/web/src/**/*.tsx' 'packages/backend/src/**/*.ts'

# Renamed files
git log <last_commit>..HEAD --diff-filter=R --summary -- \
  'apps/web/src/**/*.ts' 'apps/web/src/**/*.tsx' 'packages/backend/src/**/*.ts'
```

4. If no relevant commits, still run full validation (Phase 2) to catch accumulated drift.

---

## Phase 2: Node Validation (Structural)

For EVERY node in the `nodes:` section of `architecture-latest.mapping.yaml`:

### Step 1: File existence check
Verify each mapped path exists on disk. Classify each node:

| Status | Meaning | Action |
|--------|---------|--------|
| `EXISTS` | File found at mapped path | No action |
| `MISSING` | File not found, no rename detected | **Queue for removal** (Phase 3) |
| `RENAMED` | File moved/renamed (git detected) | **Queue for update** (Phase 3) |
| `MOVED` | File exists at different layer path | **Queue for subgraph move** (Phase 3) |

### Step 2: Detect renames and moves
For each `MISSING` node, check if the file was renamed or moved:

```bash
# Check git for rename tracking
git log <last_commit>..HEAD --follow --diff-filter=R --summary -- "<old_path>"
```

If not found via git, search for the exported class/function name:

```bash
# Search for the export in the codebase
grep -r "export.*class <ClassName>" packages/backend/src/ apps/web/src/
```

If found at a new path → mark as `RENAMED` or `MOVED` (if different subgraph).

Output as table:
```markdown
| Node | Status | Old Path | New Path |
|------|--------|----------|----------|
| ChatInterface | EXISTS | - | apps/web/src/components/chat/ChatInterface.tsx |
| MessageHandler | MISSING | .../handlers/MessageHandler.ts | (deleted) |
| ConsultToolLoopService | MOVED | .../application/services/ | .../websocket/services/ |
```

---

## Phase 3: Handle Deletions, Renames, and Moves

### 3a: Remove deleted nodes

For each `MISSING` node confirmed as deleted (not renamed/moved):

1. **Remove from diagram** (`architecture-latest.mmd`):
   - Delete the node line
   - Delete ALL edges referencing the node (both `NodeA --> DeletedNode` and `DeletedNode --> NodeB`)
   - If the node was inside a `subgraph`, verify the subgraph still has other nodes

2. **Remove from mapping** (`architecture-latest.mapping.yaml`):
   - Delete from `nodes:` section entirely
   - Do NOT move to `not_in_diagram` (it no longer exists)

3. **Check for orphaned subgraphs:**
   - If removing a node leaves a subgraph empty (e.g., `ModeStrategies`), remove the subgraph block too

### 3b: Update renamed nodes

For each `RENAMED` node (same layer, file renamed):

1. **Update mapping** path to new file location
2. **Update mapping** exports if class name changed
3. **Update diagram** node label if the name changed significantly
4. **Update diagram** edges — node ID stays the same if it's just a file rename

### 3c: Handle layer moves

For each `MOVED` node (file changed directories, different subgraph):

1. **Move node** in diagram from old subgraph to correct new subgraph
2. **Update mapping** path to new location
3. **Review edges** — imports may have changed with the move
4. **Update subgraph** in mapping if it was explicitly tracked

---

## Phase 4: Edge Validation

**This is critical for catching stale relationships after refactoring.**

### Step 1: Validate existing edges

For each edge `A --> B` in the diagram:

1. Read the source file for node `A`
2. Check if it actually imports/uses node `B`:
   - grep for the class/function name of B in A's file
   - grep for the file path of B in A's import statements
3. Classify:

| Status | Meaning | Action |
|--------|---------|--------|
| `VALID` | A imports/uses B | Keep edge |
| `STALE` | A does NOT import/use B | **Remove edge** |
| `INDIRECT` | A uses B through an intermediary | Keep but add note |

### Step 2: Discover missing edges

For each node in the diagram, read its source file and check imports:

```bash
# Extract imports from a TypeScript file
grep "^import" <file_path>
```

For each import that resolves to another diagram node, check if an edge exists.
If not → **add the edge**.

### Step 3: Apply edge changes

- Remove stale edges from diagram
- Add new edges with appropriate comments (e.g., `%% Epic 36: Orchestrator delegates to streaming`)
- Log all edge changes in the report

---

## Phase 5: Completeness Check (New Items)

Find files that exist in code but are NOT in `nodes:` or `not_in_diagram:`.

### Scan directories:

```bash
# Backend services (application layer)
packages/backend/src/application/services/*.ts

# Backend websocket services (infrastructure layer)
packages/backend/src/infrastructure/websocket/services/*.ts

# Backend handlers
packages/backend/src/infrastructure/websocket/handlers/*.ts

# Backend context builders
packages/backend/src/infrastructure/websocket/context/*.ts

# Frontend hooks
apps/web/src/hooks/*.ts

# Frontend components
apps/web/src/components/chat/*.tsx

# Frontend stores
apps/web/src/stores/*.ts
```

Compare against both `nodes` and `not_in_diagram` sections. Any file not in either → needs classification.

### Significance classification

**Do NOT rely solely on filename patterns.** Instead, use a two-step approach:

#### Step 1: Import analysis (primary signal)

Read the file and check:
- **How many other diagram nodes import it?** (grep for its export name across mapped files)
- **How many diagram nodes does it import?** (read its import statements)
- **Is it in a delegation chain?** (called by a controller/orchestrator that IS in the diagram)

**Significant if:**
- Imported by 2+ diagram nodes, OR
- Part of a request-handling chain (controller → service → repository), OR
- Replaces a node that was previously in the diagram (refactoring), OR
- Handles a distinct architectural concern (streaming, validation, tool execution, etc.)

**Minor if:**
- Imported by only 1 file AND is a helper/utility, OR
- Is a type definition file, OR
- Is a child component with no independent data flow

#### Step 2: Pattern-based fallback (secondary signal)

Only use patterns to break ties when import analysis is inconclusive:

| Likely Significant | Likely Minor |
|--------------------|-------------|
| `*Service.ts`, `*Handler.ts`, `*Builder.ts` | `*Helper.ts`, `*Utils.ts` |
| `*Orchestrator.ts`, `*Registry.ts` | `*Chip.tsx`, `*Badge.tsx`, `*Icon.tsx` |
| `use*Controller.ts`, `use*Adapter.ts` | `*Modal.tsx`, `*Dialog.tsx` |
| Any file >100 LOC with exports | `*Item.tsx`, `*ListItem.tsx` |

---

## Phase 6: Add New Items

### For significant items:

1. **Add to diagram** (`architecture-latest.mmd`):
   - Place in correct subgraph (see mapping below)
   - Use descriptive label matching existing style
   - Add edges based on actual imports (Phase 4 Step 2 logic)

2. **Add to mapping** (`architecture-latest.mapping.yaml`):
   - Add to `nodes:` section with paths, exports, validation_strategy, status
   - Include `note:` with brief description and epic reference

3. **Subgraph mapping:**

   | Path Pattern | Subgraph |
   |-------------|----------|
   | `apps/web/src/components/**` | Presentation |
   | `apps/web/src/hooks/**` | HooksState |
   | `apps/web/src/stores/**` | HooksState |
   | `apps/web/src/services/**` | HooksState |
   | `packages/backend/src/infrastructure/websocket/ChatServer.ts` | Backend (top level) |
   | `packages/backend/src/infrastructure/websocket/handlers/**` | Backend → Handlers |
   | `packages/backend/src/infrastructure/websocket/services/**` | Backend → Services (create if needed) |
   | `packages/backend/src/infrastructure/websocket/context/**` | Backend → ContextBuilders |
   | `packages/backend/src/infrastructure/websocket/*.ts` | Backend (top level) |
   | `packages/backend/src/infrastructure/http/**` | Backend |
   | `packages/backend/src/application/services/**` | Services |
   | `packages/backend/src/domain/**` | Domain |
   | `packages/backend/src/infrastructure/ai/**` | AI |
   | `packages/backend/src/infrastructure/database/**` | Data |
   | `packages/backend/src/infrastructure/extraction/**` | Backend → Extraction |

4. **Edge inference (import-based, not pattern-based):**
   - Read the new file's imports
   - For each import that resolves to a diagram node → add edge
   - Read files that import the new node → add reverse edges
   - Verify edges with actual `grep` — never guess

### For minor items:

1. Add to `not_in_diagram` section in mapping file under the correct category
2. Do NOT add to diagram

---

## Phase 7: Subgraph Maintenance

After all node additions/removals, verify subgraph health:

1. **Remove empty subgraphs** — If all nodes in a subgraph were deleted, remove the subgraph block
2. **Create new subgraphs** — If 3+ related nodes are added in a new area, consider grouping them
3. **Rename subgraphs** — If the subgraph name no longer reflects its contents (e.g., "Mode Strategies" after all strategies deleted)
4. **Update description** in `diagram-index.yaml` if subgraph structure changed significantly

---

## Phase 8: Update Tracking

1. Update `diagram-index.yaml`:
   - Set `last_processed_commit` to current HEAD (`git rev-parse --short HEAD`)
   - Set `last_updated` to today's date
   - Update `description` field if architecture changed significantly

2. Update mapping file header with update note:
   ```yaml
   # UPDATED: <date> - <brief description of changes>
   ```

3. Update `subgraphs:` section if new path patterns were used

---

## Output Format

```markdown
## Diagram Validation Report

**Last validated:** abc123
**Current commit:** def456
**Commits analyzed:** 12

### Phase 2: Node Validation
| Node | Status | Details |
|------|--------|---------|
| ChatInterface | EXISTS | - |
| MessageHandler | MISSING | Deleted in Epic 36 |
| ConsultToolLoopService | MOVED | application → infrastructure/websocket |

### Phase 3: Deletions & Renames
**Removed from diagram:**
- MessageHandler (node + 8 edges)
- ModeStrategies subgraph (empty after removal)

**Updated paths:**
- ConsultToolLoopService → new path in infrastructure/websocket/services/

### Phase 4: Edge Validation
**Stale edges removed:** 5
- MessageHandler --> ConversationContextBuilder (MessageHandler deleted)
- ChatServer --> MessageHandler (replaced by Orchestrator)

**New edges added:** 3
- ChatServer --> SendMessageOrchestrator
- SendMessageOrchestrator --> ClaudeStreamingService

### Phase 5: New Items Detected
**Significant (added to diagram):**
- SendMessageOrchestrator (Backend → Services)
- ClaudeStreamingService (Backend → Services)

**Minor (tracked only):**
- SendMessage.ts (types file)

### Phase 7: Subgraph Changes
- Removed: ModeStrategies (empty)
- Created: WebSocketServices (3 nodes)

### Files Updated
- architecture-latest.mmd (removed X nodes, added Y nodes, removed Z edges, added W edges)
- architecture-latest.mapping.yaml (updated)
- diagram-index.yaml (updated commit hash)
```

---

## Important Rules

1. **Never guess edges** — Always verify with actual import analysis (grep/read)
2. **Remove stale nodes promptly** — A deleted file must be removed from the diagram, not left as MISSING
3. **Preserve diagram readability** — Keep labels concise, use consistent style
4. **For >15 changes**, present the report and ask for user approval before applying
5. **Verify after changes** — After editing the .mmd file, re-read it to confirm valid Mermaid syntax
6. **Document the "why"** — Edge comments should reference epic/story (e.g., `%% Epic 36`)
7. **Subgraphs reflect architecture** — Create/remove subgraphs to match actual code organization
8. **Clean up `not_in_diagram` too** — Remove entries for files that no longer exist
