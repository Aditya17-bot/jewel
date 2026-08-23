#!/usr/bin/env sh
# Hand the "type src/tryon/*.ts" job to Codex.
#
# Run it yourself - from the Claude Code prompt, `! sh tools/codex-typecheck.sh`, or from
# any terminal in the repo root. Claude cannot launch another autonomous agent with write
# access to the tree; that permission is yours to give.
#
# The brief is in tools/codex-typecheck.md. Codex is scoped to src/tryon/ and told not to
# commit, so the diff is yours to review before anything lands.
set -e

CODEX="$HOME/.codex/.sandbox-bin/codex.exe"
HERE=$(cd "$(dirname "$0")/.." && pwd)

[ -x "$CODEX" ] || { echo "no codex at $CODEX"; exit 1; }

"$CODEX" exec --full-auto \
  -C "$HERE" \
  -o "$HERE/codex-report.md" \
  - < "$HERE/tools/codex-typecheck.md"

echo
echo "----- report -----"
cat "$HERE/codex-report.md"
echo
echo "review with:  git diff --stat  &&  git diff src/tryon"
