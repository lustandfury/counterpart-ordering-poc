#!/bin/bash
# PreToolUse hook for Bash: block `git commit` if gitleaks finds secrets in staged changes.
input=$(cat)
cmd=$(echo "$input" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("tool_input",{}).get("command",""))')
echo "$cmd" | grep -Eq '(^|[;&| ])git( -C [^ ]+)? commit' || exit 0
cd "$CLAUDE_PROJECT_DIR" || exit 0
if ! command -v gitleaks >/dev/null; then
  echo "gitleaks is not installed (brew install gitleaks); refusing to commit without a secret scan." >&2
  exit 2
fi
out=$(gitleaks protect --staged --redact --no-banner 2>&1) || { echo "Secret scan found issues:" >&2; echo "$out" >&2; exit 2; }
