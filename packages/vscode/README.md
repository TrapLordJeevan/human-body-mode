# Human Body Mode

This extension is the visible input broker for the Human Body Mode Claude Code experiment. It is installed together with the repository's Claude Code Mod; alone, it does not enforce the experiment.

It adapts AI Pair's MIT-licensed VS Code playback implementation. See the project `README.md`, `EXPERIMENT.md`, and `LIMITATIONS.md` for setup, protocol, and enforcement boundaries.

Open the dashboard with the keyboard icon in the activity bar, click the bottom WPM indicator, or run **Human Body Mode: Open Dashboard**. Adjust target WPM and Human cadence/Strict constant, pause/resume, take a timed break, reset/stop the clock, export statistics, or enter a command to type through the shared queue. No model requests are made by these controls. Physical input pauses do not suspend reasoning or builds already running.

Expand Typing rhythm, Short pauses, Automatic breaks, Mistakes and corrections, or Navigation and narration. Set variation, burst length, pause weights, probabilities, interval/duration ranges, correction delays and seed, then Apply profile. Settings are saved for this workspace. Strict mode disables optional automatic behaviours; extra pauses/breaks/corrections add elapsed time outside base WPM. Mistakes are editor-only, off by default, and corrected visibly. Full profile and additional metrics are exported. Use disposable repositories when enabling mistakes: a hard crash during correction can leave transient characters.

The dashboard shows characters left and estimated typing time for the known queue, including command entry. Paused estimates are conditional on Resume; approval and build states are labelled. Optional input delays are approximate. No project-completion prediction is made: future agent output, navigation and build runtime are excluded. Wait until a safe point before upgrading/reloading the extension; a reload disconnects an active editor session.
