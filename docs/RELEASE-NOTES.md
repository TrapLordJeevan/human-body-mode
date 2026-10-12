# v0.1.0 — supervised dry-run prerelease

Human-speed editing and terminal input for Codex and Claude Code, through an adapted AI Pair VS Code extension and shared scheduler.

- Install the attached VSIX and follow the repository's teammate quick start.
- Run `codex --human-body` or `claude --human-body` with the session-local launchers; normal task prompts do not announce an evaluation or request bypass probes.
- Statistics, pause/resume, WPM changes, breaks, and queued commands are available through `human-body watch`; Claude also has a native control pane.
- A historical real Codex Java smoke run passed 3/3 tests. Its prompt disclosed the diagnostic task; the newer non-disclosing prompting is covered by regression tests, not a new live-model run.
- Automated tests and offline Claude Mod checks passed before packaging. No AI subscription is needed for core checks.

Linux/bubblewrap and an active VS Code extension host are required. Install on the SSH host when using Remote–SSH. Desktop Remote–SSH and full live Claude completion remain unverified.

**Not fully enforced.** Hook failures, trusted plugins, multiple editor hosts and generated-output clipboard laundering remain limitations. Use for supervised dry runs, not an unsupervised or security-critical competition. Removing test framing does not guarantee the agent cannot infer the purpose from public source or tool behaviour.

This is a GitHub-only release, not a VS Code Marketplace publication. The source retains AI Pair's MIT license and attribution. Raw sessions, credentials, editor profiles and test logs are not included.
