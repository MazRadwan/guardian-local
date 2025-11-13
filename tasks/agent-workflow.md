# Guardian Agent Workflow

**Version:** 3.0
**Last Updated:** 2025-01-13

---

## Overview

Guardian development uses **specialized sub-agents** with **automated code review** for quality assurance.

**Workflow:** Specialist builds → Code reviewer (Opus) reviews → User approves → Next story

---

## Sub-Agents

### Specialist Agents (Sonnet)

| Agent | Epic | Scope | Model |
|-------|------|-------|-------|
| `setup-agent` | Epic 1 | Project setup, database, Docker | Sonnet |
| `auth-agent` | Epic 2 | Authentication, user management | Sonnet |
| `chat-backend-agent` | Epic 3 | Chat infrastructure (backend) | Sonnet |
| `frontend-agent` | Epic 4 | Chat UI (frontend) | Sonnet |
| `assessment-agent` | Epic 5 | Vendor/assessment management | Sonnet |
| `question-gen-agent` | Epic 6 | Question generation (Claude integration) | Sonnet |
| `export-agent` | Epic 7 | Export functionality | Sonnet |
| `ui-ux-agent` | Epic 9 | UI/UX upgrade (25 stories) | Sonnet |

### Review Agent (Opus)

| Agent | Scope | Model |
|-------|-------|-------|
| `code-reviewer` | Review all code for quality, architecture, security, tests | Opus 4.1 |

### Bug-Fix Agent (Sonnet)

| Agent | Scope | Model |
|-------|-------|-------|
| `bug-fix-agent` | Fix bugs from previous implementations, refine based on feedback | Sonnet |

---

## Implementation Logs (Optional)

**Purpose:** Preserve context and design decisions for future sessions.

**Location:** `/tasks/implementation-logs/epic-X-[name].md`

**When to update (recommended):**
- After completing a story
- After code review approval
- When fixing bugs
- When session is ending mid-epic

**What to document:**
- What was implemented
- Files modified
- Tests added
- Design decisions and rationale
- Known issues or technical debt
- Links to commits

**Template:** `/tasks/implementation-logs/_TEMPLATE.md`

**Note:** Implementation logs are optional but helpful for:
- Session handoffs (if work is interrupted)
- Bug-fix agent context
- Understanding "why" decisions were made

