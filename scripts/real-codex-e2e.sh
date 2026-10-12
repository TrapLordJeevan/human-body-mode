#!/bin/sh
set -eu
repo=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
if [ "${1:-}" != "--run" ]; then
  echo "This test consumes Codex usage. Install the VSIX and open the disposable fixture in VS Code first."
  echo "Run: sh scripts/real-codex-e2e.sh --run"
  exit 0
fi
cd "$repo/fixture-java"
echo "Use human-body watch in a second terminal here; reset the clock before entering the task."
echo "Record actual denials and editor/log evidence; a model's report alone is not a passing test."
exec "$repo/bin/codex" --human-body "Please read this project and complete the work described in TASKS.md. Preserve existing behaviour, run the tests, and report the result. If you have questions or need clarification, ask me."
