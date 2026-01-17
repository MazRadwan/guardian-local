# Post-Epic 20 Fixes

Issues discovered during Epic 20 implementation that need to be addressed after completion.

---

## 1. Orchestrator State Checkpointing Flaw

**Priority:** High
**Discovered:** 2026-01-15 during batch 1 execution

**Problem:**
The orchestrator updates `completedStories` at batch boundaries, not per-story. If a crash occurs mid-batch:
- Work is done (files written)
- But `completedStories` is empty
- Status may already be set to next phase

**Impact:**
On resume, state is inconsistent - workflow thinks no work was done.

**Fix Required:**
1. Checkpoint per-story - Update `completedStories` as each agent returns
2. Add resume validation - Check if `awaiting_gpt_review` but `completedStories` doesn't match current batch
3. Add recovery logic - Scan for implemented stories if state seems inconsistent

**Files to Update:**
- `.claude/agents/orchestrator-agent.md`
- `.claude/commands/implement.md`

---

## 2. Codex MCP Returns Empty Content

**Priority:** Medium
**Discovered:** 2026-01-15 during GPT review handoff

**Problem:**
MCP call to codex returned thread ID but no content, forcing Bash fallback.

**Possible Causes:**
- MCP server connection issue
- API rate limiting
- Model availability (`gpt-5.2-codex`)

**Investigation Needed:**
- Check MCP server logs
- Verify API key/auth configuration
- Test MCP server manually

**Files to Check:**
- `.mcp.json` (codex server config)

---

## 3. Outdated Bash Fallback Syntax

**Priority:** High
**Discovered:** 2026-01-15 during GPT review fallback

**Problem:**
Orchestrator Bash fallback uses incorrect `codex` CLI syntax:

```bash
# Wrong (current template):
codex --model gpt-5.2 --approval-policy never --quiet --prompt "..."

# Correct syntax:
codex exec -m gpt-5.2 -s read-only --json "..."
```

**Impact:**
Fallback fails initially, requiring self-correction (wastes time, causes errors).

**Fix Required:**
Update all Bash fallback templates to use correct `codex exec` syntax.

**Files to Update:**
- `.claude/agents/orchestrator-agent.md` (line ~434)
- `.claude/commands/implement.md` (line ~334)
- `.claude/commands/spec-design.md` (line ~164)

---

## 4. Consider Using gpt-5.2-high for Reviews

**Priority:** Low
**Discovered:** 2026-01-15

**Problem:**
Currently using `gpt-5.2` for code reviews. User suggested `gpt-5.2-high` for deeper analysis.

**Consideration:**
- Higher quality reviews
- Potentially slower/more expensive
- May be worth it for CRITICAL/HIGH severity checks

**Decision Needed:**
- When to use `gpt-5.2` vs `gpt-5.2-high`
- Update MCP config and Bash templates accordingly

**Files to Update:**
- `.mcp.json`
- `.claude/agents/orchestrator-agent.md`

---

---

## 5. Orphaned Codex Processes Accumulate

**Priority:** High
**Discovered:** 2026-01-15 during re-review loop

**Problem:**
Multiple codex processes accumulate from failed/interrupted review attempts:
```
pgrep -f "codex" | head -5
→ 5+ PIDs returned
```

**Impact:**
- Resource consumption
- Potential conflicts between processes
- Unclear which process is the "active" one

**Fix Required:**
1. Kill orphaned codex processes before starting new review
2. Or track PID and clean up on failure/timeout
3. Consider single-process enforcement

**Files to Update:**
- `.claude/agents/orchestrator-agent.md`
- `.claude/commands/implement.md`

---

## 6. GPT Review Completion Detection is Fragile

**Priority:** High
**Discovered:** 2026-01-15 during re-review loop

**Problem:**
The orchestrator polls output file length to detect review completion:
```
sleep 60 → tail output → still running → sleep 60 → tail output...
```

No clear signal for "review complete" - just checks if output stops growing.

**Impact:**
- Agent gets stuck in polling loops
- No timeout enforcement
- Wastes time with repeated sleep/check cycles

**Fix Required:**
Parse codex output for clear completion signals:
1. `needs_follow_up: false` in codex output = review complete
2. `STATUS: APPROVED` or `STATUS: NEEDS_REVISION` = review complete
3. Or use codex exit code (0 = complete)

**Files to Update:**
- `.claude/agents/orchestrator-agent.md`
- `.claude/commands/implement.md`

---

## 7. macOS `timeout` Command Not Available

**Priority:** Medium
**Discovered:** 2026-01-15 during re-review

