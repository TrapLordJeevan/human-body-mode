// Run as the same OS user and in the same container as the editor extension.
// Real MCP + real VS Code edits; no model requests.
import assert from 'node:assert/strict'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const project = process.argv[2] || path.join(repo, 'fixture-java')
const smokeFile = `.human-body-mode/Smoke-${Date.now()}.java`
const client = new Client({ name: 'human-body-editor-smoke', version: '1' })
await client.connect(new StdioClientTransport({ command: process.execPath, args: [path.join(repo, 'plugin/server/pair-mcp.cjs')], cwd: project }))
const call = async (name, args = {}) => {
  const result = await client.callTool({ name, arguments: args })
  assert.ok(!result.isError, JSON.stringify(result.content))
  return result.content.filter(c => c.type === 'text').map(c => c.text).join('\n')
}
try {
  await call('control', { operation: 'reset' })
  await call('start', { cwd: project, task: 'Zero-token real editor smoke test' })
  await call('control', { operation: 'wpm', value: 60 })
  await call('step', { actions: [{ move: { file: smokeFile, line: 1, to: 'line_end' } }, { type: 'class Smoke {\n  int answer() { return 42; }\n}\n▌' }] })
  await call('step', { actions: [] })
  const file = await call('read', { file: smokeFile })
  assert.match(file, /return 42/)
  const status = JSON.parse(await call('control', { operation: 'status' }))
  assert.ok(status.charactersTyped >= 42)
  assert.ok(status.physicalActionMs > 8000)
  console.log(JSON.stringify({ passed: true, ...status }, null, 2))
  await call('control', { operation: 'pause' })
  assert.equal(JSON.parse(await call('control', { operation: 'status' })).paused, true)
  await call('control', { operation: 'resume' })
  await call('end', { summary: 'Real editor smoke test passed' })
} finally { await client.close() }
