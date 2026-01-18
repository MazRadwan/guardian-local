#!/bin/bash
# Ralph Wiggum Stop Hook - Keeps Claude running until completion promise found
#
# This hook intercepts exit attempts and checks for completion promises in output.
# If no promise found, it blocks exit and re-injects the prompt.
#
# Exit Methods:
#   1. Output an exit promise (EPIC_COMPLETE, PLAN_APPROVED, etc.)
#   2. Press ESC when Claude output is short/empty (detected as user interrupt)
#   3. Run: touch /tmp/claude-force-exit (then press ESC)
#   4. Press ESC 5 times (max iterations safety net)
#
# Exit Promises (any of these allow exit):
#   EPIC_COMPLETE, PLAN_APPROVED, PLAN_APPROVED_WITH_WARNINGS,
#   PAUSE_REQUESTED, EXIT_MODE, PLAN_STUCK_FEASIBILITY, PLAN_STUCK_INTEGRATION
#
# Usage: Automatically called by Claude Code on Stop event
# Config: Command frontmatter hooks (not global settings.json)

set -e

# ═══════════════════════════════════════════════════════════════════════════════
# CONFIGURATION
# ═══════════════════════════════════════════════════════════════════════════════

MAX_ITERATIONS="${MAX_ITERATIONS:-5}"
ITERATION_FILE="/tmp/claude-workflow-iterations"
FORCE_EXIT_FILE="/tmp/claude-force-exit"

# Exit promises that allow clean exit
EXIT_PROMISES="EPIC_COMPLETE|PLAN_APPROVED|PLAN_APPROVED_WITH_WARNINGS|PAUSE_REQUESTED|EXIT_MODE|PLAN_STUCK_FEASIBILITY|PLAN_STUCK_INTEGRATION"

# ═══════════════════════════════════════════════════════════════════════════════
# FORCE EXIT CHECK (User can touch /tmp/claude-force-exit to break loop)
# ═══════════════════════════════════════════════════════════════════════════════

if [ -f "$FORCE_EXIT_FILE" ]; then
    echo "✓ Force exit signal found. Exiting."
    rm -f "$FORCE_EXIT_FILE" "$ITERATION_FILE"
    exit 0
fi

# ═══════════════════════════════════════════════════════════════════════════════
# EMPTY OUTPUT CHECK (User likely pressed ESC to interrupt)
# ═══════════════════════════════════════════════════════════════════════════════

if [ -z "$CLAUDE_OUTPUT" ] || [ ${#CLAUDE_OUTPUT} -lt 50 ]; then
    echo "✓ Detected user interrupt (empty/short output). Exiting."
    rm -f "$ITERATION_FILE"
    exit 0
fi

# ═══════════════════════════════════════════════════════════════════════════════
# ITERATION TRACKING (Safety net for runaway loops)
# ═══════════════════════════════════════════════════════════════════════════════

if [ -f "$ITERATION_FILE" ]; then
    count=$(cat "$ITERATION_FILE")
    count=$((count + 1))
else
    count=1
fi
echo "$count" > "$ITERATION_FILE"

# Safety: max iterations prevents infinite loops
if [ "$count" -ge "$MAX_ITERATIONS" ]; then
    echo "⚠️  Max iterations ($MAX_ITERATIONS) reached. Forcing exit."
    echo "   Check .orchestrator-state.json for workflow status."
    rm -f "$ITERATION_FILE"
    exit 0  # Allow exit
fi

# ═══════════════════════════════════════════════════════════════════════════════
# CHECK FOR EXIT PROMISES IN CLAUDE'S OUTPUT
# ═══════════════════════════════════════════════════════════════════════════════

# CLAUDE_OUTPUT is provided by Claude Code containing the last response
if [ -n "$CLAUDE_OUTPUT" ]; then
    if echo "$CLAUDE_OUTPUT" | grep -qE "$EXIT_PROMISES"; then
        matched=$(echo "$CLAUDE_OUTPUT" | grep -oE "$EXIT_PROMISES" | head -1)
        echo "✓ Exit promise found: $matched"
        rm -f "$ITERATION_FILE"
        exit 0  # Allow exit
    fi
fi

# ═══════════════════════════════════════════════════════════════════════════════
# FALLBACK: CHECK STATE FILE FOR COMPLETION
# ═══════════════════════════════════════════════════════════════════════════════

# Find the most recent state file
find_state_file() {
    local state_file=""
    for dir in tasks/epic-*/; do
        if [[ -f "${dir}.orchestrator-state.json" ]]; then
            state_file="${dir}.orchestrator-state.json"
        fi
    done
    echo "$state_file"
}

STATE_FILE=$(find_state_file)

if [[ -n "$STATE_FILE" && -f "$STATE_FILE" ]]; then
    PHASE=$(jq -r '.phase // "unknown"' "$STATE_FILE" 2>/dev/null)
    STATUS=$(jq -r '.status // "unknown"' "$STATE_FILE" 2>/dev/null)

    # Check if workflow is complete via state file
    if [[ "$PHASE" == "complete" || "$STATUS" == "complete" ]]; then
        echo "✓ Workflow complete (via state file)"
        rm -f "$ITERATION_FILE"
        exit 0
    fi

    # Check for error/stuck status
    if [[ "$STATUS" == "error" || "$STATUS" == "stuck" ]]; then
        echo "⚠️  Workflow status: $STATUS"
        echo "   Check .stuck-log.md for details"
        rm -f "$ITERATION_FILE"
        exit 0
    fi

    echo "→ Workflow in progress: phase=$PHASE, status=$STATUS"
fi

# ═══════════════════════════════════════════════════════════════════════════════
# NOT COMPLETE - BLOCK EXIT AND CONTINUE
# ═══════════════════════════════════════════════════════════════════════════════

echo ""
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║  WORKFLOW INCOMPLETE - Iteration $count/$MAX_ITERATIONS                    ║"
echo "║                                                                ║"
echo "║  No exit promise found. Continuing workflow...                 ║"
echo "║                                                                ║"
echo "║  Say 'pause' to exit cleanly with state preserved             ║"
echo "║  Say 'exit' to return to normal chat                          ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# Exit code 2 signals Claude Code to re-run with same prompt
exit 2
