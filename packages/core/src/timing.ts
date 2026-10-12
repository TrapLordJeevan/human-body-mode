// Every number that shapes how playback feels, in one place, for calibration.
// Durations are in milliseconds at normal speed; the speed setting divides them all.
// The programmer can override any of them with the `aiPair.timing` setting.

export type Cadence = {
  /** Benchmark model. Strict is exactly wpm*5 characters/minute. */
  mode: "variable" | "strict"
  /** Five-character words per minute. */
  wpm: number
  /** Between characters within a word. */
  charMs: number
  /** Random variation of `charMs`, e.g. 0.25 for ±25%. */
  jitter: number
  /** Extra, when a word starts: switching from punctuation or whitespace to a letter or digit. */
  wordStartMs: number
  /** Extra, after `,` `;` `:`. */
  punctuationMs: number
  /** Extra, after an opening `(` `[` `{`. */
  openBracketMs: number
  /** Extra, after a newline: the next line is being thought of. */
  newlineMs: number
  /** Correlated speed variation across small groups of characters. */
  burstJitter?: number
  /** Pause after sentence punctuation; normalized into the configured average. */
  sentenceMs?: number
  burstMinChars?: number
  burstMaxChars?: number
  shortPauseChance?: number
  shortPauseMinMs?: number
  shortPauseMaxMs?: number
  autoBreakIntervalMinSeconds?: number
  autoBreakIntervalMaxSeconds?: number
  autoBreakMinSeconds?: number
  autoBreakMaxSeconds?: number
  typoChance?: number
  falseStartChance?: number
  correctionPauseMs?: number
  backspaceMs?: number
}

export type Reading = { msPerWord: number; minMs: number; maxMs: number }

export type Timing = {
  type: Cadence
  /** `type_fast` plays the same cadence, with every delay multiplied by this. */
  fastFactor: number
  /** After a `say`: enough to read the message at an ordinary pace. */
  reading: Reading
  /** Before a move, so the jump doesn't look instantaneous. */
  beforeMoveMs: number
  /** After a move nearby, and after `type` steps back between its parts: the eyes find the cursor again. */
  afterMoveNearMs: number
  /** After a move to another file or far away: the view changed, re-orient. */
  afterMoveFarMs: number
  /** A move within this many lines in the same file counts as nearby. */
  nearLines: number
  beforeSelectMs: number
  /** After a selection appears: read what's about to change. */
  afterSelectMs: number
  /** After a deletion: register what's gone. */
  afterDeleteMs: number
  /** After a `point` highlight appears: find the highlighted code. */
  afterPointMs: number
}

export const defaultTiming: Timing = {
  type: {
    mode: "variable",
    wpm: 60,
    charMs: 200,
    jitter: 0.4,
    wordStartMs: 35,
    punctuationMs: 70,
    openBracketMs: 30,
    newlineMs: 100,
    burstJitter: 0.25,
    sentenceMs: 300,
    burstMinChars: 4,
    burstMaxChars: 13,
    shortPauseChance: 0,
    shortPauseMinMs: 300,
    shortPauseMaxMs: 1200,
    autoBreakIntervalMinSeconds: 0,
    autoBreakIntervalMaxSeconds: 0,
    autoBreakMinSeconds: 30,
    autoBreakMaxSeconds: 90,
    typoChance: 0,
    falseStartChance: 0,
    correctionPauseMs: 500,
    backspaceMs: 100,
  },
  fastFactor: 1,
  reading: { msPerWord: 270, minMs: 1500, maxMs: 9000 },
  beforeMoveMs: 150,
  afterMoveNearMs: 450,
  afterMoveFarMs: 900,
  nearLines: 15,
  beforeSelectMs: 150,
  afterSelectMs: 700,
  afterDeleteMs: 300,
  afterPointMs: 400,
}

export type TimingOverrides = Partial<Omit<Timing, "type" | "reading">> & {
  type?: Partial<Cadence>
  reading?: Partial<Reading>
}

export function withOverrides(base: Timing, overrides: TimingOverrides): Timing {
  return {
    ...base,
    ...overrides,
    type: { ...base.type, ...overrides.type },
    reading: { ...base.reading, ...overrides.reading },
    // Authored text has no fast path in Human Body Mode, including through settings.
    fastFactor: 1,
  }
}

