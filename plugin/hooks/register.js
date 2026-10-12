const SAFE_TOOLS = new Set([
  'Read', 'Glob', 'Grep', 'WebFetch', 'WebSearch', 'ToolSearch',
  'AskUserQuestion', 'TodoWrite', 'TaskCreate', 'TaskUpdate', 'TaskList', 'TaskGet',
  'Task', 'TaskOutput', 'Agent', 'SendMessage', 'Skill', 'EnterPlanMode', 'ExitPlanMode'
])

let blocked = 0
let startedAt = Date.now()
let status = null
let error = 'Editor not connected yet'
let polling = false

async function control($, args) {
  try {
    const reply = await $.mcp.call('plugin:human-body-mode:pair', 'control', args)
    const text = reply.content.filter(c => c.type === 'text').map(c => c.text).join('\n')
    if (reply.isError) throw new Error(text)
    status = JSON.parse(text)
    error = ''
  } catch (e) {
    error = String(e)
  }
  $.ui.invalidate('ui.render')
}

function summary() {
  if (!status) return error
  return `${status.paused ? 'PAUSED' : 'RUNNING'} · ${status.configuredWpm} target WPM · ${status.effectiveWpm.toFixed(1)} effective WPM · ${Math.round(status.elapsedMs / 1000)}s elapsed · ${status.charactersTyped} chars · blocked ${blocked}`
}

function isPhysicalInputTool(tool) {
  return /^mcp__pair__(start|step|listen|end|read)$/.test(tool) ||
    /^mcp__plugin_human-body-mode_pair__(start|step|listen|end|read)$/.test(tool)
}

export function register(on) {
  on('session.start', async ($, e, next) => {
    $.clock.every(1000, async () => {
      if (polling) return
      polling = true
      try { await control($, { operation: 'status' }) } finally { polling = false }
    })
    await $.command.register({ name: 'human-body', description: 'Open physical-input controls', immediate: true, argumentHint: '[pause|resume|wpm N|break seconds|run command|reset|stop]' })
    await $.command.register({ name: 'human-body-status', description: 'Show Human Body Mode enforcement status' })
    await $.command.register({ name: 'human-body-reset', description: 'Reset the Human Body Mode wall clock and block counter' })
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    // next.origin is engine-owned, not a model-supplied tool argument.
    if (e.tool === 'mcp__plugin_human-body-mode_pair__control' &&
        next.origin.plugin === 'human-body-mode') return next(e)
    if (SAFE_TOOLS.has(e.tool) || isPhysicalInputTool(e.tool)) return next(e)
    blocked += 1
    const path = '.human-body-mode/blocked.jsonl'
    const previous = (await $.fs.exists(path)) ? await $.fs.read(path) : ''
    const event = JSON.stringify({ at: new Date().toISOString(), tool: e.tool, agentId: e.agentId ?? null })
    await $.fs.write(path, previous + event + '\n')
    $.ui.invalidate('ui.render')
    return { deny: `${e.tool} is blocked by Human Body Mode. Use the pair MCP tools so all physical input shares the measured queue.` }
  }).catch(async ($, e, next) => {
    if (next.called) throw new Error(next.error.message)
    return { deny: `Human Body Mode failed closed: ${next.error.message}` }
  })

  on('command.run', { command: 'human-body' }, async ($, e) => {
    const [operation, ...rest] = (e.args || '').trim().split(/\s+/)
    if (operation) {
      await control($, { operation, ...(operation === 'run' ? { command: rest.join(' ') } : ['wpm', 'break'].includes(operation) ? { value: Number(rest[0]) } : {}) })
      return { text: error || summary() }
    }
    await control($, { operation: 'status' })
    await $.ui.open({ id: 'human-body', title: 'Human Body Mode', focus: true, closeOnEscape: true })
    return {}
  })

  on('ui.render', { component: 'Pane' }, async ($, e, next) => {
    if (e.requestId !== 'human-body') return next(e)
    const { Box, Text, Button, Input } = $.ui.resolve(e)
    return Box({ flexDirection: 'column', gap: 1, children: [
      Text({ children: summary() }),
      Text({ children: status ? `Physical ${(status.physicalActionMs / 1000).toFixed(1)}s · queue wait ${(status.queueWaitMs / 1000).toFixed(1)}s · clipboard ${status.clipboardOperations} · commands ${status.commandsExecuted}` : 'Requires the AI Pair editor backend; no model requests are made by this panel.' }),
      ...(status ? [Text({ children: status.queuedCharacters > 0 ? `Queued typing ~${Math.ceil(status.typingEtaMs / 1000)}s · ${status.queuedCharacters} chars left · ${status.typingEtaState}. Excludes future output and builds.` : 'No input queued; project completion time is unknown.' })] : []),
      ...(error && status ? [Text({ children: error })] : []),
      Box({ gap: 1, children: [
        Button({ key: 'pause', label: 'Pause', onPress: () => control($, { operation: 'pause' }) }),
        Button({ key: 'resume', label: 'Resume', onPress: () => control($, { operation: 'resume' }) }),
        Button({ key: 'reset', label: 'Reset clock', onPress: () => control($, { operation: 'reset' }) }),
        Button({ key: 'stop', label: 'Stop clock', onPress: () => control($, { operation: 'stop' }) }),
      ] }),
      Input({ key: 'wpm', label: 'WPM (next typing block)', value: '', placeholder: String(status?.configuredWpm || 60), onSubmit: value => control($, { operation: 'wpm', value: Number(value) }) }),
      Input({ key: 'break', label: 'Break seconds', value: '', placeholder: '300', onSubmit: value => control($, { operation: 'break', value: Number(value) }) }),
      Input({ key: 'run', label: 'Type and run command', value: '', placeholder: 'git status', onSubmit: command => control($, { operation: 'run', command }) }),
    ] })
  })

  on('command.run', { command: 'human-body-status' }, async () => ({
    text: `Human Body Mode active · elapsed ${Math.round((Date.now() - startedAt) / 1000)}s · blocked bypasses ${blocked}`
  }))

  on('command.run', { command: 'human-body-reset' }, async () => {
    blocked = 0
    startedAt = Date.now()
    return { text: 'Human Body Mode clock and block counter reset' }
  })

  on('ui.render', { component: 'Spinner' }, async ($, e, next) =>
    next({ ...e, props: { ...e.props, suffix: ` · Human Body · ${status ? summary() : `blocked ${blocked}`}…` } })
  )
}
