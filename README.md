# Human Body Mode

Human Body Mode is an adapted AI Pair VS Code extension plus a Claude Code Mod and a Codex CLI adapter. Both agents use the same visible, measured physical-input queue.

**Experimental, supervised dry-run tooling—not a fully enforced security boundary.** Codex completed a small real-editor Java task; full Claude completion and desktop Remote–SSH are not verified. Read [LIMITATIONS.md](LIMITATIONS.md) before comparing results.

## Teammate quick start

Use Linux with Node 20+, bubblewrap, VS Code, and either an existing Codex or Claude Code installation. No Marketplace account is needed.

```sh
git clone https://github.com/TrapLordJeevan/human-body-mode.git
cd human-body-mode
npm ci
npm run build:plugin
```

Download `human-body-mode-0.1.3.vsix` from the [GitHub prerelease](https://github.com/TrapLordJeevan/human-body-mode/releases/tag/v0.1.3), or build it with `npm run package`, then use VS Code's **Extensions → Install from VSIX**. Version 0.1.2 lacks the typing ETA; 0.1.1 has only basic controls; 0.1.0 has no dashboard. **Upgrade/reload at a safe stopping point: reloading disconnects an active editor session.** For Remote–SSH/WSL, install it in the **remote host**, not just your laptop. Open the target project there; the CLI and extension host must run on the same server/container and OS user. Use Bash shell integration and `aiPair.confirmCommands: false`, as in the supplied `config/` examples.

Click the **keyboard icon in the left activity bar**, or the bottom WPM indicator, to open the Human Body Mode dashboard. Alternatively run **Human Body Mode: Open Dashboard** from the command palette. It shows elapsed/physical/queue time, cumulative effective WPM, characters, clipboard operations, commands, blocked attempts, corrections and automatic breaks. Click **Apply profile** to validate/save changes for this workspace; typing settings apply to the next block. The profile survives editor reloads without writing project source or changing global settings. Previously installed windows may retain their old view location; use Open Dashboard or VS Code's View: Reset View Locations if needed.

**Typing ETA** and **characters left** refer to work already in the physical input queue—not finishing the project. The estimate counts down during active typing, freezes the remaining work on manual pause, includes current timed breaks and expected optional input overhead, and labels confirmation/build states. It excludes future AI output, navigation, narration and build execution time. No queued text means **No input queued**, not **Done**. Active blocks retain their original WPM; future queued blocks reflect new settings. ETA polling does not consume the seeded RNG or change throughput. The estimate also appears in Claude's panel, companion terminal and JSON/CSV exports. Optional pauses/mistakes/breaks make it approximate.

Expand **Typing rhythm**, **Short pauses**, **Automatic breaks**, **Mistakes and corrections**, or **Navigation and narration** to adjust every supported parameter, plus the seed. Rhythm includes character/burst variation, burst-length bounds and word/punctuation/bracket/newline/sentence pause weights normalized into target WPM. Optional short pauses use a per-word probability and min/max duration. Automatic breaks use min/max intervals of **scheduled authored-typing time**, shared across all batches/agents, and min/max wall-clock durations; builds, reasoning, correction overhead and idle time do not advance the interval. Set both intervals to 0 to disable. Resume skips the current automatic break.

Optional editor typos use a probability per eligible ASCII letter; false starts use a probability per eligible word start and insert a three-letter wrong prefix. Both are visibly noticed, backspaced and corrected; correction delay and backspace interval are configurable. Selection replacement's first chunk, indentation, punctuation and non-ASCII letters are excluded. Errors and extra pauses/breaks add time **outside** the base WPM budget; inserted wrong letters count toward typed characters. Terminal commands remain correct delayed full-string submissions, without injected mistakes. All optional behaviours are off by default, and **strict mode disables them regardless of profile values**. Manual breaks/navigation still work. This is independently authored, not Dripwriter code and not empirically fitted to humans. Changing the seed resets random state; reloads restart that sequence, not a bit-exact continuation. Export includes the full profile and new metrics.

For a zero-token stress test with a disposable Java project open in the editor: `node scripts/human-profile-smoke.mjs /absolute/path/to/disposable-project`. It enables high error rates, checks exact final text, compiles the newly typed Java file through the sandboxed command queue, then restores the previous runtime profile. Do not run it on a real competition repository.

From this clone, enable the launchers for this shell only, then move to your project:

```sh
export PATH="$PWD/bin:$PATH"
cd /path/to/your/project
codex --human-body
# Or: claude --human-body
```

Ask normally: **“Please read this project and complete the work. If you have questions, ask me.”** In another terminal at the project, `human-body reset` starts the clock before you write your prompt; `human-body watch` shows stats and accepts controls. Claude also offers `/human-body` inside its TUI. Omit the flag for normal operation. The editor backend remains required.

Keep the tool's checkout, operator docs and trial logs outside the target project. Normal agent instructions describe the editor workflow, not a benchmark or competition; they do not ask the agent to probe bypasses. The public source and visible tool behaviour can still reveal or suggest the setup if the agent investigates them—this is **non-disclosing prompting**, not guaranteed blinding.

## Build and verify

Requirements: Linux, Node 20+, npm, bubblewrap, Claude Code 2.1.287+ (validation/tests do not consume model usage), and VS Code 1.105+ for the real editor test.

```sh
npm ci
npm run verify:core  # no Claude installation required
npm run verify
npm run test:timing-real  # intentionally takes about 60 seconds
```

`verify:core` is the portable source/build check. `verify` also needs Claude Code on PATH for its offline Mod checks; those checks do not call a model. `npm run release` builds a source archive and VSIX locally from a clean committed tree; it does not publish or change a remote.

Artifacts are `human-body-mode-0.1.0.vsix` and `plugin/` (including its bundled MCP server).

## Install

```sh
code --install-extension human-body-mode-0.1.0.vsix
claude --plugin-dir "$PWD/plugin"
```

Open only the disposable competition repository in VS Code. Run **Human Body Mode: Reset Experiment**, then ask Claude to start the `pair` MCP session. Settings examples are in `config/`.

### Short toggle and terminal controls

For this shell only (no global configuration change):

```sh
export PATH="$PWD/bin:$PATH"  # run while in this clone
cd /path/to/competition-project
claude --dangerously-skip-permissions --human-body
```

`--human-body` is implemented by our wrapper, not a native Claude flag. Omit it for normal Claude. The wrapper adds the plugin and operating instructions, so your ordinary project-completion prompt works without mentioning pairing. It refuses `--bare`, `--safe-mode`, and extra plugin flags; existing settings or installed plugins can still interfere. This convenience launcher does **not** isolate Claude's filesystem: use the isolated E2E script for enforcement testing.

Inside Claude, `/human-body` opens a native terminal panel: statistics, Pause/Resume, clock Reset/Stop, WPM, timed breaks in seconds, and a queued command field. Controls also work while Claude is working: `/human-body pause`, `/human-body resume`, `/human-body wpm 45`, `/human-body break 300`, `/human-body run git status`. Commands use the same typing queue and allowlist; explicit supervisor entry is their human confirmation. Reset starts the clock; do that **before writing your task prompt**. Stop freezes the competition clock and pauses physical playback; Reset restarts the clock, Resume restarts playback. Pause/break suspends physical input, not model reasoning or already-running builds. WPM changes apply to the next typing block; effective WPM is cumulative, not a rolling instantaneous measure. The panel does not call a model.

The **controls** work over plain SSH in Claude's TUI. The **editing backend still requires** a VS Code window with this extension running on the server, under the same user, with the target project open (normally VS Code Remote–SSH). This is not yet a standalone, no-VS-Code implementation. No active editor means physical calls fail; there is no unrestricted-write fallback. Real terminal painting and real editing were smoke-tested using an isolated VS Code Web/code-server instance. Desktop Remote–SSH attachment remains untested. See [screenshots and verification notes](docs/UI-VERIFICATION.md).

For the later subscription-backed test:

```sh
./scripts/real-claude-e2e.sh ./fixture-java
```

### Codex

With the same session-local PATH and the project open in the editor:

```sh
codex --human-body
# Second SSH terminal, in the same project:
human-body watch
```

Omit `--human-body` for ordinary Codex. This is our wrapper flag, not an OpenAI flag. It configures native hooks and the existing MCP relay, forces a read-only native shell sandbox with approvals disabled, explicitly approves only the five exposed broker tools, disables existing MCP servers for this session, and excludes supervisor control from Codex's tool list. No normal Codex settings are changed. Start from the desired directory; `-C`, profiles, config/sandbox overrides and resumed sessions are deliberately rejected in this mode. Hook trust is bypassed for this vetted launch; existing trusted hooks/plugins are still part of the supervised trust boundary.

Codex controls are a **companion terminal**, not an injected native Codex pane: `human-body pause`, `human-body resume`, `human-body wpm 60`, `human-body break 300`, `human-body run git status`, `human-body reset`, `human-body stop`. Reset starts the clock, including prompt-writing time. `watch` shows elapsed/physical/queue time, target and cumulative effective WPM, characters, clipboard operations, command count and persistent blocked attempts. Type controls there without another model turn. Both integrations still require the VS Code backend; these controls do not make editing headless.

Offline checks and a real-model benchmark are verified against Codex CLI 0.162.1:

```sh
npm run test:codex-offline  # real config/MCP loader; never starts a turn
sh scripts/real-codex-e2e.sh       # prints prerequisites; no usage
sh scripts/real-codex-e2e.sh --run # later, subscription-backed supervised test
```

The offline check confirms accepted hooks/config and five exposed agent tools, without a model turn. A separate **real Codex** run completed the public Java Two Fer task through actual VS Code typing and sandboxed terminal tests: 3/3 passed, direct writer denied, tests unchanged, 83 characters typed, approximately 133 seconds overall. It does not prove full native process isolation, live subagent inheritance or Claude compatibility. See [the evidence, fixes, reproduction command and exact limitations](docs/CODEX-BENCHMARK.md).

## Uninstall

```sh
code --uninstall-extension human-body-experiment.human-body-mode
```

Stop launching Claude with `--plugin-dir .../plugin`. Remove the target repository's `.human-body-mode/` directory if its exported logs are no longer needed. No user-wide Claude or VS Code settings are changed by the build.

See [EXPERIMENT.md](EXPERIMENT.md), [LIMITATIONS.md](LIMITATIONS.md), and [docs/RESEARCH.md](docs/RESEARCH.md).
