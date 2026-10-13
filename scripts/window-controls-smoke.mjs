// Check actual sidebar routing after selecting workspace two and clicking Pause selected.
import assert from 'node:assert/strict'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const clients = []
async function connect(project) {
  assert.ok(project && fs.existsSync(path.join(project, '.multi-agent-smoke-fixture')), 'Supply two disposable marked workspaces')
  const client = new Client({ name: 'operator-window-routing-NOT-a-model', version: '1' })
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [path.join(repo, 'plugin/server/pair-mcp.cjs')], cwd: path.resolve(project), env: Object.fromEntries(Object.entries(process.env).filter(([, v]) => typeof v === 'string')) }))
  clients.push(client); return client
}
async function control(client, args) {
  const result = await client.callTool({ name: 'control', arguments: args })
  assert.ok(!result.isError, JSON.stringify(result.content))
  return JSON.parse(result.content.find(c => c.type === 'text').text)
}
try {
  const one = await connect(process.argv[2]), two = await connect(process.argv[3])
  const first = await control(one, { operation: 'status' }), second = await control(two, { operation: 'status' })
  assert.ok(!first.paused, 'Window one must remain unpaused')
  assert.ok(second.pauseReasons.includes('operator'), 'Sidebar must have paused only window two')
  await control(two, { operation: 'resume', scope: 'all' })
  assert.ok(!(await control(two, { operation: 'status' })).paused)
  console.log(JSON.stringify({ passed: true, kind: 'real-editor-NOT-a-model', firstWorkspace: first.workspaceName, secondWorkspace: second.workspaceName, isolatedRemotePause: true }, null, 2))
} finally { for (const client of clients) await client.close() }
