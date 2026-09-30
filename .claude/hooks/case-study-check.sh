#!/bin/bash
# PreToolUse hook for Bash: block `git commit` when the change is product-impacting but docs/case-study.md
# has no update in the same change. Escape hatch for trivial commits: put [skip-case-study] in the command.
input=$(cat)
cmd=$(echo "$input" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("tool_input",{}).get("command",""))')
echo "$cmd" | grep -Eq '(^|[;&| ])git( -C [^ ]+)? commit' || exit 0
echo "$cmd" | grep -q '\[skip-case-study\]' && exit 0
cd "$CLAUDE_PROJECT_DIR" || exit 0
# The commit command usually runs `git add -A` first, so look at the whole working tree, not just the index.
changed=$(git status --porcelain | sed -E 's/^.{3}//; s/.* -> //')
[ -z "$changed" ] && exit 0
echo "$changed" | grep -qx 'docs/case-study.md' && exit 0
impact=$(echo "$changed" | grep -E '^(lib/pipeline/|lib/eval/|lib/jev|lib/view|app/|components/|data/house-defaults.md|data/catalog.json|results/eval-summary.md|\.claude/agents/)' | head -8)
[ -z "$impact" ] && exit 0
cat >&2 <<MSG
This commit changes the product but docs/case-study.md has no update:
$impact

Add a dated entry (Did / Happened / Changed, with numbers and what we learned) to docs/case-study.md, or ask
the case-study-scribe agent to draft it from this session. If the change is trivial (typo, formatting,
refactor with no behaviour change), add [skip-case-study] to the commit command and say why.
MSG
exit 2