**Problem:**
```
(eval):1: command not found: timeout
```
macOS doesn't have `timeout` by default. Agent tried to use it for codex review.

**Fix Required:**
Use macOS-compatible alternatives:
```bash
# Option 1: Use gtimeout from coreutils
brew install coreutils
gtimeout 120 codex review...

# Option 2: Use perl one-liner
perl -e 'alarm 120; exec @ARGV' codex review...

# Option 3: Background + sleep + kill pattern
codex review & PID=$!; sleep 120; kill $PID 2>/dev/null
```

**Files to Update:**
- `.claude/agents/orchestrator-agent.md`

---

---

## 8. Add Confidence Threshold for GPT Approvals

**Priority:** High
**Discovered:** 2026-01-15 during batch 1 review

**Problem:**
GPT returns a confidence score with its review (e.g., 0.6), but the workflow accepts any `STATUS: APPROVED` regardless of confidence level. A low-confidence approval (e.g., 0.3) means GPT is uncertain but the workflow proceeds anyway.

**Risk:**
- Low-confidence approvals may miss bugs
- No quality gate based on review certainty
- Silent failures when GPT is unsure

**Fix Required:**
Add confidence threshold logic to approval handling:

```markdown
### Confidence Threshold Rules

After GPT returns STATUS: APPROVED:
1. Parse confidence score from response
2. If confidence >= 0.7: Proceed normally
3. If confidence 0.5-0.69: Log warning, proceed with caution
4. If confidence 0.4-0.49: Pause for human review before proceeding
5. If confidence < 0.4: Treat as NEEDS_REVISION, require re-review or human override
```

**Implementation:**
```typescript
const CONFIDENCE_THRESHOLDS = {
  AUTO_APPROVE: 0.7,      // High confidence - proceed
  WARN_APPROVE: 0.5,      // Moderate - approve with warning
  HUMAN_REVIEW: 0.4,      // Low - pause for human
  REJECT: 0.0             // Below 0.4 - reject approval
};

function handleApproval(status: string, confidence: number) {
  if (status !== 'APPROVED') return 'NEEDS_REVISION';

  if (confidence >= CONFIDENCE_THRESHOLDS.AUTO_APPROVE) {
    return 'APPROVED';
  } else if (confidence >= CONFIDENCE_THRESHOLDS.WARN_APPROVE) {
    log('WARNING: Moderate confidence approval');
    return 'APPROVED_WITH_WARNING';
  } else if (confidence >= CONFIDENCE_THRESHOLDS.HUMAN_REVIEW) {
    return 'NEEDS_HUMAN_REVIEW';
  } else {
    return 'REJECTED_LOW_CONFIDENCE';
  }
}
```

**Files to Update:**
- `.claude/agents/orchestrator-agent.md`
- `.claude/commands/implement.md`
- `.claude/commands/spec-design.md`

---

---

## 9. Scoped CLAUDE.md Not Updated With Learnings

**Priority:** High
**Discovered:** 2026-01-15 after Batch 1 approval

**Problem:**
The GPT review found a "minor layering concern (type import from infra to app layer)" but this learning was NOT appended to `packages/backend/CLAUDE.md`.

The orchestrator-agent.md states:
> "After EVERY GPT review that contains recommendations, you MUST append learnings"

But the append step was skipped.

**Evidence:**
```bash
# apps/web/CLAUDE.md - Has Epic 19.5 learnings (previous epic) ✅
# packages/backend/CLAUDE.md - Empty, no Epic 20 learnings ❌
# tasks/CLAUDE.md - Empty ❌
```

**Impact:**
- Institutional memory lost
- Same issues may recur in future epics
- Defeats purpose of GPT review feedback loop

**Possible Causes:**
1. Workflow only appends on `NEEDS_REVISION`, not on `APPROVED` with minor concerns
2. Workflow skips append step when moving to next batch
3. Minor concerns below severity threshold not captured

**Fix Required:**
1. Append learnings after ANY GPT review with findings (regardless of approval status)
2. Capture all severity levels: CRITICAL, HIGH, MEDIUM, LOW, and minor concerns
3. Add verification step: check if CLAUDE.md was updated before proceeding

**Implementation:**
```markdown
### Post-Review Learning Capture

After GPT review completes:
1. Parse response for ANY recommendations/concerns (not just REQUIRED CHANGES)
2. If findings exist:
   a. Determine target CLAUDE.md based on file paths
   b. Format learnings as markdown
   c. Append to appropriate CLAUDE.md
   d. Verify append succeeded
3. Only then proceed to next batch/phase
```

