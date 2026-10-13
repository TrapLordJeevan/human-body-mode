// End to end through MCP: client → relay → WebSocket → bridge → controller → fake editor.

import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js"
import { ListRootsRequestSchema } from "@modelcontextprotocol/sdk/types.js"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { Bridge, Controller, controlWindow, listControlWindows } from "@ai-pair/core"
import { FakeEditor, FakePanel, testConfig } from "../../core/test/fake"
import { EditorLink, findWindows } from "../src/link"
import { agentGuide, createServer } from "../src/server"

const fast = {
  ...testConfig,
  timing: {
    ...testConfig.timing,
    type: { ...testConfig.timing.type, charMs: 0.5 },
    reading: { msPerWord: 1, minMs: 5, maxMs: 5 },
    beforeMoveMs: 5,
    beforeSelectMs: 5,
  },
  navigatorIdleMs: 50,
}

let dir: string
let editor: FakeEditor
let panel: FakePanel
let controller: Controller
let bridge: Bridge
const clients: Client[] = []

beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "ai-pair-"))
  editor = new FakeEditor()
  panel = new FakePanel()
  editor.files.set(editor.resolvePath("src/a.ts"), "")
  controller = new Controller(editor, panel, fast)
  editor.controller = controller
  bridge = new Bridge(controller, { dir, workspaceFolders: () => ["/project"] })
  await bridge.start()
})

afterEach(async () => {
  for (const c of clients.splice(0)) await c.close()
  bridge.dispose()
  fs.rmSync(dir, { recursive: true, force: true })
})

/** `roots`: the harness's roots, as file URLs, if it has them. */
async function connect(cwd = "/project/src", roots?: string[]): Promise<Client> {
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair()
  const server = createServer(new EditorLink(cwd, dir), "THE GUIDE", cwd)
  await server.connect(serverSide)
  const client = new Client({ name: "test", version: "0" }, { capabilities: roots ? { roots: {} } : {} })
  if (roots) client.setRequestHandler(ListRootsRequestSchema, () => ({ roots: roots.map((uri) => ({ uri })) }))
  await client.connect(clientSide)
  clients.push(client)
  return client
}

type Content = { type: string; text: string }[]

async function call(client: Client, name: string, args: Record<string, unknown> = {}, signal?: AbortSignal) {
  const result = await client.callTool({ name, arguments: args }, undefined, { signal })
  const content = result.content as Content
  return { error: result.isError === true, text: content[0]!.text, content }
}

