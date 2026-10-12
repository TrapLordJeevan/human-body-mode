#!/usr/bin/env node
if (process.argv.includes('--signal-probe')) {
  const timer = setInterval(() => {}, 1000)
  process.on('SIGTERM', () => { clearInterval(timer); process.stdout.write('FORWARDED\n'); process.exit(0) })
  process.stdout.write('READY\n')
} else process.stdout.write(JSON.stringify(process.argv[2] === 'mcp' ? [{ name: 'other-server' }] : process.argv.slice(2)))
