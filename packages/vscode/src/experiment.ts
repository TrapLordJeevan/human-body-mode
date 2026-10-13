import * as fs from "node:fs"
import * as path from "node:path"
import * as vscode from "vscode"
import type { Controller, MetricsSnapshot } from "@ai-pair/core"

type Exported = MetricsSnapshot & {
  blockedBypassAttempts: number
  workspaceTotals?: { charactersTyped: number }
  selectedAgent?: string
  agents?: (MetricsSnapshot & { id: string; queuedCharacters: number; typingEtaMs: number; typingEtaState: string })[]
}

export function metricsCsv(data: object): string {
  const entries = Object.entries(data)
  const cell = (value: unknown) => `"${String(typeof value === "object" ? JSON.stringify(value) : value ?? "").replaceAll('"', '""')}"`
  return `${entries.map(([key]) => cell(key)).join(",")}\n${entries.map(([, value]) => cell(value)).join(",")}\n`
}

export function registerExperiment(context: vscode.ExtensionContext, controller: Controller, root: string, publish: (data: object) => void, sessionData: () => object = () => ({})): void {
  const dir = path.join(root, ".human-body-mode")
  const stateFile = path.join(dir, "metrics.json")
  const hookLog = path.join(dir, "blocked.jsonl")
  let previousAgents: unknown[] = []
  try {
    const saved = JSON.parse(fs.readFileSync(stateFile, "utf8")) as MetricsSnapshot & { agents?: unknown[]; previousAgents?: unknown[] }
    controller.metrics.restore(saved)
    previousAgents = (saved.agents?.length ? saved.agents : saved.previousAgents ?? []).slice(-64)
  } catch {
    // A missing or partial crash-state file starts a new clock on the first session.
  }

  const blocked = () => {
    try {
      return fs.readFileSync(hookLog, "utf8").split("\n").filter(Boolean).length
    } catch {
      return 0
    }
  }
  const data = (): Exported => ({ ...controller.metricsSnapshot(), ...controller.controlStatus(), ...sessionData(), ...(previousAgents.length ? { previousAgents } : {}), blockedBypassAttempts: blocked() })
  const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100)
  item.command = "humanBody.open"
  item.name = "Human Body Mode"
  item.show()

  const update = () => {
    const m = data()
    publish(m)
    const selected = m.agents?.find(a => a.id === m.selectedAgent)
    const shown = selected ?? m
    item.text = `$(keyboard) ${Math.round(m.elapsedMs / 1000)}s · ${m.workspaceTotals?.charactersTyped ?? m.charactersTyped} chars · ${shown.effectiveWpm.toFixed(1)} WPM · ${m.blockedBypassAttempts} blocked`
    const eta = selected ?? controller.typingEstimate()
    item.tooltip = `This workspace: selected-agent physical actions ${Math.round(shown.physicalActionMs / 1000)}s; queue wait ${Math.round(shown.queueWaitMs / 1000)}s; clipboard ${shown.clipboardOperations}; commands ${shown.commandsExecuted}; queued typing ${eta.queuedCharacters} chars / ~${Math.ceil(eta.typingEtaMs / 1000)}s (${eta.typingEtaState}; excludes builds and future output)`
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(stateFile, JSON.stringify(m, null, 2))
  }
  const timer = setInterval(update, 1000)
  update()

  context.subscriptions.push(
    item,
    { dispose: () => clearInterval(timer) },
    vscode.commands.registerCommand("humanBody.start", () => {
      controller.resetMetrics()
      update()
    }),
    vscode.commands.registerCommand("humanBody.stop", () => {
      controller.stopMetrics()
      update()
    }),
    vscode.commands.registerCommand("humanBody.reset", () => {
      controller.resetMetrics()
      try { fs.unlinkSync(hookLog) } catch {}
      update()
    }),
    vscode.commands.registerCommand("humanBody.export", () => {
      const m = data()
      fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(path.join(dir, "experiment.json"), JSON.stringify(m, null, 2))
      fs.writeFileSync(path.join(dir, "experiment.csv"), metricsCsv(m))
      void vscode.window.showInformationMessage(`Human Body Mode logs exported to ${dir}`)
    }),
  )
}
