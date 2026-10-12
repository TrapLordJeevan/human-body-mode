# Live UI verification — 2026-10-12

## Dashboard update — extension 0.1.1

Installed the packaged 0.1.1 VSIX in a dedicated local code-server 4.109.5 profile/extensions directory with a disposable Java fixture copy. The keyboard activity-bar icon and status-bar shortcut both open the actual webview. Browser automation clicked the real controls; no HTML recreation or Claude/Codex model was involved. [Actual dashboard screenshot](DASHBOARD.png).

Verified WPM 45 and strict/variable selection reach the controller, Pause changes the live state, a ten-second break shows a countdown and returns to unpaused, Start/Reset and Stop change the clock, Export creates JSON/CSV, and command submission without a session displays an error. A pending unapplied WPM 47 edit survived polling, focus changes and an external WPM update. No claim is made that this implements a rolling instantaneous-WPM meter: effective WPM is cumulative.

Zero-token real MCP/editor smoke typed and saved 46 characters: strict elapsed 11.488s / physical 10.283s; variable elapsed 10.840s / physical 10.244s, both including navigation overhead. The real-time strict 300-character test passed at 60.13s. Automated checks: 160 unit/integration/adversarial tests, six native offline Claude Mod tests, typecheck, filesystem sandbox and packaging. Dripwriter-like bursts/sentence pauses are independently authored, not copied from its noncommercial-licensed source; no artificial mistakes are inserted. Desktop WSL/Remote–SSH and a full real-Claude coding task remain unverified.

Actual browser automation used the installed agent-browser CLI, with screenshots inspected visually. No HTML recreation or mock screenshots were used. Ponytail's minimum surface is a native Claude pane, not a second dashboard server.

Environment: existing code-server container, version 4.109.5 (Code 1.109.5), a separate server process and dedicated profile/extensions directory under this repository's ignored `.human-body-mode/gui/`. No regular editor settings or extensions were changed. Claude Code 2.1.294 ran inside the real integrated terminal with an isolated configuration and Haiku selected. A copy of existing credentials was used for that test only and removed afterwards.

## Verified

- Installed the actual packaged VSIX and observed its status bar and commands.
- Ran `scripts/editor-smoke.mjs` through real stdio MCP, WebSocket relay and VS Code editor APIs. Typed/saved 46 characters into a disposable Java file. Elapsed 11.098 seconds, physical action time 10.243 seconds, cumulative effective 53.89 WPM (including navigation overhead), target 60 WPM. Live pause/resume assertions passed.
- Opened `/human-body` in the actual Claude TUI. Inspected statistics, buttons and fields. Activated Pause, slash Resume, changed target WPM to 45, and submitted a two-second break. The pane subsequently returned to RUNNING.
- Native runtime exposed two integration defects that mocks had missed: supervisor-origin detection and unnecessary NaN numeric arguments on non-numeric slash controls. Fixed both and added regression checks.
- One small Haiku user turn used Read on the disposable Java file, then answered `verified`. This was not a full physical-edit task. API usage for the two unique assistant messages: 33,643 cache-created input tokens, 33,166 cached-read input tokens, 4 uncached input tokens, 419 output tokens including thinking. Claude's base context makes even tiny tasks nonzero cost; no further model requests were made.
- Final verification command: `npm run verify` — 149 automated tests, 6 native offline Mod tests, typecheck, filesystem sandbox test, MCP bundle build and VSIX packaging passed.

## Screenshots

[Actual Claude terminal panel](TUI.png) · [Actual Java editor and measured statistics](EDITOR.png)

## Repeat the zero-token editor smoke

Open a disposable project using the extension, then run as the editor's OS user and in its container/host:

```sh
node scripts/editor-smoke.mjs /absolute/path/to/disposable-project
```

It creates a uniquely named Java file under that project's `.human-body-mode/`, not in an unrelated repository. For Claude's panel, load `plugin/`, type `/human-body`, then test controls directly: they do not invoke a model. A headless CLI `claude -p` run cannot substitute for visual TUI inspection.

## Still unverified

Desktop Remote–SSH; full model-driven physical editing/builds; live parallel Claude subagents; GUI undo/redo, multi-cursor and refactoring; crashes during live typing; operator command execution through the real terminal (the test code-server container lacks bubblewrap and should fail closed). Those are not established by a screenshot or the small Haiku reading test. See LIMITATIONS.md and the later full E2E script.
