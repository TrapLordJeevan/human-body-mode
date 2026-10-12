# Changelog

## 0.1.2

- Full persistent human profile: rhythm, burst ranges, short-pause probability/duration, automatic-break intervals/durations, typo/false-start rates, correction/backspace timing, navigation/narration and seed.
- Optional visible editor mistakes are corrected before continuation. Strict mode disables extra behaviours.
- Shared automatic-break budgets/deadlines, countdown, Resume-to-skip, correction/break metrics and full-profile JSON/CSV exports.

## 0.1.1

- Keyboard activity-bar icon, status-bar shortcut and Open Dashboard command.
- Basic dashboard: metrics, WPM, mode, manual breaks, clock/export and queued commands.
- Seeded bursts/sentence pauses and removal of the legacy playback multiplier.

## 0.1.0 (upstream-derived playback)

The first release.

- Your coding agent gets its own cursor in the editor, types at a human pace,
  and explains what it's doing in the **Pair** panel.
- Reply, interrupt, or edit the code at any moment, and the agent's next move
  takes it into account. Select some code to ask about it.
- **My turn** lets you write a part yourself while the agent navigates.
- The agent's commands play in an *AI Pair* terminal, after you allow them.
- The speed menu sets the pace, from 0.4× to 3.0×.
- **AI Pair: Set Up Agent** connects Claude Code, Codex, OpenCode, Gemini CLI
  and Cursor. GitHub Copilot needs no setup.
- **AI Pair: Play Demo Session** shows what it's like without an agent.
