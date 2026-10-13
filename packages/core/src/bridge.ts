// The editor side of the relay connection: a WebSocket server on localhost that forwards tool
// calls to the controller, and the discovery file that lets relays find it.

import { randomBytes, timingSafeEqual } from "node:crypto"
import * as fs from "node:fs"
import * as path from "node:path"
import { WebSocketServer, type WebSocket } from "ws"
import {
  PROTOCOL_VERSION,
  ToolError,
  type Action,
  type Discovery,
  type EditorMessage,
  type RelayMessage,
  type ToolName,
} from "@ai-pair/protocol"
import type { Controller } from "./controller"
import { InputScheduler } from "./inputScheduler"

export type BridgeOptions = {
  /** Where discovery files live; see `discoveryDir()`. */
  dir: string
  workspaceFolders: () => string[]
  /** Enable independent agent sessions inside this editor window. */
  createController?: (id: string) => Controller
  selectController?: (controller: Controller, id: string) => void
  workspaceName?: string
}

export class Bridge {
  private server?: WebSocketServer
  private readonly token = randomBytes(24).toString("hex")
  private port = 0
  private lastFocused = Date.now()
  /** The relay connection whose agent started the current (or last) session. */
  private owner: WebSocket | null = null
  readonly scheduler = new InputScheduler()
  private agents = new Map<WebSocket, { id: string; name: string; controller: Controller; connected: boolean }>()
  private selected = ""
  private nextAgent = 1
  private workspacePaused = false
  private workspaceBreakUntil = 0

  constructor(
    private readonly controller: Controller,
    private readonly options: BridgeOptions,
  ) {}

  status(): object {
    const counters = this.agents.size ? [...this.agents.values()].map(a => a.controller.metricsSnapshot()) : [this.controller.metricsSnapshot()]
    const workspaceTotals = counters.reduce((total, m) => ({ charactersTyped: total.charactersTyped + m.charactersTyped, clipboardOperations: total.clipboardOperations + m.clipboardOperations, commandsExecuted: total.commandsExecuted + m.commandsExecuted }), { charactersTyped: 0, clipboardOperations: 0, commandsExecuted: 0 })
    return { workspaceName: this.options.workspaceName ?? this.options.workspaceFolders()[0] ?? "Workspace", typingMode: this.scheduler.mode, leadAgent: this.scheduler.lead, selectedAgent: this.selected,
      workspaceTotals,
      agents: [...this.agents.values()].map(a => ({ id: a.id, name: a.name, connected: a.connected, lane: this.scheduler.status(a.id), ...a.controller.controlStatus() })) }
  }

  async control(args: Record<string, unknown>): Promise<object> {
    const entries = [...this.agents.values()]
    const chosen = entries.find(a => a.id === (args.agentId ?? this.selected))
    if (args.agentId !== undefined && !chosen) throw new Error("Unknown agent")
    if (args.operation === "typingMode") {
      if (entries.some(a => a.controller.typingEstimate().queuedCharacters > 0)) throw new Error("Finish or discard pending input before switching mode")
      const lead = typeof args.leadAgent === "string" ? args.leadAgent : this.scheduler.lead || chosen?.id || ""
      if (args.value === "lead" && !entries.some(a => a.id === lead && a.connected && a.controller.isActive)) throw new Error("Select an active connected lead agent first")
      this.scheduler.setMode(args.value, lead)
    } else if (args.operation === "selectAgent") {
      const agent = entries.find(a => a.id === args.value)
      if (!agent) throw new Error("Unknown agent")
      this.selected = agent.id
      this.options.selectController?.(agent.controller, agent.id)
    } else if (args.operation !== "status") {
      const commonProfile = this.scheduler.mode !== "individual" && ["profile", "wpm", "mode"].includes(String(args.operation))
      const targets = args.scope === "all" || commonProfile ? entries.filter(a => a.connected) : chosen ? [chosen] : []
      if (args.scope === "all" && !["pause", "resume", "break", "stop"].includes(String(args.operation))) throw new Error("Unsupported workspace-wide operation")
      if (!targets.length) await this.controller.control(args)
      else for (const agent of targets) await agent.controller.control(args)
      if (args.scope === "all") {
        if (args.operation === "pause" || args.operation === "stop") this.workspacePaused = true
        if (args.operation === "resume") { this.workspacePaused = false; this.workspaceBreakUntil = 0 }
        if (args.operation === "break") this.workspaceBreakUntil = Date.now() + Number(args.value) * 1000
      }
      if (commonProfile && !targets.some(a => a.controller === this.controller)) await this.controller.control(args)
      if (args.operation === "stop") this.controller.stopMetrics()
      if (args.operation === "reset") {
        for (const agent of entries) if (agent.controller !== this.controller) agent.controller.resetMetrics()
        this.controller.resetMetrics()
      }
    }
    const selected = entries.find(a => a.id === this.selected)
    return { ...(selected?.controller ?? this.controller).controlStatus(), elapsedMs: this.controller.metricsSnapshot().elapsedMs, running: this.controller.metricsSnapshot().running, ...this.status() }
  }

