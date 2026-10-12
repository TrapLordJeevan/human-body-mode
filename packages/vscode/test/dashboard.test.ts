import { expect, it, vi } from "vitest"
import type * as vscode from "vscode"
import { NarrationPanel } from "../src/panel"
import { Controller } from "@ai-pair/core"
import { setup } from "../../core/test/fake"

const executeCommand = vi.hoisted(() => vi.fn())
vi.mock("vscode", () => ({ commands: { executeCommand } }))

function dashboard(controller: Controller) {
  const messages: any[] = []
  let receive: (message: any) => void = () => {}
  const panel = new NarrationPanel(file => file, { current: () => undefined, ref: () => undefined })
  panel.controller = controller
  panel.resolveWebviewView({
    webview: { options: {}, cspSource: "vscode-resource:", html: "", postMessage: (message: any) => messages.push(message), onDidReceiveMessage: (handler: typeof receive) => { receive = handler } },
    onDidDispose: () => {},
  } as unknown as vscode.WebviewView)
  return { panel, receive, messages }
}

it("routes dashboard controls to the shared controller before an agent connects", async () => {
  const { controller } = setup({})
  const { panel, receive, messages } = dashboard(controller)
  panel.showMetrics({ blockedBypassAttempts: 7 })
  receive({ type: "control", operation: "wpm", value: 45 })
  receive({ type: "control", operation: "mode", value: "strict" })
  receive({ type: "control", operation: "pause" })
  await vi.waitFor(() => expect(messages.at(-1)).toEqual({ type: "controlResult", error: "" }))
  expect(controller.controlStatus()).toMatchObject({ configuredWpm: 45, configuredMode: "strict", paused: true, active: false })
  expect(messages.some(m => m.type === "metrics" && m.data.blockedBypassAttempts === 7 && m.data.configuredWpm === 45)).toBe(true)
  receive({ type: "control", operation: "resume" })
  expect(controller.isPaused).toBe(false)
  receive({ type: "control", operation: "reset" })
  receive({ type: "control", operation: "export" })
  expect(executeCommand).toHaveBeenCalledWith("humanBody.reset")
  expect(executeCommand).toHaveBeenCalledWith("humanBody.export")
})

it("reports invalid controls and refuses unknown operations", async () => {
  const { controller } = setup({})
  const { receive, messages } = dashboard(controller)
  receive({ type: "control", operation: "wpm", value: 0 })
  await vi.waitFor(() => expect(messages.at(-1)?.error).toMatch(/WPM/))
  receive({ type: "control", operation: "run", command: "git status" })
  await vi.waitFor(() => expect(messages.at(-1)?.error).toMatch(/Start the pair session/))
  const spy = vi.spyOn(controller, "control")
  receive({ type: "control", operation: "writeFile", command: "bypass" })
  expect(spy).not.toHaveBeenCalled()
})
