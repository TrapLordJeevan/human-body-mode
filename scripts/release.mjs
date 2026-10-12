// Build distributable files locally. Publication is an explicit gh command, never Marketplace automation.
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const run = (command, args) => execFileSync(command, args, { cwd: root, stdio: 'inherit' })
const dirty = execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim()
if (dirty) throw new Error('Commit the release source first so the archive matches the build.')
run('npm', ['run', 'verify:core'])
const version = JSON.parse(fs.readFileSync(path.join(root, 'packages/vscode/package.json'), 'utf8')).version
const dir = path.join(root, '.human-body-mode/artifacts')
fs.mkdirSync(dir, { recursive: true })
const vsix = `human-body-mode-${version}.vsix`
fs.copyFileSync(path.join(root, vsix), path.join(dir, vsix))
run('git', ['archive', '--format=tar.gz', '--prefix=human-body-mode/', '-o', path.join(dir, `human-body-mode-${version}-source.tar.gz`), 'HEAD'])
console.log(`Artifacts: ${dir}. No remote was changed. Upload these with gh release create after pushing the reviewed commit.`)
