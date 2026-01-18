# Task & Planning Rules (tasks/)

This file contains planning-specific rules and learnings. Updated automatically when GPT-5.2 catches issues during plan review.

## Task Structure

All tasks live in `/tasks/` directory:
- `task-overview.md` - High-level epic status
- `epic-{N}/` - Epic-specific folders
- `epic-{N}/epic-{N}-goals.md` - Goals and context
- `epic-{N}/sprint-{X}.md` - Sprint specifications
- `epic-{N}/sprint-{X}-story-{Y}.md` - Story specifications

## Story Format Requirements

Every story MUST have:
1. **Description** - What and why
2. **Acceptance Criteria** - Testable requirements
3. **Technical Approach** - How to implement
4. **Files Touched** - Specific file paths (critical for parallelization)
5. **Agent Assignment** - frontend-agent or backend-agent
6. **Tests Required** - Specific tests to write

## Files Touched Section

**CRITICAL:** This enables parallelization. Be specific:

```markdown
## Files Touched
- `apps/web/src/components/chat/Composer.tsx` - Add handler
- `apps/web/src/hooks/useMultiFileUpload.ts` - Implement abort
```

Vague entries like "frontend components" break parallelization.

## Story Sizing

| Size | Scope | Guidance |
|------|-------|----------|
| Small | 1-2 files | Ideal |
| Medium | 3-4 related files | OK |
| Large | 5+ files | Split into smaller stories |

## Agent Assignment Rules

- `apps/web/**` → frontend-agent
- `packages/backend/**` → backend-agent
- Both → Split into two stories

---

## Learnings from GPT Reviews

<!-- Auto-appended by orchestrator when GPT catches issues -->
