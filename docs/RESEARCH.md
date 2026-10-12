# Human Body Mode: API and architecture research

Research date: 2026-10-12. Sources are first-party documentation and source repositories only. Claude Code's Mods API is new and version-sensitive; the implementation should pin and report the tested Claude Code and VS Code versions rather than assume later releases preserve undocumented behavior.

## Executive conclusion

The preferred architecture is feasible, with one important correction: a Claude Code Mod or hook is a policy/interception layer, not a security boundary. The strongest practical design is:

1. Adapt AI Pair's VS Code extension, editor-independent playback core, MCP relay, virtual cursor, and real-VS-Code integration-test pattern.
2. Add a Claude Code Mod that denies every mutating built-in tool and every non-Human-Body MCP tool, including calls from subagents, and exposes experiment controls/status.
3. Put the Claude Code process and every process it can launch inside an OS-enforced environment where competition source is read-only. Give write access only to explicit build-output/cache directories. Run the VS Code extension and its edit broker outside that boundary, and give the agent access only to the broker's narrow local protocol.
4. Make that broker the single global scheduler for typing, navigation, clipboard-token operations, and sandboxed terminal commands. It owns the append-only log and lock, so additional agents cannot add physical throughput.

This is more reliable than a Mod-only design. Anthropic explicitly says a failed ordinary hook is non-blocking unless configured otherwise, a timed-out Mod hook may be skipped, and Claude's Bash sandbox does not cover file tools, MCP servers, hooks, or plugin processes. Anthropic recommends putting the whole Claude Code process in a container, VM, or sandbox runtime when one boundary must cover all of them ([hooks failure behavior](https://code.claude.com/docs/en/hooks#exit-code-output), [holding tool calls and timeouts](https://code.claude.com/docs/en/plugins/mods/events#hold-a-tool-call-until-the-user-decides), [sandbox scope](https://code.claude.com/docs/en/sandboxing#what-runs-outside-the-sandbox)).

## AI Pair: what can be reused

AI Pair already has almost the right interaction path:

```text
agent --stdio MCP--> pair-mcp relay --local authenticated WebSocket--> VS Code extension
                                                             |
                                                  playback core + editor adapter
```

