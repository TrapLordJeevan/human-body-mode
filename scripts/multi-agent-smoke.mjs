// Uses real MCP, editor buffers and saves, never a model. Supply a disposable open workspace.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const project = path.resolve(process.argv[2] || '')
assert.ok(process.argv[2] && project !== repo, 'Supply a disposable project, not this repository')
assert.ok(fs.existsSync(path.join(project, '.multi-agent-smoke-fixture')), 'Create .multi-agent-smoke-fixture only in your disposable test workspace')
const clients = []
async function connect(name) {
  const client = new Client({ name, version: '1' })
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [path.join(repo, 'plugin/server/pair-mcp.cjs')], cwd: project,
    env: Object.fromEntries(Object.entries(process.env).filter(([, v]) => typeof v === 'string')) }))
  clients.push(client); return client
}
async function call(client, name, args = {}) {
  const result = await client.callTool({ name, arguments: args })
  const text = result.content.filter(c => c.type === 'text').map(c => c.text).join('\n')
  assert.ok(!result.isError, text); return text
}
const operator = await connect('operator-NOT-a-model')
const status = () => call(operator, 'control', { operation: 'status' }).then(JSON.parse)
const controls = args => call(operator, 'control', args)
const one = await connect('agent-one-NOT-a-model'), two = await connect('agent-two-NOT-a-model')
const stamp = Date.now()
let oldProfile
try {
  oldProfile = (await status()).profile
  assert.ok(!(await status()).agents.some(a => a.active), 'Use a fresh disposable workspace without active agents')
  await controls({ operation: 'typingMode', value: 'shared' })
  await controls({ operation: 'profile', profile: { timing: { type: { mode: 'strict', wpm: 60 } }, seed: 42 } })
  await call(one, 'start', { task: 'Agent One', cwd: project })
  await call(two, 'start', { task: 'Agent Two', cwd: project })
  let state = await status()
  const first = state.agents.find(a => a.name === 'Agent One' && a.connected && a.active).id
  const second = state.agents.find(a => a.name === 'Agent Two' && a.connected && a.active).id
  assert.equal(state.typingMode, 'shared')
  await controls({ operation: 'selectAgent', value: second })
  await controls({ operation: 'pause' })
  state = await status()
  assert.ok(state.agents.find(a => a.id === second).pauseReasons.includes('operator'))
  assert.ok(!state.agents.find(a => a.id === first).paused)
  const hold = Number(process.env.HUMAN_BODY_UI_HOLD_MS ?? 8000)
  assert.ok(Number.isFinite(hold) && hold >= 0 && hold <= 60000)
  console.log(`READY: sidebar should show two agents, Agent Two selected, and Paused · manual pause. Continuing in ${hold / 1000} seconds.`)
  await new Promise(resolve => setTimeout(resolve, hold))
  await controls({ operation: 'resume', scope: 'all' })
  const results = []
  for (const mode of ['shared', 'individual']) {
    await controls({ operation: 'typingMode', value: mode })
    const files = [`One-${stamp}-${mode}.txt`, `Two-${stamp}-${mode}.txt`].map(file => `.human-body-mode/${file}`)
    const moves = await Promise.all([one, two].map((client, i) => call(client, 'step', { actions: [{ move: { file: files[i], line: 1, to: 'line_end' } }] })))
    const moveFlushes = await Promise.all([one, two].map(client => call(client, 'step', { actions: [] })))
    for (const report of [...moves, ...moveFlushes]) assert.ok(!/Batch \d+ (?:failed|discarded|interrupted)|Batch rejected/.test(report), report)
    const started = performance.now()
    const submissions = await Promise.all([one, two].map(client => call(client, 'step', { actions: [{ type: 'abcdefghijklmnopqrst▌' }] })))
    const flushes = await Promise.all([one, two].map(client => call(client, 'step', { actions: [] })))
    const ms = performance.now() - started
    for (const file of files) {
      const text = fs.readFileSync(path.join(project, file), 'utf8')
      if (text !== 'abcdefghijklmnopqrst') console.error(JSON.stringify({ mode, file, moves, moveFlushes, submissions, flushes, agents: (await status()).agents.map(a => ({ id: a.id, active: a.active, lane: a.lane, pauseReasons: a.pauseReasons })) }, null, 2))
      assert.equal(text, 'abcdefghijklmnopqrst')
    }
    assert.ok(ms >= (mode === 'shared' ? 7900 : 3900), `${mode} must incur real human typing time: ${ms}`)
    assert.ok(ms < (mode === 'shared' ? 13000 : 7500), `${mode} did not make expected progress: ${ms}`)
    results.push({ mode, characters: 40, elapsedMs: Math.round(ms) })
  }
  await controls({ operation: 'typingMode', value: 'lead', leadAgent: first })
  const rejected = await two.callTool({ name: 'step', arguments: { actions: [{ type: 'bypass▌' }] } })
  assert.ok(rejected.isError)
  await call(two, 'read', { file: `.human-body-mode/One-${stamp}-shared.txt` })
  await controls({ operation: 'typingMode', value: 'shared' })
  const conflict = `.human-body-mode/One-${stamp}-shared.txt`
  for (const client of [one, two]) {
    await call(client, 'read', { file: conflict })
    await call(client, 'step', { actions: [{ move: { file: conflict, line: 1, to: 'line_end' } }] })
    await call(client, 'step', { actions: [] })
  }
  await call(one, 'step', { actions: [{ type: 'XXXXXXXXXX▌' }] })
  await call(two, 'step', { actions: [{ type: 'YYYYYYYYYY▌' }] })
  await Promise.all([one, two].map(client => call(client, 'step', { actions: [] })))
  assert.equal(fs.readFileSync(path.join(project, conflict), 'utf8'), 'abcdefghijklmnopqrstXXXXXXXXXX', 'Peer edits must invalidate a stale queued same-file plan')
  await call(one, 'end')
  assert.ok((await status()).agents.find(a => a.id === second).active)
  await call(two, 'end')
  console.log(JSON.stringify({ passed: true, kind: 'real-editor-NOT-a-model', results, isolatedPause: true, leadReadOnly: true, independentEnd: true, staleConflictDiscarded: true }, null, 2))
} finally {
  await controls({ operation: 'resume', scope: 'all' }).catch(() => {})
  if (oldProfile) await controls({ operation: 'profile', profile: oldProfile }).catch(() => {})
  await one.close(); await two.close()
  await controls({ operation: 'typingMode', value: 'shared' }).catch(() => {})
  await operator.close()
}
