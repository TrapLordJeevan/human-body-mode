// Uses the installed Codex app-server and its real config/MCP loader. Never starts a model turn.
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const capture = spawnSync(process.execPath, [path.join(root, 'bin/codex'), '--human-body'], {
  encoding: 'utf8', env: { ...process.env, HUMAN_BODY_CODEX_BINARY: path.join(root, 'packages/relay/test/mock-codex.cjs') },
})
assert.equal(capture.status, 0, capture.stderr)
const args = JSON.parse(capture.stdout)
const configArgs = []
for (let i = 0; i < args.length; i++) if (args[i] === '-c') configArgs.push(args[i], args[++i])
// The wrapper must inventory the actual user's active servers for this check, not the mock inventory.
const inventory = spawnSync(process.env.HUMAN_BODY_CODEX_BINARY || 'codex', ['mcp', 'list', '--json'], { encoding: 'utf8' })
assert.equal(inventory.status, 0)
for (const server of JSON.parse(inventory.stdout)) {
  assert.match(server.name, /^[A-Za-z0-9_-]+$/)
  configArgs.push('-c', `mcp_servers.${server.name}.enabled=false`)
}
const child = spawn(process.env.HUMAN_BODY_CODEX_BINARY || 'codex', ['app-server', '--strict-config', ...configArgs], { stdio: ['pipe', 'pipe', 'pipe'] })
let id = 0
const pending = new Map()
const lines = createInterface({ input: child.stdout })
lines.on('line', line => {
  const message = JSON.parse(line)
  if (message.id !== undefined && pending.has(message.id)) {
    const { resolve, reject, timer } = pending.get(message.id)
    clearTimeout(timer); pending.delete(message.id)
    if (message.error) reject(new Error(JSON.stringify(message.error)))
    else resolve(message.result)
  }
})
let errors = ''
child.stderr.on('data', chunk => { errors += chunk.toString() })
child.on('exit', () => { for (const p of pending.values()) { clearTimeout(p.timer); p.reject(new Error('Codex exited: ' + errors.slice(-1500))) } pending.clear() })
function call(method, params = {}) {
  return new Promise((resolve, reject) => {
    const request = ++id
    const timer = setTimeout(() => { pending.delete(request); reject(new Error(`Timeout: ${method}`)) }, 20000)
    pending.set(request, { resolve, reject, timer })
    child.stdin.write(JSON.stringify({ id: request, method, params }) + '\n')
  })
}
try {
  await call('initialize', { clientInfo: { name: 'human_body_offline_check', version: '1' }, capabilities: { experimentalApi: true } })
  child.stdin.write(JSON.stringify({ method: 'initialized', params: {} }) + '\n')
  const result = await call('config/read', { includeLayers: false })
  assert.equal(result.config.features.hooks, true)
  assert.ok(result.config.hooks.PreToolUse.length)
  const servers = Object.keys(result.config.mcp_servers).filter(name => result.config.mcp_servers[name].enabled !== false)
  assert.deepEqual(servers, ['pair'], 'Existing MCP servers must not remain enabled')
  assert.deepEqual(result.config.mcp_servers.pair.enabled_tools, ['start', 'step', 'listen', 'end', 'read'])
  assert.equal(result.config.mcp_servers.pair.default_tools_approval_mode, 'approve')
  const status = await call('mcpServerStatus/list', {})
  const pair = status.data.find(server => server.name === 'pair')
  assert.ok(pair, 'Pair relay did not load')
  assert.deepEqual(Object.keys(pair.tools).sort(), ['end', 'listen', 'read', 'start', 'step'])
  console.log('PASS: real Codex config accepted; only pair MCP loaded; supervisor control excluded. No model turns or tokens used.')
} finally { child.kill('SIGTERM'); lines.close() }
