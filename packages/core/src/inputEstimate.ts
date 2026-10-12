import type { Action } from "@ai-pair/protocol"
import type { Cadence } from "./timing"

export type InputEstimate = { characters: number; baseMs: number; extraMs: number }

/** Expected costs only: status polling must never consume the playback RNG. */
export function estimateTyping(text: string, cadence: Cadence, mistakes = true): InputEstimate {
  const characters = Array.from(text).length
  const beat = 12000 / cadence.wpm
  let extraMs = 0
  if (cadence.mode === "variable") {
    const words = text.match(/[a-z]+/gi)?.length ?? 0
    extraMs += words * (cadence.shortPauseChance ?? 0) * ((cadence.shortPauseMinMs ?? 300) + (cadence.shortPauseMaxMs ?? 1200)) / 2
    if (mistakes) {
      const letters = text.match(/[a-z]/gi)?.length ?? 0
      const falseStarts = words * (cadence.falseStartChance ?? 0)
      const typos = Math.max(0, letters - falseStarts) * (cadence.typoChance ?? 0)
      const notice = cadence.correctionPauseMs ?? 500
      const backspace = cadence.backspaceMs ?? 100
      extraMs += typos * (beat + notice + backspace) + falseStarts * (3 * beat + notice + 3 * backspace)
    }
  }
  return { characters, baseMs: characters * beat, extraMs }
}

export function estimateInput(actions: Action[], cadence: Cadence, commandTyping: boolean): InputEstimate {
  const total = { characters: 0, baseMs: 0, extraMs: 0 }
  for (const action of actions) {
    const text = "type" in action ? action.type.replace("▌", "") : "type_fast" in action ? action.type_fast.replace("▌", "") : "run" in action && commandTyping ? action.run : ""
    const value = estimateTyping(text, cadence, !("run" in action))
    total.characters += value.characters
    total.baseMs += value.baseMs
    total.extraMs += value.extraMs
  }
  return total
}
