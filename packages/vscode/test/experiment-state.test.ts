import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { expect, it, vi } from "vitest"
import type * as vscode from "vscode"
import { registerExperiment } from "../src/experiment"
import { setup } from "../../core/test/fake"

vi.mock("vscode", () => ({
  StatusBarAlignment: { Left: 1 },
  window: { createStatusBarItem: () => ({ show() {}, dispose() {} }) },
  commands: { registerCommand: () => ({ dispose() {} }) },
}))

it("retains secondary-agent checkpoints as history across repeated restarts, without resurrecting sessions", () => {
  vi.useFakeTimers()
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "human-body-state-"))
  const subscriptions: vscode.Disposable[] = []
  const context = { subscriptions } as unknown as vscode.ExtensionContext
  try {
    const dir = path.join(root, ".human-body-mode")
    fs.mkdirSync(dir)
    const state = path.join(dir, "metrics.json")
    const previous = { id: "agent-2", charactersTyped: 7, active: true }
    fs.writeFileSync(state, JSON.stringify({ running: true, startedAt: new Date(Date.now() - 5000).toISOString(), elapsedMs: 5000, physicalActionMs: 1000, queueWaitMs: 0, charactersTyped: 5, clipboardOperations: 0, commandsExecuted: 0, effectiveWpm: 60, agents: [previous] }))
    for (let restart = 0; restart < 2; restart++) {
      const { controller } = setup()
      registerExperiment(context, controller, root, () => {}, () => ({ agents: [], selectedAgent: "" }))
      expect(controller.isActive).toBe(false)
      expect(controller.metricsSnapshot().charactersTyped).toBe(5)
      expect(JSON.parse(fs.readFileSync(state, "utf8"))).toMatchObject({ agents: [], previousAgents: [previous] })
      for (const resource of subscriptions.splice(0)) resource.dispose()
    }
  } finally {
    for (const resource of subscriptions) resource.dispose()
    fs.rmSync(root, { recursive: true, force: true })
    vi.useRealTimers()
  }
})
