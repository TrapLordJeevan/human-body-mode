import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { setup, until, advance } from "./fake"
import { defaultTiming, validatedTiming, PROFILE_FIELDS } from "../src/timing"

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

it("validates every setting and applies profiles atomically", async () => {
  const { controller } = setup()
  for (const [group, key, , min, max] of PROFILE_FIELDS) {
    const field = group === "navigation" ? { [key]: max + 1 } : { [group]: { [key]: max + 1 } }
    expect(() => validatedTiming(field)).toThrow()
    const nan = group === "navigation" ? { [key]: NaN } : { [group]: { [key]: NaN } }
    expect(() => validatedTiming(nan)).toThrow()
    expect(min).toBeLessThanOrEqual(max)
  }
  expect(() => validatedTiming({ type: { shortPauseMinMs: 500, shortPauseMaxMs: 100 } })).toThrow(/Minimum/)
  expect(() => validatedTiming({ type: { burstMinChars: 1.5 } })).toThrow(/integer/)
  expect(() => validatedTiming({ type: { autoBreakIntervalMinSeconds: 0, autoBreakIntervalMaxSeconds: 1 } })).toThrow(/both/)
  expect(() => validatedTiming({ type: { randomWrite: true } })).toThrow()
  const original = controller.profile()
  await expect(controller.control({ operation: "profile", profile: { timing: { type: { wpm: 90, typoChance: 2 } }, seed: 1 } })).rejects.toThrow()
  expect(controller.profile()).toEqual(original)
  await expect(controller.control({ operation: "profile", profile: { timing: {}, seed: -1 } })).rejects.toThrow(/Seed/)
  await controller.control({ operation: "profile", profile: { timing: { type: { shortPauseChance: 1, typoChance: 0.02 } }, seed: 42 } })
  expect(controller.profile()).toMatchObject({ seed: 42, timing: { type: { shortPauseChance: 1, typoChance: 0.02 } } })
})

async function prepared(type: Record<string, unknown>) {
  const env = setup({ "a.ts": "" })
  await env.controller.control({ operation: "profile", profile: { timing: { type, beforeMoveMs: 0, afterMoveFarMs: 0, afterMoveNearMs: 0 }, seed: 7 } })
  await env.controller.start()
  await env.controller.read("a.ts")
  await env.controller.step([{ move: { file: "a.ts", line: 1, to: "line_end" } }])
  await until(env.controller.step([]))
  return env
}

it("visibly corrects typos and false starts without changing intended text or undo grouping", async () => {
  const { controller, editor } = await prepared({ typoChance: 1, falseStartChance: 1 })
  await controller.step([{ type: "abc def▌" }])
  await until(controller.step([]))
  expect(editor.text("a.ts")).toBe("abc def")
  expect(editor.edits.some(edit => edit.deleteLength === 1 && edit.text === "")).toBe(true)
  expect(editor.edits.filter(edit => edit.options.undoStopBefore)).toHaveLength(1)
  expect(controller.metricsSnapshot()).toMatchObject({ typingCorrections: 6, falseStarts: 2, charactersTyped: 17 })
  expect(controller.metricsSnapshot().physicalActionMs).toBeGreaterThan(7 * 200)
})

it("cleans a transient typo on interruption", async () => {
  const { controller, editor } = await prepared({ typoChance: 1, correctionPauseMs: 5000 })
  await controller.step([{ type: "a▌" }])
  await advance(300)
  expect(editor.text("a.ts")).not.toBe("")
  expect(editor.text("a.ts")).not.toBe("a")
  controller.userInterrupt()
  await advance(10)
  expect(editor.text("a.ts")).toBe("")
})

it("does not treat every typing action as a new word", async () => {
  const { controller, editor } = await prepared({ falseStartChance: 1 })
  await controller.step([{ type: "a▌" }, { type: "b▌" }])
  await until(controller.step([]))
  expect(editor.text("a.ts")).toBe("ab")
  expect(controller.metricsSnapshot().falseStarts).toBe(1)
})

it("short pauses add actual time, while strict mode disables extra behaviour", async () => {
  for (const mode of ["variable", "strict"]) {
    const { controller, editor } = await prepared({ mode, shortPauseChance: 1, shortPauseMinMs: 1000, shortPauseMaxMs: 1000, typoChance: 1, falseStartChance: 1, autoBreakIntervalMinSeconds: 0.1, autoBreakIntervalMaxSeconds: 0.1, autoBreakMinSeconds: 1, autoBreakMaxSeconds: 1 })
    const start = Date.now()
    await controller.step([{ type: "a b▌" }])
    await until(controller.step([]))
    expect(editor.text("a.ts")).toBe("a b")
    if (mode === "strict") {
      expect(Date.now() - start).toBeLessThan(700)
      expect(controller.metricsSnapshot()).toMatchObject({ typingCorrections: 0, automaticBreaks: 0 })
    } else expect(Date.now() - start).toBeGreaterThan(2600)
  }
})

it("shares automatic-break budgets across submissions, records real duration and allows skipping", async () => {
  const { controller, editor } = await prepared({ autoBreakIntervalMinSeconds: 0.4, autoBreakIntervalMaxSeconds: 0.4, autoBreakMinSeconds: 10, autoBreakMaxSeconds: 10 })
  await controller.step([{ type: "aa▌" }])
  await until(controller.step([]))
  await controller.step([{ type: "b▌" }])
  await advance(10)
  expect(controller.controlStatus()).toMatchObject({ paused: true, automaticBreaks: 1 })
  expect(editor.text("a.ts")).toBe("aa")
  await advance(1000)
  await controller.control({ operation: "resume" })
  await until(controller.step([]))
  expect(editor.text("a.ts")).toBe("aab")
  expect(controller.metricsSnapshot().automaticBreakMs).toBeGreaterThanOrEqual(1000)
  expect(controller.metricsSnapshot().automaticBreakMs).toBeLessThan(10000)
  expect(controller.metricsSnapshot().physicalActionMs).toBeLessThan(1000)
})

it("preserves the break budget on restore and keeps zero defaults backwards compatible", async () => {
  const { controller } = await prepared({})
  const saved = controller.metrics.snapshot()
  saved.typingSinceBreakMs = 200
  saved.nextAutomaticBreakMs = 1000
  saved.automaticBreakEndsAt = Date.now() + 3000
  controller.metrics.restore(saved)
  expect(controller.metrics.snapshot()).toMatchObject({ typingSinceBreakMs: 200, nextAutomaticBreakMs: 1000 })
  await controller.step([{ type: "a▌" }])
  await advance(1000)
  expect(controller.controlStatus()).toMatchObject({ paused: true })
  await controller.control({ operation: "resume" })
  await until(controller.step([]))
  expect(controller.metrics.snapshot().automaticBreakEndsAt).toBe(0)
  controller.metrics.automaticBreakEndsAt = Date.now() + 5000
  await controller.step([{ type: "b▌" }])
  await advance(1000)
  controller.resetMetrics()
  await until(controller.step([]))
  expect(controller.metrics.snapshot().automaticBreakEndsAt).toBe(0)
  expect(controller.metrics.snapshot().automaticBreakMs).toBeLessThan(10)
  expect(defaultTiming.type).toMatchObject({ typoChance: 0, falseStartChance: 0, shortPauseChance: 0, autoBreakIntervalMinSeconds: 0 })
})
