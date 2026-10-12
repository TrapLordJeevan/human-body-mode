// Typing cadence and reading time. The numbers are in timing.ts.

import type { Cadence, Reading } from "./timing"

/** A piece of text inserted in one edit, after waiting `delay` ms. */
export type Chunk = { text: string; delay: number }

const PUNCTUATION = new Set([",", ";", ":"])
const OPEN_BRACKETS = new Set(["(", "[", "{"])
const WORD = /[\p{L}\p{N}_]/u

function isIndent(ch: string | undefined): boolean {
  return ch === " " || ch === "\t"
}

/**
 * Splits text into chunks: one per character, except that a newline and the indentation after
 * it are inserted together, as an editor's auto-indent would. Indentation at the very start is
 * inserted at once too, if `atLineStart`. Every delay is multiplied by `scale`.
 *
 * The rhythm: quick within words, a small pause as each word starts, and longer ones after
 * punctuation, opening brackets, and newlines.
 */
export function planTyping(
  text: string,
  cadence: Cadence,
  atLineStart: boolean,
  random: () => number,
  scale = 1,
): Chunk[] {
  const chars = Array.from(text)
  const chunks: Chunk[] = []
  let pause = 0
  let previous: string | undefined
  let i = 0

  const takeIndent = (): string => {
    let indent = ""
    while (isIndent(chars[i])) indent += chars[i++]
    return indent
  }

  if (atLineStart) {
    const indent = takeIndent()
    if (indent) {
      chunks.push({ text: indent, delay: 0 })
      previous = " "
    }
  }

  while (i < chars.length) {
    const ch = chars[i++]!
    const wordStart = previous !== undefined && !WORD.test(previous) && WORD.test(ch)
    const baseMs = 12_000 / cadence.wpm
    const delay =
      cadence.mode === "strict"
        ? baseMs
        : baseMs * (1 + (random() * 2 - 1) * cadence.jitter) + (wordStart ? cadence.wordStartMs : 0) + pause
    if (ch === "\n") {
      const indent = takeIndent()
      chunks.push({ text: ch + indent, delay: (cadence.mode === "strict" ? baseMs * (1 + indent.length) : delay) * scale })
      pause = cadence.newlineMs
      previous = indent ? " " : "\n"
    } else {
      chunks.push({ text: ch, delay: delay * scale })
      pause = PUNCTUATION.has(ch) ? cadence.punctuationMs : OPEN_BRACKETS.has(ch) ? cadence.openBracketMs : 0
      previous = ch
    }
  }
  // Variable delays retain human rhythm while converging exactly to the configured
  // average over each authored block. This keeps benchmark seeds comparable.
  if (cadence.mode === "variable" && chunks.length > 0) {
    const target = (Array.from(text).length * 12_000 * scale) / cadence.wpm
    const actual = chunks.reduce((sum, chunk) => sum + chunk.delay, 0)
    if (actual > 0) for (const chunk of chunks) chunk.delay *= target / actual
  }
  return chunks
}

/** Small deterministic PRNG; suitable for repeatable timing, not security. */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state += 0x6d2b79f5
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296
  }
}

export function readingTime(text: string, reading: Reading): number {
  const words = text.split(/\s+/).filter(Boolean).length
  return Math.min(reading.maxMs, Math.max(reading.minMs, words * reading.msPerWord))
}
