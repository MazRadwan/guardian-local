#!/bin/bash
# Post-Tool Format Hook - Auto-formats code after edits
#
# This hook runs after Edit/Write tools to ensure consistent formatting.
# Inspired by Boris Cherny's PostToolUse formatting pattern.
#
# Usage: Called automatically by Claude Code on PostToolUse for Edit|Write

set -e

# Get the file that was edited from environment or argument
FILE_PATH="${CLAUDE_TOOL_FILE_PATH:-$1}"

if [[ -z "$FILE_PATH" ]]; then
    # No file path provided, skip formatting
    exit 0
fi

# Check if file exists
if [[ ! -f "$FILE_PATH" ]]; then
    exit 0
fi

# Determine file type and format accordingly
case "$FILE_PATH" in
    *.ts|*.tsx|*.js|*.jsx)
        # TypeScript/JavaScript - use prettier
        if command -v prettier &> /dev/null; then
            prettier --write "$FILE_PATH" 2>/dev/null || true
        elif [[ -f "node_modules/.bin/prettier" ]]; then
            node_modules/.bin/prettier --write "$FILE_PATH" 2>/dev/null || true
        fi

        # Also run eslint fix for JS/TS files
        if command -v eslint &> /dev/null; then
            eslint --fix "$FILE_PATH" 2>/dev/null || true
        elif [[ -f "node_modules/.bin/eslint" ]]; then
            node_modules/.bin/eslint --fix "$FILE_PATH" 2>/dev/null || true
        fi
        ;;

    *.json)
        # JSON - use prettier
        if command -v prettier &> /dev/null; then
            prettier --write "$FILE_PATH" 2>/dev/null || true
        elif [[ -f "node_modules/.bin/prettier" ]]; then
            node_modules/.bin/prettier --write "$FILE_PATH" 2>/dev/null || true
        fi
        ;;

    *.md)
        # Markdown - use prettier if available
        if command -v prettier &> /dev/null; then
            prettier --write "$FILE_PATH" 2>/dev/null || true
        elif [[ -f "node_modules/.bin/prettier" ]]; then
            node_modules/.bin/prettier --write "$FILE_PATH" 2>/dev/null || true
        fi
        ;;

    *.css|*.scss)
        # CSS - use prettier
        if command -v prettier &> /dev/null; then
            prettier --write "$FILE_PATH" 2>/dev/null || true
        elif [[ -f "node_modules/.bin/prettier" ]]; then
            node_modules/.bin/prettier --write "$FILE_PATH" 2>/dev/null || true
        fi
        ;;

    *.sh)
        # Shell scripts - use shfmt if available
        if command -v shfmt &> /dev/null; then
            shfmt -w "$FILE_PATH" 2>/dev/null || true
        fi
        ;;

    *)
        # Unknown file type - skip formatting
        ;;
esac

# Silent exit - formatting is a background concern
exit 0
