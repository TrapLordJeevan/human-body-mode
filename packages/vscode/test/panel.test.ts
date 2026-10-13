// The panel's page is a template literal holding a script: an escape lost in the template (a `\b`
// in a regex, say) only shows as a panel that stays blank. Parse the script as the webview would.

import { expect, it } from "vitest"
import { panelHtml } from "../src/panelHtml"
import { PROFILE_FIELDS } from "@ai-pair/core"

it("has a page script that parses", () => {
  const html = panelHtml("vscode-resource:")
  const scripts = [...html.matchAll(/<script nonce="[^"]+">([\s\S]*?)<\/script>/g)].map((m) => m[1]!)
  expect(scripts).toHaveLength(1)
  expect(() => new Function(scripts[0]!)).not.toThrow()
})

it("offers real WPM, cadence, break and clock controls even without an agent session", () => {
  const html = panelHtml("vscode-resource:")
  for (const id of ["dashboard", "target-wpm", "cadence-mode", "break-seconds", "operator-command", "metric-physical", "metric-blocked"]) expect(html).toContain(`id="${id}"`)
  expect(html).toContain('data-control="reset"')
  expect(html).not.toContain('id="speed-menu"')
  expect(html).toContain('["INPUT", "SELECT", "TEXTAREA", "BUTTON", "SUMMARY"]')
})

it("gives controls the panel's own tooltips, since native ones show unreliably in a webview", () => {
  const html = panelHtml("vscode-resource:")
  expect(html).not.toMatch(/\stitle=|\.title = /)
  expect(html).toContain('data-tip="Interrupt"')
})

it("exposes every validated profile parameter with units and a seed", () => {
  const html = panelHtml("vscode-resource:")
  for (const [, key] of PROFILE_FIELDS) expect(html).toContain(`id="profile-${key}"`)
  expect(html).toContain('id="profile-seed"')
  expect(html).toContain("Mistakes and corrections")
  expect(html).toContain("Automatic breaks")
  expect(html).toContain('control("profile",')
})

it("labels the queued typing ETA without claiming a project-completion prediction", () => {
  const html = panelHtml("vscode-resource:")
  expect(html).toContain('id="metric-remaining"')
  expect(html).toContain('id="metric-eta"')
  expect(html).toContain("after resume")
  expect(html).toContain("after confirmation")
  expect(html).toContain("No input queued")
  expect(html).toContain("not project completion")
})

it("provides scoped sessions, explicit pause reasons, safe continuation and a visible version", () => {
  const html = panelHtml("vscode-resource:")
  for (const id of ["workspace-picker", "agent-picker", "typing-mode", "agent-list", "extension-version"]) expect(html).toContain(`id="${id}"`)
  expect(html).toContain('data-control="reconnect"')
  expect(html).toContain('data-scope="all"')
  expect(html).toContain("manual pause")
  expect(html).toContain("reply being drafted")
  expect(html).toContain("left")
  expect(html).toContain("Total throughput increases")
})
