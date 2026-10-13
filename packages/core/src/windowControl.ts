import fs from "node:fs"
import path from "node:path"
import WebSocket from "ws"
import { PROTOCOL_VERSION, type Discovery, type EditorMessage } from "@ai-pair/protocol"

export function listControlWindows(dir: string, ownFile: string): { id: string; name: string }[] {
  const windows: { id: string; name: string }[] = []
  try {
    for (const id of fs.readdirSync(dir)) {
      if (!/^\d+\.json$/.test(id) || path.join(dir, id) === ownFile) continue
      try {
        const window = JSON.parse(fs.readFileSync(path.join(dir, id), "utf8")) as Discovery
        process.kill(window.pid, 0)
        if (window.multiAgent && window.protocolVersion === PROTOCOL_VERSION) windows.push({ id, name: `${path.basename(window.workspaceFolders[0] ?? "Workspace")} · window ${window.pid}` })
      } catch { /* Stale discovery or a different user's process isn't a control target. */ }
    }
  } catch { /* No other windows yet. */ }
  return windows
}

/** Operator-only, same-host control; never forwards a discovery token to a webview. */
export async function controlWindow(dir: string, id: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
  if (!/^\d+\.json$/.test(id)) return Promise.reject(new Error("Invalid window ID"))
  const window = JSON.parse(fs.readFileSync(path.join(dir, id), "utf8")) as Discovery
  if (!window.multiAgent || window.protocolVersion !== PROTOCOL_VERSION || !Number.isInteger(window.port) || window.port < 1 || window.port > 65535) return Promise.reject(new Error("Update the target window extension before controlling it"))
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${window.port}`)
    const timer = setTimeout(() => finish(new Error("Workspace connection timed out")), 5000)
    let done = false
    const finish = (error?: Error, result?: Record<string, unknown>) => {
      if (done) return
      done = true; clearTimeout(timer); ws.close()
      if (error) reject(error)
      else resolve(result ?? {})
    }
    ws.on("open", () => ws.send(JSON.stringify({ type: "hello", token: window.token, protocolVersion: PROTOCOL_VERSION })))
    ws.on("message", data => {
      let message: EditorMessage
      try { message = JSON.parse(String(data)) as EditorMessage } catch { finish(new Error("Invalid workspace reply")); return }
      if (message.type === "welcome") ws.send(JSON.stringify({ type: "call", id: 1, tool: "control", args }))
      else if (message.type === "result") finish(undefined, message.result as Record<string, unknown>)
      else if (message.type === "error") finish(new Error(message.message))
      else if (message.type === "rejected") finish(new Error(message.reason))
    })
    ws.on("error", error => finish(error))
    ws.on("close", () => finish(new Error("Workspace disconnected")))
  })
}
