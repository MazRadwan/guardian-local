# Autonomous QA/Bug-Fixing System

**Version:** 1.0.0
**Created:** 2025-11-15
**Purpose:** Semi-autonomous system for testing Guardian UI and fixing bugs iteratively

---

## Overview

This system implements an **OODA Loop** (Observe-Orient-Decide-Act) with hierarchical agents to autonomously:
1. **Test** the Guardian UI against UX specifications
2. **Detect** bugs using Playwright
3. **Analyze** root causes systematically
4. **Plan** fix strategies
5. **Implement** fixes with code review
6. **Verify** quality gates pass
7. **Iterate** until all bugs fixed or escalation needed

---

## Architecture

```
┌─────────────────────────────────────────┐
│        Orchestrator (State Machine)     │
│  - Coordinates all agents               │
│  - Tracks state                         │
│  - Enforces circuit breakers            │
│  - Handles rollbacks                    │
└──────────────┬──────────────────────────┘
               │
       ┌───────┴────────┐
       │   OODA LOOP    │
       └───────┬────────┘
               │
    ┌──────────┼──────────┬──────────┐
    │          │          │          │
    ▼          ▼          ▼          ▼
┌─────────┐┌─────────┐┌─────────┐┌─────────┐
│OBSERVE  ││ORIENT   ││DECIDE   ││  ACT    │
│(Test)   ││(Analyze)││(Plan)   ││(Fix)    │
└────┬────┘└────┬────┘└────┬────┘└────┬────┘
     │          │          │          │
     └──────────┴──────────┴──────────┘
                    │
                    ▼
              ┌──────────┐
              │ VERIFY   │
              │ (QA Gate)│
              └─────┬────┘
                    │
              ┌─────┴─────┐
              │           │
              ▼           ▼
           ┌──────┐   ┌──────┐
           │ DONE │   │RETRY │
           └──────┘   └──────┘
```

---

## How to Use

### Quick Start

**From main Claude session:**

```markdown
User: "Test the Guardian UI and fix any bugs autonomously"

Main Agent: Invokes orchestrator
  Task(
    subagent_type: "general-purpose",
    description: "Run autonomous QA system",
    prompt: "
      Load: .claude/autonomous-qa/orchestrator.md

      You are now the Orchestrator. Follow the state machine.

      User request: Test Guardian UI, fix all bugs

      Start from IDLE state, run full QA scan.
    "
  )
```

**Orchestrator takes over and runs the full OODA loop automatically.**

---

### System Flow Example

**User Request:** "Test the UI"

```
Orchestrator (IDLE):
  → Loads state.json
  → Sets bugs_queue = ["full-scan"]
  → Transitions to OBSERVE
  → Invokes 1-observe.md

1-OBSERVE Agent:
  → Runs Playwright tests on localhost:3000
  → Finds BUG-001, BUG-002, BUG-003
  → Returns to orchestrator

Orchestrator (OBSERVE → ORIENT):
  → Updates state: current_bug = "BUG-001"
  → Invokes 2-orient.md

2-ORIENT Agent:
  → Analyzes BUG-001 root cause
  → Traces to backend ChatServer.ts:415
  → Returns root cause to orchestrator

Orchestrator (ORIENT → DECIDE):
  → Creates rollback tag
  → Invokes 3-decide.md

3-DECIDE Agent:
  → Plans fix strategy
  → Selects "backend-title-generation"
  → Returns plan to orchestrator

Orchestrator (DECIDE → ACT):
  → Determines bug type: backend
  → Invokes 4-act-backend.md

4-ACT-BACKEND Agent:
  → Implements title generation
  → Writes tests
  → Invokes code-reviewer → APPROVED
  → Commits changes
  → Returns to orchestrator

Orchestrator (ACT → VERIFY):
  → Invokes 5-verify.md

5-VERIFY Agent:
  → Runs all tests → PASS
  → Checks regressions → NONE
  → Checks console errors → NONE
  → Final code review → APPROVED
  → All gates PASS
  → Returns: DONE

Orchestrator (VERIFY → DONE):
  → Marks BUG-001 as FIXED
  → Moves to BUG-002
  → Repeats cycle...

After BUG-003 fixed:
  → Reports to user: "✅ Fixed 3 bugs. All tests passing."
```

---

## Directory Structure

