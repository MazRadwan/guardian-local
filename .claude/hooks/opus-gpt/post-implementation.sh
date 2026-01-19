#!/bin/bash
# Opus-GPT Post-Implementation Hook - Triggered after specialist agents complete
#
# LIGHTWEIGHT VERSION - No full test suite!
# Only quick verification to prevent workflow hangs.
#
# Usage: Called automatically by Claude Code on SubagentStop for frontend-agent|backend-agent
# Workflow: opus-gpt only

# Don't use set -e - handle errors manually to prevent crashes
# set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

# Timeout for each verification step (seconds)
VERIFY_TIMEOUT=60

# Find the most recent opus-gpt orchestrator state file
find_state_file() {
    local state_file=""

    for dir in "$PROJECT_ROOT"/tasks/epic-*/; do
        if [[ -f "${dir}.orchestrator-state.json" ]]; then
            # Check if this is an opus-gpt workflow
            local workflow
            workflow=$(jq -r '.workflow // "unknown"' "${dir}.orchestrator-state.json" 2>/dev/null)
            if [[ "$workflow" == "opus-gpt" ]]; then
                state_file="${dir}.orchestrator-state.json"
            fi
        fi
    done

    echo "$state_file"
}

STATE_FILE=$(find_state_file)

if [[ -z "$STATE_FILE" || ! -f "$STATE_FILE" ]]; then
    echo "[opus-gpt/post-implementation] No opus-gpt state file found, skipping"
    exit 0
fi

EPIC=$(jq -r '.epic' "$STATE_FILE" 2>/dev/null || echo "unknown")
CURRENT_BATCH=$(jq -r '.currentBatch // "unknown"' "$STATE_FILE" 2>/dev/null)
CURRENT_STORY=$(jq -r '.currentStory // "unknown"' "$STATE_FILE" 2>/dev/null)

echo ""
echo "=== OPUS-GPT IMPLEMENTATION COMPLETE ==="
echo "Epic: $EPIC"
echo "Batch: $CURRENT_BATCH"
echo "Story: $CURRENT_STORY"
echo ""

# Quick verification with timeouts - don't run full test suite!
echo "Running quick verification (${VERIFY_TIMEOUT}s timeout each)..."
echo ""

VERIFICATION_PASSED=true
VERIFICATION_RESULTS=""

# Quick typecheck only (fastest)
echo "Typecheck..."
if timeout "$VERIFY_TIMEOUT" pnpm tsc --noEmit --skipLibCheck 2>&1 | tail -5; then
    VERIFICATION_RESULTS="${VERIFICATION_RESULTS}Typecheck: PASS\n"
else
    VERIFICATION_RESULTS="${VERIFICATION_RESULTS}Typecheck: FAIL/TIMEOUT\n"
    VERIFICATION_PASSED=false
fi

# Quick lint (errors only, no warnings)
echo "Lint..."
if timeout "$VERIFY_TIMEOUT" pnpm lint --quiet 2>&1 | tail -5; then
    VERIFICATION_RESULTS="${VERIFICATION_RESULTS}Lint: PASS\n"
else
    VERIFICATION_RESULTS="${VERIFICATION_RESULTS}Lint: FAIL/TIMEOUT\n"
    VERIFICATION_PASSED=false
fi

# NOTE: Full test suite runs during GPT code review, not here
# This prevents hook from blocking for minutes
echo "(Full tests will run during GPT review)"
VERIFICATION_RESULTS="${VERIFICATION_RESULTS}Tests: DEFERRED_TO_REVIEW\n"

echo ""
echo "Quick Verification Results:"
echo -e "$VERIFICATION_RESULTS"

# Update state
TEMP_FILE=$(mktemp)
if [[ "$VERIFICATION_PASSED" == "true" ]]; then
    if jq '.status = "awaiting_gpt_review" | .verificationPassed = true' "$STATE_FILE" > "$TEMP_FILE" 2>/dev/null; then
        mv "$TEMP_FILE" "$STATE_FILE"
    else
        rm -f "$TEMP_FILE"
    fi
else
    if jq '.status = "awaiting_gpt_review" | .verificationPassed = false' "$STATE_FILE" > "$TEMP_FILE" 2>/dev/null; then
        mv "$TEMP_FILE" "$STATE_FILE"
    else
        rm -f "$TEMP_FILE"
    fi
fi

echo ""
if [[ "$VERIFICATION_PASSED" == "true" ]]; then
    echo "Quick verification PASSED - Ready for GPT-5.2 code review."
else
    echo "Quick verification FAILED - Issues will be included in GPT review."
fi
echo "Status: awaiting_gpt_review"
echo "========================================="
echo ""
