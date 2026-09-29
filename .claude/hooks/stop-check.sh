#!/bin/bash
# Stop hook: run lint + typecheck + tests; exit 2 makes Claude keep working until they pass.
input=$(cat)
# Avoid an endless loop: if we already blocked once this turn, let the turn end.
if echo "$input" | grep -q '"stop_hook_active": *true'; then exit 0; fi
cd "$CLAUDE_PROJECT_DIR" || exit 0
[ -f package.json ] || exit 0
out=$(npm run check 2>&1) || { echo "Lint/typecheck/tests failed; fix before finishing:" >&2; echo "$out" | tail -40 >&2; exit 2; }