describe("relay", () => {
  it("lists the tools and the prompt, with short instructions", async () => {
    const client = await connect()
    const tools = await client.listTools()
    expect(tools.tools.map((t) => t.name).sort()).toEqual(["control", "end", "listen", "read", "start", "step"])
    expect(client.getInstructions()).toContain("`start`")
    const prompt = await client.getPrompt({ name: "start", arguments: { task: "add a todos API" } })
    expect(JSON.stringify(prompt.messages)).toContain("The task: add a todos API")
  })

  it("runs a session: start with the guide, pipelined steps, read, end", async () => {
    const client = await connect()
    const started = await call(client, "start", { task: "test" })
    expect(started.error).toBe(false)
    expect(started.text).toMatch(/started/)
    expect(started.content[1]!.text).toContain("THE GUIDE")
    expect(started.content[1]!.text).toContain("not rg/ls/cat")
    expect(started.content[1]!.text).not.toMatch(/benchmark|experiment|competition|probe|supervised|assessment/i)

    const first = await call(client, "step", { actions: [{ move: { file: "a.ts", line: 1, to: "line_end" } }, { type: "hi▌" }] })
    expect(first.text).toMatch(/Batch 1 is playing/)
    const second = await call(client, "step", { actions: [] })
    // Reports are text for the agent to read: check what they say, not how they're laid out.
    expect(second.text).toMatch(/Batch 1 completed/)
    expect(second.text).toMatch(/1 +hi▌/)
    expect(editor.text("src/a.ts")).toBe("hi")

    const read = await call(client, "read", { file: "a.ts" })
    expect(read.text).toMatch(/a\.ts/)
    expect(read.text).toMatch(/1 +hi/)

    const ended = await call(client, "end", { summary: "Done." })
    expect(ended.text).toMatch(/ended/)
    expect(panel.events).toContainEqual({ type: "session", active: false, reason: "agent", summary: "Done." })
    expect((await call(client, "listen")).text).toMatch(/^no_session:/)
  })

  it("rejects malformed actions before they reach the editor", async () => {
    const client = await connect()
    await call(client, "start")
    const bad = await call(client, "step", { actions: [{ typo: "x" }] })
    expect(bad.text).toMatch(/Not an action/)
    // Two actions in one object: zod would otherwise strip one of them silently.
    const combined = await call(client, "step", { actions: [{ move: { line: 1, to: "line_end" }, type: "x" }] })
    expect(combined.text).toMatch(/One action per object, got `move` and `type`/)
    const extra = await call(client, "step", { actions: [{ move: { line: 1, to: "line_end", txt: "x" } }] })
    expect(extra.error).toBe(true)
    expect(extra.text).toMatch(/txt/)
    const malformed = await call(client, "step", { actions: [{ move: { line: "3", to: "line_end" } }] })
    expect(malformed.text).toMatch(/`line` is a line number/)
    const old = await call(client, "step", { actions: [{ move: { line: 1, before: "x", after: "" } }] })
    expect(old.text).toMatch(/A spot is one text, `at`/)
    const unmarked = await call(client, "step", { actions: [{ move: { line: 1, at: "x" } }] })
    expect(unmarked.text).toMatch(/marks where your cursor goes with ▌/)
    const end = await call(client, "step", { actions: [{ move: { to: "end" } }] })
    expect(end.text).toMatch(/`to` is `"line_end"`/)
    const plain = await call(client, "step", { actions: [{ type: "x" }] })
    expect(plain.error).toBe(true)
    expect(plain.text).toMatch(/Mark where your cursor ends with ▌/)
    const pair = await call(client, "step", { actions: [{ type_fast: ["f(", ")"] }] })
    expect(pair.text).toMatch(/one text, with ▌ where your cursor ends/)
    const twice = await call(client, "step", { actions: [{ type: "f(▌)▌" }] })
    expect(twice.text).toMatch(/has 2 ▌/)
    const near = await call(client, "step", { actions: [{ select: { text: "x", near_line: 3 } }] })
    expect(near.text).toMatch(/Give `line`: the line the code starts on/)
    const range = await call(client, "step", { actions: [{ point: { line: 1, from: "a", to: "b" } }] })
    expect(range.text).toMatch(/The end of a range is `through`/)
    const nothing = await call(client, "step", { actions: [{ select: { line: 1 } }] })
    expect(nothing.text).toMatch(/Give the code: `text`, or `from` and `through`/)
  })

  it("lets only one agent pair in a window at a time", async () => {
    const one = await connect()
    const two = await connect()
    await call(one, "start")
    expect((await call(two, "start")).text).toMatch(/^session_active:/)
    expect((await call(two, "listen")).text).toMatch(/^no_session:/)
  })

  it("isolates multiple real MCP connections, routes selected controls, and keeps other sessions after one ends", async () => {
    bridge.dispose()
    const controllers = [controller]
    bridge = new Bridge(controller, { dir, workspaceFolders: () => ["/project"], createController: () => {
      const port = new FakeEditor(); port.files = editor.files
      const agent = new Controller(port, new FakePanel(), fast); port.controller = agent
      controllers.push(agent)
      return agent
    } })
    await bridge.start()
    const one = await connect(), two = await connect()
    expect((await call(one, "start", { task: "First" })).error).toBe(false)
    expect((await call(two, "start", { task: "Second" })).error).toBe(false)
    const status = JSON.parse((await call(one, "control", { operation: "status" })).text)
    expect(status.agents).toHaveLength(2)
    expect(status.selectedAgent).toBe("agent-1")
    expect(status.typingMode).toBe("shared")
    await call(two, "control", { operation: "selectAgent", value: "agent-2" })
    await call(two, "control", { operation: "pause" })
    expect(controllers[0]!.isPaused).toBe(false)
    expect(controllers[1]!.isPaused).toBe(true)
    await call(two, "control", { operation: "resume", scope: "all" })
    expect(controllers[1]!.isPaused).toBe(false)
    await call(one, "step", { actions: [{ move: { file: "one.txt", line: 1, to: "line_end" } }, { type: "a▌" }] })
    await call(two, "step", { actions: [{ move: { file: "two.txt", line: 1, to: "line_end" } }, { type: "b▌" }] })
    await Promise.all([call(one, "step", { actions: [] }), call(two, "step", { actions: [] })])
    expect(editor.text("src/one.txt")).toBe("a")
    expect(editor.text("src/two.txt")).toBe("b")
    await call(one, "end")
    expect(controllers[1]!.isActive).toBe(true)
    await call(two, "step", { actions: [{ type: "c▌" }] })
    await call(two, "step", { actions: [] })
    expect(editor.text("src/two.txt")).toBe("bc")
    expect(JSON.parse((await call(one, "control", { operation: "status" })).text).workspaceTotals.charactersTyped).toBe(3)
    const peer = await controlWindow(dir, path.basename(bridge.file), { operation: "pause", scope: "all" })
    expect(peer.agents).toHaveLength(2)
    expect(controllers[1]!.isPaused).toBe(true)
    expect(listControlWindows(dir, "/not/our/window")).toEqual([{ id: path.basename(bridge.file), name: `project · window ${process.pid}` }])
    await expect(controlWindow(dir, "../secrets.json", { operation: "status" })).rejects.toThrow("Invalid window")
    await expect(controlWindow(dir, "999999999.json", { operation: "status" })).rejects.toThrow()
    await call(one, "control", { operation: "pause", scope: "all" })
    const three = await connect()
    expect((await call(three, "start", { task: "Late joiner" })).error).toBe(false)
    expect(controllers[2]!.isPaused).toBe(true)
    expect((await call(three, "read", { file: "a.ts" })).error).toBe(false)
    await call(one, "control", { operation: "resume", scope: "all" })
    expect(controllers[2]!.isPaused).toBe(false)
    await call(two, "end")
    const four = await connect()
    expect((await call(four, "start", { task: "Reconnect" })).error).toBe(false)
    expect(JSON.parse((await call(four, "control", { operation: "status" })).text).selectedAgent).toBe("agent-4")
  })

  it("lead mode allows other agents to read but refuses their physical actions", async () => {
    bridge.dispose()
    bridge = new Bridge(controller, { dir, workspaceFolders: () => ["/project"], createController: () => {
      const port = new FakeEditor(); port.files = editor.files
      const agent = new Controller(port, new FakePanel(), fast); port.controller = agent
      return agent
    } })
    await bridge.start()
    const one = await connect(), two = await connect()
    await call(one, "start"); await call(two, "start")
    expect((await call(one, "control", { operation: "typingMode", value: "lead", leadAgent: "agent-1" })).error).toBe(false)
    expect((await call(two, "read", { file: "a.ts" })).error).toBe(false)
    expect((await call(two, "step", { actions: [{ type: "bypass▌" }] })).text).toContain("selected lead")
    expect(editor.edits).toHaveLength(0)
  })

  // The programmer acts right after the cancellation, before it reaches the editor, so the
  // cancelled call returns their message. It must still reach the agent.
  it("cancels a blocked call without losing the report, even when racing", async () => {
    const client = await connect()
    await call(client, "start")
    await call(client, "step", { actions: [{ move: { file: "a.ts", line: 1, to: "line_end" } }] })
    const abort = new AbortController()
    const listening = call(client, "listen", {}, abort.signal).catch((e: unknown) => e)
    await new Promise((r) => setTimeout(r, 50))
    abort.abort()
    expect(await listening).toBeInstanceOf(Error)

    controller.userMessage("hello")
    const report = await call(client, "listen")
    expect(report.text).toMatch(/hello/)
    expect(report.text).toMatch(/Batch 1 completed/)
  })

  it("ends the session when the agent's harness goes away", async () => {
    const client = await connect()
    await call(client, "start")
    await client.close()
    await new Promise((r) => setTimeout(r, 50))
    // The in-memory transport closing doesn't close the WebSocket by itself; the process exiting
    // does. Simulate that by disposing of every relay connection.
    await Promise.all([...(bridge["server"]?.clients ?? [])].map(c => new Promise<void>(resolve => {
      c.once("close", () => resolve())
      c.close()
    })))
    expect(controller.isActive).toBe(false)
    expect(panel.events).toContainEqual({ type: "session", active: false, reason: "disconnected" })
  })

  it("explains when no editor has the project open", async () => {
    const client = await connect("/elsewhere")
    expect((await call(client, "start")).text).toMatch(/^no_editor: No VS Code window has \/elsewhere open/)
    const given = await call(client, "start", { cwd: "/also/elsewhere" })
    expect(given.text).toMatch(/^no_editor: No VS Code window has \/also\/elsewhere open/)
  })

  it("works in the folder the agent gives, when the harness started the relay somewhere else", async () => {
    const client = await connect("/")
    expect((await call(client, "start", { cwd: "/project/src" })).error).toBe(false)
    await call(client, "step", { actions: [{ move: { file: "a.ts", line: 1, to: "line_end" } }, { type: "hi▌" }] })
    await call(client, "step", { actions: [] })
    expect(editor.text("src/a.ts")).toBe("hi")
  })

  it("works in the harness's root, and in the relay's folder when the agent's isn't open", async () => {
    const rooted = await connect("/", ["file:///elsewhere", "file:///project/src"])
    expect((await call(rooted, "start")).error).toBe(false)
    expect((await call(rooted, "read", { file: "a.ts" })).error).toBe(false)
    await call(rooted, "end")

    const client = await connect("/project/src")
    expect((await call(client, "start", { cwd: "/elsewhere" })).error).toBe(false)
    expect((await call(client, "read", { file: "a.ts" })).error).toBe(false)
  })
})