**Files to Update:**
- `.claude/agents/orchestrator-agent.md`
- `.claude/commands/implement.md`

---

---

## 10. Re-Review After Fixes Not Enforced

**Priority:** Critical
**Discovered:** 2026-01-15 after Batch 2 fixes

**Problem:**
The workflow announced it would run a final GPT review after fixing P2 issues, but didn't actually execute it:

```
Agent said: "All 943 unit tests pass. Now let me update the orchestrator state
            and run a final GPT review to confirm the fixes."

Agent did:  Updated state → "Sprint 1 complete!" → Spawned Batch 3 agents
            (skipped the re-review)
```

**Evidence:**
- `ba8601a.output` (14:00): Initial review with P2 findings
- Empty files (14:03-14:04): No re-review ran
- Batch 3 agents spawned (14:05): Moved on without verification

**Impact:**
- P2 fixes not verified by GPT
- Bugs may have been introduced during fixes
- Defeats purpose of review loop
- Quality gate bypassed

**Root Cause:**
- No enforcement mechanism to verify re-review actually ran
- Passing unit tests treated as sufficient (should be necessary but not sufficient)
- State transition allowed without re-review completion proof

**Fix Required:**
Add mandatory re-review verification:

```markdown
### Re-Review Enforcement

After fixing GPT findings:
1. Set state: `status: "pending_re_review"`, `reReviewRequired: true`
2. Run GPT re-review
3. Only clear `reReviewRequired` when GPT returns `STATUS: APPROVED`
4. Block batch completion until `reReviewRequired === false`
5. Log re-review result to `.review-log.md`

### State Guards
- Cannot transition to next batch if `reReviewRequired === true`
- Cannot mark story complete until re-review passes
- Tests passing is necessary but NOT sufficient for approval
```

**Files to Update:**
- `.claude/agents/orchestrator-agent.md`
- `.claude/commands/implement.md`

---

## 11. Opus Intermediate Review for Non-GPT Batches

**Priority:** Medium
**Discovered:** 2026-01-15 during Batch 4 monitoring

**Problem:**
Currently Opus only reviews as a fallback when GPT is rate limited. Batches that don't trigger GPT review (due to Option A batching) get no review at all until the batch group completes.

**Current Flow:**
```
Batch 4a → No review
Batch 4b → No review
Batch 4c → GPT deep review (batch group complete)
```

**Desired Flow:**
```
Batch 4a → Opus light review
Batch 4b → Opus light review
Batch 4c → GPT deep review (batch group complete)
```

**Benefits:**
- Catches issues earlier before they compound
- Different perspective (Opus vs GPT may catch different things)
- Still maintains GPT as primary deep reviewer

**Implementation:**
1. After each batch completes, check if GPT review is due
2. If NOT due → spawn Opus code-review-agent for light review
3. If due → spawn GPT for deep review
4. Opus reviews are advisory - don't block on low confidence

**Files to Update:**
- `.claude/agents/orchestrator-agent.md`
- `.claude/commands/implement.md`

---

## 12. Codex MCP needs_follow_up Loop Causes Crashes

**Priority:** Critical
**Discovered:** 2026-01-15 during Sprint 3 GPT review (3rd crash)

**Problem:**
Codex MCP server enters a `needs_follow_up: true` loop during GPT reviews:

```
codex_core::codex: needs_follow_up: true  (repeated ~50+ times over 5+ minutes)
```

**What happens:**
1. Codex MCP connects successfully
2. GPT starts processing review
3. GPT keeps flagging `needs_follow_up: true` internally
4. Each iteration logs an ERROR message
5. After ~5+ minutes, Cursor runs out of memory or hits timeout and crashes

**Evidence:**
- 3 crashes during GPT handoff in Epic 20
- One successful run took 5m 32s when `needs_follow_up` finally became `false`
- Crashes happen when loop doesn't resolve quickly

**Workaround:**
Use Bash fallback instead of MCP:
```bash
# CORRECT syntax:
codex exec -m gpt-5.2 -s read-only --json "Your review prompt"

# WRONG syntax (doesn't work):
codex --prompt "..." --approval-policy never
```

**Permanent Fix Options:**
1. Default to Bash fallback for code reviews (bypass MCP)
2. Add timeout to MCP calls (kill after 3 min, fall back to Bash)
3. Reduce prompt size to speed up GPT response
4. Use Opus fallback after 2 min of MCP waiting

**Files to Update:**
- `.claude/agents/orchestrator-agent.md` - Default to Bash for reviews
- `.mcp.json` - Consider removing codex from MCP if unreliable

