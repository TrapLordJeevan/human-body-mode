#!/bin/sh
set -eu
repo=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
project=${1:-"$repo/fixture-java"}
state="$project/.human-body-mode"
mkdir -p "$state/claude-config" "$project/target" "$project/build" "$project/.gradle"
command -v code >/dev/null || { echo "VS Code CLI is required" >&2; exit 1; }
command -v bwrap >/dev/null || { echo "bubblewrap is required" >&2; exit 1; }
command -v claude >/dev/null || { echo "Claude Code is required" >&2; exit 1; }
claude plugin validate --strict "$repo/plugin"
echo "Install the VSIX, open $project in VS Code, and run 'Human Body Mode: Reset Experiment'."
echo "This next command consumes Claude usage and intentionally was not run during packaging."
exec env CLAUDE_CONFIG_DIR="$state/claude-config" bwrap \
  --ro-bind / / --dev-bind /dev /dev --proc /proc --tmpfs /tmp \
  --bind "$state" "$state" --bind "$project/target" "$project/target" \
  --bind "$project/build" "$project/build" --bind "$project/.gradle" "$project/.gradle" \
  --chdir "$project" -- claude --plugin-dir "$repo/plugin" \
  -p "Please read this project and complete the work described in TASKS.md. Preserve existing behaviour, run the tests, and report the result. If you have questions or need clarification, ask me."
