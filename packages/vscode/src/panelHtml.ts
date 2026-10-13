// The narration panel's page. Layout, top to bottom: the band, a full-width area whose header holds
// the status (its dot fills a ring during the reading pause) and the controls, then the current
// message (top edge fixed, grows downward), then the reply box; below the band, the history, newest
// first.

import { randomBytes } from "node:crypto"
import { defaultTiming, PROFILE_FIELDS } from "@ai-pair/core"

const svg = (paths: string, cls = "") =>
  `<svg class="i ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`

const ICONS = {
  pause: svg('<path d="M9 5v14M15 5v14"/>', "pause"),
  resume: svg('<path d="M8 5l11 7-11 7z"/>', "resume"),
  stop: svg('<rect x="6" y="6" width="12" height="12" rx="2"/>'),
  swap: svg('<path d="M7 7h11l-3-3M17 17H6l3 3"/>'),
  exit: svg('<path d="M14 4h5v16h-5M10 8l-4 4 4 4M6 12h11"/>'),
  send: svg('<path d="M4 12l16-8-6 16-2.5-6.5z"/>'),
  play: svg('<path d="M8 5l11 7-11 7z"/>'),
}

export function panelHtml(cspSource: string): string {
  const nonce = randomBytes(16).toString("base64")
  const fields = (keys: readonly string[]) => PROFILE_FIELDS.filter(([, key]) => keys.includes(key)).map(([group, key, label, min, max, scale]) => {
    const defaults = group === "navigation" ? defaultTiming : defaultTiming[group]
    const value = (defaults as unknown as Record<string, number>)[key]! * scale
    return `<label>${label}<input type="number" id="profile-${key}" data-profile-group="${group}" data-profile-key="${key}" data-profile-scale="${scale}" min="${min * scale}" max="${max * scale}" step="${["burstMinChars", "burstMaxChars", "nearLines"].includes(key) ? 1 : "any"}" value="${value}" required></label>`
  }).join("")
  const section = (label: string, keys: readonly string[], note: string) => `<details><summary>${label}</summary><small>${note}</small>${fields(keys)}</details>`
  return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  /*
   * Every color is the theme's: one of its tokens, or its foreground mixed into what's behind, so
   * the panel sits in whatever theme is set, dark or light, and recedes the same way in each. The
   * fallbacks are for tokens a theme may leave unset.
   */
  :root {
    --fg: var(--vscode-foreground);
    --accent: var(--vscode-aiPair-cursor, #e8875b);
    --read: var(--vscode-aiPair-cursorRead, #facc15);
    /* Text a step and two steps back. Not descriptionForeground: some themes make it the foreground. */
    --muted: color-mix(in srgb, var(--fg) 66%, transparent);
    --faint: color-mix(in srgb, var(--fg) 46%, transparent);
    --hair: color-mix(in srgb, var(--fg) 12%, transparent);
    --soft: color-mix(in srgb, var(--fg) 7%, transparent);
    --soft-hover: color-mix(in srgb, var(--fg) 13%, transparent);
    --border: var(--vscode-contrastBorder, var(--vscode-widget-border, var(--vscode-panel-border, var(--hair))));
    /*
     * The band is the editor's surface, so the current message sits on the same ground as the code.
     * It may be lighter, darker, or the same as the side bar's; the band's hairline marks it either way.
     */
    --surface: var(--vscode-editor-background);
    --you: var(--vscode-charts-blue, var(--vscode-textLink-foreground));
    --ok: var(--vscode-testing-iconPassed, var(--vscode-charts-green));
    --fail: var(--vscode-testing-iconFailed, var(--vscode-errorForeground));
    --mono: var(--vscode-editor-font-family, monospace);
  }
  /* High contrast themes: text at full strength, and their contrast border for hairlines. */
  body.vscode-high-contrast, body.vscode-high-contrast-light {
    --muted: var(--fg);
    --faint: var(--fg);
    --hair: var(--vscode-contrastBorder, var(--fg));
  }
  html, body { height: 100%; margin: 0; padding: 0; }
  body {
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size, 13px);
    color: var(--fg);
  }
  #app { display: flex; flex-direction: column; min-height: 100%; }
  #dashboard { padding: 12px 14px; border-bottom: 1px solid var(--border); flex: none; }
  #dashboard h2 { font-size: 13px; margin: 0 0 8px; }
  #metrics { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-variant-numeric: tabular-nums; margin: 8px 0; }
  #metrics span { display: block; font-size: 11px; color: var(--muted); }
  #dashboard .row { display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0; align-items: center; }
  #dashboard label { font-size: 12px; display: flex; gap: 6px; align-items: center; }
  #dashboard input, #dashboard select { min-width: 0; box-sizing: border-box; padding: 4px; border: 1px solid var(--border); color: var(--vscode-input-foreground, var(--fg)); background: var(--vscode-input-background, var(--surface)); font: inherit; }
  #target-wpm, #break-seconds { width: 68px; }
  #operator-command { flex: 1; width: 100%; }
  #control-error { color: var(--fail); overflow-wrap: anywhere; }
  #operator-state, #dashboard small { font-size: 11px; color: var(--muted); }
  #cadence-form { display: block !important; }
  #cadence-form > label { margin: 8px 0; }
  #cadence-form details { margin: 10px 0; width: 100%; }
  #cadence-form summary { cursor: pointer; padding: 6px 0; font-size: 12px; font-weight: 500; }
  #cadence-form details label { display: grid; grid-template-columns: minmax(0, 1fr) 70px; margin: 8px 0; }
  #cadence-form details input { width: 70px; }
  #profile-seed { width: 120px; }

  /* A compact control room, using theme tokens rather than hard-coded dark colors. */
  #dashboard { padding: 16px 12px; background: var(--vscode-sideBar-background, var(--surface)); }
  .dashboard-title { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
  .dashboard-title h2 { margin: 0 !important; font-size: 14px !important; letter-spacing: -.2px; }
  #extension-version { color: var(--muted); font-size: 10px; border: 1px solid var(--border); border-radius: 20px; padding: 3px 7px; }
  #operator-state { border: 1px solid var(--border); border-left: 3px solid var(--ok); border-radius: 8px; padding: 10px; line-height: 1.6; margin: 10px 0; color: var(--fg); }
  #operator-state[data-paused="true"] { border-left-color: var(--read); }
  #metrics { gap: 8px; margin: 12px 0; }
  #metrics > div { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 11px 9px; min-width: 0; }
  #metrics strong { display: block; font-size: 20px; font-weight: 600; margin-top: 5px; overflow-wrap: anywhere; letter-spacing: -.4px; }
  #metric-eta { font-size: 16px !important; }
  #dashboard button { min-height: 30px; height: auto; padding: 6px 10px; border-radius: 6px; }
  #dashboard > details, #session-controls { border: 1px solid var(--border); border-radius: 8px; padding: 10px; margin: 12px 0; background: var(--surface); }
  #dashboard > details > summary { cursor: pointer; font-weight: 600; font-size: 12px; }
  #dashboard small { display: block; line-height: 1.5; margin-top: 6px; }
  #dashboard input, #dashboard select { min-height: 30px; border-radius: 5px; padding: 5px 7px; }
  #session-controls label { display: grid; grid-template-columns: 70px minmax(0, 1fr); margin: 8px 0; }
  #agent-list { display: grid; gap: 6px; margin-top: 10px; }
  .agent-card { border-left: 2px solid var(--border); padding: 6px 8px; background: var(--soft); border-radius: 4px; overflow-wrap: anywhere; }
  .agent-card.selected { border-left-color: var(--accent); }
  .agent-card small { margin-top: 2px !important; }
  .detail-metrics { display: grid; grid-template-columns: 1fr 1fr; gap: 12px 8px; padding-top: 12px; font-variant-numeric: tabular-nums; }
  .detail-metrics span { display: block; color: var(--muted); font-size: 11px; margin-bottom: 3px; }
  #cadence-form details { border-top: 1px solid var(--border); padding-top: 4px; }
  #idle { padding: 8px 0; }
  #idle-text { font-size: 12px; }
  @media (max-width: 240px) { #metrics, .detail-metrics { grid-template-columns: 1fr; } #session-controls label { grid-template-columns: 1fr; gap: 4px; } }

  button {
    font: inherit; font-size: 12px; height: 24px; min-width: 24px; box-sizing: border-box; padding: 0 5px;
    display: inline-flex; align-items: center; justify-content: center; gap: 5px; flex: none;
    border: none; border-radius: 5px; cursor: pointer; background: transparent; color: var(--fg);
  }
  button:focus-visible { outline: 1px solid var(--vscode-focusBorder); outline-offset: 1px; }
  button:disabled { opacity: 0.45; cursor: default; }
  /* Icon buttons hover like the theme's toolbar icons; the others are the theme's buttons. */
  button.quiet { color: var(--muted); }
  button.quiet:hover:not(:disabled), button.quiet.on { background: var(--vscode-toolbar-hoverBackground, var(--soft)); color: var(--fg); }
  button.primary { box-shadow: inset 0 0 0 1px var(--vscode-button-border, transparent); }
  button.soft { box-shadow: inset 0 0 0 1px var(--vscode-button-secondaryBorder, var(--vscode-button-border, transparent)); }
  button.soft { background: var(--vscode-button-secondaryBackground, var(--soft)); color: var(--vscode-button-secondaryForeground, var(--fg)); }
  button.soft:hover:not(:disabled) { background: var(--vscode-button-secondaryHoverBackground, var(--vscode-button-secondaryBackground, var(--soft-hover))); }
  button.primary { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
  button.primary:hover:not(:disabled) { background: var(--vscode-button-hoverBackground, var(--vscode-button-background)); }
  body.vscode-high-contrast button:hover:not(:disabled), body.vscode-high-contrast-light button:hover:not(:disabled) {
    outline: 1px dashed var(--vscode-contrastActiveBorder, var(--vscode-focusBorder)); outline-offset: -1px;
  }
  .i { width: 14px; height: 14px; flex: none; }

  #band { flex: none; padding: 10px 14px 12px; background: var(--surface); border-bottom: 1px solid var(--border); }
  /* Room for the header and two lines of message, so the reply box stays still for short messages. */
  body.active #main { min-height: calc(32px + 2 * 1.5 * 1.3 * var(--vscode-editor-font-size, 13px)); box-sizing: border-box; }

  #head { display: flex; align-items: center; gap: 4px; height: 24px; }
  /* Without a session, the title under it says it all. */
  body:not(.active) #head { display: none; }
  #status { display: flex; align-items: center; gap: 12px; flex: 1; min-width: 0; font-size: 12px; }
  #status-text { font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .dot { position: relative; width: 7px; height: 7px; margin-left: 4px; border-radius: 50%; background: var(--accent); flex: none; }
  .dot.read { background: var(--read); animation: breathe 2.4s ease-in-out infinite; }
  .dot.dim { opacity: 0.45; }
  .dot.ring { background: transparent; box-shadow: inset 0 0 0 1.5px var(--accent); }
  .dot.off { background: var(--muted); opacity: 0.45; }
  @keyframes breathe { 50% { opacity: 0.35; } }
  /* The reading pause fills a ring around the dot, --progress from 0 to 1; what's left is the same color, faded. */
  .dot.reading { --ring: var(--read); background: var(--read); animation: none; }
  body.paused .dot.reading { --ring: var(--faint); }
  .dot.reading::after {
    content: ""; position: absolute; inset: -4.5px; border-radius: 50%;
    background: conic-gradient(var(--ring) calc(var(--progress, 0) * 360deg), color-mix(in srgb, var(--ring) 28%, transparent) 0);
    mask: radial-gradient(circle, transparent 6px, #000 6.5px);
  }

  #controls { display: none; align-items: center; gap: 1px; }
  body.active #controls { display: flex; }
  #pause .resume, body.paused #pause .pause { display: none; }
  body.paused #pause .resume { display: block; }
  body.user-turn #pause, body.user-turn #interrupt { display: none; }
  /* My turn is its icon; Hand back, the main action in the programmer's turn, is labeled. */
  #turn-label { display: none; }
  body.user-turn #turn-label { display: inline; }
  #end { margin-left: 2px; }
  #now { display: none; margin-top: 8px; }
  body.active #now { display: block; }
  #now-text { font-size: calc(var(--vscode-editor-font-size, 13px) * 1.3); line-height: 1.5; overflow-wrap: anywhere; }
  #now-text.empty { font-size: inherit; color: var(--muted); }
  #now-text code { font-size: 0.85em; padding: 1px 3px; border-radius: 3px; }
  /* Something new in the band fades in. */
  .arrive { animation: arrive 0.7s ease-out; }
  @keyframes arrive { from { opacity: 0.2; } }
  #now-ref { margin-top: 8px; font-size: 12px; }
  #now-ref:empty { display: none; }
  #run { display: none; margin-top: 12px; }
  #run.on { display: block; }
  #run-label { font-size: 12px; color: var(--muted); margin-bottom: 6px; }
  #run-cmd { padding: 8px 10px; border-radius: 6px; background: var(--soft); font-family: var(--mono); font-size: 12.5px; white-space: pre-wrap; overflow-wrap: anywhere; }
  #run-cmd::before { content: "$ "; color: var(--muted); }
  #run-actions { display: none; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
  #run.confirm #run-actions { display: flex; }
  #run-actions button { height: 26px; padding: 0 8px; }

  body.active #idle { display: none; }
  #idle-title { font-size: 15px; font-weight: 600; }
  #idle-summary { margin-top: 6px; font-size: 14px; line-height: 1.5; }
  #idle-summary:empty { display: none; }
  #idle-text { margin-top: 4px; font-size: 12.5px; line-height: 1.5; color: var(--muted); }

  #composer { display: none; margin-top: 12px; }
  body.active #composer { display: block; }
  #compose-row {
    display: flex; align-items: flex-end; gap: 4px; padding: 3px 3px 3px 10px; border-radius: 6px;
    background: var(--vscode-sideBar-background, var(--vscode-input-background)); border: 1px solid var(--vscode-input-border, var(--border));
  }
  #compose-row:focus-within { border-color: var(--vscode-focusBorder); }
  #reply {
    flex: 1; min-width: 0; box-sizing: border-box; resize: none; border: none; outline: none; padding: 4px 0; margin: 0;
    font: inherit; font-size: 13px; line-height: 1.4; background: transparent; color: var(--vscode-input-foreground, var(--fg));
  }
  #reply::placeholder { color: var(--vscode-input-placeholderForeground, var(--muted)); }
  #attach { display: none; align-items: center; gap: 6px; margin: 0 2px 6px; font-size: 11.5px; color: var(--muted); }
  #attach.on { display: flex; }
  #attach-ref { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  #attach button { height: 18px; min-width: 18px; padding: 0 4px; font-size: 12px; }

  #history {
    flex: 1; overflow-y: auto; padding: 14px 14px 18px; display: flex; flex-direction: column; gap: 12px;
    font-size: 12.5px; color: var(--muted);
  }
  .entry { overflow-wrap: anywhere; line-height: 1.5; }
  .you {
    align-self: flex-end; max-width: 85%; padding: 6px 10px; border-radius: 10px;
    background: var(--soft); color: var(--fg); line-height: 1.45;
  }
  .you .ref { display: block; margin-top: 4px; }
  .run { display: flex; align-items: center; gap: 7px; padding: 6px 9px; border-radius: 5px; background: var(--soft); font-size: 12px; }
  .run .cmd { font-family: var(--mono); color: var(--fg); min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .run .cmd::before { content: "$ "; color: var(--muted); }
  .run.skipped .cmd { color: var(--muted); }
  .run .outcome { margin-left: auto; flex: none; font-size: 11px; white-space: nowrap; }
  .run .outcome.ok { color: var(--ok); }
  .run .outcome.fail { color: var(--fail); }
  body.vscode-high-contrast :is(.you, .run), body.vscode-high-contrast-light :is(.you, .run) { outline: 1px solid var(--border); }
  .divider { display: flex; align-items: center; gap: 8px; font-size: 11px; color: var(--faint); }
  .divider::before, .divider::after { content: ""; flex: 1; height: 1px; background: var(--hair); }

  code { font-family: var(--mono); font-size: 0.88em; padding: 1px 4px; border-radius: 4px; background: var(--soft); color: inherit; }
  a { color: var(--vscode-textLink-foreground); cursor: pointer; text-decoration: none; }
  a:hover { color: var(--vscode-textLink-activeForeground, var(--vscode-textLink-foreground)); text-decoration: underline; }
  /* Code references, in messages and after them: mono, underlined quietly, a link's color only on hover. */
  a.file, a.ref {
    color: inherit; font-family: var(--mono); font-size: 0.88em;
    text-decoration: underline dotted color-mix(in srgb, currentColor 45%, transparent); text-underline-offset: 3px;
  }
  a.file:hover, a.ref:hover { color: var(--vscode-textLink-foreground); text-decoration-color: currentColor; }
  a.ref { font-size: 11.5px; }
  #now-ref a.ref { color: var(--muted); }

  /*
   * Tooltips are the panel's own, in the theme's hover colors, like VS Code's: native ones show
   * unreliably in a webview, and only on hover.
   */
  #tip {
    position: fixed; z-index: 20; max-width: min(280px, calc(100vw - 12px)); box-sizing: border-box;
    padding: 4px 8px; border-radius: 4px; font-size: 12px; line-height: 1.4; pointer-events: none;
    background: var(--vscode-editorHoverWidget-background, var(--surface));
    color: var(--vscode-editorHoverWidget-foreground, var(--fg));
    border: 1px solid var(--vscode-editorHoverWidget-border, var(--border));
    box-shadow: 0 2px 8px var(--vscode-widget-shadow, transparent);
  }
  #tip[hidden] { display: none; }

  @media (prefers-reduced-motion: reduce) {
    .dot.read, .arrive { animation: none; }
  }
</style>
</head>
<body>
<div id="app">
  <section id="dashboard" aria-label="Physical input controls">
    <div class="dashboard-title"><h2>Human Body Mode</h2><span id="extension-version">v0.1.4</span></div>
    <details id="session-controls"><summary id="session-summary">Sessions &amp; typers</summary>
      <label>Workspace<select id="workspace-picker" aria-label="Workspace"><option value="local">This window</option></select></label>
      <label>Agent<select id="agent-picker" aria-label="Selected agent"><option value="">Waiting for agent</option></select></label>
      <label>Typers<select id="typing-mode" aria-label="Typing mode"><option value="shared">Shared · one physical typer</option><option value="individual">Individual · typer per agent</option><option value="lead">Lead only · selected agent writes</option></select></label>
      <small id="mode-note">One shared queue. Adding agents does not increase typing throughput.</small>
      <div class="row"><button class="soft" data-control="reconnect">Reconnect / continue…</button><button class="soft" data-control="refreshWindows">Refresh workspaces</button></div>
      <button class="soft" id="set-lead">Make selected agent the lead</button>
      <div id="agent-list" aria-label="Agent status"></div>
    </details>
    <div id="operator-state" role="status">Editor ready · waiting for agent</div>
    <div class="row">
      <button class="primary" data-control="resume">Resume selected</button><button class="soft" data-control="pause">Pause selected</button>
      <button class="soft" data-control="pause" data-scope="all">Pause all</button><button class="soft" data-control="resume" data-scope="all">Resume all</button>
    </div>
    <div id="metrics">
      <div><span>Workspace clock</span><strong id="metric-elapsed">0s</strong></div>
      <div><span>Effective WPM (cumulative)</span><strong id="metric-wpm">0</strong></div>
      <div><span>Characters left (queued)</span><strong id="metric-remaining">0</strong></div>
      <div><span>Typing ETA (estimate)</span><strong id="metric-eta">No input queued</strong></div>
    </div>
    <small>Selected-agent stats. Shared / lead mode has a common cadence.</small>
    <small id="workspace-totals">Workspace: 0 characters typed</small>
    <details><summary>Activity &amp; counters</summary><div class="detail-metrics">
      <div><span>Physical actions</span><strong id="metric-physical">0s</strong></div>
      <div><span>Queue wait</span><strong id="metric-queue">0s</strong></div>
      <div><span>Characters typed</span><strong id="metric-chars">0</strong></div>
      <div><span>Clipboard operations</span><strong id="metric-clipboard">0</strong></div>
      <div><span>Commands executed</span><strong id="metric-commands">0</strong></div>
      <div><span>Blocked attempts</span><strong id="metric-blocked">0</strong></div>
      <div><span>Corrections / false starts</span><strong id="metric-corrections">0 / 0</strong></div>
      <div><span>Automatic breaks / time</span><strong id="metric-breaks">0 / 0s</strong></div>
    </div>
    <small id="eta-note">Known queue only—not project completion. Includes expected input pauses/corrections; excludes future AI output, navigation and build runtime.</small>
    </details>
    <div class="row">
      <button class="soft" data-control="reset">Start / reset clock</button><button class="soft" data-control="stop">Stop clock</button>
      <button class="soft" data-control="export">Export logs</button>
    </div>
    <details><summary>Typing &amp; human cadence</summary><form id="cadence-form" class="row">
      <label>WPM <input id="target-wpm" type="number" min="1" max="300" value="60" required></label>
      <label>Cadence <select id="cadence-mode"><option value="variable">Human cadence</option><option value="strict">Strict constant</option></select></label>
      <label>Seed <input id="profile-seed" type="number" min="0" max="4294967295" step="1" value="20261012" required></label>
      ${section("Typing rhythm", ["jitter", "burstJitter", "burstMinChars", "burstMaxChars", "wordStartMs", "punctuationMs", "openBracketMs", "newlineMs", "sentenceMs"], "Pause weights are normalized into target WPM. Strict mode ignores human rhythm.")}
      ${section("Short pauses", ["shortPauseChance", "shortPauseMinMs", "shortPauseMaxMs"], "Chance per word; 0% disables. These pauses add elapsed time outside the WPM budget.")}
      ${section("Automatic breaks", ["autoBreakIntervalMinSeconds", "autoBreakIntervalMaxSeconds", "autoBreakMinSeconds", "autoBreakMaxSeconds"], "Intervals count scheduled typing time across all agents, not builds or idle reasoning. Set both intervals to 0 to disable. Resume skips the current automatic break.")}
      ${section("Mistakes and corrections", ["typoChance", "falseStartChance", "correctionPauseMs", "backspaceMs"], "Optional editor-only mistakes are visibly corrected. 0% disables. False starts are short wrong prefixes; chances apply only to ASCII letters, not indentation or punctuation. Correction costs add elapsed time. Strict mode disables these behaviours.")}
      ${section("Navigation and narration", PROFILE_FIELDS.filter(([group]) => group !== "type").map(([, key]) => key), "Physical navigation and narration delays; these do not limit reasoning or repository reading.")}
      <button class="primary" type="submit">Apply profile</button>
    </form></details>
    <small>Profile changes apply to the next typing block and are saved for this workspace. Strict mode disables automatic pauses, breaks and mistakes.</small>
    <form id="break-form" class="row">
      <label>Break seconds <input id="break-seconds" type="number" min="1" max="86400" value="300" required></label>
      <button class="soft" type="submit">Take break</button>
    </form>
    <form id="command-form" class="row">
      <input id="operator-command" aria-label="Command to type and run" placeholder="git status" required>
      <button class="soft" type="submit">Type &amp; run</button>
    </form>
    <small>Pause and breaks stop input only; reasoning and running builds continue.</small>
    <div id="control-error" role="alert"></div>
  </section>
  <section id="band">
    <div id="main">
      <div id="head">
        <div id="status"><span id="dot" class="dot off"></span><span id="status-text">No session</span></div>
        <div id="controls">
          <button id="pause" class="quiet" aria-label="Pause" data-tip="Pause (Space)" aria-keyshortcuts="Space">${ICONS.pause}${ICONS.resume}</button>
          <button id="interrupt" class="quiet" aria-label="Interrupt" data-tip="Interrupt">${ICONS.stop}</button>
          <button id="turn" class="quiet" aria-label="My turn" data-tip="Take the turn: you drive, the agent navigates">${ICONS.swap}<span id="turn-label">My turn</span></button>
          <button id="end" class="quiet" aria-label="End the session" data-tip="End the session">${ICONS.exit}</button>
        </div>
      </div>
      <div id="now">
        <div id="now-text" class="empty"></div>
        <div id="now-ref"></div>
        <div id="run">
          <div id="run-label"></div>
          <div id="run-cmd"></div>
          <div id="run-actions">
            <button id="run-go" class="primary">${ICONS.play}<span>Run</span></button>
            <button id="run-always" class="soft" data-tip="Run it, and run exactly this command without asking until the session ends">Allow for session</button>
            <button id="run-skip" class="quiet">Skip</button>
          </div>
        </div>
      </div>
      <div id="idle">
        <div id="idle-title">No active session</div>
        <div id="idle-summary"></div>
        <div id="idle-text">Your files and clock are kept. Use <b>Reconnect / continue…</b> to copy a continuation prompt for your agent terminal. It starts a new editor session, not a replay of unfinished typing. First time? <a class="command" data-command="aiPair.setUpAgent">Set up your agent</a>, or <a class="command" data-command="aiPair.playDemo">play a demo</a>.</div>
      </div>
    </div>
    <div id="composer">
      <div id="attach"><span>With selection</span><a id="attach-ref"></a><button id="attach-x" class="quiet" aria-label="Don't send the selection" data-tip="Don't send the selection">×</button></div>
      <div id="compose-row">
        <textarea id="reply" rows="1" aria-label="Reply to the agent" placeholder="Reply to the agent…"></textarea>
        <button id="send" class="quiet" aria-label="Send" data-tip="Send (Enter)">${ICONS.send}</button>
      </div>
    </div>
  </section>
  <section id="history" aria-label="Earlier, newest first"></section>
</div>
<div id="tip" role="tooltip" hidden></div>
<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  const $ = (id) => document.getElementById(id);
  const ui = {
    band: $("band"), dot: $("dot"), status: $("status-text"), pause: $("pause"), interrupt: $("interrupt"),
    turn: $("turn"), turnLabel: $("turn-label"), end: $("end"),
    now: $("now-text"), ref: $("now-ref"),
    idleTitle: $("idle-title"), idleSummary: $("idle-summary"), idleText: $("idle-text"),
    reply: $("reply"), send: $("send"), attach: $("attach"), attachRef: $("attach-ref"), attachX: $("attach-x"),
    run: $("run"), runLabel: $("run-label"), runCmd: $("run-cmd"), runGo: $("run-go"), runAlways: $("run-always"), runSkip: $("run-skip"),
    history: $("history"), tip: $("tip"),
  };
  let active = false, turn = "agent", paused = false, replaying = false;
  let state = null;     // the agent's state, as the extension last reported it
  let selection = null, selectionDismissed = false;   // the programmer's selection, offered with the reply
  let runId = null, runConfirming = false;   // the command shown in the run box
  let current = null;   // text of the current message
  let reading = null;   // { ms, elapsed, last }
  let pointed = null;   // a link to the code the agent just pointed at, shown with the message about it

  const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  // A code span that names a file, like \`game.ts\` or \`src/game.ts\`, becomes a link that opens it.
  const FILE = /^[\\w@.~-]*(\\/[\\w@.~-]+)*\\.(ts|tsx|js|jsx|mjs|cjs|json|jsonc|md|css|scss|less|html|vue|svelte|py|rs|go|java|kt|swift|c|h|cc|cpp|hpp|cs|rb|php|lua|sh|zsh|toml|yaml|yml|xml|sql|txt|lock|env)$/;
  const URL = /\\bhttps?:\\/\\/[^\\s<>"'\`]*[^\\s<>"'\`.,;:!?)\\]]/g;
  const codeSpan = (code) =>
    FILE.test(code) && !code.startsWith(".") ? '<a class="file" data-file="' + code + '">' + code + "</a>" : "<code>" + code + "</code>";
  const rich = (s) => esc(s).split(/(\`[^\`]+\`)/).map((part, i) =>
    i % 2 === 1 ? codeSpan(part.slice(1, -1)) : part.replace(URL, (u) => '<a class="url" data-url="' + u + '">' + u + "</a>")).join("");

  function add(el) {
    ui.history.prepend(el);
    return el;
  }

  function entry(cls, html) {
    const el = document.createElement("div");
    el.className = "entry " + cls;
    if (html !== undefined) el.innerHTML = html;
    return el;
  }

  function addAgent(html) { add(entry("agent", html)); }

  function addDivider(text) { add(entry("divider")).textContent = text; }

  function refLink(ref) {
    const a = document.createElement("a");
    a.className = "ref";
    a.textContent = ref.file + ":" + ref.line + (ref.endLine > ref.line ? "–" + ref.endLine : "");
    a.onclick = () => vscode.postMessage({ type: "open", file: ref.file, line: ref.line });
    return a;
  }

  function addYou(text, ref) {
    const el = entry("you", text ? rich(text) : "");
    if (ref) el.append(refLink(ref));
    add(el);
  }

  function addRun(id, command, phase, exitCode) {
    const el = entry("run");
    el.dataset.run = String(id);
    const cmd = document.createElement("span");
    cmd.className = "cmd";
    cmd.textContent = command;
    cmd.dataset.tip = command;
    const outcome = document.createElement("span");
    el.append(cmd, outcome);
    setOutcome(el, phase, exitCode);
    add(el);
  }

  function setOutcome(el, phase, exitCode) {
    const outcome = el.querySelector(".outcome") || el.lastElementChild;
    outcome.className = "outcome";
    el.classList.toggle("skipped", phase === "declined");
    if (phase === "declined") outcome.textContent = "⊘ skipped";
    else if (phase === "background") outcome.textContent = "still running";
    else if (exitCode === undefined) outcome.textContent = phase === "exited" ? "ended" : "done";
    else if (exitCode === 0) { outcome.classList.add("ok"); outcome.textContent = "✓ exit 0"; }
    // Interrupted (Ctrl+C) or terminated, like a server being restarted: not a failure.
    else if (exitCode === 130 || exitCode === 143) outcome.textContent = "■ stopped";
    else { outcome.classList.add("fail"); outcome.textContent = "✕ exit " + exitCode; }
  }

  const attaching = () => active && selection !== null && !selectionDismissed;
  function syncAttach() {
    ui.attach.classList.toggle("on", attaching());
    if (attaching()) ui.attachRef.replaceChildren(refLink(selection));
  }

  // Fades something new in the band in, restarting the fade if it's still going.
  function arrive(el) {
    if (replaying) return;
    el.classList.remove("arrive");
    void el.offsetWidth;
    el.classList.add("arrive");
  }

  function setNow(text) {
    if (current !== null) addAgent(rich(current));
    current = text;
    ui.now.className = "";
    ui.now.innerHTML = rich(text);
    // The agent points first, then says what's there.
    ui.ref.replaceChildren(...(pointed ? [pointed] : []));
    pointed = null;
    arrive(ui.now);
  }

  // The reading pause fills a ring around the status dot.
  function startReading(ms) {
    if (replaying) return;
    reading = { ms, elapsed: 0, last: performance.now() };
    ui.dot.style.setProperty("--progress", "0");
    syncReading();
    requestAnimationFrame(tick);
  }

  function tick(t) {
    if (!reading) return;
    if (!paused) reading.elapsed += t - reading.last;
    reading.last = t;
    const f = Math.min(1, reading.elapsed / reading.ms);
    ui.dot.style.setProperty("--progress", String(f));
    if (f >= 1) { reading = null; syncReading(); return; }
    requestAnimationFrame(tick);
  }

  function syncReading() { ui.dot.classList.toggle("reading", reading !== null); }

  const STATUS = {
    typing: ["", "Agent is typing"],
    read: ["read", "Read this"],
    running: ["", "Running a command"],
    thinking: ["dim", "Agent is thinking"],
    paused: ["dim", "Paused"],
    listening: ["ring", "Your move"],
    navigator: ["ring", "Your turn"],
  };

  function syncStatus() {
    if (!active) {
      ui.dot.className = "dot off";
      ui.status.textContent = "No session";
      return;
    }
    const [cls, text] = runConfirming ? ["read", "Needs you"] : STATUS[state] || ["", "Session started"];
    ui.dot.className = "dot " + cls;
    syncReading();
    ui.status.textContent = text;
  }

  function setState(e) {
    state = e.state; turn = e.turn; paused = e.paused;
    document.body.classList.toggle("paused", paused);
    document.body.classList.toggle("user-turn", turn === "user");
    ui.pause.classList.toggle("on", paused);
    ui.pause.setAttribute("aria-label", paused ? "Resume" : "Pause");
    setTip(ui.pause, paused ? "Resume (Space)" : "Pause (Space)");
    ui.turnLabel.textContent = turn === "user" ? "Hand back" : "My turn";
    ui.turn.setAttribute("aria-label", ui.turnLabel.textContent);
    setTip(ui.turn, turn === "user" ? "Hand the turn back to the agent, with your reply if you typed one" : "Take the turn: you drive, the agent navigates");
    syncStatus();
    syncTip();
  }

  function setActive(on) {
    active = on;
    document.body.classList.toggle("active", on);
    ui.reply.disabled = !on;
    if (!on) {
      reading = null;
      runId = null; runConfirming = false; ui.run.className = "";
      closeSpeedMenu();
    }
    syncStatus();
    syncAttach();
    syncTip();
  }

  function handle(e) {
    switch (e.type) {
      case "resetView":
        ui.history.replaceChildren(); current = null; setActive(false); return;
      case "replay":
        replaying = true;
        for (const ev of e.events) handle(ev);
        replaying = false;
        return;
      case "session":
        if (e.active) {
          if (current !== null) addAgent(rich(current));
          current = null;
          state = null;
          ui.now.className = "empty";
          ui.now.textContent = "Waiting for the agent…";
          ui.ref.innerHTML = "";
          pointed = null;
          addDivider("Session started" + (e.task ? ": " + e.task : ""));
          setActive(true);
        } else {
          if (current !== null) addAgent(rich(current));
          current = null;
          const why = { agent: "The agent ended the session", user: "You ended the session", disconnected: "The agent disconnected" }[e.reason];
          addDivider(why);
          ui.idleTitle.textContent = e.reason === "disconnected" ? "The agent disconnected" : "Session ended";
          ui.idleSummary.innerHTML = e.summary ? rich(e.summary) : "";
          ui.idleText.textContent = "Ask your agent to pair again.";
          setActive(false);
        }
        return;
      case "say": setNow(e.text); return;
      case "reading": startReading(e.ms); return;
      case "state": setState(e); return;
      case "user": addYou(e.text, e.ref); return;
      case "interrupt": addDivider("You interrupted"); return;
      case "turn":
        addDivider(e.to === "user" ? "You took the turn" : "You handed the turn back");
        if (e.message || e.ref) addYou(e.message, e.ref);
        ui.reply.placeholder = e.to === "user" ? "Ask the agent…" : "Reply to the agent…";
        return;
      case "point": {
        const a = document.createElement("a");
        a.className = "ref";
        a.textContent = "→ " + e.file + ":" + e.line;
        a.onclick = () => vscode.postMessage({ type: "open", file: e.file, line: e.line });
        pointed = a;
        return;
      }
      case "run": {
        if (e.phase === "confirm" || e.phase === "running") {
          runId = e.id;
          runConfirming = e.phase === "confirm";
          ui.run.className = "on" + (runConfirming ? " confirm" : "");
          ui.runLabel.textContent = runConfirming ? "Allow this command in the terminal?" : "Running in the terminal…";
          ui.runCmd.textContent = e.command;
          syncStatus();
          if (runConfirming) arrive(ui.run);
          return;
        }
        if (e.phase === "exited") {
          // A command left running has ended: its row says how.
          const row = ui.history.querySelector('.run[data-run="' + e.id + '"]');
          if (row) setOutcome(row, e.phase, e.exitCode);
          return;
        }
        if (runId === e.id) { runId = null; runConfirming = false; ui.run.className = ""; syncStatus(); }
        addRun(e.id, e.command, e.phase, e.exitCode);
        return;
      }
      case "selection":
        selection = e.ref || null;
        selectionDismissed = false;
        syncAttach();
        return;
      case "focusReply": ui.reply.focus(); return;
    }
  }

  window.addEventListener("message", (m) => handle(m.data));
  let cadenceDirty = false;
  let currentProfile = ${JSON.stringify({ timing: defaultTiming, seed: 20261012 })};
  window.addEventListener("message", ({ data: e }) => {
    if (e.type === "controlResult") { $("control-error").textContent = e.error; if (e.profileApplied && !e.error) cadenceDirty = false; return; }
    if (e.type !== "metrics") return;
    const m = e.data;
    const seconds = (ms) => Math.round((ms || 0) / 1000) + "s";
    $("metric-elapsed").textContent = seconds(m.elapsedMs);
    $("metric-wpm").textContent = (m.effectiveWpm || 0).toFixed(1);
    $("metric-physical").textContent = seconds(m.physicalActionMs);
    $("metric-queue").textContent = seconds(m.queueWaitMs);
    $("metric-chars").textContent = m.charactersTyped || 0;
    $("metric-clipboard").textContent = m.clipboardOperations || 0;
    $("metric-commands").textContent = m.commandsExecuted || 0;
    $("metric-blocked").textContent = m.blockedBypassAttempts || 0;
    $("metric-corrections").textContent = (m.typingCorrections || 0) + " / " + (m.falseStarts || 0);
    $("metric-breaks").textContent = (m.automaticBreaks || 0) + " / " + seconds(m.automaticBreakMs);
    $("metric-remaining").textContent = m.queuedCharacters || 0;
    const left = Math.ceil(Math.max(0, m.typingEtaMs || 0) / 1000);
    const duration = left >= 60 ? Math.floor(left / 60) + "m " + String(left % 60).padStart(2, "0") + "s" : left + "s";
    $("metric-eta").textContent = m.queuedCharacters > 0 ? "~" + duration + (m.typingEtaState === "paused" ? " after resume" : m.typingEtaState === "confirmation" ? " after confirmation" : "") : "No input queued";
    $("eta-note").textContent = (m.typingEtaState === "command-running" ? "Build/command running; its runtime is unknown. " : m.typingEtaState === "break" ? "Current break included. " : "") + "Known typing queue only—not project completion. Excludes future AI output, navigation and build runtime; optional input delays are estimates.";
    const reasons = (m.pauseReasons || []).filter(r => r !== "break").map(r => ({ operator: "manual pause", user: "manual pause", workspace: "workspace-wide pause", reply: "reply being drafted", away: "editor navigation / looked away" }[r] || r));
    const breaks = m.automaticBreakRemainingMs > 0 ? "automatic break · " + seconds(m.automaticBreakRemainingMs) + " left" : m.breakRemainingMs > 0 ? "timed break · " + seconds(m.breakRemainingMs) + " left" : "";
    $("operator-state").dataset.paused = String(Boolean(m.paused));
    const selected = (m.agents || []).find(a => a.id === m.selectedAgent);
    $("operator-state").textContent = (selected ? selected.name + " · " : "") + (m.paused ? "Paused" + (reasons.length ? " · " + reasons.join(", ") : "") : m.active ? selected?.lane || "Agent connected" : "Editor ready · waiting for agent") + (breaks ? " · " + breaks : "") + (m.running ? " · clock running" : " · clock stopped");
    if (m.extensionVersion) $("extension-version").textContent = "v" + m.extensionVersion;
    if (m.workspaceTotals) $("workspace-totals").textContent = "Workspace: " + m.workspaceTotals.charactersTyped + " typed · " + m.workspaceTotals.commandsExecuted + " commands · " + m.workspaceTotals.clipboardOperations + " clipboard ops";
    if (m.agents) {
      $("session-summary").textContent = "Sessions & typers · " + m.agents.filter(a => a.connected && a.active).length + " active";
      const picker = $("agent-picker");
      const displayedAgents = [...m.agents].sort((a, b) => Number(b.connected && b.active) - Number(a.connected && a.active));
      const signature = JSON.stringify(displayedAgents.map(a => [a.id, a.name, a.connected, a.active]));
      if (picker.dataset.signature !== signature) {
        picker.replaceChildren();
        if (!m.agents.length) picker.add(new Option("Waiting for agent", ""));
        for (const a of displayedAgents) picker.add(new Option(a.name + " [" + a.id + "]" + (a.connected ? a.active ? "" : " · ended" : " · disconnected"), a.id));
        picker.dataset.signature = signature;
      }
      picker.value = m.selectedAgent || "";
      picker.dataset.selected = picker.value;
      $("agent-list").replaceChildren();
      for (const a of displayedAgents) {
        const card = document.createElement("div"); card.className = "agent-card" + (a.id === m.selectedAgent ? " selected" : "");
        const name = document.createElement("strong"); name.textContent = a.name + (a.id === m.leadAgent && m.typingMode === "lead" ? " · lead" : "");
        const info = document.createElement("small"); info.textContent = (a.connected ? a.active ? a.paused ? "paused" : a.lane : "session ended" : "disconnected") + " · " + (a.charactersTyped || 0) + " typed · " + (a.queuedCharacters || 0) + " queued";
        card.append(name, info); $("agent-list").append(card);
      }
      $("typing-mode").value = m.typingMode || "shared";
      $("mode-note").textContent = m.typingMode === "individual" ? "Separate WPM budgets. Total throughput increases: outside single-human benchmark rules. Same-file edits and commands stay locked." : m.typingMode === "lead" ? "Only the selected lead writes. Other agents may read and advise; advice forwarding is not automated." : "One shared queue. Adding agents does not increase typing throughput. ETA excludes other agents’ waiting time.";
    }
    if (m.windows) {
      const picker = $("workspace-picker"); const signature = JSON.stringify(m.windows);
      if (picker.dataset.signature !== signature) { picker.replaceChildren(); picker.add(new Option("This window", "local")); for (const w of m.windows) picker.add(new Option(w.name, w.id)); picker.dataset.signature = signature; }
      picker.value = m.selectedWindow || "local";
      picker.dataset.selected = picker.value;
    }
    if (m.profile) currentProfile = m.profile;
    if (!cadenceDirty) {
      for (const field of document.querySelectorAll("[data-profile-key]")) {
        if (document.activeElement === field) continue;
        const source = field.dataset.profileGroup === "navigation" ? currentProfile.timing : currentProfile.timing[field.dataset.profileGroup];
        field.value = source[field.dataset.profileKey] * Number(field.dataset.profileScale);
      }
      if (document.activeElement !== $("profile-seed")) $("profile-seed").value = currentProfile.seed;
    }
    if (document.activeElement !== $("target-wpm") && !cadenceDirty) $("target-wpm").value = m.configuredWpm || 60;
    if (document.activeElement !== $("cadence-mode") && !cadenceDirty) $("cadence-mode").value = m.configuredMode || "variable";
  });
  const control = (operation, args = {}) => vscode.postMessage({ type: "control", operation, ...args });
  $("cadence-form").oninput = () => { cadenceDirty = true; };
  for (const button of document.querySelectorAll("[data-control]")) button.onclick = () => control(button.dataset.control, { scope: button.dataset.scope });
  const switchTarget = (id, operation) => {
    const picker = $(id);
    if (ui.reply.value.trim()) { picker.value = picker.dataset.selected || ""; $("control-error").textContent = "Send or clear your drafted reply before switching targets."; return; }
    control(operation, { value: picker.value });
  };
  $("agent-picker").onchange = () => switchTarget("agent-picker", "selectAgent");
  $("typing-mode").onchange = () => control("typingMode", { value: $("typing-mode").value, leadAgent: $("agent-picker").value });
  $("set-lead").onclick = () => control("typingMode", { value: "lead", leadAgent: $("agent-picker").value });
  $("workspace-picker").onchange = () => switchTarget("workspace-picker", "selectWindow");
  $("cadence-form").onsubmit = (e) => {
    e.preventDefault();
    const timing = { type: { wpm: Number($("target-wpm").value), mode: $("cadence-mode").value }, reading: {} };
    for (const field of document.querySelectorAll("[data-profile-key]")) {
      const target = field.dataset.profileGroup === "navigation" ? timing : timing[field.dataset.profileGroup];
      target[field.dataset.profileKey] = Number(field.value) / Number(field.dataset.profileScale);
    }
    control("profile", { profile: { timing, seed: Number($("profile-seed").value) } });
  };
  $("break-form").onsubmit = (e) => { e.preventDefault(); control("break", { value: Number($("break-seconds").value) }); };
  $("command-form").onsubmit = (e) => { e.preventDefault(); control("run", { command: $("operator-command").value }); };

  let draftEmpty = true;
  function syncDraft() {
    const empty = ui.reply.value.trim() === "";
    ui.reply.style.height = "auto";
    ui.reply.style.height = Math.min(ui.reply.scrollHeight, 120) + "px";
    if (empty !== draftEmpty) { draftEmpty = empty; vscode.postMessage({ type: "draft", empty }); }
  }
  function takeDraft() {
    const text = ui.reply.value.trim();
    ui.reply.value = "";
    draftEmpty = true;
    syncDraft();
    return text;
  }
  function takeAttach() {
    const on = attaching();
    if (on) { selectionDismissed = true; syncAttach(); }
    return on;
  }
  function sendReply() {
    const text = takeDraft();
    if (text) vscode.postMessage({ type: "reply", text, attach: takeAttach() });
  }

  ui.reply.addEventListener("input", syncDraft);
  ui.reply.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      sendReply();
    } else if (e.key === "Escape") {
      ui.reply.blur();
    }
  });
  ui.send.onclick = sendReply;
  ui.pause.onclick = () => vscode.postMessage({ type: paused ? "resume" : "pause" });
  ui.interrupt.onclick = () => vscode.postMessage({ type: "interrupt" });
  ui.turn.onclick = () => {
    const handingBack = turn === "user";
    const message = handingBack ? takeDraft() : "";
    const attach = handingBack && takeAttach();
    vscode.postMessage({ type: "turn", ...(message ? { message } : {}), ...(attach ? { attach } : {}) });
  };
  ui.attachX.onclick = () => { selectionDismissed = true; syncAttach(); };
  const decide = (run, remember) => { if (runId !== null) vscode.postMessage({ type: "runDecision", id: runId, run, remember }); };
  ui.runGo.onclick = () => decide(true, false);
  ui.runAlways.onclick = () => decide(true, true);
  ui.runSkip.onclick = () => decide(false, false);
  ui.end.onclick = () => vscode.postMessage({ type: "end" });

  // Tooltips: an element's data-tip shows under it after a moment's hover, or at once while one is
  // showing or just was, the way VS Code's own hovers do; and on keyboard focus. A click hides it.
  const TIP_DELAY_MS = 500, TIP_WARM_MS = 300, TIP_GAP = 4, TIP_MARGIN = 6;
  let tipTarget = null, tipTimer = 0, tipWarmUntil = 0;

  function setTip(el, text) {
    el.dataset.tip = text;
    if (el === tipTarget) { ui.tip.textContent = text; placeTip(); }
  }

  function showTip(el) {
    clearTimeout(tipTimer);
    tipTarget = el;
    ui.tip.textContent = el.dataset.tip;
    ui.tip.hidden = false;
    el.setAttribute("aria-describedby", "tip");
    placeTip();
  }

  // Under the element, centered on it, inside the panel; above it if there's no room below.
  function placeTip() {
    const r = tipTarget.getBoundingClientRect(), w = ui.tip.offsetWidth, h = ui.tip.offsetHeight;
    const left = Math.max(TIP_MARGIN, Math.min(r.left + r.width / 2 - w / 2, innerWidth - w - TIP_MARGIN));
    const top = r.bottom + TIP_GAP + h <= innerHeight - TIP_MARGIN ? r.bottom + TIP_GAP : r.top - TIP_GAP - h;
    ui.tip.style.left = left + "px";
    ui.tip.style.top = Math.max(TIP_MARGIN, top) + "px";
  }

  function hideTip() {
    clearTimeout(tipTimer);
    if (!tipTarget) return;
    tipTarget.removeAttribute("aria-describedby");
    tipTarget = null;
    ui.tip.hidden = true;
    tipWarmUntil = performance.now() + TIP_WARM_MS;
  }

  function hoverTip(el) {
    if (el === tipTarget) return;
    const warm = tipTarget !== null || performance.now() < tipWarmUntil;
    hideTip();
    if (!el) return;
    if (warm) showTip(el);
    else tipTimer = setTimeout(() => showTip(el), TIP_DELAY_MS);
  }

  // The element went away or moved, when the panel changed under it.
  function syncTip() {
    if (!tipTarget) return;
    if (tipTarget.getClientRects().length === 0) hideTip();
    else placeTip();
  }

  document.addEventListener("pointerover", (e) => hoverTip(e.target.closest("[data-tip]")));
  document.documentElement.addEventListener("pointerleave", () => hoverTip(null));
  document.addEventListener("pointerdown", hideTip, true);
  document.addEventListener("focusin", (e) => { if (e.target.matches("[data-tip]:focus-visible")) showTip(e.target); });
  document.addEventListener("focusout", (e) => { if (e.target === tipTarget) hideTip(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") hideTip(); }, true);
  document.addEventListener("scroll", hideTip, true);
  window.addEventListener("blur", hideTip);

  // Space pauses and resumes, anywhere in the panel but the reply box. It doesn't press the focused
  // button, which after a click could be End; Enter still does.
  document.addEventListener("keydown", (e) => {
    if (e.key !== " " || e.ctrlKey || e.metaKey || e.altKey || !active) return;
    if (["INPUT", "SELECT", "TEXTAREA", "BUTTON", "SUMMARY"].includes(e.target.tagName)) return;
    e.preventDefault();
    if (e.repeat || turn === "user") return;
    vscode.postMessage({ type: paused ? "resume" : "pause" });
  });

  // File names in messages open the file, URLs open in the browser, and the intro's commands run.
  document.addEventListener("click", (e) => {
    const a = e.target.closest && e.target.closest("a.file, a.url, a.command");
    if (a?.dataset.file) vscode.postMessage({ type: "openFile", file: a.dataset.file });
    if (a?.dataset.url) vscode.postMessage({ type: "openUrl", url: a.dataset.url });
    if (a?.dataset.command) vscode.postMessage({ type: "command", command: a.dataset.command });
  });

  vscode.postMessage({ type: "ready" });
</script>
</body>
</html>`
}
