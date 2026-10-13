import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { Controller, InputScheduler } from "../src/index"
import { FakeEditor, FakePanel, testConfig, until, advance } from "./fake"

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

it("shares one FIFO lane and releases an aborted waiter without stealing the active lease", async () => {
  const scheduler = new InputScheduler()
  const one = await scheduler.acquire("one", ["a"], new AbortController().signal)
  const cancel = new AbortController()
  const two = scheduler.acquire("two", ["b"], cancel.signal)
  const rejected = expect(two).rejects.toThrow("interrupted")
  cancel.abort()
  await rejected
  expect(scheduler.status("one")).toBe("operating")
  const three = scheduler.acquire("three", ["c"], new AbortController().signal)
  expect(scheduler.status("three")).toBe("waiting for typer")
  expect(() => scheduler.setMode("individual")).toThrow("queued input")
  one()
  const release = await three
  expect(scheduler.status("three")).toBe("operating")
  release(); release()
  scheduler.setMode("individual")
})

it("individual typers overlap separate files, serialize same files and give command locks priority", async () => {
  const scheduler = new InputScheduler()
  scheduler.setMode("individual")
  const one = await scheduler.acquire("one", ["a"], new AbortController().signal)
  const two = await scheduler.acquire("two", ["b"], new AbortController().signal)
  const command = scheduler.acquire("command", ["*"], new AbortController().signal)
  const later = scheduler.acquire("later", ["c"], new AbortController().signal)
  expect(scheduler.status("later")).toBe("waiting for typer")
  one(); two()
  const commandRelease = await command
  expect(scheduler.status("later")).toBe("waiting for typer")
  commandRelease()
  const laterRelease = await later
  const same = scheduler.acquire("same", ["c"], new AbortController().signal)
  expect(scheduler.status("same")).toBe("waiting for typer")
  laterRelease(); (await same)()
})

it("lead mode permits only the selected agent and rejects invalid modes", async () => {
  const scheduler = new InputScheduler()
  expect(() => scheduler.setMode("unlimited")).toThrow("Unknown")
  scheduler.setMode("lead", "one")
  await expect(scheduler.acquire("two", [], new AbortController().signal)).rejects.toThrow("selected lead")
  ;(await scheduler.acquire("one", [], new AbortController().signal))()
})

it.each(["shared", "individual"] as const)("%s controllers have real isolated sessions and measured combined typing throughput", async mode => {
  const scheduler = new InputScheduler()
  scheduler.setMode(mode)
  const files = new Map<string, string>()
  const agents = ["one", "two"].map(id => {
    const editor = new FakeEditor(); editor.files = files
    const controller = new Controller(editor, new FakePanel(), { ...testConfig, timing: { ...testConfig.timing, type: { ...testConfig.timing.type, mode: "strict", wpm: 60 } } })
    editor.controller = controller
    controller.acquireInput = (resources, signal) => scheduler.acquire(id, resources, signal)
    return { id, editor, controller }
  })
  for (const { controller, id } of agents) {
    await controller.start()
    await controller.step([{ move: { file: `${id}.txt`, line: 1, to: "line_end" } }])
    await until(controller.step([]))
  }
  const started = Date.now()
  await Promise.all(agents.map(({ controller }) => controller.step([{ type: "abcdefghij▌" }])))
  await until(Promise.all(agents.map(({ controller }) => controller.step([]))))
  expect(Date.now() - started).toBe(mode === "shared" ? 4000 : 2000)
  for (const { id, editor, controller } of agents) {
    expect(editor.text(`${id}.txt`)).toBe("abcdefghij")
    expect(controller.metricsSnapshot().charactersTyped).toBe(10)
  }
  if (mode === "shared") expect(agents[1]!.controller.metricsSnapshot().queueWaitMs).toBeGreaterThanOrEqual(2000)
})

it("disconnecting a waiting controller never edits later and never releases another agent's lane", async () => {
  const scheduler = new InputScheduler()
  const release = await scheduler.acquire("first", ["a"], new AbortController().signal)
  const editor = new FakeEditor()
  const controller = new Controller(editor, new FakePanel(), testConfig)
  controller.acquireInput = (files, signal) => scheduler.acquire("second", files, signal)
  await controller.start()
  await controller.step([{ move: { file: "b.txt", line: 1, to: "line_end" } }, { type: "nope▌" }])
  controller.disconnect()
  await advance(1)
  expect(scheduler.status("first")).toBe("operating")
  release()
  await advance(10000)
  expect(editor.edits).toHaveLength(0)
})

it("shared human breaks count typing across agents rather than giving every agent a fresh budget", async () => {
  const scheduler = new InputScheduler()
  const ports = [new FakeEditor(), new FakeEditor()]
  const controllers = ports.map(port => new Controller(port, new FakePanel(), { ...testConfig, timing: { ...testConfig.timing, type: { ...testConfig.timing.type, autoBreakIntervalMinSeconds: 1, autoBreakIntervalMaxSeconds: 1, autoBreakMinSeconds: .5, autoBreakMaxSeconds: .5 } } }))
  for (const [i, controller] of controllers.entries()) {
    ports[i]!.controller = controller
    controller.acquireInput = (files, signal) => scheduler.acquire(String(i), files, signal)
    controller.breakMetrics = () => controllers[0]!.metrics
    await controller.start()
    await controller.step([{ move: { file: "a.txt", line: 1, to: "line_end" } }])
    await until(controller.step([]))
  }
  await controllers[0]!.step([{ type: "abcdefgh▌" }]); await until(controllers[0]!.step([]))
  expect(controllers[0]!.metrics.typingSinceBreakMs).toBe(800)
  await controllers[1]!.step([{ type: "abcd▌" }]); await until(controllers[1]!.step([]))
  expect(controllers[0]!.metrics.automaticBreaks).toBe(1)
  expect(controllers[0]!.metrics.automaticBreakMs).toBe(500)
  expect(controllers[0]!.metrics.typingSinceBreakMs).toBe(200)
  expect(controllers[1]!.metrics.charactersTyped).toBe(4)
})