  get file(): string {
    return path.join(this.options.dir, `${process.pid}.json`)
  }

  async start(): Promise<void> {
    const server = new WebSocketServer({ host: "127.0.0.1", port: 0 })
    this.server = server
    await new Promise<void>((resolve, reject) => {
      server.once("listening", resolve)
      server.once("error", reject)
    })
    const address = server.address()
    this.port = typeof address === "object" && address ? address.port : 0
    server.on("connection", (ws) => this.accept(ws))
    this.writeDiscovery()
  }

  /** Call when the window gains focus, so relays prefer it among windows with the same folder. */
  focused(): void {
    this.lastFocused = Date.now()
    this.writeDiscovery()
  }

  /** Call when the workspace folders change. */
  writeDiscovery(): void {
    if (!this.server) return
    const discovery: Discovery = {
      pid: process.pid,
      workspaceFolders: this.options.workspaceFolders(),
      port: this.port,
      token: this.token,
      protocolVersion: PROTOCOL_VERSION,
      lastFocused: this.lastFocused,
      multiAgent: Boolean(this.options.createController),
    }
    fs.mkdirSync(this.options.dir, { recursive: true, mode: 0o700 })
    fs.writeFileSync(this.file, JSON.stringify(discovery), { mode: 0o600 })
  }

  dispose(): void {
    try {
      fs.unlinkSync(this.file)
    } catch {
      // Already gone.
    }
    for (const client of this.server?.clients ?? []) client.terminate()
    this.server?.close()
    this.server = undefined
  }

  private accept(ws: WebSocket): void {
    let authenticated = false
    const calls = new Map<number, AbortController>()
    const send = (m: EditorMessage) => {
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(m))
    }

    ws.on("message", (data) => {
      let m: RelayMessage
      try {
        m = JSON.parse(String(data)) as RelayMessage
      } catch {
        return
      }
      if (!authenticated) {
        if (m.type !== "hello" || !this.tokenMatches(m.token)) {
          send({ type: "rejected", reason: "Authentication failed." })
          ws.close()
        } else if (m.protocolVersion !== PROTOCOL_VERSION) {
          send({
            type: "rejected",
            reason: `Protocol version mismatch (editor ${PROTOCOL_VERSION}, relay ${m.protocolVersion}). The extension was updated: reload the VS Code window and restart the agent.`,
          })
          ws.close()
        } else {
          authenticated = true
          send({ type: "welcome" })
        }
        return
      }
      if (m.type === "cancel") {
        calls.get(m.id)?.abort()
      } else if (m.type === "return") {
        if (this.options.createController) this.agents.get(ws)?.controller.restore(m.report)
        else if (this.owner === ws) this.controller.restore(m.report)
      } else if (m.type === "call") {
        const abort = new AbortController()
        calls.set(m.id, abort)
        this.dispatch(ws, m.tool, m.args ?? {}, abort.signal)
          .then(
            (result) => send({ type: "result", id: m.id, result }),
            (e: unknown) =>
              send({
                type: "error",
                id: m.id,
                code: e instanceof ToolError ? e.code : "internal",
                message: e instanceof Error ? e.message : String(e),
              }),
          )
          .finally(() => calls.delete(m.id))
      }
    })