```
.claude/autonomous-qa/
├── README.md                 # This file
├── orchestrator.md           # Main state machine coordinator
├── state.json                # Current state (mutable)
├── history.jsonl             # Append-only log (audit trail)
│
├── agents/                   # Specialized agents
│   ├── 1-observe.md          # Testing & bug detection (Playwright)
│   ├── 2-orient.md           # Root cause analysis
│   ├── 3-decide.md           # Fix planning & strategy
│   ├── 4-act-ui.md           # Frontend implementation
│   ├── 4-act-backend.md      # Backend implementation
│   ├── 4-act-integration.md  # Cross-layer implementation
│   └── 5-verify.md           # Quality gate & regression testing
│
├── config/                   # Configuration
│   ├── rules.json            # Quality gates, circuit breakers
│   └── escalation.json       # Escalation triggers and format
│
└── workflows/                # Workflow definitions
    ├── fix-ui-bug.yaml       # Frontend bug workflow
    ├── fix-backend-bug.yaml  # Backend bug workflow
    └── fix-integration-bug.yaml  # Integration bug workflow
```

---

## Key Features

### ✅ State Persistence
- Current progress saved in `state.json`
- Complete history logged in `history.jsonl`
- Can resume after interruption

### ✅ Failure Memory
- Failed approaches tracked
- Never repeats same failed strategy
- Learns from past iterations

### ✅ Quality Gates
- All tests must pass
- No console errors allowed
- No regressions permitted
- Code review required
- UX spec compliance verified

### ✅ Circuit Breakers
- Max 5 iterations per bug
- Max 30 minutes total time
- Max 10 files changed
- Auto-escalates when limits reached

### ✅ Automatic Rollback
- Git tag created before each fix attempt
- Auto-rollback on verification failure
- Clean state for retry

### ✅ Isolation
- Separate from main Epic agents
- No interference with development workflow
- Self-contained system

---

## State Machine

```
IDLE
  ↓ (bug loaded)
OBSERVE ──────> (bugs found)
  ↓
ORIENT ────────> (root cause identified)
  ↓
DECIDE ────────> (strategy selected)
  ↓
ACT ───────────> (fix implemented)
  ↓
VERIFY
  ├─> DONE (all gates pass)
  ├─> ORIENT (retry - gates failed, iteration < max)
  └─> ESCALATE (max iterations OR unrecoverable)
```

---

## Configuration

### Quality Gates (config/rules.json)

**All gates must pass for bug to be marked FIXED:**
1. All tests pass (backend + frontend + e2e)
2. No console errors in browser
3. No regressions detected
4. Code review approved
5. UX spec compliance verified

**Customize:**
Edit `config/rules.json` to adjust gates, timeouts, and thresholds.

### Circuit Breakers

**Automatic escalation when:**
- 5+ fix attempts on same bug
- 30+ minutes elapsed
- 10+ files changed
- 3+ consecutive failures

**Customize:**
Edit `config/rules.json` circuit_breakers section.

### Escalation Triggers

**System escalates when:**
- Can't determine root cause
- No viable strategy exists
- Breaking multiple features
- Security concerns
- Architectural change needed

**Customize:**
Edit `config/escalation.json` to add/remove triggers.

---

## Workflows

### UI Bug Workflow
**Use when:** Bug is frontend-only (styling, components, state)
**File:** `workflows/fix-ui-bug.yaml`
**ACT agent:** 4-act-ui.md
**Max iterations:** 5

### Backend Bug Workflow
**Use when:** Bug is backend-only (services, database, API)
**File:** `workflows/fix-backend-bug.yaml`
**ACT agent:** 4-act-backend.md
**Max iterations:** 5

### Integration Bug Workflow
**Use when:** Bug spans frontend + backend (WebSocket, API contract)
**File:** `workflows/fix-integration-bug.yaml`
**ACT agent:** 4-act-integration.md
**Max iterations:** 3 (higher risk)

---

## Agent Communication Protocol

### Rule: Agents NEVER invoke each other

**Only orchestrator can invoke agents:**

```
✅ CORRECT:
   Orchestrator → invokes → 1-observe.md
   Orchestrator ← receives result
   Orchestrator → invokes → 2-orient.md

❌ WRONG:
   1-observe.md → invokes → 2-orient.md (FORBIDDEN)
```

### Standardized Message Format

**All agents return this JSON:**

```json
{
  "from_agent": "agent-name",
  "to": "orchestrator",
  "status": "success" | "failure" | "escalate",
  "data": { /* agent-specific data */ },
  "next_state": "STATE_NAME",
  "metadata": {
    "timestamp": "ISO-8601",
    "duration_ms": 1500,
    "tools_used": ["tool1", "tool2"]
  }
}
```

---

## State Files

### state.json (Current State)

**Mutable** - Updated after every state transition

