// Real MCP/editor stress test of optional behaviours; never invokes a model.
// Run only with a disposable project open in the matching VS Code extension host.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { spawnSync } from 'node:child_process'
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const project = path.resolve(process.argv[2] || '')
assert.ok(process.argv[2] && project !== repo && fs.existsSync(project), 'Supply a disposable project, not the tool repository')
const client = new Client({ name: 'scripted-human-profile-smoke-NOT-a-model', version: '1' })
await client.connect(new StdioClientTransport({ command: process.execPath, args: [path.join(repo, 'plugin/server/pair-mcp.cjs')], cwd: project,
  env: Object.fromEntries(Object.entries(process.env).filter(([, value]) => typeof value === 'string')) }))
async function call(name, args = {}) {
  const result = await client.callTool({ name, arguments: args })
  const text = result.content.filter(c => c.type === 'text').map(c => c.text).join('\n')
  assert.ok(!result.isError, text)
  return text
}
const className = `ProfileSmoke${Date.now()}`
const file = `.human-body-mode/${className}.java`
const intended = `class ${className} {\n  int answer() { return 42; }\n}\n`
let previous
let wasPaused = false
try {
  const originalStatus = JSON.parse(await call('control', { operation: 'status' }))
  previous = originalStatus.profile
  wasPaused = originalStatus.paused
  await call('control', { operation: 'profile', profile: { seed: 7, timing: { type: {
    wpm: 120, mode: 'variable', typoChance: 1, falseStartChance: 0.5, correctionPauseMs: 25, backspaceMs: 10,
    shortPauseChance: 1, shortPauseMinMs: 20, shortPauseMaxMs: 20,
    autoBreakIntervalMinSeconds: 1, autoBreakIntervalMaxSeconds: 1, autoBreakMinSeconds: 0.1, autoBreakMaxSeconds: 0.1,
  } } } })
  await call('control', { operation: 'reset' })
  await call('control', { operation: 'resume' })
  await call('start', { cwd: project })
  await call('step', { actions: [{ move: { file, line: 1, to: 'line_end' } }, { type: intended + '▌' }] })
  await call('step', { actions: [] })
  assert.equal(fs.readFileSync(path.join(project, file), 'utf8'), intended, 'Corrections must preserve intended code exactly')
  const status = JSON.parse(await call('control', { operation: 'status' }))
  assert.ok(status.typingCorrections > 0 && status.falseStarts > 0 && status.automaticBreaks > 0)
  assert.ok(status.charactersTyped > intended.length, 'Inserted wrong characters must be counted')
  assert.ok(status.automaticBreakMs > 0)
  const compiler = spawnSync('javac', ['-version']).error ? 'java -m jdk.compiler/com.sun.tools.javac.Main' : 'javac'
  await call('control', { operation: 'run', command: `${compiler} -d target/classes ${file}` })
  await call('step', { actions: [] })
  assert.ok(fs.existsSync(path.join(project, `target/classes/${className}.class`)), 'Unique actual compiler output must exist')
  await call('end')
  const finalMetrics = JSON.parse(await call('control', { operation: 'stop' }))
  assert.equal(finalMetrics.commandsExecuted, 1)
  console.log(JSON.stringify({ passed: true, kind: 'scripted-real-editor-NOT-a-model', sourceMetrics: status, finalMetrics }, null, 2))
} finally {
  if (previous) await call('control', { operation: 'profile', profile: previous }).catch(error => console.error('Could not restore operator profile:', error.message))
  if (!wasPaused) await call('control', { operation: 'resume' }).catch(() => {})
  await client.close()
}
