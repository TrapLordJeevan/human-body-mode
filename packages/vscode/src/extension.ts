import * as os from "node:os"
import * as vscode from "vscode"
import { Bridge, Controller, controlWindow, listControlWindows, type PanelEvent } from "@ai-pair/core"
import { discoveryDir } from "@ai-pair/protocol"
import { playDemo } from "./demo"
import { VsCodeEditor } from "./editor"
import { NarrationPanel } from "./panel"
import { registerServerProvider, setUpAgent, writeLauncher } from "./setup"
import { registerExperiment } from "./experiment"

/** Returned from `activate`, for integration tests. */
export type Api = { controller: Controller; playDemo: () => Promise<void>; launcher: string; ready: Promise<void> }

export function activate(context: vscode.ExtensionContext): Api {
  const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? os.homedir()
  const config = () => vscode.workspace.getConfiguration("aiPair")

  const editor = new VsCodeEditor(root, config().get("agentName", "Agent"))
  let selectedId = "agent-1"
  let selectedEditor = editor
  const histories = new Map<string, PanelEvent[]>()
  const postFor = (id: string, event: PanelEvent) => {
    const log = histories.get(id) ?? []
    log.push(event)
    if (log.length > 400) log.shift()
    histories.set(id, log)
    if (id === selectedId) panel.post(event)
  }
  const panel = new NarrationPanel((file) => editor.resolvePath(file), {
    current: () => selectedEditor.programmerSelection(),
    ref: () => selectedEditor.selectionRef(),
  }, (profile) => context.workspaceState.update("humanBody.profile", profile))
  const controller = new Controller(editor, { post: event => postFor("agent-1", event) })
  editor.controller = controller
  editor.onSelection = (ref) => panel.showSelection(ref)
  panel.controller = controller
  controller.setSpeed(1)
  controller.setTiming(config().get("timing", {}))
  controller.setConfirmCommands(config().get("confirmCommands", true))
  controller.setSeed(config().get("seed", 20261012))
  const savedProfile = context.workspaceState.get<ReturnType<Controller["profile"]>>("humanBody.profile")
  if (savedProfile) {
    try { controller.setTiming(savedProfile.timing); controller.setSeed(savedProfile.seed) }
    catch (error) { void vscode.window.showWarningMessage(`Saved Human Body profile is invalid: ${String(error)}`) }
  }
  const agentEditors = new Map<string, VsCodeEditor>([["agent-1", editor]])
  const bridge = new Bridge(controller, {
    dir: discoveryDir(),
    workspaceFolders: () => (vscode.workspace.workspaceFolders ?? []).map((f) => f.uri.fsPath),
    workspaceName: vscode.workspace.name ?? root,
    createController: (id) => {
      const port = new VsCodeEditor(root, id)
      const agent = new Controller(port, { post: event => postFor(id, event) })
      port.controller = agent
      port.onSelection = ref => { if (id === selectedId) panel.showSelection(ref) }
      agent.setTiming(controller.profile().timing)
      agent.setSeed(controller.profile().seed)
      agent.setConfirmCommands(config().get("confirmCommands", true))
      agentEditors.set(id, port)
      context.subscriptions.push(port, { dispose: () => agent.disconnect() })
      return agent
    },
    selectController: (agent, id) => {
      selectedId = id
      selectedEditor = agentEditors.get(id) ?? editor
      panel.controller = agent
      panel.replaceHistory(histories.get(id) ?? [])
    },
  })
  let selectedWindow = "local"
  let remotePolling = false
  const windowMeta = () => ({ windows: listControlWindows(discoveryDir(), bridge.file), selectedWindow, extensionVersion: context.extension.packageJSON.version })
  registerExperiment(context, controller, root, (data) => {
    if (selectedWindow === "local") panel.showMetrics({ ...data, ...(panel.controller ?? controller).controlStatus(), elapsedMs: controller.metricsSnapshot().elapsedMs, running: controller.metricsSnapshot().running, ...bridge.status(), ...windowMeta() })
    else if (!remotePolling) {
      remotePolling = true
      const target = selectedWindow
      void controlWindow(discoveryDir(), target, { operation: "status" }).then(status => {
        if (selectedWindow === target) panel.showMetrics({ ...status, ...windowMeta() })
      }).catch(() => {
        if (selectedWindow === target) { selectedWindow = "local"; void vscode.window.showWarningMessage("That workspace disconnected. Returned to this window's controls.") }
      }).finally(() => { remotePolling = false })
    }
  }, () => bridge.status())
  panel.controlHandler = async args => {
    if (args.operation === "selectWindow") {
      if (args.value !== "local" && !listControlWindows(discoveryDir(), bridge.file).some(w => w.id === args.value)) throw new Error("Workspace is no longer available")
      selectedWindow = String(args.value)
      panel.replaceHistory(selectedWindow === "local" ? histories.get(selectedId) ?? [] : [])
    } else if (args.operation === "refreshWindows") {
      // Discovery is re-read below; no agent/model call is made.
    } else if (args.operation === "reconnect") {
      if (!vscode.workspace.isTrusted) throw new Error("Trust this workspace before reconnecting")
      await vscode.env.clipboard.writeText("Start a new AI Pair session in this workspace, inspect the current files and Git status, and continue where we left off. Do not repeat completed edits or commits.")
      void vscode.window.showInformationMessage("Continuation prompt copied. Paste it into your existing agent terminal. This does not replay pending edits or reset the clock.")
    } else if (selectedWindow !== "local") {
      if (args.operation === "export" || args.operation === "reset") throw new Error("Export or reset from the target workspace window")
      await controlWindow(discoveryDir(), selectedWindow, args)
    } else if (args.operation === "export" || args.operation === "reset") {
      if (args.operation === "reset") await bridge.control({ operation: "reset" })
      await vscode.commands.executeCommand(`humanBody.${args.operation}`)
    } else if (args.operation === "stop") {
      await bridge.control({ ...args, scope: "all" })
      controller.stopMetrics()
    } else {
      await bridge.control(args)
      if (["profile", "wpm", "mode"].includes(String(args.operation))) await context.workspaceState.update("humanBody.profile", (panel.controller ?? controller).profile())
    }
    return selectedWindow === "local" ? { ...(panel.controller ?? controller).controlStatus(), elapsedMs: controller.metricsSnapshot().elapsedMs, running: controller.metricsSnapshot().running, ...bridge.status(), ...windowMeta() } : { ...await controlWindow(discoveryDir(), selectedWindow, { operation: "status" }), ...windowMeta() }
  }
  const ready = bridge.start()
  ready.catch((e: unknown) => void vscode.window.showErrorMessage(`AI Pair couldn't start its local server: ${String(e)}`))
  const launcher = writeLauncher(context.extensionPath)
  registerServerProvider(context)

  context.subscriptions.push(
    { dispose: () => bridge.dispose() },
    vscode.window.onDidChangeWindowState((state) => {
      if (state.focused) bridge.focused()
    }),
    vscode.workspace.onDidChangeWorkspaceFolders(() => bridge.writeDiscovery()),
    vscode.commands.registerCommand("aiPair.setUpAgent", () => setUpAgent(launcher)),
    vscode.commands.registerCommand("humanBody.open", () => vscode.commands.executeCommand(`${NarrationPanel.viewId}.focus`)),
    editor,
    vscode.window.registerWebviewViewProvider(NarrationPanel.viewId, panel, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("aiPair.timing")) controller.setTiming(config().get("timing", {}))
      if (e.affectsConfiguration("aiPair.agentName")) editor.setAgentName(config().get("agentName", "Agent"))
      if (e.affectsConfiguration("aiPair.confirmCommands")) {
        controller.setConfirmCommands(config().get("confirmCommands", true))
      }
    }),
    vscode.commands.registerCommand("aiPair.playDemo", () => {
      if (!vscode.workspace.workspaceFolders?.length) {
        void vscode.window.showErrorMessage("Open a folder first: the demo creates files in ai-pair-demo/.")
        return
      }
      void playDemo(controller, root)
    }),
    vscode.commands.registerCommand("aiPair.togglePause", () => {
      if (controller.isPaused) controller.resume()
      else controller.pause()
    }),
    vscode.commands.registerCommand("aiPair.interrupt", () => controller.userInterrupt()),
    vscode.commands.registerCommand("aiPair.toggleTurn", () => {
      if (controller.turn === "user") controller.handBack()
      else controller.takeTurn()
    }),
    vscode.commands.registerCommand("aiPair.endSession", () => controller.endSession()),
    vscode.commands.registerCommand("aiPair.focusReply", () => panel.focusReply()),
    vscode.commands.registerCommand("aiPair.askAboutSelection", () => panel.focusReply()),
    { dispose: () => controller.disconnect() },
  )
  if (!context.globalState.get("aiPair.offeredSetup")) {
    void context.globalState.update("aiPair.offeredSetup", true)
    void vscode.window
      .showInformationMessage("AI Pair is installed. Connect it to your agent?", "Set Up Agent")
      .then((answer) => answer && setUpAgent(launcher))
  }

  return { controller, playDemo: () => playDemo(controller, root), launcher, ready }
}

export function deactivate(): void {}