---

## 13. Uncommitted Changes Accumulate Across Reviews

**Priority:** High
**Discovered:** 2026-01-15 during Sprint 3 GPT review

**Problem:**
`codex review --uncommitted` reviews the entire git diff - ALL uncommitted changes, not just changes since last review. If the workflow never commits approved batches:

- Sprint 1 changes: reviewed ✅ (but still uncommitted)
- Sprint 2 changes: reviewed ✅ (but still uncommitted)
- Sprint 3 review: GPT sees Sprint 1 + 2 + 3 changes combined

**Evidence:**
```bash
git diff --stat | tail -5
→ 45 files changed, 3666 insertions(+), 990 deletions(-)
```

All Epic 20 work (Sprints 1-3) being re-reviewed every time.

**Impact:**
- Wasted tokens - Re-reviewing already-approved code
- Wasted API quota - Each review gets bigger
- Confusion - GPT might flag issues in already-approved code
- Slower reviews - More code = longer processing time

**Fix Required (Two-Part Solution):**

### Part A: Structured 7-Section Prompt Format (Primary Fix)

Instead of relying on `--uncommitted` to determine scope, use a structured prompt that tells GPT exactly what to review. Based on [jarrodwatts/claude-delegator](https://github.com/jarrodwatts/claude-delegator) patterns:

```bash
codex review - <<'EOF'
## TASK
Review Batch {N} implementation for Epic {X}.

## EXPECTED OUTCOME
Identify correctness, security, architecture, and pattern issues in THIS batch only.

## CONTEXT
Stories in this batch:
- {story_id}: {title}
- {story_id}: {title}

Files changed (THIS BATCH ONLY):
- {file_path} - {change_description}
- {file_path} - {change_description}

Test results: {pass/fail}
Lint results: {pass/fail}

## CONSTRAINTS
- Clean architecture (domain → application → infrastructure)
- Existing codebase patterns
- No regressions to existing functionality

## MUST DO
- Focus ONLY on the files listed above
- Search codebase for conflicts with existing code
- Verify changes don't break existing patterns

## MUST NOT DO
- Review files not in this batch
- Flag issues in previously-approved code
- Suggest stylistic changes without substance

## OUTPUT FORMAT
STATUS: APPROVED or STATUS: NEEDS_REVISION

[If NEEDS_REVISION]
CRITICAL: [blocks approval]
HIGH: [significant risk]
MEDIUM: [tech debt]
LOW: [nice to have]

CONFIDENCE: [0.0-1.0]
EOF
```

This way GPT knows exactly what to review, even if more uncommitted files exist.

### Part B: Commit After Approval (Secondary Fix)

Additionally, commit approved batches to keep the git diff clean:

```markdown
### After GPT approves a batch:
1. Stage the batch's files: `git add <files>`
2. Commit with message: `feat(epic-{N}): batch {X} - stories {list}`
3. Next `--uncommitted` review only sees NEW changes
```

**Files to Update:**
- `.claude/agents/orchestrator-agent.md`
- `.claude/commands/implement.md`
- `.claude/commands/spec-design.md`

---

## Action Items Summary

| # | Issue | Priority | Files |
|---|-------|----------|-------|
| 1 | State checkpointing flaw | High | orchestrator-agent.md, implement.md |
| 2 | MCP empty content | Medium | .mcp.json, investigate logs |
| 3 | Bash syntax outdated | High | orchestrator-agent.md, implement.md, spec-design.md |
| 4 | gpt-5.2-high option | Low | .mcp.json, orchestrator-agent.md |
| 5 | Orphaned codex processes | High | orchestrator-agent.md, implement.md |
| 6 | Review completion detection fragile | High | orchestrator-agent.md, implement.md |
| 7 | macOS timeout unavailable | Medium | orchestrator-agent.md |
| 8 | Confidence threshold for approvals | High | orchestrator-agent.md, implement.md, spec-design.md |
| 9 | CLAUDE.md not updated with learnings | High | orchestrator-agent.md, implement.md |
| 10 | Re-review after fixes not enforced | Critical | orchestrator-agent.md, implement.md |
| 11 | Opus intermediate review for non-GPT batches | Medium | orchestrator-agent.md, implement.md |
| 12 | Codex MCP needs_follow_up loop causes crashes | Critical | .mcp.json, orchestrator-agent.md |
| 13 | Uncommitted changes accumulate across reviews | High | orchestrator-agent.md, implement.md |

---

*Created: 2026-01-15*
*Status: Pending (complete Epic 20 first)*