// The operator form and validation use the same numeric ranges; percentages are displayed as 0–100.
export const PROFILE_FIELDS = [
  ["type", "jitter", "Character variation (%)", 0, 0.8, 100],
  ["type", "burstJitter", "Burst variation (%)", 0, 0.8, 100],
  ["type", "burstMinChars", "Burst length min (characters)", 1, 100, 1],
  ["type", "burstMaxChars", "Burst length max (characters)", 1, 100, 1],
  ["type", "wordStartMs", "Word-start pause weight (ms)", 0, 10000, 1],
  ["type", "punctuationMs", "Punctuation pause weight (ms)", 0, 10000, 1],
  ["type", "openBracketMs", "Bracket pause weight (ms)", 0, 10000, 1],
  ["type", "newlineMs", "Newline pause weight (ms)", 0, 10000, 1],
  ["type", "sentenceMs", "Sentence pause weight (ms)", 0, 10000, 1],
  ["type", "shortPauseChance", "Short-pause chance per word (%)", 0, 1, 100],
  ["type", "shortPauseMinMs", "Short pause min (ms)", 0, 60000, 1],
  ["type", "shortPauseMaxMs", "Short pause max (ms)", 0, 60000, 1],
  ["type", "autoBreakIntervalMinSeconds", "Break interval min (active input seconds; 0 = off)", 0, 86400, 1],
  ["type", "autoBreakIntervalMaxSeconds", "Break interval max (active input seconds)", 0, 86400, 1],
  ["type", "autoBreakMinSeconds", "Automatic break duration min (seconds)", 0, 3600, 1],
  ["type", "autoBreakMaxSeconds", "Automatic break duration max (seconds)", 0, 3600, 1],
  ["type", "typoChance", "Typo chance per eligible letter (%)", 0, 1, 100],
  ["type", "falseStartChance", "False-start chance per word (%)", 0, 1, 100],
  ["type", "correctionPauseMs", "Notice mistake after (ms)", 0, 10000, 1],
  ["type", "backspaceMs", "Backspace interval (ms)", 0, 1000, 1],
  ["navigation", "beforeMoveMs", "Before moving (ms)", 0, 10000, 1],
  ["navigation", "afterMoveNearMs", "After nearby move (ms)", 0, 10000, 1],
  ["navigation", "afterMoveFarMs", "After file switch / far move (ms)", 0, 10000, 1],
  ["navigation", "nearLines", "Nearby move threshold (lines)", 0, 1000, 1],
  ["navigation", "beforeSelectMs", "Before selection (ms)", 0, 10000, 1],
  ["navigation", "afterSelectMs", "After selection (ms)", 0, 10000, 1],
  ["navigation", "afterDeleteMs", "After deletion (ms)", 0, 10000, 1],
  ["navigation", "afterPointMs", "After highlighting (ms)", 0, 10000, 1],
  ["reading", "msPerWord", "Narration reading (ms / word)", 0, 10000, 1],
  ["reading", "minMs", "Narration reading min (ms)", 0, 60000, 1],
  ["reading", "maxMs", "Narration reading max (ms)", 0, 60000, 1],
] as const

/** Validates the entire profile before any setting is applied. */
export function validatedTiming(input: unknown): Timing {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Timing must be an object")
  const overrides = input as Record<string, unknown>
  const limits = new Map<string, readonly [number, number]>(PROFILE_FIELDS.map(([group, key, , min, max]) => [`${group}.${key}`, [min, max]]))
  limits.set("type.wpm", [1, 300])
  limits.set("type.charMs", [0, 10000]) // Legacy field, retained for settings compatibility.
  for (const [key, value] of Object.entries(overrides)) {
    const group = key === "type" || key === "reading" ? key : "navigation"
    const entries: [string, unknown][] | null = group === "navigation" ? [[key, value]] : value && typeof value === "object" && !Array.isArray(value) ? Object.entries(value) : null
    if (!entries) throw new Error(`${key} must be an object`)
    for (const [field, number] of entries) {
      if (group === "type" && field === "mode") {
        if (number !== "strict" && number !== "variable") throw new Error("Mode must be strict or variable")
        continue
      }
      if (group === "navigation" && field === "fastFactor" && number === 1) continue
      const range = limits.get(`${group}.${field}`)
      if (!range || typeof number !== "number" || !Number.isFinite(number) || number < range[0] || number > range[1]) throw new Error(`Invalid timing: ${group}.${field}`)
      if (["burstMinChars", "burstMaxChars", "nearLines"].includes(field) && !Number.isInteger(number)) throw new Error(`${field} must be an integer`)
    }
  }
  const timing = withOverrides(defaultTiming, overrides as TimingOverrides)
  const c = timing.type
  for (const [min, max] of [[c.burstMinChars, c.burstMaxChars], [c.shortPauseMinMs, c.shortPauseMaxMs], [c.autoBreakIntervalMinSeconds, c.autoBreakIntervalMaxSeconds], [c.autoBreakMinSeconds, c.autoBreakMaxSeconds], [timing.reading.minMs, timing.reading.maxMs]]) {
    if (min! > max!) throw new Error("Minimum timing cannot exceed maximum")
  }
  if (c.autoBreakIntervalMinSeconds === 0 && c.autoBreakIntervalMaxSeconds !== 0) throw new Error("Set both break intervals to zero to disable automatic breaks")
  return timing
}
