# Experiment protocol

## Clock and controls

Open the VS Code dashboard using its keyboard activity-bar icon, bottom WPM indicator, or `Human Body Mode: Open Dashboard`. It provides WPM, cadence, pause/resume, timed breaks, clock reset/stop, queued commands and export controls. The original clock/export commands and Claude TUI/companion terminal controls remain available. Export writes JSON and CSV under the target repository's `.human-body-mode/` directory. Effective WPM is cumulative over all physical actions, not instantaneous typing speed.

Prompt-writing time is included when the supervisor resets immediately before entering the task prompt. Elapsed wall time is never derived by adding action and wait intervals, so overlapping reasoning is not double-counted. Physical-action time sums the single queue's actual delays. Queue wait records the union of FIFO waiting intervals, not a per-agent sum; it overlaps physical playback and must not be added to it.

## Input rules

- Strict 60 WPM uses the conventional five-character word: every authored character costs exactly 200 ms. The 300-character real-time test allows scheduler overhead.
- Variable mode uses seeded character jitter, configurable bursts and sentence/punctuation/word-start/bracket/newline rhythm normalized per authored block to the configured average. Optional short pauses, automatic breaks and corrected editor mistakes add time outside that normalization; defaults are zero/off. Strict mode ignores optional behaviours. Parameters are not fitted to human keystrokes and must be pinned/exported with WPM/seed. Different probabilities consume different random streams.
- Automatic-break intervals count scheduled authored-typing milliseconds across one controller, including command entry but excluding builds, reasoning, navigation, corrections and short pauses. Durations run at wall-clock speed even during a manual pause. Resume skips an automatic break. Budgets/deadlines are checkpointed once a second and reconnects honour unexpired checkpointed deadlines. Clock Reset explicitly clears the budget/deadline.
- Typos/false starts are optional motor-error approximations on ASCII editor letters only, corrected before normal continuation; they are not semantic reasoning mistakes. Wrong inserted letters count as typed characters, backspacing costs time but is not a typed character, and false starts use three-letter synthetic prefixes. Terminal commands remain delay-only correct submissions. See LIMITATIONS.md for crash safety.
- `type_fast` remains for AI Pair wire compatibility but is deliberately the same speed as `type`.
- Copy/cut capture only the current editor selection into a broker-owned clipboard. Paste accepts no text argument, so model-authored text cannot become a fast clipboard payload.
- Movement, file opening, selection, deletion, narration, and command entry have physical delays. Builds and program output run at native speed.
- Commands pass a small executable/subcommand allowlist, reject shell syntax, incur authored-command timing, and run inside bubblewrap. The repository is read-only there; only `target`, `build`, `.gradle`, and `.human-body-mode` are writable.
- The adapted AI Pair controller serializes tool calls and playback. Subagents can reason concurrently but reach the same controller and cannot create another typing lane.

## Enforcement layers

1. The Claude Code Mod intercepts `tool.call`, including subagent calls. It allows read/search/reasoning tools and the Human Body `pair` MCP tools; direct `Write`, `Edit`, `Bash`, PowerShell, and unknown MCP tools are denied and logged.
2. The MCP relay has no file mutation operation. Its `step` requests cross an authenticated loopback WebSocket to the VS Code extension.
3. The extension owns the single action queue and provenance clipboard.
4. Terminal subprocesses execute with the source tree read-only under bubblewrap.
5. The later real-Claude launcher places the Claude process itself in a read-only bubblewrap view of the project, leaving only declared outputs writable.

## Experimental bias

Normal model-facing prompts and guides do not disclose an experiment or demand deliberate bypass probes. Run security/adversarial checks with external scripted drivers, separately from the coding trial. Keep operator documents and observations outside the target repository. This does not guarantee blinding: an unrestricted agent may infer the purpose from tool names, timing, installed source or public documentation. The historical Codex smoke used a disclosed diagnostic prompt and must not be presented as a blinded result.

Edits use visible VS Code `TextEditor.edit` calls rather than OS keyboard injection. Autoindent, save participants, autocomplete settings, font/rendering speed, machine load, and Java/VS Code versions can affect results. Pin the machine image and workspace settings for both competitors. AI reasoning can overlap physical playback, as a human can think while typing. Clipboard reuse favours tasks with repetitive existing code, intentionally matching ordinary IDE use.

The implementation adapts AI Pair at its reviewed upstream commit and retains its MIT license. API and architecture sources are captured in `docs/RESEARCH.md`.
# Codex compatibility addendum

Codex uses the same editor controller, seeded timing, clipboard provenance, command broker and metrics as Claude. The adapter changes the harness only: session-local CLI config supplies native PreToolUse hooks and MCP, with native shell sandbox set to read-only. Read-only inspection is unrestricted in volume, but its direct-shell grammar is narrower than an ordinary shell; odd commands should use repository files/pair read. Supervisor controls live in a second terminal rather than inside the agent TUI. Existing MCP servers are disabled for that session; trusted plugin/hosted paths are not proven isolated. These differences are experimental bias and must be recorded when comparing harnesses. A real Codex Two Fer integration smoke passed; its known, very small exercise, single fixed prompt, default reasoning and non-dedicated server load are not a valid productivity comparison. It did not measure a human composing that prompt or test Claude's separate Mod. See docs/CODEX-BENCHMARK.md.
