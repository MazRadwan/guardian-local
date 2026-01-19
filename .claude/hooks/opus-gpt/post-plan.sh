#!/bin/bash
# Opus-GPT Post-Plan Hook - Triggered after plan-agent completes
#
# This hook signals that planning is done and GPT review should begin.
# Lightweight version - no heavy operations, just state update.
#
# Usage: Called automatically by Claude Code on SubagentStop for plan-agent
# Workflow: opus-gpt only

# Don't use set -e - handle errors manually to prevent crashes
# set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

# Find the most recent orchestrator state file
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
    echo "[opus-gpt/post-plan] No opus-gpt state file found, skipping"
    exit 0
fi

# Update state to indicate planning complete, ready for GPT review
TEMP_FILE=$(mktemp)
if jq '.status = "awaiting_gpt_review" | .planCompleteAt = now' "$STATE_FILE" > "$TEMP_FILE" 2>/dev/null; then
    mv "$TEMP_FILE" "$STATE_FILE"
else
    rm -f "$TEMP_FILE"
    echo "[opus-gpt/post-plan] Failed to update state file"
    exit 0
fi

# Get epic number for logging
EPIC=$(jq -r '.epic' "$STATE_FILE" 2>/dev/null || echo "unknown")

# Count created files (with timeout)
SPRINT_COUNT=$(timeout 5 ls -1 "$PROJECT_ROOT"/tasks/epic-"${EPIC}"/sprint-*.md 2>/dev/null | wc -l | tr -d ' ' || echo "0")
STORY_COUNT=$(timeout 5 ls -1 "$PROJECT_ROOT"/tasks/epic-"${EPIC}"/sprint-*-story-*.md 2>/dev/null | wc -l | tr -d ' ' || echo "0")

echo ""
echo "=== OPUS-GPT PLAN COMPLETE ==="
echo "Epic: $EPIC"
echo "Sprints: $SPRINT_COUNT"
echo "Stories: $STORY_COUNT"
echo "Status: awaiting_gpt_review"
echo "=============================="
echo ""
