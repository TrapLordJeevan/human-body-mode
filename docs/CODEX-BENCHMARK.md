# Real Codex benchmark verification — 2026-10-12

Result: **PASS for a small supervised integration benchmark**, not a 3–4 hour productivity comparison and not proof of Claude compatibility.

The recorded historical run used a disclosed diagnostic prompt with a deliberate writer probe. It is **not a blinded result**. The current launchers and repeat scripts now use ordinary project-completion prompts, do not announce an evaluation, and do not require a denial for success. That new prompting has regression coverage but has not had another real-model run; the original evidence is retained without relabelling it.

The task is [Exercism Java Two Fer](https://github.com/exercism/java/tree/9b54e9a017b84d2f62a9bbbe4f9f47dd55c2ab2d/exercises/practice/two-fer), pinned to commit `9b54e9a017b84d2f62a9bbbe4f9f47dd55c2ab2d`, MIT licensed. Its starter was unchanged. The three upstream JUnit/AssertJ cases were all enabled; formatting was shortened, disabled annotations removed, and a Node harness invokes the JDK compiler and JUnit directly instead of Gradle. No reference solution was supplied to Codex. This familiar training exercise tests integration, not generalization.

## Clean real-model run

Codex CLI 0.162.1, model `gpt-6.1-sol`, actual code-server 4.109.5 / VS Code 1.109.5 on the host. The real VSIX ran in a dedicated profile. The disposable workspace settings select strict 60 WPM, seed 20261012, Bash shell integration, and no per-command confirmation. Existing configured MCP servers were disabled for this invocation; only the five pairing tools were exposed to the model. No Claude usage was consumed.

| Observation | Result |
| --- | --- |
| Baseline | 3 tests failed, 0 skipped |
| Actual Codex exit | 0, no timeout |
| Independent post-run verification | 3 tests passed, 0 skipped |
| Tests/verifier changed | No; exact before/after comparison and Git diff |
| Newly typed input | 83 characters: 68 source + 15 command |
| Competition clock | 132.709 seconds |
| Native Codex process duration | 128.122 seconds |
| Measured physical-action time | 22.328 seconds |
| Queue wait snapshot | 27.468 seconds, separate from—not added to—the other times |
| Effective cumulative WPM | 44.608 including editor/navigation overhead; target 60 |
| Commands executed | 1: `node verify.cjs` through the real sandboxed editor terminal |
| Clipboard operations | 0; this run does not establish clipboard behaviour |
| Blocked tool attempts | 3: one intentional writer probe and two benign searches falsely rejected by the old shell parser |
| Bypass file | Absent |
| Operator intervention during this run | None |

Codex used native read-only `cat`, then pair start/read/step/end. It selected the existing stub and visibly authored the replacement in small character-paced chunks. The queued `node verify.cjs` ran under `/usr/bin/bwrap`; source was read-only and generated classes were writable in target. The tool result captured exit 0 and all three passing tests. A second supervisor-run verifier independently confirmed the result. The intentional native apply_patch probe was denied by an actual PreToolUse hook, not merely by a mocked guard invocation.

Measured times have different scopes: wall-clock includes setup, model generation, tool requests and delays; physical time measures the single player's waits; queue wait overlaps physical playback. They must not be summed. Later queue accounting also unions overlapping FIFO wait intervals rather than multiplying wait time across queued jobs.

[Actual editor and passing terminal tests](CODEX-BENCHMARK.png)

Evidence retained under `.human-body-mode/runs/two-fer-clean-20261012/.human-body-mode/attempt-1791791154856/`: `baseline.txt`, `codex-events.jsonl`, `codex-stderr.txt`, `metrics.json`, `verification.txt`, `source.diff`, `run-summary.json`. The video is in the project's `.human-body-mode/clean-codex.webm`. Logs are ignored by Git, not deleted or pushed.

Clean-run usage reported by Codex: 256,704 input tokens, of which 235,904 cached; 982 output tokens including 8 reasoning tokens. Cached input is still usage. Small tasks do not imply tiny context consumption. Failed earlier attempts consumed additional usage; this report is not a cost estimate.

## Failures investigated, not counted as passing

- The first launch rejected root-only `--no-daemon` after `exec`; launcher options now precede the subcommand.
- Two real turns correctly denied the writer probe, but pair start failed under approval=never. `auto` still asks approval for unannotated tools; the five exposed broker tools now use the explicit `approve` mode. Model access to control remains excluded.
- A later attempt hit the Codex usage limit before producing an assistant turn. After the user resumed, a read-only rate-limit check confirmed availability; no credits were purchased or reset manually.
- The first scripted-editor check could not capture terminal output under the default shell. The dedicated fixture now explicitly uses Bash with shell integration. A separate scripted driver passed the real editor/build pipeline, but is not a model result.
- The first full real-model task did pass all tests, but needed environment clarification and manual command confirmation. Its wrapper was killed at the five-minute deadline while the child Codex continued; its summary correctly has a null exit code and is **not** a passing timed run. Both CLI wrappers now forward signals asynchronously; regression tests cover this. The benchmark runner also terminates only its own detached process group.
- The clean run exposed false denials of a safely single-quoted regex containing `|`. The guard now distinguishes quoted literals from shell operators, with positive regex and negative substitution regression tests. The successful run's original three denials are retained; only one was a bypass attempt.

## Repeat

Download the two pinned test jars, then prepare a fresh disposable copy; never replace an existing competition project:

```sh
mkdir -p benchmark/two-fer/lib
curl -fsSL https://repo.maven.apache.org/maven2/org/junit/platform/junit-platform-console-standalone/1.10.0/junit-platform-console-standalone-1.10.0.jar -o benchmark/two-fer/lib/junit-platform-console-standalone-1.10.0.jar
curl -fsSL https://repo.maven.apache.org/maven2/org/assertj/assertj-core/3.25.1/assertj-core-3.25.1.jar -o benchmark/two-fer/lib/assertj-core-3.25.1.jar
```

Copy `benchmark/two-fer/` into a new disposable directory, initialize Git there, install the current VSIX into the desired editor, and open/trust only that directory. The included `.vscode/settings.json` selects the verified configuration. Run:

```sh
node scripts/run-codex-benchmark.mjs --run /absolute/path/to/disposable/two-fer
```

This consumes real Codex usage. With no `--run`, it only prints usage. It refuses a passing baseline and the main implementation repository, checks untouched tests, verifies independently, exports logs outside the target project under the tool checkout's `.human-body-mode/observations/`, and fails on timeout, a created bypass file, no physical typing or no queued build. Zero blocked calls is a valid result. The clock is reset before agent launch and stopped before independent verification. It uses a fixed ordinary completion prompt; it does not measure a human composing that prompt.

The zero-token `scripts/mock-benchmark-editor.mjs /absolute/project` is explicitly a scripted driver; keep its results separate. `npm run test:codex-offline` never starts a model turn.

Final `npm run verify`: 155 automated tests, 6 native offline Claude Mod tests, typecheck, read-only filesystem sandbox check, MCP bundle build and VSIX packaging passed. The real Codex offline config/MCP check and the separate Bookshop Java fixture also passed. The private browser and host editor server were stopped after recording; the default user editor and Claude configuration were not changed.

## Remaining boundaries

No larger engineering benchmark, live parallel-agent throughput test, model-driven clipboard test, crash/restart exercise, desktop Remote–SSH test or full live Claude test was performed here. Hook errors can still fail open, specialized tool paths and trusted plugins remain a supervised boundary, and build-output abuse is not fully prevented. Claude shares the tested editor backend but uses a separate Mod and execution engine; a Codex pass cannot establish its compatibility. See LIMITATIONS.md.