**Source of Truth Hierarchy:**
1. Git history (what code exists)
2. task-overview.md (what's next)
3. Implementation logs (design rationale, context)

---

## Workflow Steps

### Overview: Story-Level Iteration with 3-Story User Checkpoints

**Pattern:**
```
Main Agent → Specialist (3 stories) → Code Review (per story) → User Review (every 3 stories) → Next batch
```

**Key Principles:**
1. **Main agent delegates** to specialist (never does work directly)
2. **Specialist reviews after EACH story** (not batched)
3. **User reviews every 3 stories** (manual quality gate)

---

### Step 1: Main Agent Delegates to Specialist

**Main agent identifies work** (e.g., "Epic 9 Stories 9.1-9.3")

**Delegation command:**
```
Task(subagent_type: "ui-ux-agent",
     prompt: "Complete Stories 9.1-9.3.
             After EACH story: invoke code-reviewer, iterate until approved.
             After all 3 stories: provide summary for user manual review.")
```

**What happens:**
- Main agent hands off to specialist
- Specialist reads epic file (`tasks/epic-9-ui-ux-upgrade.md`)
- Specialist begins Story 9.1

**Anti-Pattern (WRONG):**
```
❌ Main agent writes Sidebar.tsx directly
❌ Main agent implements stories (should delegate to specialist)
```

---

### Step 2: Specialist Builds Story (Per Story)

**For EACH story** (e.g., Story 9.1):

1. **Specialist reads story specs** from epic file
2. **Implements feature** (creates/modifies files)
3. **Writes tests** (unit + integration as needed)
4. **Runs tests** (`npm test`)
5. **Self-reviews** against Definition of Done checklist

**Then proceeds to Step 3** (code review)

---

### Step 3: Specialist Invokes Code Reviewer (Per Story)

**After EACH story completion**, specialist invokes code-reviewer:

```
Story 9.1 complete
  → Task(subagent_type: "code-reviewer",
         prompt: "Review Story 9.1 (Sidebar component).
                 Files changed: Sidebar.tsx, chatStore.ts, layout.tsx
                 Focus: Component structure, state management, responsive design")
```

**What happens:**
- Code-reviewer (Opus) analyzes changes
- Checks: architecture, tests, security, quality
- Runs test suite
- Generates review report

**Output:** One of:
- `.claude/review-approved.md` (✅ all checks passed)
- `.claude/review-feedback.md` (❌ issues found)

---

### Step 4: Specialist Iterates on Feedback (If Needed)

**If issues found:**
1. Specialist reads `.claude/review-feedback.md`
2. Fixes each documented issue
3. Re-invokes code-reviewer for same story
4. Repeats until approved

**If approved:**
1. Specialist moves to next story (e.g., Story 9.2)
2. Repeats Steps 2-4 for each subsequent story

**Critical:** Do NOT batch stories before review. Review after EACH story.

---

### Step 5: Specialist Provides 3-Story Summary

**After Stories 9.1, 9.2, 9.3 all approved:**

Specialist creates summary for user:

```markdown
## Stories 9.1-9.3 Complete - Summary for Manual Review

**Stories Completed:**
- ✅ Story 9.1: Sidebar skeleton
- ✅ Story 9.2: Three-panel layout
- ✅ Story 9.3: Sidebar state persistence

**Files Created:**
- apps/web/src/components/chat/Sidebar.tsx
- apps/web/src/components/chat/__tests__/Sidebar.test.tsx

**Files Modified:**
- apps/web/src/stores/chatStore.ts
- apps/web/src/app/(dashboard)/layout.tsx

**Tests:**
- 18 new tests written
- All tests passing (102 → 120 tests)
- Coverage: 78% (maintained)

**Known Issues:**
- None

**Next Batch:** Stories 9.4-9.6 (Composer component)

**Awaiting your approval to proceed.**
```

Specialist **WAITS** for user response.

---

### Step 6: User Manual Review & Approval

**User reviews summary:**
- Check files make sense
- Verify tests passing
- Visual inspection (optional)
- Approve or request changes

**If approved:**
```
USER: "Approved. Continue with Stories 9.4-9.6."
```

**If changes needed:**
```
USER: "Change X in Sidebar.tsx, then re-review Story 9.1"
```

---

### Step 7: Repeat for Next Batch

Main agent (or specialist continues):
```
Stories 9.4-9.6
  → Same process (build → review per story → 3-story summary → user approval)

Stories 9.7-9.9
  → Same process

... until all 25 stories complete
```

---

## Example Workflow

### Example: Epic 9 Stories 9.1-9.3 (Story-Level Review Pattern)

```
USER: "Complete Epic 9 Stories 9.1-9.3"

MAIN AGENT: Delegating to ui-ux-agent...
  → Task(ui-ux-agent, "Complete Stories 9.1-9.3 with per-story code review")

---

UI-UX-AGENT: Starting Story 9.1 (Sidebar skeleton)...
  → Creates Sidebar.tsx
  → Updates chatStore.ts with sidebar state
  → Updates layout.tsx for three-panel layout
  → Runs tests (all pass)
  → Self-review complete

UI-UX-AGENT: Story 9.1 complete. Invoking code-reviewer...
  → Task(code-reviewer, "Review Story 9.1: Sidebar.tsx, chatStore.ts, layout.tsx")

CODE-REVIEWER (Opus): Reviewing Story 9.1...
  ✅ Architecture: Component structure good
  ✅ Tests: Would like tests for Sidebar component
  ✅ TypeScript: Clean types
  ⚠️ Missing: No tests for Sidebar.tsx

CODE-REVIEWER: Minor issue - Need Sidebar.test.tsx

UI-UX-AGENT: Adding tests for Sidebar...
  → Creates __tests__/Sidebar.test.tsx
  → Runs tests (all pass)

UI-UX-AGENT: Tests added. Re-invoking code-reviewer...
  → Task(code-reviewer, "Re-review Story 9.1 with new tests")

CODE-REVIEWER: ✅ APPROVED. Story 9.1 complete.

---

UI-UX-AGENT: Moving to Story 9.2...
  → [builds Story 9.2]
  → [invokes code-reviewer]
  → [approved first try]

UI-UX-AGENT: Moving to Story 9.3...
  → [builds Story 9.3]
  → [invokes code-reviewer]
  → [approved first try]

---

UI-UX-AGENT: Stories 9.1-9.3 complete. Generating summary...

## Stories 9.1-9.3 Complete - Manual Review Required

**Stories:**
- ✅ 9.1: Sidebar skeleton
- ✅ 9.2: [Story 9.2 description]
- ✅ 9.3: [Story 9.3 description]

**Files:** [lists files]
**Tests:** 18 new, all passing
**Coverage:** 78%

**Awaiting your approval to proceed to Stories 9.4-9.6.**

---

USER: [Reviews summary]

USER: "Approved. Continue with Stories 9.4-9.6."

MAIN AGENT: Invoking ui-ux-agent for next batch...
  → Task(ui-ux-agent, "Complete Stories 9.4-9.6...")

[Process repeats for Stories 9.4-9.6, then 9.7-9.9, etc.]
```

---

## Fix Documentation Pattern

**When code review finds issues:**

1. **Code-reviewer creates:** `.claude/review-feedback.md` with issues list
2. **User invokes specialist** with: "Fix issues in review-feedback.md"
3. **Specialist reads review**, fixes issues
4. **Specialist documents fixes** in EPIC summary:

```markdown
## Fixes Applied

**Issue 1: JWT Hardcoded Secret**
- File: JWTProvider.ts:18-30
- Problem: Had fallback to 'guardian-secret-key'
- Fix: Added env check, throws error if JWT_SECRET missing (except test env)
- Result: Secure - no hardcoded production secrets

**Issue 2: Integration Tests Missing**
- Problem: No tests for DrizzleConversationRepository
- Status: SKIPPED
- Reason: Database connection pooling issues causing test hangs. Deferred to prevent blocking progress. Unit tests (86% coverage) validate logic.
```

5. **Code-reviewer re-reviews:**
   - Reads EPIC summary "Fixes Applied" section
   - Verifies documented fixes match actual code changes
   - Checks rationale for skipped fixes is reasonable
   - If matches: APPROVED
   - If doesn't match: Flag as issue

**Why this pattern:**
- Fixes documented (traceability)
- Skipped fixes explained (context preserved)
- Git commits alone don't explain "why"
- Code-reviewer can verify fixes match documentation

---

## Manual Intervention Points

**You decide:**
- ✅ When to invoke each specialist
- ✅ Whether to fix issues or override
- ✅ When to move to next epic
- ✅ When to stop and iterate

**Agents execute, you orchestrate.**

---

## Review Bypass (Emergency)

If you need to bypass code review (not recommended):

```
/agents modify code-reviewer --disable
```

**Restore:**
```
/agents modify code-reviewer --enable
```

**Use sparingly.** Code review catches bugs early.

---

## Parallel Execution

**Some epics can run in parallel** (see mvp-tasks.md dependency diagram):

**After Epic 3 complete:**
```
USER: "Use frontend-agent to complete Epic 4"
      (in one session)

USER: "Use assessment-agent to complete Epic 5"
      (in different session/parallel)
```

Both agents work simultaneously. Code reviewer reviews each independently.

---

## Bug-Fix Agent Workflow

**When to use bug-fix agent:**
- User reports a bug in completed epic
- External LLM identifies an issue
- Code review finds critical bug
- Integration tests fail after merge
- Refining implementation based on feedback

**Workflow:**

### Step 1: Invoke Bug-Fix Agent
```
USER: "Use bug-fix agent to fix [issue description] in Epic X"
```

### Step 2: Agent Investigates
- Reads implementation log (if exists) for Epic X
- Falls back to git history if no log
- Uses Grep/Read to investigate code
- Identifies root cause

### Step 3: Agent Fixes with Tests
- Implements fix
- Adds/updates tests
- Ensures all tests pass

### Step 4: Automatic Code Review
- SubagentStop hook triggers
- Code reviewer reviews the fix
- Checks: no regressions, tests adequate, fix is correct

### Step 5: Agent Documents (Optional)
If implementation log exists:
- Adds bug fix section to log
- Documents issue, root cause, solution
- Links to commits

### Step 6: Commit
- Clear commit message with "fix:" prefix
- References issue if applicable

**Example:**

```
USER: "Use bug-fix agent to fix: Login endpoint returns 500 instead of 401 for invalid credentials (Epic 2)"

[bug-fix-agent works...]

bug-fix-agent:
✅ Bug fixed in Epic 2
Issue: AuthController error handling
Root cause: Error middleware not catching AuthenticationError
Solution: Updated error middleware to map AuthenticationError → 401
Tests: Added test for invalid credentials → 401
Files: AuthController.ts, error.middleware.ts
Commits: abc1234 - fix(epic-2): Return 401 for invalid credentials
Implementation log updated: tasks/implementation-logs/epic-2-auth.md

[SubagentStop hook triggers]

code-reviewer: ✅ APPROVED
- Fix addresses root cause
- Test coverage adequate
- No regressions introduced
```

**Benefits:**
- Context-aware fixes (reads implementation logs)
- Systematic documentation (updates logs)
- Quality assurance (code review)
- Preserves design decisions

---

## Tips for Success

### 1. **One Epic at a Time (Recommended)**
Finish Epic 1 → Review → Epic 2 → Review → etc.

**Pros:** Easier to debug, clear progress
**Cons:** Slower (no parallelism)

### 2. **Parallel When Possible**
After Epic 3, run Epic 4 + Epic 5 in parallel

**Pros:** Faster overall
**Cons:** More complexity if both have issues

### 3. **Trust the Code Reviewer**
If Opus finds issues, they're usually real. Fix them.

### 4. **Document Overrides**
If you override a code review warning, document why in commit message or review file.

---

## Troubleshooting

### Problem: Code reviewer is too strict

**Solution:** Edit `.claude/agents/code-reviewer.md` to adjust thresholds (e.g., lower coverage requirement to 60%)

### Problem: Specialist agent goes off-rails

**Solution:** Edit specialist agent prompt to be more explicit about constraints

### Problem: Review takes too long

**Solution:** Code reviewer uses Opus (thorough but slower). This is intentional for quality. Be patient.

### Problem: Circular issues (fix creates new issues)

**Solution:** Manually review, might indicate architectural problem. Discuss with team.

---

## Success Metrics

**Quality indicators:**
- ✅ All epics pass code review on first try (good agent prompts)
- ✅ Test coverage > 75% consistently
- ✅ Zero security issues found
- ✅ < 2 iterations per epic (specialist → review → fix → approve)

**If you're iterating >3 times per epic:** Agent prompts need improvement.

---

## Files

**Agent definitions:**
- `.claude/agents/setup-agent.md` (Epic 1)
- `.claude/agents/auth-agent.md` (Epic 2)
- `.claude/agents/login-agent.md` (Epic 2.5)
- `.claude/agents/chat-backend-agent.md` (Epic 3)
- `.claude/agents/frontend-agent.md` (Epic 4)
- `.claude/agents/assessment-agent.md` (Epic 5)
- `.claude/agents/question-gen-agent.md` (Epic 6)
- `.claude/agents/export-agent.md` (Epic 7)
- `.claude/agents/ui-ux-agent.md` (Epic 9) ⭐ NEW
- `.claude/agents/code-reviewer.md` (Review agent)
- `.claude/agents/bug-fix-agent.md` (Bug fixes)

**Review outputs:**
- `.claude/review-approved.md` (ephemeral, created per story review)
- `.claude/review-feedback.md` (ephemeral, created per story review)

**Task tracking:**
- `tasks/task-overview.md` - High-level epic status
- `tasks/mvp-tasks.md` - Epic 1-8 story definitions
- `tasks/epic-9-ui-ux-upgrade.md` - Epic 9 story definitions (25 stories) ⭐ NEW
- `tasks/roadmap.md` - Feature roadmap (all phases)

**Implementation logs (optional):**
- `tasks/implementation-logs/epic-X-[name].md` - Context and design decisions
- `tasks/implementation-logs/_TEMPLATE.md` - Template for new logs

---

## Document History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2025-01-04 | Initial agent workflow documentation - 7 specialist agents (Sonnet) + 1 code reviewer (Opus). Manual approval checkpoints between stories. |
| 2.0 | 2025-01-12 | Added bug-fix agent workflow. Added implementation logs (optional context preservation). Updated source of truth hierarchy. |
| 3.0 | 2025-01-13 | **MAJOR UPDATE:** Added ui-ux-agent (Epic 9). Clarified story-level code review pattern (review after EACH story, not batched). Added 3-story user manual review checkpoints. Updated example workflow to show correct delegation: Main Agent → Specialist → Code Review (per story) → User Review (every 3 stories). |

---

**This workflow ensures quality without slowing you down.**

Specialist agents (Sonnet) build fast. Code reviewer (Opus) catches issues. You make final decisions.

**Next:** Invoke `setup-agent` to begin Epic 1.
