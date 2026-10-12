import { createRequire } from 'node:module'
import { chmodSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawn, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import { Bridge, Controller } from '@ai-pair/core'
import { FakeEditor, FakePanel, testConfig } from '../../core/test/fake'
const root = fileURLToPath(new URL('../../../', import.meta.url))
const { allowed } = createRequire(import.meta.url)(path.join(root, 'codex/guard.cjs'))
it('both launchers forward interruption to their actual CLI child', async () => {
  const fake = path.join(root, 'packages/relay/test/mock-codex.cjs')
  chmodSync(fake, 0o755)
  for (const cli of ['codex', 'claude']) {
    const result = await new Promise<{ code: number | null, out: string }>((resolve, reject) => {
      const child = spawn(process.execPath, [path.join(root, 'bin', cli), '--human-body', '--signal-probe'], {
        env: { ...process.env, HUMAN_BODY_CODEX_BINARY: fake, HUMAN_BODY_CLAUDE_BINARY: fake },
      })
      const timer = setTimeout(() => child.kill('SIGTERM'), 3000)
      let out = '', sent = false
      child.stdout.on('data', data => { out += data; if (!sent && out.includes('READY')) { sent = true; child.kill('SIGTERM') } })
      child.on('error', reject)
      child.on('close', code => { clearTimeout(timer); resolve({ code, out }) })
    })
    expect(result.out).toContain('FORWARDED')
    expect(result.code).toBe(0)
  }
})
it('allows inspection and shared pairing, denies authorship and supervisor bypasses', () => {
  for (const name of ['start', 'step', 'listen', 'end', 'read']) expect(allowed({ tool_name: `mcp__pair__${name}` })).toBe(true)
  for (const name of ['apply_patch', 'mcp__pair__control', 'mcp__other__write_file', 'exec', 'unknown']) expect(allowed({ tool_name: name })).toBe(false)
  for (const command of ['pwd', 'ls -la', 'rg --files', 'rg -n "hello world" src', "rg -n 'twofer|Twofer' src verify.cjs", "rg -n '^foo$' src", 'cat README.md', 'git diff --stat']) expect(allowed({ tool_name: 'Bash', tool_input: { command } })).toBe(true)
  for (const command of ['echo code > Main.java', 'python3 -c "write()"', 'node generate.js', 'cat <<EOF', 'sed -i s/a/b/ Main.java', 'git apply x.patch', 'rg --pre ./generate.sh foo', 'cat a; touch b', 'cat $(touch b)', 'rg -n "$(touch b)" src', 'rg "`touch b`" src', 'sh', 'npm test', 'human-body wpm 300']) expect(allowed({ tool_name: 'Bash', tool_input: { command } })).toBe(false)
})
it('native command hook emits documented denial and records real filesystem audit; malformed input denies', () => {
  const cwd = mkdtempSync(path.join(tmpdir(), 'human-body-codex-'))
  const launch = (input: string) => spawnSync(process.execPath, [path.join(root, 'codex/guard.cjs')], { input, encoding: 'utf8' })
  const blocked = launch(JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'apply_patch', cwd }))
  expect(blocked.status).toBe(0)
  expect(JSON.parse(blocked.stdout).hookSpecificOutput.permissionDecision).toBe('deny')
  expect(JSON.parse(readFileSync(path.join(cwd, '.human-body-mode/blocked.jsonl'), 'utf8')).agent).toBe('codex')
  expect(JSON.parse(launch('{broken').stdout).hookSpecificOutput.permissionDecision).toBe('deny')
  expect(JSON.parse(launch(JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'mcp__pair__step' })).stdout)).toEqual({})
})
it('Codex toggle preserves off arguments, forces native read-only sandbox and excludes control', () => {
  const fake = path.join(root, 'packages/relay/test/mock-codex.cjs')
  chmodSync(fake, 0o755)
  const launch = (...args: string[]) => spawnSync(process.execPath, [path.join(root, 'bin/codex'), ...args], { encoding: 'utf8', env: { ...process.env, HUMAN_BODY_CODEX_BINARY: fake } })
  expect(JSON.parse(launch('--model', 'test').stdout)).toEqual(['--model', 'test'])
  const args = JSON.parse(launch('--human-body', 'do the task').stdout)
  expect(args).toContain('read-only')
  expect(args).toContain('--no-daemon')
  expect(args).toContain('--dangerously-bypass-hook-trust')
  expect(args.find((s: string) => s.startsWith('developer_instructions='))).not.toMatch(/benchmark|experiment|competition|probe|supervised|assessment/i)
  expect(args).toContain('mcp_servers.other-server.enabled=false')
  expect(args.find((s: string) => s.startsWith('mcp_servers='))).not.toContain('"control"')
  expect(args.find((s: string) => s.startsWith('mcp_servers='))).toContain('default_tools_approval_mode="approve"')
  expect(args.find((s: string) => s.startsWith('hooks.PreToolUse='))).toContain('guard.cjs')
  const execArgs = JSON.parse(launch('--human-body', 'exec', '--json', 'task').stdout)
  expect(execArgs.indexOf('--no-daemon')).toBeLessThan(execArgs.indexOf('exec'))
  expect(execArgs.indexOf('--ask-for-approval')).toBeLessThan(execArgs.indexOf('exec'))
  for (const option of ['--dangerously-bypass-approvals-and-sandbox', '-c', '--sandbox=workspace-write', 'resume', '--disable=hooks']) expect(launch('--human-body', option).status).toBe(1)
})
it('ordinary task prompts and model-facing fixtures do not announce an evaluation', () => {
  for (const file of ['benchmark/two-fer/TASK.md', 'fixture-java/TASKS.md', 'fixture-java/README.md', 'plugin/skills/human-body-mode/SKILL.md']) {
    expect(readFileSync(path.join(root, file), 'utf8')).not.toMatch(/benchmark|experiment|competition|probe|supervised|assessment/i)
  }
  const script = readFileSync(path.join(root, 'scripts/run-codex-benchmark.mjs'), 'utf8')
  expect(script.match(/^const prompt = (.*)$/m)?.[1]).not.toMatch(/benchmark|experiment|competition|probe|supervised|assessment|bypass/i)
})
it('companion terminal operates the real stdio MCP and bridge without a model (fake editor)', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'human-body-supervisor-'))
  const controller = new Controller(new FakeEditor(), new FakePanel(), testConfig)
  const bridge = new Bridge(controller, { dir: path.join(dir, 'windows'), workspaceFolders: () => [dir] })
  await bridge.start()
  const run = (args: string[], input?: string) => new Promise<{ code: number | null, out: string, err: string }>((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(root, 'bin/human-body'), ...args], { cwd: dir, env: { ...process.env, AI_PAIR_HOME: dir } })
    const timer = setTimeout(() => child.kill('SIGTERM'), 7000)
    let out = '', err = ''
    child.stdout.on('data', chunk => { out += chunk })
    child.stderr.on('data', chunk => { err += chunk })
    child.on('error', reject)
    child.on('close', code => { clearTimeout(timer); resolve({ code, out, err }) })
    child.stdin.end(input)
  })
  try {
    const status = await run(['reset'])
    expect(status.code, status.err).toBe(0)
    expect(JSON.parse(status.out).running).toBe(true)
    const watched = await run(['watch'], 'wpm 45\npause\nresume\nquit\n')
    expect(watched.code, watched.err).toBe(0)
    expect(watched.out).toContain('Human Body supervisor')
    expect(watched.out).toContain('queue 0.0s')
    expect(watched.out).not.toContain('NaN')
    expect(await controller.control({ operation: 'status' })).toMatchObject({ configuredWpm: 45, paused: false })
    expect((await run(['wpm', 'nonsense'])).code).toBe(1)
  } finally { bridge.dispose(); rmSync(dir, { recursive: true, force: true }) }
}, 15000)
