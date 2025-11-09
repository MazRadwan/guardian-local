# Guardian App

## Quick Context
Conversational AI assistant for healthcare organizations to assess AI vendors against 10 risk dimensions.

**Full details:** `docs/design/architecture/overview.md`

---

## 🚨 Critical Rules

### Single Source of Truth for Tasks
**IMPORTANT:** Tasks live ONLY in `/tasks/` directory.
- When starting work → Check `tasks/task-overview.md` first
- When creating tasks → Add to `tasks/task-overview.md` only
- Never add tasks to: docs, README, code comments, or anywhere else

### Architecture Type
**IMPORTANT:** This is a **chat-first application**, NOT a traditional form-based app.
- User interaction is conversational (like ChatGPT)
- Structured workflows embedded in chat (forms/buttons appear inline)
- Mode switching via GUI dropdown, NOT command syntax
- Never suggest traditional multi-step form UIs

### AI vs Code Responsibilities
**IMPORTANT:** Assessment responses are qualitative text requiring interpretation.
- ✅ Claude interprets vendor responses against rubrics → identifies risk factors
- ✅ TypeScript calculates scores from identified factors → deterministic math
- ❌ Claude does NOT do arithmetic on structured data

### Test Requirements
**IMPORTANT:** All features MUST have tests. No exceptions.

**Before building:**
- Plan test cases (what should pass/fail?)
- Check existing tests for patterns

**While building:**
- Domain layer: Write tests FIRST (TDD)
- Services: Write tests WITH implementation
- Integration: Write tests AFTER implementation

**Test requirements:**
- ✅ Unit tests for domain logic (entities, business rules, scoring)
- ✅ Integration tests for repositories (Drizzle with test DB)
- ✅ E2E tests for critical workflows (auth, chat, question generation)
- ✅ Minimum 70% coverage (aim for 80%+)

**Before committing:**
- Run: `npm test` (all tests must pass)
- Run: `npm run test:coverage` (check coverage)
- Fix failures before proceeding

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

---

## Agent-Based Development

**Guardian uses specialized sub-agents** for development with automated code review.

**Workflow:**
1. Invoke specialist agent for epic (e.g., `auth-agent` for Epic 2)
2. Agent builds features and tests
3. Code reviewer (Opus) automatically reviews
4. User approves → Proceed to next epic

**See:** `tasks/agent-workflow.md` for complete workflow documentation

**Available agents:** `.claude/agents/` (7 specialists + 1 reviewer)

---

## For New Claude Sessions

1. Read `.claude/PROJECT_CONTEXT.md` - 2 min overview
2. Check `tasks/task-overview.md` - What's next?
3. Check `tasks/agent-workflow.md` - How to use sub-agents
4. If needed: `docs/design/architecture/overview.md` - Full vision

**Last Updated:** 2025-01-04 v4.0 (added agent-based development workflow)
