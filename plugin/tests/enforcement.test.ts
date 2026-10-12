import { expect, test } from 'claude-code/testing'

test('blocks direct writers and allows repository reading', async ($, on) => {
  on('tool.call', () => ({ result: 'ok' }))
  on('fs.exists', () => ({ value: false }))
  on('fs.write', () => ({ value: undefined }))
  await expect($.tool.call({ tool: 'Read', file_path: 'README.md' })).resolves.toBeDefined()
  await expect($.tool.call({ tool: 'Write', file_path: 'x.java', content: 'bypass' })).resolves.toMatchObject({ deny: expect.stringMatching(/blocked by Human Body Mode/) })
  await expect($.tool.call({ tool: 'Bash', command: "printf bypass > x.java" })).resolves.toMatchObject({ deny: expect.stringMatching(/blocked by Human Body Mode/) })
})

test('permits only the shared physical-input MCP writer', async ($, on) => {
  on('tool.call', () => ({ result: 'ok' }))
  on('fs.exists', () => ({ value: false }))
  on('fs.write', () => ({ value: undefined }))
  await expect($.tool.call({ tool: 'mcp__pair__step', actions: [] })).resolves.toBeDefined()
  await expect($.tool.call({ tool: 'mcp__other__write_file', path: 'x' })).resolves.toMatchObject({ deny: expect.stringMatching(/blocked by Human Body Mode/) })
})
