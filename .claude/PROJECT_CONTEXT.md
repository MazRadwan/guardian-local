# GUARDIAN App - Project Context

## What is GUARDIAN?

GUARDIAN is an AI governance assessment system originally designed as a Claude.ai Project for Newfoundland & Labrador Health Services (NLHS). It helps security/privacy analysts evaluate AI vendors through:

- **10-dimensional risk analysis** (clinical safety, privacy, bias, security, etc.)
- **111-question vendor interview framework** (90-minute comprehensive assessment)
- **Automated scoring and compliance checking** (PIPEDA, PHIA, ATIPP, NIST CSF)
- **Professional report generation** (internal analysis + vendor-facing feedback)

## Current Project Goal

**Transform the GUARDIAN system prompt into a standalone web application.**

The original Claude.ai Project implementation has critical limitations:
- **No persistence** - Can't store vendor history, portfolio analytics, or assessment tracking
- **Context exhaustion** - 90-minute conversational interviews degrade quality as token window fills
- **Single-user, single-session** - No collaboration, no cross-assessment insights

## Key Design Insights Discovered

1. **Intended workflow vs. actual usage gap:**
   - Prompt assumes: Analyst conducts interview → fills YAML form → pastes to Claude for analysis
   - Reality: Users try to have Claude conduct the interview conversationally (breaks down)

2. **Architectural separation needed:**
   - Conversational chat interface (not traditional forms)
   - Dynamic question generation by Claude (78-126 questions based on context)
   - Analysis & scoring → Claude interpretation + deterministic calculation
   - Persistence & tracking → Database-backed application

3. **Target users:**
   - Primary: Expert security/privacy analysts at healthcare orgs
   - Secondary: Junior analysts, leadership dashboards, vendor portals

## Current Phase

**MVP (Phase 1) Planning Complete** - Architecture designed, database schema defined, ready for task breakdown.

**Next:** Break MVP features into agent-assignable tasks.

## Key Documents

- **Roadmap:** `tasks/roadmap.md` - Feature plan (MVP → Phase 2 → Phase 3 → Phase 4)
- **Architecture:** `docs/design/architecture/` - System design (layers, modules, implementation)
- **Database:** `docs/design/data/database-schema.md` - 6 MVP tables (Drizzle ORM)
- **Tasks:** `tasks/task-overview.md` - Current execution status

## Tech Stack

- Next.js 16 + React 19 + Tailwind v4
- Node.js 22 + Express 5 + Socket.IO
- PostgreSQL 17 + Drizzle ORM
- Anthropic Claude API (Sonnet 4.5)

## Reference Materials

- `GUARDIAN_Security_Privacy_Analyst_v1_0_COMPLETE.md` - Original system prompt (~16k tokens)
