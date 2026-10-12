// Zero-token real-editor ETA check. Resume via the sidebar once READY appears.
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const project = path.resolve(process.argv[2] || '')
assert.ok(process.argv[2] && project !== repo, 'Supply a disposable editor project')
const client = new Client({ name: 'scripted-eta-smoke-NOT-a-model', version: '1' })
await client.connect(new StdioClientTransport({ command: process.execPath, args: [path.join(repo, 'plugin/server/pair-mcp.cjs')], cwd: project,
  env: Object.fromEntries(Object.entries(process.env).filter(([, value]) => typeof value === 'string')) }))
async function call(name, args = {}) {
  const result = await client.callTool({ name, arguments: args })
  const text = result.content.filter(c => c.type === 'text').map(c => c.text).join('\n')
  assert.ok(!result.isError, text)
  return text
}
let previous
try {
  previous = JSON.parse(await call('control', { operation: 'status' })).profile
  await call('control', { operation: 'profile', profile: { timing: { type: { mode: 'strict', wpm: 60 } }, seed: 42 } })
  await call('control', { operation: 'reset' })
  await call('control', { operation: 'pause' })
  await call('start', { cwd: project })
  await call('step', { actions: [{ move: { file: `.human-body-mode/Eta-${Date.now()}.txt`, line: 1, to: 'line_end' } }, { type: 'abcde '.repeat(25) + '▌' }] })
  const initial = JSON.parse(await call('control', { operation: 'status' }))
  assert.equal(initial.queuedCharacters, 150)
  assert.equal(initial.typingEtaMs, 30000)
  assert.equal(initial.typingEtaState, 'paused')
  console.log('READY: click Resume in the actual sidebar. Expect ~30s and 150 characters, then a countdown.')
  let sawProgress = false
  for (let attempts = 0; attempts < 180; attempts++) {
    const status = JSON.parse(await call('control', { operation: 'status' }))
    if (status.queuedCharacters > 0 && status.queuedCharacters < 150 && status.typingEtaMs < 30000) sawProgress = true
    if (status.queuedCharacters === 0) break
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  const done = JSON.parse(await call('control', { operation: 'status' }))
  assert.ok(sawProgress)
  assert.equal(done.queuedCharacters, 0)
  assert.equal(done.typingEtaMs, 0)
  await call('step', { actions: [] })
  await call('end')
  console.log(JSON.stringify({ passed: true, kind: 'real-editor-NOT-a-model', initial: { characters: initial.queuedCharacters, etaMs: initial.typingEtaMs }, final: { characters: done.queuedCharacters, etaMs: done.typingEtaMs }, actualPhysicalMs: done.physicalActionMs }, null, 2))
} finally {
  if (previous) await call('control', { operation: 'profile', profile: previous }).catch(() => {})
  await client.close()
}
