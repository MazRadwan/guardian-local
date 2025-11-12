# Guardian Agent Workflow

**Version:** 2.0
**Last Updated:** 2025-01-12

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

### Step 1: Invoke Specialist Agent

**Command:**
```
Use the setup-agent to complete Epic 1
```

**OR**
```
/task --subagent setup-agent
[Describe Epic 1 stories to complete]
```

**What happens:**
- Specialist agent reads relevant docs
- Implements stories for their epic
- Writes tests
- Runs tests
- Outputs summary of work completed

---

### Step 2: Automatic Code Review (SubagentStop Hook)

**Trigger:** When specialist completes, SubagentStop hook fires

**What happens:**
- Hook invokes `code-reviewer` sub-agent (Opus)
- Code reviewer analyzes changes
- Checks: architecture, tests, security, quality
- Runs test suite
- Generates review report

**Output:** One of:
- `.claude/review-approved.md` (✅ all checks passed)
- `.claude/review-feedback.md` (❌ issues found)

---

### Step 3: User Review & Decision

**Your action:**

1. **Read review file:**
   ```bash
   cat .claude/review-approved.md
   # OR
   cat .claude/review-feedback.md
   ```

2. **Make decision:**

   **If APPROVED (✅):**
   - Move to next story/epic
   - Invoke next specialist agent
   - Update task-overview.md

   **If ISSUES FOUND (❌):**
   - Review feedback details
   - Decide: Fix now OR override and proceed
   - If fixing: Re-invoke same specialist with feedback
   - If overriding: Document why, proceed to next

---

### Step 4: Repeat

Continue pattern: Specialist → Review → Approval → Next

---

## Example Workflow

### Complete Epic 2 (Auth System)

```
USER: "Use the auth-agent to complete Epic 2"

[auth-agent works...]

auth-agent: ✅ Epic 2 complete. Stories 2.1-2.4 done.
            Tests: 42 passed
            Files: [lists 15 files created]
            Ready for review.

[SubagentStop hook triggers]

code-reviewer (Opus): Reviewing Epic 2 changes...

[5 minutes later]

code-reviewer: ❌ Issues found. See .claude/review-feedback.md

USER: [Reads review-feedback.md]

Feedback shows:
- Critical: Domain layer imports Drizzle (violation)
- Warning: Test coverage 65% (below 70%)

USER: "Use auth-agent to fix issues in review-feedback.md"

[auth-agent fixes issues...]

auth-agent: ✅ Issues fixed. Re-running tests...
            Tests: 46 passed
            Coverage: 74%

            Updated /summaries/EPIC2_SUMMARY.md with:
            ## Fixes Applied
            - Issue 1: JWT security - FIXED
            - Issue 2: Domain layer violation - FIXED
            - Issue 3: Test coverage - ADDRESSED

            Ready for re-review.

[SubagentStop hook triggers again]

code-reviewer (Opus): Re-reviewing...

code-reviewer: ✅ APPROVED. All issues resolved.

USER: [Reads review-approved.md]

USER: "Use chat-backend-agent to complete Epic 3"

[Process repeats...]
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
- `.claude/agents/setup-agent.md`
- `.claude/agents/auth-agent.md`
- `.claude/agents/chat-backend-agent.md`
- `.claude/agents/frontend-agent.md`
- `.claude/agents/assessment-agent.md`
- `.claude/agents/question-gen-agent.md`
- `.claude/agents/export-agent.md`
- `.claude/agents/code-reviewer.md`
- `.claude/agents/bug-fix-agent.md`

**Review outputs:**
- `.claude/review-approved.md` (ephemeral, created per review)
- `.claude/review-feedback.md` (ephemeral, created per review)

**Task tracking:**
- `tasks/mvp-tasks.md` - Story definitions
- `tasks/task-overview.md` - Status tracking (update manually after approval)

**Implementation logs (optional):**
- `tasks/implementation-logs/epic-X-[name].md` - Context and design decisions
- `tasks/implementation-logs/_TEMPLATE.md` - Template for new logs

---

## Document History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2025-01-04 | Initial agent workflow documentation - 7 specialist agents (Sonnet) + 1 code reviewer (Opus). Manual approval checkpoints between stories. |
| 2.0 | 2025-01-12 | Added bug-fix agent workflow. Added implementation logs (optional context preservation). Updated source of truth hierarchy. |

---

**This workflow ensures quality without slowing you down.**

Specialist agents (Sonnet) build fast. Code reviewer (Opus) catches issues. You make final decisions.

**Next:** Invoke `setup-agent` to begin Epic 1.
