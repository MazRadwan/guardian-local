#!/bin/bash
# Post-Implementation Hook - Triggered after specialist agents complete
#
# This hook signals that implementation batch is done and:
# 1. Runs verification (tests, lint, typecheck)
# 2. Updates state
# 3. Signals ready for GPT code review
#
# Usage: Called automatically by Claude Code on SubagentStop for frontend-agent|backend-agent

set -e

# Find the most recent orchestrator state file
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

if [[ -z "$STATE_FILE" || ! -f "$STATE_FILE" ]]; then
    echo "No orchestrator state file found"
    exit 0
fi

EPIC=$(jq -r '.epic' "$STATE_FILE")
CURRENT_BATCH=$(jq -r '.currentBatch' "$STATE_FILE")
CURRENT_STORY=$(jq -r '.currentStory' "$STATE_FILE")

echo "IMPLEMENTATION_AGENT_COMPLETE"
echo "Epic: $EPIC"
echo "Batch: $CURRENT_BATCH"
echo "Story: $CURRENT_STORY"
echo ""

# Run verification
echo "Running verification..."
echo ""

VERIFICATION_PASSED=true
VERIFICATION_RESULTS=""

# Run tests
echo "Running tests..."
if pnpm test 2>&1; then
    VERIFICATION_RESULTS="${VERIFICATION_RESULTS}Tests: PASS\n"
else
    VERIFICATION_RESULTS="${VERIFICATION_RESULTS}Tests: FAIL\n"
    VERIFICATION_PASSED=false
fi

# Run lint
echo "Running lint..."
if pnpm lint 2>&1; then
    VERIFICATION_RESULTS="${VERIFICATION_RESULTS}Lint: PASS\n"
else
    # Try auto-fix
    echo "Lint failed, attempting auto-fix..."
    if pnpm lint --fix 2>&1; then
        VERIFICATION_RESULTS="${VERIFICATION_RESULTS}Lint: PASS (after auto-fix)\n"
    else
        VERIFICATION_RESULTS="${VERIFICATION_RESULTS}Lint: FAIL\n"
        VERIFICATION_PASSED=false
    fi
fi

# Run typecheck (if available)
echo "Running typecheck..."
if pnpm typecheck 2>&1 || pnpm tsc --noEmit 2>&1; then
    VERIFICATION_RESULTS="${VERIFICATION_RESULTS}Typecheck: PASS\n"
else
    VERIFICATION_RESULTS="${VERIFICATION_RESULTS}Typecheck: FAIL\n"
    VERIFICATION_PASSED=false
fi

echo ""
echo "Verification Results:"
echo -e "$VERIFICATION_RESULTS"

# Update state
TEMP_FILE=$(mktemp)
if [[ "$VERIFICATION_PASSED" == "true" ]]; then
    jq '.status = "awaiting_gpt_review" | .verificationPassed = true' "$STATE_FILE" > "$TEMP_FILE"
else
    jq '.status = "awaiting_gpt_review" | .verificationPassed = false' "$STATE_FILE" > "$TEMP_FILE"
fi
mv "$TEMP_FILE" "$STATE_FILE"

echo ""
if [[ "$VERIFICATION_PASSED" == "true" ]]; then
    echo "Verification PASSED - Ready for GPT-5.2 code review."
else
    echo "Verification FAILED - Will include failures in GPT review."
fi
echo "Trigger: SEND_TO_GPT_REVIEW"