    ws.on("close", () => {
      for (const abort of calls.values()) abort.abort()
      if (this.owner === ws) {
        this.owner = null
        this.controller.disconnect()
      }
      const agent = this.agents.get(ws)
      if (agent) { agent.connected = false; agent.controller.disconnect() }
    })
  }

  private async dispatch(ws: WebSocket, tool: ToolName, args: Record<string, unknown>, signal: AbortSignal): Promise<unknown> {
    if (tool === "control") return this.options.createController ? this.control(args) : this.controller.control(args)
    let c = this.controller
    if (this.options.createController) {
      let agent = this.agents.get(ws)
      if (tool === "start" && !agent) {
        if (this.agents.size >= 64) throw new ToolError("session_active", "Agent history is full. Reload at a safe stopping point.")
        const id = `agent-${this.nextAgent++}`
        c = this.agents.size === 0 ? this.controller : this.options.createController(id)
        c.acquireInput = (files, signal) => this.scheduler.acquire(id, files, signal)
        c.breakMetrics = () => this.scheduler.mode === "individual" ? c.metrics : this.controller.metrics
        if (this.workspacePaused) c.pause("workspace")
        if (this.workspaceBreakUntil > Date.now()) await c.control({ operation: "break", value: Math.max(1, (this.workspaceBreakUntil - Date.now()) / 1000) })
        agent = { id, name: optionalString(args.task)?.slice(0, 80) || `Agent ${this.nextAgent - 1}`, controller: c, connected: true }
        this.agents.set(ws, agent)
        const selected = [...this.agents.values()].find(a => a.id === this.selected)
        if (!selected || !selected.connected || !selected.controller.isActive) {
          this.selected = id
          if (!this.scheduler.lead) this.scheduler.lead = id
          this.options.selectController?.(c, id)
        }
      }
      if (!agent) throw new ToolError("no_session", "Call `start` to begin an agent session.")
      c = agent.controller
      if (tool === "start") { this.controller.metrics.start(); return c.start(optionalString(args.task), optionalString(args.cwd)) }
      if (tool === "step" && Array.isArray(args.actions) && args.actions.length && this.scheduler.mode === "lead" && agent.id !== this.scheduler.lead) throw new ToolError("invalid_arguments", "Only the selected lead may operate the editor. Send your findings to the lead.")
      return this.agentCall(c, tool, args, signal)
    }
    if (tool === "start") {
      if (c.isActive && this.owner !== ws) {
        throw new ToolError("session_active", "Another agent is already pairing in this editor window.")
      }
      const report = await c.start(optionalString(args.task), optionalString(args.cwd))
      this.owner = ws
      return report
    }
    if (this.owner !== ws) {
      throw new ToolError("no_session", "No pairing session is active. Call `start` to begin one.")
    }
    return this.agentCall(c, tool, args, signal)
  }

  private agentCall(c: Controller, tool: ToolName, args: Record<string, unknown>, signal: AbortSignal): Promise<unknown> {
    switch (tool) {
      case "step":
        if (!Array.isArray(args.actions)) throw new ToolError("invalid_arguments", "`actions` must be an array.")
        return c.step(args.actions as Action[], signal)
      case "listen":
        return c.listen(signal)
      case "end":
        return c.end(optionalString(args.summary), signal)
      case "read":
        if (typeof args.file !== "string") throw new ToolError("invalid_arguments", "`file` must be a string.")
        return c.read(args.file, optionalNumber(args.from_line), optionalNumber(args.to_line))
      default:
        return Promise.reject(new ToolError("invalid_arguments", `Unknown tool: ${String(tool)}`))
    }
  }

  private tokenMatches(token: unknown): boolean {
    if (typeof token !== "string") return false
    const a = Buffer.from(token)
    const b = Buffer.from(this.token)
    return a.length === b.length && timingSafeEqual(a, b)
  }
}

function optionalString(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined
}

function optionalNumber(v: unknown): number | undefined {
  return typeof v === "number" ? v : undefined
}
