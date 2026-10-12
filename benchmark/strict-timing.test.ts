import { expect, test } from "vitest"
import { setup } from "../packages/core/test/fake"

test("300 authored characters take approximately 60 seconds at strict 60 WPM", async () => {
  const { controller } = setup({ "Timed.java": "" }, {
    timing: {
      type: { mode: "strict", wpm: 60, charMs: 200, jitter: 0, wordStartMs: 0, punctuationMs: 0, openBracketMs: 0, newlineMs: 0 },
      fastFactor: 1,
      reading: { msPerWord: 0, minMs: 0, maxMs: 0 },
      beforeMoveMs: 0,
      afterMoveNearMs: 0,
      afterMoveFarMs: 0,
      nearLines: 15,
      beforeSelectMs: 0,
      afterSelectMs: 0,
      afterDeleteMs: 0,
      afterPointMs: 0,
    },
    commandTyping: true,
  })
  await controller.start()
  const started = Date.now()
  await controller.step([{ move: { file: "Timed.java", line: 1, to: "line_end" } }, { type: `${"x".repeat(300)}▌` }])
  let report = await controller.step([])
  while (report.batches.length === 0) report = await controller.step([])
  const elapsed = Date.now() - started
  expect(elapsed).toBeGreaterThanOrEqual(59_500)
  expect(elapsed).toBeLessThan(62_000)
}, 70_000)
