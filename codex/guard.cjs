#!/usr/bin/env node
// Native Codex PreToolUse hook. Read-only sandbox remains necessary: hook runtime failures fail open.
const fs = require('node:fs')
const path = require('node:path')
function allowed(event) {
  const name = event.tool_name
  if (/^mcp__pair__(start|step|listen|end|read)$/.test(name)) return true
  if (['update_plan', 'spawn_agent', 'Agent', 'send_input', 'wait', 'close_agent', 'resume_agent', 'view_image', 'request_user_input'].includes(name)) return true
  if (name !== 'Bash') return false
  const command = event.tool_input?.command
  // ponytail: deliberately narrow shell grammar; use pair read for unusual filenames and pair step for commands.
  if (typeof command !== 'string' || /[\n\r\0]/.test(command)) return false
  const words = command.match(/"[^"\n]*"|'[^'\n]*'|[^\s"']+/g) || []
  if (words.join(' ').replace(/\s+/g, ' ') !== command.trim().replace(/\s+/g, ' ')) return false
  // Shell metacharacters are literal in single quotes; double quotes still allow substitutions.
  if (words.some(word => word.startsWith("'") ? false : word.startsWith('"') ? /[`$\\]/.test(word) : /[;&|><`$(){}\\]/.test(word))) return false
  const argv = words.map(w => w.replace(/^(['"])(.*)\1$/, '$2'))
  if (argv[0] === 'pwd') return argv.length === 1
  if (argv[0] === 'git') return ['status', 'diff', 'log', 'show', 'ls-files'].includes(argv[1]) && argv.slice(2).every(w => !w.startsWith('-') || /^--(stat|name-only|oneline|short)$/.test(w))
  if (!['ls', 'cat', 'head', 'tail', 'rg'].includes(argv[0])) return false
  return argv.slice(1).every(w => !w.startsWith('-') || ['--', '-n', '-l', '-a', '-la', '-al', '--files', '-F', '-i', '-S', '--hidden', '-g', '-e'].includes(w) || /^-\d+$/.test(w))
}
function decision(event) {
  if (event.hook_event_name !== 'PreToolUse') throw new Error('Unexpected hook event')
  if (allowed(event)) return {}
  const reason = 'Human Body Mode: direct writes, unapproved tools and terminal execution are blocked. Use pair start/read/step; physical actions share the editor queue.'
  if (typeof event.cwd === 'string') {
    fs.mkdirSync(path.join(event.cwd, '.human-body-mode'), { recursive: true })
    fs.appendFileSync(path.join(event.cwd, '.human-body-mode/blocked.jsonl'), JSON.stringify({ timestamp: new Date().toISOString(), tool: event.tool_name, reason, agent: 'codex' }) + '\n')
  }
  return { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } }
}
module.exports = { allowed, decision }
if (require.main === module) {
  let input = ''
  process.stdin.setEncoding('utf8')
  process.stdin.on('data', chunk => { input += chunk })
  process.stdin.on('end', () => {
    try { console.log(JSON.stringify(decision(JSON.parse(input)))) }
    catch { console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: 'Human Body guard could not validate this call.' } })) }
  })
}
