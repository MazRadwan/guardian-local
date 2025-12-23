# Guardian App

## Quick Context
Conversational AI assistant for healthcare organizations to assess AI vendors against 10 risk dimensions.

**Full details:** `docs/design/architecture/overview.md`

---

## 🚨 Critical Rules

### Single Source of Truth for Tasks
**IMPORTANT:** Tasks live ONLY in `/tasks/` directory.
- When starting work → Check `tasks/task-overview.md` first (high-level status)
- For detailed MVP specs → See `tasks/mvp-tasks.md` (Epic 1-8, referenced by task-overview.md)
- For Epic 9 UI/UX → See `tasks/epic-9-ui-ux-upgrade.md` (25 granular stories)
- When creating tasks → Add to `tasks/task-overview.md` only
- Never add tasks to: docs, README, code comments, or anywhere else

**Task File Hierarchy:**
1. `task-overview.md` - High-level epic status and "what's next"
2. `mvp-tasks.md` - Detailed story specs for MVP (Epic 1-8)
3. `epic-9-ui-ux-upgrade.md` - Detailed story specs for UI/UX upgrade (Epic 9)

### Architecture Type
**IMPORTANT:** This is a **chat-first application**, NOT a traditional form-based app.
- User interaction is conversational (like ChatGPT)
- Structured workflows embedded in chat (forms/buttons appear inline)
- Mode switching via GUI dropdown, NOT command syntax
- Never suggest traditional multi-step form UIs

### AI vs Code Responsibilities
**IMPORTANT:** Scoring uses the Guardian rubric which requires qualitative interpretation.
- ✅ Claude applies rubric to vendor responses → outputs scores + narrative (matches Claude.ai Projects workflow)
- ✅ TypeScript validates payloads → stores results in database
- ❌ TypeScript does NOT re-interpret or second-guess Claude's scoring

### Test Requirements
**IMPORTANT:** All features MUST have tests. No exceptions.

#### Test Commands (Use the Right One)

| Command | What it runs | Speed | When to use |
|---------|--------------|-------|-------------|
| `pnpm test:unit` | Unit tests only | ~10-20s | During development |
| `pnpm test:integration` | DB/repository tests | ~30-60s | After DB changes |
| `pnpm test` | Unit + integration | ~1-2min | Before commit |
| `pnpm test:e2e` | E2E tests | ~2-5min | Before PR/merge |

**Package-specific commands:**
```bash
# Backend
pnpm --filter @guardian/backend test:unit
pnpm --filter @guardian/backend test:integration
pnpm --filter @guardian/backend test:watch        # Watch mode (recommended during dev)
pnpm --filter @guardian/backend test:watch:unit   # Watch unit tests only

# Frontend
pnpm --filter @guardian/web test:unit
pnpm --filter @guardian/web test:watch
pnpm --filter @guardian/web test:e2e              # Playwright
```

#### When to Run Tests (Tiered Approach)

**During development (use watch mode):**
```bash
# Start watch mode in the package you're working on
pnpm --filter @guardian/backend test:watch:unit
# Jest will re-run only affected tests on file save
```

**Before committing:**
- Run `pnpm test:unit` — Must pass
- If you touched DB/repositories: also run `pnpm test:integration`

**Before PR/merge:**
- Run `pnpm test` — Full unit + integration suite
- E2E tests run in CI (or run locally if touching critical paths)

#### What Tests to Write

| Layer | Test type | When to write | Mock strategy |
|-------|-----------|---------------|---------------|
| **Domain** (entities, value objects) | Unit | TDD (test first) | No mocks needed |
| **Application** (services) | Unit | With implementation | Mock repositories, external APIs |
| **Infrastructure** (repositories) | Integration | After implementation | Real test DB |
| **API/WebSocket** | E2E | Critical paths only | Real services, test DB |
| **UI Components** | Unit | With implementation | Mock hooks, services |

#### What NOT to Test

- ❌ Simple getters/setters with no logic
- ❌ Framework code (Express routing, Next.js config)
- ❌ Third-party library internals
- ❌ Trivial pass-through functions
- ❌ Every edge case of external APIs (mock them)

#### Test Speed Expectations