```json
{
  "current_bug": "BUG-001",
  "current_state": "ORIENT",
  "iteration": 2,
  "bugs_queue": ["BUG-001", "BUG-002"],
  "bugs_fixed": [],
  "failed_approaches": [
    {
      "bug_id": "BUG-001",
      "approach": "frontend-only-fix",
      "iteration": 1,
      "reason": "Doesn't persist"
    }
  ],
  "rollback_commit": "abc123",
  "rollback_tag": "before-fix-BUG-001-attempt-2",
  "circuit_breaker": {
    "files_changed": 3,
    "consecutive_failures": 0
  }
}
```

### history.jsonl (Audit Trail)

**Immutable** - Append-only log

```jsonl
{"state":"OBSERVE","bug":"BUG-001","iteration":1,"result":"success","bugs_found":3,"timestamp":"2025-11-15T12:00:00Z"}
{"state":"ORIENT","bug":"BUG-001","iteration":1,"result":"success","root_cause":"backend","timestamp":"2025-11-15T12:05:00Z"}
{"state":"DECIDE","bug":"BUG-001","iteration":1,"result":"success","strategy":"backend-title-gen","timestamp":"2025-11-15T12:10:00Z"}
{"state":"ACT","bug":"BUG-001","iteration":1,"result":"success","commit":"abc123","timestamp":"2025-11-15T12:15:00Z"}
{"state":"VERIFY","bug":"BUG-001","iteration":1,"result":"failure","reason":"regression","timestamp":"2025-11-15T12:20:00Z"}
{"state":"ORIENT","bug":"BUG-001","iteration":2,"result":"success","root_cause":"same","timestamp":"2025-11-15T12:22:00Z"}
{"state":"DECIDE","bug":"BUG-001","iteration":2,"result":"success","strategy":"backend-title-gen-v2","timestamp":"2025-11-15T12:25:00Z"}
{"state":"ACT","bug":"BUG-001","iteration":2,"result":"success","commit":"def456","timestamp":"2025-11-15T12:30:00Z"}
{"state":"VERIFY","bug":"BUG-001","iteration":2,"result":"success","decision":"DONE","timestamp":"2025-11-15T12:35:00Z"}
```

---

## Troubleshooting

### Issue: Orchestrator stuck in loop

**Symptom:** Same state repeating
**Cause:** Agent returning same result
**Fix:**
1. Check state.json for current_state
2. Read history.jsonl for pattern
3. Manually transition to ESCALATE
4. Review agent logic

### Issue: Tests keep failing

**Symptom:** VERIFY always fails
**Cause:** Flaky tests or environment issue
**Fix:**
1. Run tests manually: `pnpm test`
2. Check if dev servers running
3. Check database state
4. May need manual intervention

### Issue: Agent not returning result

**Symptom:** Orchestrator waiting indefinitely
**Cause:** Agent crashed or timeout
**Fix:**
1. Check agent output for errors
2. Manually update state.json
3. Transition to ESCALATE
4. Report issue

### Issue: Infinite iterations

**Symptom:** Same bug retried >5 times
**Cause:** Circuit breaker not working
**Fix:**
1. Check config/rules.json max_iterations
2. Manually set state.current_state = "ESCALATE"
3. Review orchestrator logic

---

## Manual Overrides

### Force Escalation

```json
// Edit state.json
{
  "current_state": "ESCALATE",
  "escalation_reason": "manual_override",
  "awaiting_user_input": true
}
```

### Skip Bug

```json
// Edit state.json
{
  "bugs_queue": ["BUG-002", "BUG-003"],  // Remove BUG-001
  "bugs_failed": ["BUG-001"],
  "current_bug": null,
  "current_state": "IDLE"
}
```

### Reset System

```json
// Replace state.json with initial state
{
  "current_bug": null,
  "current_state": "IDLE",
  "iteration": 0,
  "bugs_queue": [],
  "failed_approaches": [],
  "rollback_commit": null
}
```

---

## Safety Mechanisms

### Circuit Breakers
- **Max iterations:** 5 attempts per bug
- **Max time:** 30 minutes total
- **Max files:** 10 files changed per fix
- **Max failures:** 3 consecutive failures

### Quality Gates
- **All tests pass:** 100% pass rate required
- **No console errors:** Zero tolerance
- **No regressions:** Must not break existing features
- **Code review:** Must get approval
- **UX compliance:** Must match specification

### Rollback
- **Automatic:** On verification failure
- **Git tags:** Clean rollback points
- **Stateful:** Can retry with different approach

---

## Workflows

### UI Bug Workflow
```yaml
OBSERVE → ORIENT → DECIDE → ACT(ui) → VERIFY
```
- Uses: 4-act-ui.md
- Quality gates: Frontend-focused
- Max iterations: 5

