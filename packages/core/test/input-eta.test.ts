import { beforeEach, afterEach, expect, it, vi } from "vitest"
import { setup, advance, until } from "./fake"
import { estimateInput, estimateTyping } from "../src/inputEstimate"
import { defaultTiming } from "../src/timing"

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

async function prepared(type: Record<string, unknown> = {}, commandTyping = false) {
  const env = setup({ "a.ts": "" }, { commandTyping, confirmCommands: false })
  await env.controller.control({ operation: "profile", profile: { timing: { type: { mode: "strict", wpm: 60, ...type }, beforeMoveMs: 0, afterMoveNearMs: 0, afterMoveFarMs: 0 }, seed: 42 } })
  await env.controller.start()
  await env.controller.read("a.ts")
  await env.controller.step([{ move: { file: "a.ts", line: 1, to: "line_end" } }])
  await until(env.controller.step([]))
  return env
}

it("estimates 300 strict characters at 60 seconds and counts down during playback", async () => {
  const { controller } = await prepared()
  await controller.step([{ type: "x".repeat(300) + "▌" }])
  expect(controller.typingEstimate()).toMatchObject({ queuedCharacters: 300, typingBaseRemainingMs: 60000, typingEtaMs: 60000, typingEtaState: "typing" })
  await advance(10000)
  expect(controller.typingEstimate()).toMatchObject({ queuedCharacters: 250, typingBaseRemainingMs: 50000, typingEtaMs: 50000 })
  await advance(100)
  expect(controller.typingEstimate().typingEtaMs).toBe(49900)
  await until(controller.step([]))
  if (controller.typingEstimate().queuedCharacters > 0) await until(controller.step([]))
  expect(controller.typingEstimate()).toMatchObject({ queuedCharacters: 0, typingEtaMs: 0, typingEtaState: "idle" })
})

it("includes later batches, preserves the active cadence and freezes on manual pause", async () => {
  const { controller } = await prepared()
  await controller.step([{ type: "a".repeat(100) + "▌" }])
  await controller.control({ operation: "wpm", value: 120 })
  const second = controller.step([{ type: "b".repeat(100) + "▌" }])
  await advance(10)
  expect(controller.typingEstimate()).toMatchObject({ queuedCharacters: 200, typingEtaMs: 29990 })
  await controller.control({ operation: "pause" })
  const paused = controller.typingEstimate()
  await advance(5000)
  expect(controller.typingEstimate()).toEqual(paused)
  expect(paused.typingEtaState).toBe("paused")
  await controller.control({ operation: "resume" })
  await until(second)
  await until(controller.step([]))
  expect(controller.typingEstimate().queuedCharacters).toBe(0)
})

it("clears discarded work after interruption", async () => {
  const { controller } = await prepared()
  await controller.step([{ type: "a".repeat(50) + "▌" }])
  await advance(300)
  controller.userInterrupt()
  await advance(10)
  expect(controller.typingEstimate()).toMatchObject({ queuedCharacters: 0, typingEtaMs: 0 })
})

it("counts authored code/commands but not clipboard paste or build runtime", async () => {
  const strict = { ...defaultTiming.type, mode: "strict" as const }
  expect(estimateInput([{ type: "😀a▌" }, { run: "git status" }, { paste: true }], strict, true)).toEqual({ characters: 12, baseMs: 2400, extraMs: 0 })
  const { controller, editor } = await prepared({}, true)
  editor.commandScript["git status"] = { ms: 10000, exitCode: 0 }
  await controller.step([{ run: "git status" }])
  await advance(2100)
  expect(controller.typingEstimate()).toMatchObject({ queuedCharacters: 0, typingEtaMs: 0, typingEtaState: "command-running" })
  await until(controller.step([]))
})

it("includes current breaks and expected optional costs without calling the RNG", async () => {
  const cadence = { ...defaultTiming.type, shortPauseChance: 1, shortPauseMinMs: 1000, shortPauseMaxMs: 1000, typoChance: 1 }
  expect(estimateTyping("a b", cadence).extraMs).toBeGreaterThan(2000)
  const { controller } = await prepared()
  await controller.control({ operation: "break", value: 5 })
  await controller.step([{ type: "abc▌" }])
  expect(controller.typingEstimate()).toMatchObject({ queuedCharacters: 3, typingEtaMs: 5600, typingEtaState: "break" })
  await advance(1000)
  expect(controller.typingEstimate().typingEtaMs).toBe(4600)
  await controller.control({ operation: "resume" })
  await until(controller.step([]))
})

it("polling ETA does not change seeded typing or mistake decisions", async () => {
  const edits: string[][] = []
  for (const poll of [false, true]) {
    const { controller, editor } = await prepared({ mode: "variable", typoChance: 0.2, falseStartChance: 0.1, shortPauseChance: 0.2 })
    await controller.step([{ type: "hello world abcdefghijklmnop▌" }])
    if (poll) for (let i = 0; i < 100; i++) controller.controlStatus()
    await until(controller.step([]))
    edits.push(editor.edits.map(edit => edit.text))
  }
  expect(edits[0]).toEqual(edits[1])
})