describe("discovery", () => {
  it("picks the most specific workspace folder, then the most recently focused window", () => {
    const write = (name: string, folders: string[], lastFocused: number) =>
      fs.writeFileSync(
        path.join(dir, name),
        JSON.stringify({ pid: process.pid, workspaceFolders: folders, port: 1, token: name, protocolVersion: 1, lastFocused }),
      )
    write("outer.json", ["/work"], 3)
    write("inner-old.json", ["/work/app"], 1)
    write("inner-new.json", ["/work/app"], 2)
    write("dead.json", ["/work/app/src"], 9)
    const dead = JSON.parse(fs.readFileSync(path.join(dir, "dead.json"), "utf8"))
    fs.writeFileSync(path.join(dir, "dead.json"), JSON.stringify({ ...dead, pid: 999_999_999 }))
    const tokens = (folders: string[]) => findWindows(folders, dir).windows.map((w) => w.token)
    expect(tokens(["/work/app/src"])).toEqual(["inner-new.json", "inner-old.json", "outer.json"])
    expect(tokens(["/work/lib"])).toEqual(["outer.json"])
    expect(findWindows(["/", "/work/lib", "/work/app"], dir).folder).toBe("/work/lib")
  })

  it("skips a window whose file outlived it, even when its pid now belongs to another process", async () => {
    fs.writeFileSync(
      path.join(dir, "stale.json"),
      JSON.stringify({ pid: process.pid, workspaceFolders: ["/project"], port: 1, token: "x", protocolVersion: 1, lastFocused: Date.now() + 60_000 }),
    )
    const client = await connect()
    expect((await call(client, "start")).error).toBe(false)
  })
})

describe("agent guide", () => {
  it("is everything after the first horizontal rule, whatever the line endings", () => {
    const lf = "# Agent Guide\n\nFor maintainers.\n\n---\n\n## You are pair programming\n\nDrive.\n"
    expect(agentGuide(lf)).toBe("## You are pair programming\n\nDrive.")
    expect(agentGuide(lf.replaceAll("\n", "\r\n"))).toBe("## You are pair programming\r\n\r\nDrive.")
  })
})
