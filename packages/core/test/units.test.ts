import { describe, expect, it } from "vitest"
import { resolveSpan, resolveSpot } from "../src/places"
import { applyChange } from "../src/lines"
import { planTyping, readingTime } from "../src/typing"
import { commandProblem } from "../src/commands"
import { ExperimentMetrics } from "../src/metrics"
import { terminalText } from "../src/text"
import { samePath, withinFolder, type PathStyle } from "../src/paths"

it("counts overlapping FIFO queue waits once and clamps intervals at reset", () => {
  const metrics = new ExperimentMetrics()
  metrics.reset(1000)
  metrics.addQueueWait(1100, 1500)
  metrics.addQueueWait(1200, 1600)
  metrics.addQueueWait(1700, 1900)
  expect(metrics.snapshot(2000).queueWaitMs).toBe(700)
  metrics.reset(1800)
  metrics.addQueueWait(1700, 2000)
  expect(metrics.snapshot(2000).queueWaitMs).toBe(200)
})

describe("terminal text", () => {
  it("drops colors and shell integration sequences, and resolves progress overwrites", () => {
    const raw = "\x1b]633;C\x07\x1b[32m✓\x1b[0m 4 passed\r\n 10%\r 50%\r100%\r\n\x1b]633;D;0\x07"
    expect(terminalText(raw)).toBe("✓ 4 passed\n100%")
  })
})

describe("command allowlist", () => {
  it("allows builds and read-only git but rejects source-writing shells", () => {
    expect(commandProblem("git diff --stat")).toBeUndefined()
    expect(commandProblem("./mvnw -q test")).toBeUndefined()
    expect(commandProblem("javac -d target/classes src/Main.java")).toBeUndefined()
    expect(commandProblem("printf code > src/Main.java")).toMatch(/redirection/)
    expect(commandProblem("python generate.py")).toMatch(/allowlist/)
  })
})

describe("paths", () => {
  const windows: PathStyle = { ignoreCase: true, sep: "\\" }
  const mac: PathStyle = { ignoreCase: true, sep: "/" }
  const linux: PathStyle = { ignoreCase: false, sep: "/" }

  it("ignores case on Windows and macOS, not on Linux", () => {
    expect(samePath("C:\\Users\\me\\a.ts", "c:\\users\\me\\a.ts", windows)).toBe(true)
    expect(samePath("/Users/me/A.ts", "/users/me/a.ts", mac)).toBe(true)
    expect(samePath("/home/me/A.ts", "/home/me/a.ts", linux)).toBe(false)
  })

  it("spells a file inside a folder the way the folder is spelled", () => {
    const folder = "c:\\Users\\me\\Desktop\\proj"
    expect(withinFolder(folder, "C:\\users\\me\\desktop\\proj\\src\\A.ts", windows)).toBe("c:\\Users\\me\\Desktop\\proj\\src\\A.ts")
    expect(withinFolder(folder, "C:\\USERS\\ME\\DESKTOP\\PROJ", windows)).toBe(folder)
    expect(withinFolder("/Users/me/Proj", "/users/me/proj/a.ts", mac)).toBe("/Users/me/Proj/a.ts")
    expect(withinFolder("/home/me/proj", "/home/me/proj/a.ts", linux)).toBe("/home/me/proj/a.ts")
  })

  it("leaves files outside the folder alone", () => {
    expect(withinFolder("c:\\proj", "c:\\project\\a.ts", windows)).toBeUndefined()
    expect(withinFolder("c:\\proj", "d:\\proj\\a.ts", windows)).toBeUndefined()
    expect(withinFolder("/home/me/Proj", "/home/me/proj/a.ts", linux)).toBeUndefined()
  })

  it("handles a folder that is a drive root", () => {
    expect(withinFolder("c:\\", "C:\\proj\\a.ts", windows)).toBe("c:\\proj\\a.ts")
    expect(withinFolder("/", "/home/me/a.ts", linux)).toBe("/home/me/a.ts")
  })
})

describe("places", () => {
  const text = "a = 1\nb = 1\nc = 1\n"

  it("finds a span's text on its line", () => {
    expect(resolveSpan(text, { line: 2, text: "b = " })).toEqual({ ok: true, range: { start: 6, end: 10 } })
    // Only on its line: elsewhere, it's listed.
    expect(resolveSpan(text, { line: 2, text: "1" })).toEqual({ ok: true, range: { start: 10, end: 11 } })
    expect(resolveSpan(text, { line: 1, text: "c = 1" })).toMatchObject({
      ok: false,
      kind: "not_found",
      message: 'The text isn\'t on line 1: line 1 reads "a = 1". It\'s on these lines:',
      candidates: [{ line: 3, context: "c = 1" }],
    })
    expect(resolveSpan(text, { line: 1, text: "d" })).toMatchObject({ ok: false, kind: "not_found", message: 'Text not found: "d"; line 1 reads "a = 1"' })
    expect(resolveSpan(text, { line: 1, text: " " })).toMatchObject({ ok: false, kind: "ambiguous", message: expect.stringContaining("2 times on line 1") })
  })

  it("takes a span's text starting on its line, which may go on past it", () => {
    expect(resolveSpan(text, { line: 1, text: "1\nb" })).toEqual({ ok: true, range: { start: 4, end: 7 } })
  })

  it("resolves a range through the first `through` after `from`", () => {
    expect(resolveSpan(text, { line: 2, from: "b", through: "1" })).toEqual({ ok: true, range: { start: 6, end: 11 } })
    expect(resolveSpan(text, { line: 1, from: "a", through: "c = " })).toEqual({ ok: true, range: { start: 0, end: 16 } })
    expect(resolveSpan(text, { line: 3, from: "c", through: "b" })).toMatchObject({ ok: false, kind: "not_found" })
  })

  it("ignores the cursor marker in a span, so code can be copied from a report", () => {
    expect(resolveSpan(text, { line: 2, text: "b =▌ 1" })).toEqual({ ok: true, range: { start: 6, end: 11 } })
  })

  it("resolves a spot between two texts that occur together, on its line only", () => {
    expect(resolveSpot(text, { at: "b = ▌1", line: 2 })).toEqual({ ok: true, range: { start: 10, end: 10 } })
    expect(resolveSpot(text, { at: "▌c", line: 3 })).toEqual({ ok: true, range: { start: 12, end: 12 } })
    expect(resolveSpot(text, { at: " = ▌1", line: 2 })).toEqual({ ok: true, range: { start: 10, end: 10 } })
    expect(resolveSpot(text, { at: "b▌ = ", line: 3 })).toMatchObject({
      ok: false,
      kind: "not_found",
      candidates: [{ line: 2, context: "b = 1" }],
    })
    // The line is the one the spot is on, after a `before` that ends with a newline.
    expect(resolveSpot(text, { at: "b = 1\n▌", line: 3 })).toEqual({ ok: true, range: { start: 12, end: 12 } })
  })
})

