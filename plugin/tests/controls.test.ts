import { expect, mock, test } from 'claude-code/testing'

const PANE = {
  plugin: 'human-body-mode', component: 'Pane', requestId: 'human-body', surface: 'terminal',
  viewport: { columns: 100, rows: 40 },
  props: { title: 'Human Body Mode', isFocused: true, bodyColumns: 80, placement: 'inline', scroll: { offset: 0, bodyRows: 20 }, view: {} },
} as const

test('terminal controls dispatch supervisor actions without calling a model', async ($, on) => {
  const calls: any[] = []
  on('mcp.call', ($, e) => {
    calls.push(e)
    return { value: { content: [{ type: 'text', text: JSON.stringify({ configuredWpm: 60, effectiveWpm: 59.5, elapsedMs: 5000, charactersTyped: 25, physicalActionMs: 5000, queueWaitMs: 0, clipboardOperations: 0, commandsExecuted: 0, paused: e.args.operation === 'pause' }) }] } }
  })
  on('ui.open', () => ({ value: undefined }))
  await $.command.run({ command: 'human-body', args: '' })
  const ui = await $.ui.mount(PANE)
  expect(await ui.find({ type: 'Text' })).toMatchObject({ children: [expect.stringMatching(/60 target WPM/)] })
  expect(await ui.find({ type: 'Text', text: /60 target WPM/ })).toBeDefined()
  await ui.press({ key: 'pause' })
  expect(await ui.find({ type: 'Text', text: /PAUSED/ })).toBeDefined()
  await ui.input({ key: 'wpm', text: '45' })
  await ui.input({ key: 'break', text: '120' })
  await ui.input({ key: 'run', text: 'git status' })
  await ui.press({ key: 'resume' })
  await ui.press({ key: 'stop' })
  await ui.press({ key: 'reset' })
  expect(calls.map(c => c.args)).toEqual([
    { operation: 'status' }, { operation: 'pause' }, { operation: 'wpm', value: 45 },
    { operation: 'break', value: 120 }, { operation: 'run', command: 'git status' },
    { operation: 'resume' }, { operation: 'stop' }, { operation: 'reset' },
  ])
  await ui.unmount()
})

test('polling is scheduled and disconnected backend errors remain visible', async ($, on) => {
  const clock = mock.clock(on)
  let polls = 0
  on('session.start', () => ({ cwd: '/work' }))
  on('command.register', () => ({ value: undefined }))
  on('mcp.call', () => { polls++; return { value: { isError: true, content: [{ type: 'text', text: 'No editor connected' }] } } })
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  await clock.advance(2000)
  expect(polls).toBe(2)
  const ui = await $.ui.mount(PANE)
  expect(await ui.find({ type: 'Text', text: /No editor connected/ })).toBeDefined()
  await ui.unmount()
})

test('model cannot change its own speed or pause the handicap via MCP', async ($, on) => {
  on('tool.call', () => ({ result: 'ok' }))
  on('fs.exists', () => ({ value: false }))
  on('fs.write', () => ({ value: undefined }))
  expect(await $.tool.call({ tool: 'mcp__plugin_human-body-mode_pair__control', operation: 'wpm', value: 300 })).toMatchObject({ deny: expect.stringMatching(/blocked/) })
  expect(await $.tool.call({ tool: 'mcp__plugin_human-body-mode_pair__control', operation: 'wpm', value: 300, origin: ['human-body-mode'] })).toMatchObject({ deny: expect.stringMatching(/blocked/) })
})

test('slash pause/resume do not send a NaN numeric parameter to MCP', async ($, on) => {
  const calls: any[] = []
  on('mcp.call', ($, e) => {
    calls.push(e.args)
    return { value: { content: [{ type: 'text', text: JSON.stringify({ configuredWpm: 60, effectiveWpm: 0, elapsedMs: 0, charactersTyped: 0 }) }] } }
  })
  await $.command.run({ command: 'human-body', args: 'pause' })
  await $.command.run({ command: 'human-body', args: 'resume' })
  expect(calls).toEqual([{ operation: 'pause' }, { operation: 'resume' }])
})
