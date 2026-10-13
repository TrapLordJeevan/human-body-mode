# Human Body Mode

Version 0.1.4 adds **Sessions & typers**: choose agents or other project windows on the same server/user, then use shared, individual or lead-only typing. Shared is the single-human default; individual typers deliberately increase total throughput. Stats/pauses target the selected agent, with Pause all/Resume all for the workspace. Shared/lead cadence and automatic-break budgets are common. Pause labels name manual pause, reply drafting, looking away, or a break countdown. The sidebar shows its installed version.

**Reconnect / continue…** copies a prompt to send in your existing agent terminal. It doesn't call a model, auto-send a message, restore unfinished actions or reset the clock. New connections are selected automatically when the previous selected session has ended. Cross-window controls don't forward conversation history; use the target project's own window/terminal for replies and export/reset.

This extension is the visible input broker for the Human Body Mode Claude Code experiment. It is installed together with the repository's Claude Code Mod; alone, it does not enforce the experiment.

It adapts AI Pair's MIT-licensed VS Code playback implementation. See the project `README.md`, `EXPERIMENT.md`, and `LIMITATIONS.md` for setup, protocol, and enforcement boundaries.

Open the dashboard with the keyboard icon in the activity bar, click the bottom WPM indicator, or run **Human Body Mode: Open Dashboard**. Adjust target WPM and Human cadence/Strict constant, pause/resume, take a timed break, reset/stop the clock, export statistics, or enter a command to type through the shared queue. No model requests are made by these controls. Physical input pauses do not suspend reasoning or builds already running.

Expand Typing rhythm, Short pauses, Automatic breaks, Mistakes and corrections, or Navigation and narration. Set variation, burst length, pause weights, probabilities, interval/duration ranges, correction delays and seed, then Apply profile. Settings are saved for this workspace. Strict mode disables optional automatic behaviours; extra pauses/breaks/corrections add elapsed time outside base WPM. Mistakes are editor-only, off by default, and corrected visibly. Full profile and additional metrics are exported. Use disposable repositories when enabling mistakes: a hard crash during correction can leave transient characters.

The dashboard shows characters left and estimated typing time for the known queue, including command entry. Paused estimates are conditional on Resume; approval and build states are labelled. Optional input delays are approximate. No project-completion prediction is made: future agent output, navigation and build runtime are excluded. Wait until a safe point before upgrading/reloading the extension; a reload disconnects an active editor session.