Its own architecture describes a stateless stdio MCP relay, an editor-independent TypeScript core (sessions, batch queue, playback scheduler, cursor tracking and reports), a thin VS Code adapter, and a narration webview. Each VS Code window advertises a loopback port and per-window token in a mode-0600 discovery file; JSON-RPC calls are authenticated and forwarded to the matching workspace ([AI Pair architecture at reviewed commit](https://github.com/faiface/ai-pair/blob/0defe983f1b5c554425d0bb0d21cd3e66adb8376/ARCHITECTURE.md)). The repository is split into `protocol`, `core`, `relay`, and `vscode` npm workspaces, and packages the relay with the extension ([AI Pair README](https://github.com/faiface/ai-pair)).

The interaction protocol is useful for human-speed playback. An agent submits small action batches (`say`, `move`, `select`, `type`, `delete`, `point`, `run`); the extension is the source of truth; batches play serially; user edits pre-empt playback; and the agent can plan at most one batch ahead ([AI Pair protocol](https://github.com/faiface/ai-pair/blob/0defe983f1b5c554425d0bb0d21cd3e66adb8376/PROTOCOL.md)). The VS Code adapter uses `TextEditor.edit` for visible documents, with explicit undo-stop options, and `WorkspaceEdit` only when a document is not visible ([adapter source](https://github.com/faiface/ai-pair/blob/0defe983f1b5c554425d0bb0d21cd3e66adb8376/packages/vscode/src/editor.ts)). Its typing planner emits delayed chunks with configurable character jitter and extra pauses at word starts, punctuation, brackets, and newlines ([timing source](https://github.com/faiface/ai-pair/blob/0defe983f1b5c554425d0bb0d21cd3e66adb8376/packages/core/src/timing.ts), [typing planner](https://github.com/faiface/ai-pair/blob/0defe983f1b5c554425d0bb0d21cd3e66adb8376/packages/core/src/typing.ts)).

### Required changes to AI Pair

AI Pair is a foundation, not an enforcement implementation:

- Its default cadence is not calibrated to 60 WPM, is not seeded by default (`Math.random`), and includes `type_fast` at one quarter of normal delays. Human Body Mode must replace this timing model and prohibit any fast path for newly authored text.
- It has no clipboard provenance protocol. Clipboard operations must be token-based and broker-owned, not `paste(text)`.
- Its v1 design deliberately supports at most one session in a VS Code window and lists multiple agents as out of scope. Human Body Mode needs one process-wide scheduler shared by all connected sessions/agents, not one queue per session ([AI Pair architecture, sessions and out-of-scope sections](https://github.com/faiface/ai-pair/blob/0defe983f1b5c554425d0bb0d21cd3e66adb8376/ARCHITECTURE.md#sessions)).
- AI Pair's `run` implementation sends a complete command to a normal integrated terminal, using `Terminal.sendText` when shell integration is unavailable ([terminal source](https://github.com/faiface/ai-pair/blob/0defe983f1b5c554425d0bb0d21cd3e66adb8376/packages/vscode/src/terminal.ts)). That would put execution outside the proposed Claude boundary if the extension runs on the host. Replace it with a sandboxed runner whose output is displayed in a VS Code pseudoterminal or terminal panel.
- AI Pair programmatically edits documents. This is visible and pace-controlled, but it is not literal OS keyboard injection. That is acceptable for a reproducible editor-input bottleneck if disclosed as experimental bias.

## Claude Code extension points

### Mods and plugins

The official product now has a Mods API. A Mod is a plugin whose JavaScript module registers in-process event middleware. The minimal package contains `.claude-plugin/plugin.json`, `hooks/hooks.json`, and `hooks/register.js`; `register(on)` attaches handlers such as `tool.call` and `ui.render` ([Mods overview](https://code.claude.com/docs/en/plugins/mods/overview#how-a-mod-works)). Mods require Claude Code 2.1.287+ in the terminal (2.1.286+ in Desktop according to the current documentation), and Mod hooks run in terminal, VS Code chat, `claude -p`, Agent SDK, local Desktop sessions, and eligible cloud sessions, although custom drawing is available only in terminal/Desktop ([Mods availability](https://code.claude.com/docs/en/plugins/mods/overview#where-mods-run)).

`tool.call` is the key enforcement event. It fires before built-in, MCP, and subagent tool calls. A handler can inspect or rewrite arguments, call `next(e)`, or return `{ deny: reason }` without calling `next`, which prevents execution. Calls made by subagents are included ([tool-call event](https://code.claude.com/docs/en/plugins/mods/events#guard-or-change-a-tool-call)). Hooks form an ordered middleware chain; managed hooks run before installed Mods, and multiple Mods can influence a call ([Mod ordering](https://code.claude.com/docs/en/plugins/mods/events#the-order-mods-run)).

The Mods API can register commands and tools at `session.start`; a registered tool is presented to Claude as `mcp__<plugin>__<tool>`. It also provides UI, timers, session messaging, filesystem, process, HTTP, settings, and persistent-store namespaces ([Mods API](https://code.claude.com/docs/en/plugins/mods/api)). Important security facts from that API:

- Mods are not sandboxed and run with the user's privileges. They can read/write files, start programs, inspect/change sessions, approve tool calls, and spend model usage ([Mod security warning](https://code.claude.com/docs/en/plugins/mods/overview#understand-what-a-mod-can-do)).
- A hooks module has no direct Node filesystem/network/process globals, but `$.fs`, `$.process`, and `$.http` grant those operations with user privileges ([Mods API filesystem/process/network section](https://code.claude.com/docs/en/plugins/mods/api#reach-files-processes-and-the-network)).
- `tool.call` covers subagent tool calls, and turn events carry `agentId`. Ordinary hook input likewise carries `agent_id`/`agent_type`, and settings/plugin hooks run inside subagents ([Mods events](https://code.claude.com/docs/en/plugins/mods/events#follow-a-turn), [hook subagent fields](https://code.claude.com/docs/en/hooks#common-input-fields)).
- A Mod can be disabled/uninstalled, all user Mods can be disabled with safe mode or `disableAllHooks`, and organizations can control them with managed settings. Therefore competition startup must verify that the expected Mod loaded and terminate if it did not; policy files and plugin code must be outside the writable project ([turning Mods on/off](https://code.claude.com/docs/en/plugins/mods/overview#turn-mods-on-or-off)).

The Mod should therefore be small: deny `Edit`, `Write`, `NotebookEdit`, direct `Bash`/`PowerShell`/monitor execution, and every mutating or unknown MCP tool; allow read/search/web/reasoning tools; allow only the Human Body broker's MCP namespace for mutations. It should emit blocked-attempt audit events and provide start/stop/reset/status commands. It should not implement timing or filesystem writes itself.

### Traditional hooks and permissions

`PreToolUse` can block a call and matches built-in or MCP tool names; hooks from settings and plugins run for subagents as well ([hooks reference](https://code.claude.com/docs/en/hooks)). A command hook receives tool input as JSON and can return a deny decision. Configure `onFailure: "block"`; otherwise failure to start, invalid JSON, and nonzero errors other than exit 2 are non-blocking ([hook output/failure semantics](https://code.claude.com/docs/en/hooks#exit-code-output)). Traditional hooks are a useful second audit/guard layer, but duplicating all Mod logic is unnecessary once the outer OS boundary exists.

Permission rules support `allow`, `ask`, and `deny`, with `Tool(specifier)` matching. A whole-tool deny such as `Bash` or `Write` removes that route, and deny rules remain effective in bypass-permissions mode; `dontAsk` denies unmatched calls rather than prompting ([permissions](https://code.claude.com/docs/en/permissions)). Use deny rules as defense in depth and disable bypass/auto modes in immutable managed settings. Do not rely on parsing arbitrary shell strings: Anthropic documents wildcard and compound-command limitations in Bash rules ([permission rule syntax](https://code.claude.com/docs/en/permissions#permission-rule-syntax)).

### MCP

Claude Code supports local stdio and remote HTTP MCP servers. Local stdio servers are child processes and receive `CLAUDE_PROJECT_DIR`; roots can be queried through MCP `roots/list` ([Claude Code MCP docs](https://code.claude.com/docs/en/mcp#installing-mcp-servers)). The Human Body action server can therefore retain AI Pair's stdio-relay model. However, local MCP servers run outside Claude's built-in Bash sandbox and with normal user access, so the relay itself must be non-writing and the outer process boundary must cover it ([sandbox exclusions](https://code.claude.com/docs/en/sandboxing#what-runs-outside-the-sandbox)). Disable unrelated MCP servers in the benchmark profile.

### Why an outer OS boundary is mandatory

Claude's built-in Bash sandbox is OS-enforced for Bash/PowerShell/Monitor commands and their descendants, with filesystem and network policies. It is off by default, can fall back to unsandboxed execution unless `sandbox.failIfUnavailable` is set, and by default allows writes in the working directory ([sandbox configuration](https://code.claude.com/docs/en/sandboxing)). More importantly, Anthropic states that built-in file tools, hooks, MCP servers, plugin monitors, LSPs, and helper commands run outside it. Their documented recommendation for one common boundary is to run the Claude Code process itself in a container, VM, or sandbox runtime ([what runs outside the sandbox](https://code.claude.com/docs/en/sandboxing#what-runs-outside-the-sandbox)).

For a supervised Linux benchmark, launch Claude Code and its descendants in a container/bubblewrap-style environment with:

- the competition source tree bind-mounted read-only;
- predeclared build outputs (`target`, Gradle output/cache, temp, logs) mounted writable;
- the Human Body relay executable and policy read-only;
- access to only the broker's authenticated local socket/port;
- no unsandboxed fallback; and
- a fresh, experiment-specific Claude configuration/profile with unrelated plugins and MCP servers absent.

The host VS Code extension is the only process that can modify source. If the Mod, MCP relay, or Claude process crashes, source remains read-only, so failure is closed. A malicious or compromised build can write only approved output mounts. This is stronger and easier to audit than attempting to recognize every possible shell writer.

## VS Code APIs and their limits

The stable extension API provides the required visible interaction pieces:

- `TextEditor.edit` performs replacements and accepts `undoStopBefore`/`undoStopAfter`; `WorkspaceEdit` can change non-visible documents. Human Body Mode should require the target editor to be visible for authored edits and use one undo unit per semantic action ([VS Code API: `TextEditor.edit`](https://code.visualstudio.com/api/references/vscode-api#TextEditor), [AI Pair adapter use](https://github.com/faiface/ai-pair/blob/0defe983f1b5c554425d0bb0d21cd3e66adb8376/packages/vscode/src/editor.ts)).
- `commands.executeCommand` invokes built-in commands for navigation, selection, duplicate-line, undo/redo, refactors, and similar IDE conveniences. The official built-in-command page is explicitly only a subset, so pin VS Code and integration-test every command ID used ([commands guide](https://code.visualstudio.com/api/extension-guides/command), [built-in commands reference](https://code.visualstudio.com/api/references/commands)). The internal `type`/`default:type` command exists in VS Code's implementation ecosystem but is not in the supported subset; do not make enforcement depend on it.
- `Terminal.sendText(text, shouldExecute)` sends the supplied text to the child PTY, and shell integration can execute a complete command and report completion. Sending the whole command would be instantaneous, so visible terminal typing must send scheduled characters with `shouldExecute: false` and then Enter, or render them in a `Pseudoterminal` backed by the sandbox runner ([VS Code API: `Terminal`](https://code.visualstudio.com/api/references/vscode-api#Terminal)).
- `env.clipboard.readText/writeText` accesses the system clipboard and works locally even for remote workspace extensions ([remote extension clipboard guidance](https://code.visualstudio.com/api/advanced-topics/remote-extensions#using-the-clipboard)). It provides no provenance. Provenance must live in the broker.
- `FileSystemWatcher` only reports create/change/delete events, can coalesce events, and may be affected by exclusions. It has no veto callback. It is suitable for detecting/auditing unexpected writes, not preventing them ([VS Code API: `createFileSystemWatcher`](https://code.visualstudio.com/api/references/vscode-api#workspace)). A `FileSystemProvider` controls only URIs in its registered custom scheme/virtual workspace; it does not interpose on normal `file:` access by shell processes ([File System API](https://code.visualstudio.com/api/extension-guides/virtual-documents#file-system-api)). Consequently, a VS Code extension alone cannot enforce source immutability against terminal processes or other extensions.

Use `@vscode/test-cli` and `@vscode/test-electron` to run integration tests in an isolated Extension Development Host, pinning the VS Code version and workspace. Microsoft's testing guide confirms these tests have full VS Code API access and supports separate user-data directories and disabling unrelated extensions ([Testing Extensions](https://code.visualstudio.com/api/working-with-extensions/testing-extension)). AI Pair also already has a real isolated VS Code integration-test command, making its test harness worth retaining ([AI Pair README, Development](https://github.com/faiface/ai-pair#development)).

## Concrete broker contract

Keep the mutation surface deliberately small. One authenticated server should accept only these classes of action:

- `type(text, cursor/selection)`: text is always newly authored and always rate-limited.
- `key(command, args)`: an explicit allowlist of stable/pinned VS Code commands for movement, selection, undo/redo, duplicate line, multicursor, and refactor operations.
- `copy(selection|line|terminalRange)`: broker reads existing visible content and returns an opaque clipboard token containing source kind, range, content hash, and creation sequence.
- `cut(token source)`: copy plus a scheduled editor deletion.
- `paste(token)`: accepts only an unexpired broker token. It may mirror content to the system clipboard for visible Ctrl+V behavior, but verifies the hash immediately before paste. It never accepts raw pasted text.
- `open/switch(file)`: validated workspace-relative path plus configured navigation delay.
- `run(argvToken|historyToken)`: no shell text interpolation. A new command is a validated argv list, incurs typing delay, and runs in the restricted runner. A history token repeats one previously executed exact argv quickly. Start with an explicit executable/subcommand allowlist (Java compiler/build/test, read-only Git, and narrowly required utilities); unknown commands fail closed.

The server holds one FIFO/priority-neutral mutex across all agents and sessions. Queue wait is measured from enqueue until lock acquisition. A multicursor keypress is one physical keystroke even if it inserts characters at several cursors; log both physical keys and resulting document characters so the benchmark is interpretable. All requests carry session and agent identity but identity never creates another scheduler.

Clipboard output from tests/builds should be eligible only when captured from an allowlisted command, and commands capable of echoing arbitrary model-supplied text must not be allowlisted. This closes the obvious `printf invented-code` then copy/paste route.

## Timing and reproducibility

At the conventional benchmark definition of five characters per word, 60 WPM is 300 authored characters/minute, or 200 ms per authored key. Strict mode should schedule exactly 200 ms per authored key, use a monotonic clock and absolute deadlines to avoid timer-drift accumulation, and count editor API overhead inside physical-action time. Thus 300 characters take approximately 60 seconds.

Variable mode should use a seeded PRNG and a calibrated delay model with continuous-run, word-start, punctuation/bracket, indentation/newline, and navigation components. Generate bounded instantaneous rates corresponding roughly to 40–100 WPM, then normalize the authored-key delays for a representative code corpus so the configured long-run mean is 200 ms/key. Persist seed and resolved timing parameters in every log. Keep IDE-produced indentation/autoclosing distinguishable from authored keystrokes; it is a normal convenience but should be recorded as resulting characters, not typed keys.

Remove AI Pair's `type_fast` for authored text. Fast clipboard paste remains legitimate only through a provenance token.

## Logging and time accounting

Use a monotonic clock for intervals and wall-clock timestamps only for correlation. Persist an append-only JSONL event journal first; derive JSON summary and CSV from it. Each queued request records enqueue, lock-acquire, action-start, action-end, result, agent/session, provenance token IDs/hashes, typed keys, resulting characters, command identity/exit, and denial reason.

Because the broker is single-threaded for physical actions, its action intervals do not overlap. Report:

- experiment wall time: `stop - start`;
- physical-action time: union of broker action intervals (sleep and API execution included);
- input-wait time: per-request enqueue-to-acquire, plus a clearly labeled union metric if a non-double-counted aggregate is required;
- characters/keys typed, clipboard operations, commands, blocked attempts; and
- effective WPM: physical authored keys / 5 / elapsed experiment minutes, with an additional typing-active WPM if useful.

Write journal records atomically and recover an unfinished action as aborted on restart. Keep the source tree read-only until the supervisor explicitly ends the run; a crash must not remount it writable. Broker state and queue ownership live outside the project and use an OS file lock so a restarted or second broker cannot create parallel throughput.

## Known limits and claims that must not be made

- This controls Claude Code tool-mediated action in a supervised, isolated launch. It is not a secure multi-tenant sandbox and must not be advertised as one.
- A user with host access can disable the extension/Mod, alter clocks, inject input, or remount files. The competition needs a supervisor and startup attestation.
- VS Code programmatic edits are a simulation of human-visible input, not hardware keyboard events. Autocomplete, autoindent, refactors, and multicursor may give platform-dependent leverage; pin versions/settings and document them.
- The Mod API and exact event behavior must be tested against the pinned real Claude Code version when subscription access returns. Mock tests demonstrate local policy logic, not Claude compatibility.
- Separate Claude sessions/agent teams need an adversarial test proving they resolve to the same broker lock. Official docs establish per-tool interception and agent IDs, but not the experiment's cross-process queue.
- Filesystem watchers detect but cannot prevent writes; only the outer OS boundary supports a fail-closed enforcement claim.

## Recommended verification gates

Before a supervised dry run, require all of the following:

1. Unit tests establish strict 300-character timing, seeded reproducibility, variable-mode convergence, clipboard-token rejection, queue serialization, log accounting, and crash recovery.
2. Adversarial runner tests try redirection, heredocs, `sed -i`, script interpreters, archive extraction, compiler/plugin source generation, symlink escapes, alternate MCP tools, and concurrent clients; source hashes must remain unchanged except for broker edits.
3. Pinned real-VS-Code tests verify visible per-character edits, cursor/file switching, undo/deletion, selection, multicursor, clipboard mirroring, terminal display, and VSIX install/uninstall.
4. A no-subscription mock Claude driver issues the same tool calls and simulated subagent races through the actual relay and Mod policy module.
5. Later, a real-Claude script checks Mod load/version, invokes every denied built-in and MCP path, spawns subagents, runs allowed builds/tests, kills/restarts each component, and compares the audit journal with the final filesystem.

Only gates 1–4 can be claimed without Claude usage. Gate 5 is required before claiming real Claude Code compatibility or full supervised-run readiness.
# Codex adapter sources (2026-10-12)

- [Official hooks reference](https://learn.chatgpt.com/docs/hooks): PreToolUse observes native shell (`Bash`), apply_patch and MCP calls; supported denial uses hookSpecificOutput.permissionDecision. Hook failures can fail open; write_stdin and specialized/hosted paths are not a complete interception boundary.
- [Official config reference](https://learn.chatgpt.com/docs/config-file/config-reference): inline hooks, features.hooks, developer_instructions and MCP enabled_tools are supported configuration.
- [Official app-server reference](https://learn.chatgpt.com/docs/app-server): initialize, config/read and mcpServerStatus/list permit offline loader checks without starting a model turn.
- [Official plugin packaging](https://developers.openai.com/plugins/build/plugins): plugins can bundle MCP/hooks, but this adapter uses session-local CLI overrides to avoid installation or normal config changes. It does not invent a Claude-style Codex Pane API.

Local verification on Codex CLI 0.162.1 demonstrated that MCP overrides merge with existing server tables. Explicit per-server enabled=false overrides are therefore required. The offline smoke check verifies the real accepted configuration and actual MCP tool list, not just mock argument strings.
