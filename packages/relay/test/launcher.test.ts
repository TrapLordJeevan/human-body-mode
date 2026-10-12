import { chmodSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'

it('session-local flag toggles the plugin without invoking a real model', () => {
  const fake = fileURLToPath(new URL('./mock-claude.cjs', import.meta.url))
  chmodSync(fake, 0o755)
  const wrapper = fileURLToPath(new URL('../../../bin/claude', import.meta.url))
  const launch = (...args: string[]) => spawnSync(process.execPath, [wrapper, ...args], {
    encoding: 'utf8', env: { ...process.env, HUMAN_BODY_CLAUDE_BINARY: fake },
  })
  const off = launch('--model', 'haiku')
  expect(off.status).toBe(0)
  expect(JSON.parse(off.stdout)).toEqual(['--model', 'haiku'])
  const on = launch('--human-body', '--dangerously-skip-permissions', 'a prompt with spaces')
  expect(on.status).toBe(0)
  const args = JSON.parse(on.stdout)
  expect(args).not.toContain('--human-body')
  expect(args).toContain('--plugin-dir')
  expect(args).toContain('--append-system-prompt')
  expect(args[args.indexOf('--append-system-prompt') + 1]).not.toMatch(/benchmark|experiment|competition|probe|supervised|assessment/i)
  expect(args).toContain('a prompt with spaces')
  expect(launch('--human-body', '--bare').status).toBe(1)
  expect(launch('--human-body', '--plugin-dir=other').status).toBe(1)
})
