import { test } from 'vitest'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { npmQueryInvocation } from './electron-pack.mjs'

const root = resolve(import.meta.dirname, '..')

test('npm query runs through node instead of npm.cmd on Windows', () => {
  const cli = String.raw`C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js`
  const node = String.raw`C:\Program Files\nodejs\node.exe`
  const invocation = npmQueryInvocation('#cordis', 'win32', { npm_execpath: cli }, node)
  assert.equal(invocation.command, node)
  assert.deepEqual(invocation.args, [cli, 'query', '#cordis', '--json'])
  assert.equal(invocation.shell, false)

  const fallback = npmQueryInvocation('#cordis', 'win32', {}, node)
  assert.equal(fallback.command, 'npm')
  assert.equal(fallback.shell, true)
})

test('desktop pack publishes dmg/exe via GitHub Release and ad-hoc macOS signing', async () => {
  const pkg = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'))
  assert.equal(pkg.main, 'electron/out/main.js')
  assert.equal(pkg.scripts['electron:pack'], 'npm run build && node scripts/electron-pack.mjs')
  assert.match(pkg.repository.url, /github\.com\/helloooooooooooooo97\/biu/)

  const yml = await readFile(resolve(root, 'electron-builder.yml'), 'utf8')
  const source = await readFile(resolve(root, 'scripts/electron-pack.mjs'), 'utf8')
  assert.match(yml, /app: pack-app/)
  assert.match(yml, /asar: true/)
  assert.match(source, /stagePackApp/)
  assert.match(yml, /identity: '-'/)
  assert.match(yml, /notarize: false/)
  assert.match(yml, /target: dmg/)
  assert.match(yml, /target: nsis/)
  assert.match(yml, /from: pack-host/)
  assert.match(yml, /from: pack-host\/node_modules/)
  assert.match(yml, /to: biu\/node_modules/)
  assert.match(yml, /!\*\*\/\*\.d\.ts/)
  assert.match(yml, /!\*\*\/\*\.map/)
  assert.doesNotMatch(yml.split('extraResources:')[1] ?? '', /^\s*- package\.json\s*$/m)
  assert.match(source, /stagePackHost/)
  assert.match(source, /HOST_RUNTIME_PACKAGES/)
  assert.match(source, /npmQueryInvocation\(selector\)/)
  assert.doesNotMatch(source, /copyDir\(join\(root, 'node_modules'/)
  assert.doesNotMatch(source, /cpSync\(join\(root, 'node_modules', '@biu'\)/)
  assert.match(source, /compilePackagedHost/)
  assert.match(source, /target: 'node24'/)
  assert.doesNotMatch(source, /copyDir\(join\(root, 'packages'/)
  assert.match(source, /join\(esbuildDir, 'bin'\)/)
  assert.match(source, /name\.startsWith\('downloaded-'\)/)
  assert.match(yml, /beforeBuild: scripts\/electron-builder-before-build\.cjs/)
  assert.match(yml, /provider: github/)

  const runtime = JSON.parse(await readFile(resolve(root, 'electron/host-runtime/package.json'), 'utf8'))
  assert.deepEqual(Object.keys(runtime.dependencies).sort(), [
    '@modelcontextprotocol/sdk',
    'cordis',
    'esbuild',
    'ws',
    'yaml',
  ])

  const wf = await readFile(resolve(root, '.github/workflows/desktop-release.yml'), 'utf8')
  assert.match(wf, /tags:\s*\n\s+- 'v\*'/)
  assert.match(wf, /actions\/checkout@v7/)
  assert.match(wf, /actions\/setup-node@v7/)
  assert.match(wf, /macos-latest/)
  assert.match(wf, /windows-latest/)
  assert.match(wf, /action-gh-release/)
  assert.match(wf, /ulimit -n 65536/)
  assert.match(wf, /xattr -dr com.apple.quarantine \/Applications\/Biu.app/)

  const main = await readFile(resolve(root, 'electron/main.ts'), 'utf8')
  assert.match(main, /ELECTRON_RUN_AS_NODE/)
  assert.match(main, /resourcesPath/)
  assert.match(main, /function startHost/)
  assert.match(main, /BIU_HOME/)
  assert.match(main, /host', 'index\.mjs/)
  assert.doesNotMatch(main, /node_modules', 'tsx/)

  const host = await readFile(resolve(root, 'host/index.ts'), 'utf8')
  assert.match(host, /BIU_HOME/)

  const docs = await readFile(resolve(root, 'docs/desktop-install.md'), 'utf8')
  assert.match(docs, /xattr -dr com.apple.quarantine \/Applications\/Biu.app/)
  assert.match(docs, /ad-hoc/)
})