### Backend Bug Workflow
```yaml
OBSERVE → ORIENT → DECIDE → ACT(backend) → VERIFY
```
- Uses: 4-act-backend.md
- Quality gates: Backend-focused + security
- Max iterations: 5

### Integration Bug Workflow
```yaml
OBSERVE → ORIENT → DECIDE → ACT(integration) → VERIFY
```
- Uses: 4-act-integration.md
- Quality gates: Most comprehensive
- Max iterations: 3 (higher risk)

---

## Dependencies

### Required Tools
- **Playwright MCP:** Browser automation and testing
- **Chrome DevTools MCP:** Console inspection
- **Code Reviewer Agent:** `.claude/agents/code-reviewer/`

### Required Skills
- **chatbot-ux-spec:** `.claude/skills/chatbot-ux-spec/`
- **root-cause-tracing:** `.claude/skills/root-cause-tracing/`
- **receiving-code-review:** `.claude/skills/receiving-code-review/`

### Required Services
- **Dev servers:** localhost:3000 (frontend), localhost:8000 (backend)
- **Database:** PostgreSQL running
- **Test database:** Separate test DB for E2E tests

---

## Monitoring

### Check Current State

```bash
cat .claude/autonomous-qa/state.json | jq '.current_state, .current_bug, .iteration'
```

### View History

```bash
cat .claude/autonomous-qa/history.jsonl | tail -20
```

### Check Progress

```bash
# Count bugs fixed
cat .claude/autonomous-qa/state.json | jq '.bugs_fixed | length'

# Count bugs failed
cat .claude/autonomous-qa/state.json | jq '.bugs_failed | length'

# Current iteration
cat .claude/autonomous-qa/state.json | jq '.iteration'
```

---

## Best Practices

### When to Use
✅ Multiple bugs need fixing
✅ Want autonomous iteration (test → fix → retest)
✅ Need quality gates enforced
✅ Want failure memory (don't repeat mistakes)

### When NOT to Use
❌ Single trivial bug (faster to fix manually)
❌ Architectural changes needed (requires human decision)
❌ Security-critical fixes (need careful review)
❌ Experimental features (unclear requirements)

### Tips for Success
1. **Start dev servers first** - System needs localhost:3000 running
2. **Clean database** - Remove polluted test data
3. **Review bug report** - Ensure QA_BUG_REPORT.md is accurate
4. **Monitor state.json** - Check progress periodically
5. **Trust the process** - Let system run full cycle before intervening

---

## Extending the System

### Add New Agent

1. Create `agents/X-new-agent.md`
2. Define role and responsibilities
3. Specify input/output format
4. Update orchestrator.md to invoke new agent
5. Test integration

### Add New Quality Gate

1. Edit `config/rules.json`
2. Add gate definition
3. Update 5-verify.md to check gate
4. Test gate enforcement

### Add New Workflow

1. Create `workflows/fix-X-bug.yaml`
2. Define state flow
3. Specify which ACT agent to use
4. Set circuit breaker limits
5. Document in README

---

## Limitations

### Current Limitations
- Cannot handle architectural changes (escalates)
- Requires dev servers running (doesn't start them)
- Limited to 5 iterations (circuit breaker)
- No parallel bug fixing (sequential only)

### Future Enhancements
- Parallel bug fixing (multiple bugs simultaneously)
- Automatic dev server management
- Machine learning from history (predict best strategy)
- Visual regression testing (screenshot comparison)
- Performance benchmarking
- Auto-deployment on success

---

## Success Metrics

### System is working well if:
- ✅ 80%+ bugs fixed without escalation
- ✅ Average 2-3 iterations per bug
- ✅ No infinite loops (circuit breakers working)
- ✅ All quality gates enforced (no bad code merged)
- ✅ Clear audit trail in history.jsonl

### System needs tuning if:
- ⚠️ >50% bugs escalating (gates too strict OR bugs too complex)
- ⚠️ >5 iterations average (strategies not effective)
- ⚠️ Frequent circuit breaker triggers (limits too low)
- ⚠️ Regressions getting through (gates too lenient)

---

## Support

**Questions or Issues?**
1. Check this README first
2. Review orchestrator.md for state machine logic
3. Check state.json for current status
4. Review history.jsonl for audit trail
5. Escalate to user if stuck

---

## Version History

**v1.0.0 (2025-11-15):**
- Initial release
- OODA Loop with 5 specialized agents
- State machine orchestration
- Quality gates and circuit breakers
- Three workflows (UI, Backend, Integration)
- Complete documentation
