import * as fs from "node:fs"
import * as path from "node:path"
import * as vscode from "vscode"
import type { Controller, MetricsSnapshot } from "@ai-pair/core"

type Exported = MetricsSnapshot & { blockedBypassAttempts: number }

export function metricsCsv(data: object): string {
  const entries = Object.entries(data)
  const cell = (value: unknown) => `"${String(typeof value === "object" ? JSON.stringify(value) : value ?? "").replaceAll('"', '""')}"`
  return `${entries.map(([key]) => cell(key)).join(",")}\n${entries.map(([, value]) => cell(value)).join(",")}\n`
}

export function registerExperiment(context: vscode.ExtensionContext, controller: Controller, root: string, publish: (data: object) => void): void {
  const dir = path.join(root, ".human-body-mode")
  const stateFile = path.join(dir, "metrics.json")
  const hookLog = path.join(dir, "blocked.jsonl")
  try {
    controller.metrics.restore(JSON.parse(fs.readFileSync(stateFile, "utf8")) as MetricsSnapshot)
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
  const data = (): Exported => ({ ...controller.metricsSnapshot(), ...controller.controlStatus(), blockedBypassAttempts: blocked() })
  const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100)
  item.command = "humanBody.open"
  item.name = "Human Body Mode"
  item.show()

  const update = () => {
    const m = data()
    publish(m)
    item.text = `$(keyboard) ${Math.round(m.elapsedMs / 1000)}s · ${m.charactersTyped} chars · ${m.effectiveWpm.toFixed(1)} WPM · ${m.blockedBypassAttempts} blocked`
    item.tooltip = `Physical actions ${Math.round(m.physicalActionMs / 1000)}s; queue wait ${Math.round(m.queueWaitMs / 1000)}s; clipboard ${m.clipboardOperations}; commands ${m.commandsExecuted}`
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
