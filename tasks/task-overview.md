# Guardian App - Task Overview

**Single Source of Truth for All Tasks**

This document tracks ALL tasks, phases, and implementation steps for the Guardian App project. No other documents should contain task lists or phase planning.

---

## Current Phase: MVP (Phase 1) - In Development

**Status:** Development In Progress
**Started:** 2025-01-04
**Planning Completed:** 2025-01-04

**See detailed task breakdown:** `mvp-tasks.md` (38 stories across 8 epics)

---

## Planning Phase: Complete ✅

| Task | Status | Completed | Notes |
|------|--------|-----------|-------|
| High-level overview | ✅ Complete | 2025-01-04 | `docs/design/architecture/overview.md` |
| Architecture layers & modules | ✅ Complete | 2025-01-04 | `docs/design/architecture/architecture-layers.md` |
| Implementation guide | ✅ Complete | 2025-01-04 | `docs/design/architecture/implementation-guide.md` |
| Deployment guide | ✅ Complete | 2025-01-04 | `docs/design/architecture/deployment-guide.md` |
| Database schema (MVP) | ✅ Complete | 2025-01-04 | `docs/design/data/database-schema.md` (6 tables) |
| Tech stack locked | ✅ Complete | 2025-01-04 | Next.js 16, Drizzle ORM, Express 5, PostgreSQL 17 |
| Feature roadmap | ✅ Complete | 2025-01-04 | `roadmap.md` (4 phases) |
| MVP task breakdown | ✅ Complete | 2025-01-04 | `mvp-tasks.md` (38 stories) |

---

## MVP Development: In Progress

**Detailed tasks:** See `mvp-tasks.md` for 38 granular stories across 8 epics.

**High-level epic status:**

| Epic | Stories | Status | Completed | Notes |
|------|---------|--------|-----------|-------|
| Epic 1: Project Setup & Infrastructure | 4 stories | ✅ Complete | 2025-01-06 | Database, monorepo, testing setup |
| Epic 2: Authentication & User Management | 4 stories | ✅ Complete | 2025-01-06 | JWT auth, user CRUD, session management |
| Epic 3: Chat Infrastructure (Backend) | 5 stories | ✅ Complete | 2025-01-07 | WebSocket server, message persistence |
| Epic 4: Frontend Chat UI | 5 stories | ✅ Complete | 2025-01-07 | Chat interface, 102 tests, 78.79% coverage |
| Epic 5: Vendor & Assessment Management | 4 stories | ✅ Complete | 2025-11-08 | 176 tests passing, 89.55% coverage |
| Epic 6: Question Generation (Core Feature) | 6 stories | ✅ Complete | 2025-11-08 | 53 tests, 92% coverage, Claude integration working |
| Epic 7: Export Functionality | 5 stories | ✅ Complete | 2025-11-09 | 24 tests passing, architecture fix applied |
| Epic 8: Integration & Polish | 5 stories | ⬜ Pending | - | After all epics |
| Epic 9: UI/UX Upgrade | 26 stories | ✅ Complete | 2025-11-20 | ChatGPT-style UI, sidebar, centered layout |
| Epic 10: Prompt Refinement | 18 stories | ✅ Complete | 2025-11-25 | Guardian prompt aligned with web app UX |
| Epic 11: Questionnaire Extraction | 5 stories | ✅ Complete | 2025-12-01 | Detection, parsing, WebSocket events, download UI |
| Epic 12: Tool-based Questionnaire Trigger | 4 stories | ✅ Complete | 2025-12-05 | Claude tools, progressive UI, feature flags |
| Epic 13: Observability & E2E | 9 stories | ✅ Complete | 2025-12-09 | Logging, E2E tests, export resume logic |
| Epic 14: Inline Questionnaire Bubble | 6 stories | ✅ Complete | 2025-12-11 | Inline chat bubble, button styling, auto-scroll |
| Epic 15: Conversation Rename | - | 📋 Planned | - | See `tasks/epic-15/rename-conversation-plan.md` |

**Progress:** 13 of 14 epics complete (~95%), Epic 8 (Integration & Polish) and Epic 15 (Rename) pending

**Critical Path:** Epic 1-7 ✅ → Epic 9-14 ✅ → Epic 8 (Polish) → Epic 15 (Rename)

### Active Sidequests

| Sidequest | Status | Notes |
|-----------|--------|-------|
| Prompt Cache Manager | ✅ Complete | 46KB Guardian prompt caching with 90% token reduction |
| Chat Architecture Refactor | ✅ Complete | ChatInterface.tsx modularized into controller/services |

---

## Phase 2: Analysis & Reports

### Status: Not Started (Waiting for MVP Completion)

**See:** `roadmap.md` for Phase 2 features (response input, analysis, reports)

**Database:** Will add 3 tables (responses, risk_scores, reports)

---

## Phase 3: Portfolio & Collaboration

### Status: Not Started

**See:** `roadmap.md` for Phase 3 features

---

## Phase 4: Advanced Features

### Status: Not Started

**See:** `roadmap.md` for Phase 4 features

---

## Task Status Legend

- ✅ **Complete** - Task finished and reviewed
- 🔄 **In Progress** - Currently being worked on
- ⏭️ **Next** - Prioritized for immediate next step
- ⬜ **Pending** - Not started, in backlog
- ⏸️ **Blocked** - Waiting on dependency or decision
- ❌ **Cancelled** - No longer needed

---

## How to Use This Document

1. **Adding Tasks:** All new tasks go here, organized by phase
2. **Updating Status:** Change status emoji when task state changes
3. **Completing Tasks:** Mark ✅ and add completion date in notes
4. **Blocking Issues:** Use ⏸️ and document blocker in notes
5. **Single Source:** If tasks appear elsewhere, move them here

---

## Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-01-04 | Initial | Created task tracking document, migrated phases from overview.md |
| 1.1 | 2025-01-04 | Updated | Planning phase complete. Updated to reflect MVP focus. Reference mvp-tasks.md for 38 detailed stories. Marked planning tasks complete. |
| 1.2 | 2025-01-07 | code-reviewer | Epic 4 complete with all fixes applied. Test coverage 78.79%, 102 tests passing. |
| 1.3 | 2025-11-08 | code-reviewer | Epic 5 complete after fixes applied. 176 tests passing, 89.55% coverage. |
| 1.4 | 2025-11-09 | code-reviewer | Epic 7 complete after architecture fix. 24 export tests passing, clean architecture verified. |
| 1.5 | 2025-11-13 | code-reviewer | Epic 9 Story 9.1 complete after fixes. 36 new tests, 81.48% coverage for components/chat. |
| 2.0 | 2025-12-11 | cleanup | Major update: Epics 9-14 marked complete, Epic 15 planned, sidequests complete, progress updated to 95%. |
