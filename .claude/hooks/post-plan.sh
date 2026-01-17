#!/bin/bash
# Post-Plan Hook - Triggered after plan-agent completes
#
# This hook signals that planning is done and GPT review should begin.
# It updates the state file and outputs a signal for the orchestrator.
#
# Usage: Called automatically by Claude Code on SubagentStop for plan-agent

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

# Update state to indicate planning complete, ready for GPT review
TEMP_FILE=$(mktemp)
jq '.status = "awaiting_gpt_review" | .planCompleteAt = now' "$STATE_FILE" > "$TEMP_FILE"
mv "$TEMP_FILE" "$STATE_FILE"

# Get epic number for logging
EPIC=$(jq -r '.epic' "$STATE_FILE")

# Count created files
SPRINT_COUNT=$(ls -1 tasks/epic-${EPIC}/sprint-*.md 2>/dev/null | wc -l | tr -d ' ')
STORY_COUNT=$(ls -1 tasks/epic-${EPIC}/sprint-*-story-*.md 2>/dev/null | wc -l | tr -d ' ')

echo "PLAN_AGENT_COMPLETE"
echo "Epic: $EPIC"
echo "Sprints created: $SPRINT_COUNT"
echo "Stories created: $STORY_COUNT"
echo ""
echo "Ready for GPT-5.2 plan review."
echo "Trigger: SEND_TO_GPT_REVIEW"