describe("line identities", () => {
  /** Which line of `text` (from 1) each line is after the change, or 0 for a new one. */
  const follow = (text: string, offset: number, deleteLength: number, insert: string) => {
    const ids = text.split("\n").map((_, i) => -(i + 1))
    const after = applyChange({ text, ids }, { offset, deleteLength, text: insert })
    expect(after.text).toBe(text.slice(0, offset) + insert + text.slice(offset + deleteLength))
    return after.ids.map((id) => (id < 0 ? -id : 0))
  }

  it("keeps every line in place for a change within a line", () => {
    expect(follow("a\nb\n", 1, 0, "x")).toEqual([1, 2, 3])
    expect(follow("a\n\nb", 2, 0, "x")).toEqual([1, 2, 3])
  })

  it("keeps a line in place when a line break is typed after it, and moves it down when one is typed before it", () => {
    expect(follow("a\nb\n", 1, 0, "\nx")).toEqual([1, 0, 2, 3])
    expect(follow("a\nb\n", 2, 0, "x\n")).toEqual([1, 0, 2, 3])
    expect(follow("a\r\nb\r\n", 1, 0, "\r\nx")).toEqual([1, 0, 2, 3])
    expect(follow("a\r\nb\r\n", 3, 0, "x\r\n")).toEqual([1, 0, 2, 3])
  })

  it("keeps the place of a line whose text is all replaced", () => {
    expect(follow("a\nbb\nc", 2, 2, "x")).toEqual([1, 2, 3])
    expect(follow("a\nbb\nc", 2, 2, "x\ny")).toEqual([1, 2, 0, 3])
  })

  it("follows the text of lines joined or deleted", () => {
    // A whole line, with its line break.
    expect(follow("a\nb\nc", 2, 2, "")).toEqual([1, 3])
    // The line break before a line, with the line.
    expect(follow("a\nb\nc", 1, 2, "")).toEqual([1, 3])
    // Two lines joined: the first one's text is where it was.
    expect(follow("ab\ncd", 1, 3, "")).toEqual([1])
    // From a line's start into the next: what's left is the next one's.
    expect(follow("ab\ncd\ne", 0, 4, "")).toEqual([2, 3])
  })
})

describe("typing", () => {
  const cadence = {
    mode: "variable" as const,
    wpm: 60,
    charMs: 200,
    jitter: 0.4,
    wordStartMs: 50,
    punctuationMs: 30,
    openBracketMs: 20,
    newlineMs: 250,
  }
  const delays = (text: string, atLineStart = false) =>
    planTyping(text, cadence, atLineStart, Math.random).map((c) => [c.text, c.delay])

  it("keeps variable timing calibrated to the configured average", () => {
    const planned = delays("ab c(d, e")
    expect(planned.reduce((sum, [, delay]) => sum + Number(delay), 0)).toBeCloseTo(9 * 200)
    expect(new Set(planned.map(([, delay]) => delay)).size).toBeGreaterThan(1)
  })

  it("inserts a newline together with the following indentation, then pauses", () => {
    expect(delays("x\n  y").map(([text]) => text)).toEqual(["x", "\n  ", "y"])
  })

  it("inserts leading indentation at once at the start of a line", () => {
    expect(delays("  x", true).map(([t]) => t)).toEqual(["  ", "x"])
    expect(delays("  x").map(([t]) => t)).toEqual([" ", " ", "x"])
  })

  it("strict mode charges exactly 200ms per character at 60 WPM", () => {
    const strict = { ...cadence, mode: "strict" as const }
    expect(planTyping("a\n  b", strict, false, Math.random).reduce((sum, chunk) => sum + chunk.delay, 0)).toBe(1000)
  })

  it("scales reading time with the word count, within bounds", () => {
    const reading = { msPerWord: 180, minMs: 1000, maxMs: 6000 }
    expect(readingTime("Hi.", reading)).toBe(1000)
    expect(readingTime(Array(10).fill("word").join(" "), reading)).toBe(1800)
    expect(readingTime(Array(100).fill("word").join(" "), reading)).toBe(6000)
  })
})
