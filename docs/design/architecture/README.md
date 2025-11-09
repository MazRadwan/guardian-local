# Guardian Architecture Documentation

**Index of Architecture Documents**

## Read in This Order

### 1. **overview.md** - Start Here
High-level vision, goals, and product overview. Read this first to understand WHAT we're building and WHY.

**Key sections:** Problem statement, Claude.ai limitations, core features, target users

---

### 2. **architecture-layers.md** - Foundational Architecture
Core architecture principles, layer responsibilities, and module boundaries. Read this before building ANYTHING.

**Key sections:**
- 4-layer clean architecture (Presentation, Application, Domain, Infrastructure)
- 7 module definitions (Assessment, Analysis, Reporting, Portfolio, Conversation, Auth, Export)
- Module dependency rules
- Key design patterns (dependency inversion, repository, streaming)
- Multi-agent development strategy

**Agent usage:** "Read this FIRST to understand layer rules and module boundaries"

---

### 3. **implementation-guide.md** - Build Instructions
Practical implementation details for building Guardian. Reference this when implementing specific features.

**Key sections:**
- Folder structure (exact monorepo layout)
- Tech stack decisions with rationale
- 6 data flow examples (assessment creation, chat, analysis, YAML import, reports, error handling)
- 2 Mermaid sequence diagrams (analysis workflow, conversational assessment)
- State machines (assessment lifecycle, report generation, conversations)
- Transaction boundaries
- Caching strategy
- Report formats & export options
- Testing strategy per layer

**Agent usage:** "Building Analysis module? Read data flows, caching, and testing sections"

---

### 4. **deployment-guide.md** - Infrastructure Setup
Deployment environments, Docker configuration, and infrastructure planning.

**Key sections:**
- Development environment (Docker Compose)
- Demo/Staging (Vercel + Railway/Render)
- Production architecture (AWS)
- Environment variables
- CI/CD pipeline
- Monitoring and security
- Backup and DR

**Agent usage:** "Setting up infrastructure? Read this"

---

## Quick Navigation

**Starting a new task?**
1. Check `tasks/task-overview.md` for current priorities
2. Read relevant architecture doc (likely `architecture-layers.md` first)
3. Reference `implementation-guide.md` for specific implementation details

**New to the project?**
1. Read `.claude/PROJECT_CONTEXT.md` (2-min overview)
2. Read `overview.md` (15-min vision)
3. Skim `architecture-layers.md` (understand structure)
4. Reference other docs as needed

---

## Document Relationships

```
overview.md
    ↓
architecture-layers.md (stable foundation)
    ↓
implementation-guide.md (active dev reference)
    ↓
deployment-guide.md (infrastructure)
```

All documents link back to `tasks/task-overview.md` for execution tracking.

---

**Last Updated:** 2025-01-04
**Split from:** system-design.md v1.5 (archived as system-design.md.archive)
