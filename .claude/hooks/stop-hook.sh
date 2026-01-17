#!/bin/bash
# Stop Hook - Prevents premature exit during automated workflow
#
# This hook intercepts agent exit attempts and checks if the workflow scope is complete.
# If not complete, it re-injects a prompt to continue.
#
# Usage: Called automatically by Claude Code on Stop event

set -e

# Find the most recent orchestrator state file
find_state_file() {
    local state_file=""

    # Look in tasks/epic-* directories for .orchestrator-state.json
    for dir in tasks/epic-*/; do
        if [[ -f "${dir}.orchestrator-state.json" ]]; then
            state_file="${dir}.orchestrator-state.json"
        fi
    done

    echo "$state_file"
}

STATE_FILE=$(find_state_file)

# If no state file, allow exit (not in automated workflow)
if [[ -z "$STATE_FILE" || ! -f "$STATE_FILE" ]]; then
    exit 0
fi

# Read state
PHASE=$(jq -r '.phase' "$STATE_FILE" 2>/dev/null || echo "unknown")
STATUS=$(jq -r '.status' "$STATE_FILE" 2>/dev/null || echo "unknown")

# Check if workflow is complete
if [[ "$PHASE" == "complete" || "$STATUS" == "complete" ]]; then
    # Workflow done, allow exit
    exit 0
fi

# Check for error/stuck status (allow exit but with warning)
if [[ "$STATUS" == "error" || "$STATUS" == "stuck" ]]; then
    echo "WARNING: Workflow exiting with status: $STATUS"
    echo "Check .stuck-log.md or .review-log.md for details"
    exit 0
fi

# Workflow not complete - output continuation prompt
echo "WORKFLOW_INCOMPLETE"
echo "Current phase: $PHASE"
echo "Current status: $STATUS"

# Return non-zero to signal Claude Code to continue
# The orchestrator should see this and continue the workflow
exit 1
