// Scripted agent, NOT a Codex model run. Uses the real VS Code editor/MCP and real sandboxed Java tests.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const project = path.resolve(process.argv[2] || '')
assert.ok(project !== root && fs.existsSync(path.join(project, 'src/main/java/Twofer.java')), 'Supply a disposable two-fer project')
const client = new Client({ name: 'scripted-benchmark-agent-NOT-Codex', version: '1' })
await client.connect(new StdioClientTransport({ command: process.execPath, args: [path.join(root, 'plugin/server/pair-mcp.cjs')], cwd: project,
  env: Object.fromEntries(Object.entries(process.env).filter(([, value]) => typeof value === 'string')) }))
async function call(name, args = {}) {
  const result = await client.callTool({ name, arguments: args })
  assert.ok(!result.isError, JSON.stringify(result))
  return result.content.filter(c => c.type === 'text').map(c => c.text).join('\n')
}
const log = { kind: 'scripted-agent-real-editor-NOT-Codex', startedAt: new Date().toISOString() }
const original = fs.readFileSync(path.join(project, 'src/main/java/Twofer.java'), 'utf8')
const tests = fs.readFileSync(path.join(project, 'src/test/java/TwoferTest.java'), 'utf8')
const verifier = fs.readFileSync(path.join(project, 'verify.cjs'), 'utf8')
assert.ok(original.includes('throw new UnsupportedOperationException'), 'Expected untouched starter')
try {
  await call('control', { operation: 'reset' })
  await call('control', { operation: 'resume' })
  await call('start', { cwd: project, task: 'Scripted zero-token editor/build integration, not a real model benchmark' })
  const before = await call('read', { file: 'src/main/java/Twofer.java' })
  const numbered = before.split('\n').find(line => line.includes('throw new UnsupportedOperationException'))
  assert.ok(numbered)
  const line = Number(numbered.trim().match(/^\d+/)?.[0])
  assert.ok(Number.isInteger(line) && line > 0, before)
  const selected = original.split('\n').find(line => line.includes('throw new UnsupportedOperationException')).trim()
  const typed = 'return "One for " + (name == null ? "you" : name) + ", one for me.";'
  await call('step', { actions: [{ select: { file: 'src/main/java/Twofer.java', line, text: selected } }, { type: typed + '▌' }] })
  const report = await call('step', { actions: [] })
  assert.ok(report.includes('completed'), report)
  log.editReport = report
  log.typedSourceCharacters = typed.length
  console.log('Source edit flushed through the real visible typing queue. Running queued verifier with explicit supervisor confirmation.')
  // Explicit supervisor confirmation, not model-accessible control. Same command timing/sandbox/queue.
  await call('control', { operation: 'run', command: 'node verify.cjs' })
  log.runReport = await call('step', { actions: [] })
  assert.match(log.runReport, /3 tests successful/, log.runReport)
  assert.match(log.runReport, /0 tests failed/, log.runReport)
  await call('end', { summary: 'Scripted real-editor benchmark: three tests passed; not a Codex intelligence result.' })
  log.metrics = JSON.parse(await call('control', { operation: 'stop' }))
  assert.ok(log.metrics.charactersTyped >= typed.length + 'node verify.cjs'.length)
  assert.equal(log.metrics.commandsExecuted, 1)
  assert.ok(log.metrics.physicalActionMs > 10000)
  assert.equal(fs.readFileSync(path.join(project, 'src/test/java/TwoferTest.java'), 'utf8'), tests)
  assert.equal(fs.readFileSync(path.join(project, 'verify.cjs'), 'utf8'), verifier)
  fs.writeFileSync(path.join(project, '.human-body-mode/scripted-editor-result.json'), JSON.stringify(log, null, 2))
  console.log(JSON.stringify({ passed: true, kind: log.kind, metrics: log.metrics }, null, 2))
} finally { await client.close() }