- **Unit tests:** <100ms each (if slower, you're hitting real I/O)
- **Integration tests:** <1s each (DB operations)
- **E2E tests:** <10s each (full workflows)

If tests need 1+ minute timeouts, something is wrong — likely missing mocks or hitting real external services.

#### E2E Strategy

- Keep E2E only for critical happy paths (auth, chat, question gen, export)
- UI polish/variants go to component tests; one E2E smoke per epic is enough
- Use deterministic fixtures/seeds, mock externals, assert via test-ids
- Wait on events (no sleeps), isolate storage per test

**If tests fail:** Fix the code, don't skip the tests.

### Tech Stack Versions (DO NOT DOWNGRADE)

**CRITICAL:** These are the LATEST stable versions (Jan 2025). Your training data is STALE.

```json
{
  "next": "^16.0.0",           // Stable - Turbopack, React Compiler, MCP support
  "react": "^19.0.0",          // React 19.2 features
  "tailwindcss": "^4.0.0",     // v4 stable, Shadcn compatible
  "node": ">=22.11.0",         // LTS through late 2025
  "express": "^5.1.0",         // Latest stable
  "drizzle-orm": "latest",     // SQL-first ORM, lightweight
  "drizzle-kit": "latest",     // Schema management and migrations
  "postgresql": "17.x",        // Latest stable
  "socket.io": "^4.8.1",       // v4 stable
  "typescript": "^5.6.0"       // Latest
}
```

**If you encounter bugs:**
- ✅ Debug the actual issue (check docs, Stack Overflow, GitHub issues)
- ✅ Use MCP servers (next-devtools, shadcn) for current documentation
- ✅ Check `docs/design/architecture/system-design.md` for rationale
- ❌ NEVER suggest downgrading ("try Next.js 15", "use Tailwind v3")
- ❌ NEVER assume older versions are more stable

**Configured MCP Servers** (`.mcp.json`):
- `next-devtools` - Next.js runtime diagnostics, docs, migrations
- `shadcn` - Shadcn/ui component installation and usage

**Use MCPs first** when working with Next.js or Shadcn - they have current docs, you don't.

---

## Key Files

```bash
# New session onboarding
.claude/PROJECT_CONTEXT.md           # Quick project brief
tasks/roadmap.md                     # Feature roadmap (MVP, Phase 2, Phase 3)
tasks/task-overview.md               # Current tasks and status
tasks/epic-9-ui-ux-upgrade.md        # Epic 9: UI/UX upgrade (25 stories, granular)
tasks/implementation-logs/           # Epic implementation history (optional context)
docs/design/architecture/overview.md # Vision and goals

# Architecture (read in order)
docs/design/architecture/architecture-layers.md    # 4 layers, 7 modules (read FIRST)
docs/design/architecture/implementation-guide.md   # Data flows, caching, testing
docs/design/architecture/deployment-guide.md       # Infrastructure setup

# Data design
docs/design/data/database-schema.md  # Database schema (6 MVP tables)

# Reference materials
.claude/documentation/GUARDIAN_*.md  # Original system prompts
Sample_assessment_YAML_COMPLETED.yaml # Test data example
```

---

## Code Conventions

- **TypeScript:** Strict mode, explicit types, prefer interfaces
- **Database:** PostgreSQL 17 + Drizzle ORM (SQL-first, lightweight)
- **API:** WebSocket (Socket.IO) for streaming chat, REST for CRUD
- **Frontend:** Next.js 16 + React 19 + Tailwind v4 + Shadcn/ui
- **AI:** Anthropic Claude API (Sonnet 4.5) for conversation + analysis

---

## What NOT to Do

❌ **Never downgrade tech stack versions** - Your training data is stale. Debug issues, don't downgrade.
❌ **Never ignore MCP servers** - Use next-devtools and shadcn MCPs for current docs
❌ **Never build traditional forms** - Use conversational Q&A instead
❌ **Never show command syntax** - Use GUI (mode switcher, buttons, dropdowns)
❌ **Never add tasks outside /tasks/** - Single source of truth
❌ **Never make Claude do arithmetic** - Code calculates, Claude interprets
❌ **Never treat 111 questions as rigid** - Question count is dynamic (78-126)
❌ **Never use Vitest** - Always use Jest for all tests

---

## Agent-Based Development

**Guardian uses specialized sub-agents** for development with automated code review.

**Workflow:**
1. Invoke specialist agent for epic (e.g., `auth-agent` for Epic 2)
2. Agent builds features and tests
3. Code reviewer (Opus) automatically reviews
4. User approves → Proceed to next epic

**See:** `tasks/agent-workflow.md` for complete workflow documentation

**Available agents:** `.claude/agents/` (10 specialists including ui-ux-agent + 1 reviewer + 1 bug-fix)

### Agent Delegation Rules

**IMPORTANT:** Main agent should delegate to specialists, not do work directly.

**When You Are Main Agent:**
- ✅ Planning, research, architecture decisions
- ✅ Delegating to specialist agents via Task tool
- ✅ Reviewing summaries and providing feedback
- ❌ **NEVER implement stories yourself when specialist exists**

**Delegation Pattern:**
1. **Epic 1-8:** Invoke respective specialist (setup-agent, auth-agent, chat-backend-agent, frontend-agent, assessment-agent, question-gen-agent, export-agent, login-agent)
2. **Epic 9:** Invoke `ui-ux-agent` for ALL 25 stories
3. **Bug fixes:** Invoke `bug-fix-agent`
4. **Code review:** Specialists invoke `code-reviewer` automatically after each story

**Example (CORRECT):**
```
Main Agent identifies: "Need to complete Epic 9 Stories 9.1-9.3"
  → Task(subagent_type: "ui-ux-agent", prompt: "Complete Stories 9.1-9.3.
      After each story: invoke code-reviewer, iterate until approved.
      After 3 stories: provide summary for user manual review.")
```

**Anti-Pattern (WRONG):**
```
❌ Main Agent writes Sidebar.tsx directly (should delegate to ui-ux-agent)
❌ Main Agent skips code-reviewer invocation (specialist must invoke it)
❌ Specialist completes multiple stories without per-story code review
```

**Story-Level Code Review:**
- Specialists invoke `code-reviewer` after **EACH story** (not after batch)
- Code-reviewer reviews, provides feedback
- Specialist fixes issues, re-invokes code-reviewer
- Once approved, specialist moves to next story

**User Manual Review:**
- **Every 3 stories**, specialist provides summary to user
- User reviews and approves before continuing next batch
- Ensures quality gates throughout epic development

---

## For New Claude Sessions

1. Read `.claude/PROJECT_CONTEXT.md` - 2 min overview
2. Check `tasks/task-overview.md` - What's next?
3. Check `tasks/implementation-logs/epic-X.md` - Recent work context (if available)
4. Check `tasks/agent-workflow.md` - How to use sub-agents
5. If needed: `docs/design/architecture/overview.md` - Full vision

---

## Source of Truth Hierarchy

**When information conflicts, use this precedence:**

1. **Git history** - Definitive record of what code exists
   - `git log` shows actual commits and changes
   - Most authoritative for "what was implemented"

2. **task-overview.md** - Definitive plan of what needs to be done
   - Authoritative for "what's next" and current status
   - Updated as work progresses

3. **implementation-logs/** - Narrative context (optional)
   - Design decisions and rationale
   - Known issues and technical debt
   - NOT authoritative for "what's complete" (git is)
   - NOT authoritative for "what's next" (task-overview is)
   - Useful for understanding "why" decisions were made

**If information conflicts:**
- Git history > Implementation logs (for "what exists")
- task-overview.md > Implementation logs (for "what's next")
- Implementation logs = Unique source for design rationale

---

## Implementation Logs (Optional)

**Purpose:** Preserve context and design decisions when sessions end mid-epic.

**Location:** `/tasks/implementation-logs/epic-X-[name].md`

**Usage (Recommended, Not Required):**
- After completing story, consider updating implementation log
- Document: what was done, files changed, tests, design decisions
- Helps future agents understand context

**Why it helps:**
- Preserves context if session ends mid-epic
- Helps bug-fix agent understand previous decisions
- Provides narrative complement to git history

**Template:** `/tasks/implementation-logs/_TEMPLATE.md`

---

## Agent Session Checklist (Optional)

**Use this as guidance to ensure quality and context preservation.**

### Before Starting Work
- [ ] Read `tasks/task-overview.md` for current status
- [ ] Read `tasks/implementation-logs/epic-X.md` (if epic in progress and log exists)
- [ ] Check git log for recent changes: `git log --oneline -10`
- [ ] Start watch mode: `pnpm --filter @guardian/backend test:watch:unit`

### After Completing Each Story
- [ ] Run unit tests: `pnpm test:unit` (must pass)
- [ ] If DB changes: `pnpm test:integration` (must pass)
- [ ] Run coverage: `pnpm test:coverage` (check 70% minimum)
- [ ] Invoke code-review agent (use Task tool)
- [ ] Consider updating implementation log (optional but helpful)
- [ ] Commit code changes
- [ ] Update task-overview.md if needed

### If Session Must End Mid-Epic (Optional)
- [ ] Update implementation log with current progress (if time permits)
- [ ] Mark current story status in log
- [ ] Add "Next Session Handoff" notes
- [ ] Commit any log updates

### Bug-Fix Agent Specific
- [ ] Read implementation log for relevant epic (if exists)
- [ ] Understand previous design decisions
- [ ] Fix issue with tests
- [ ] Invoke code-review agent
- [ ] Update implementation log with fix details (recommended)
- [ ] Clear commit message with "fix:" prefix

**Last Updated:** 2025-01-12 v5.0 (added implementation logs + bug-fix agent workflow)
