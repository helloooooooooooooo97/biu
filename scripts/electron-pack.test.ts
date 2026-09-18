import { test } from 'vitest'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')

test('desktop pack publishes dmg/exe via GitHub Release and ad-hoc macOS signing', async () => {
  const pkg = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'))
  assert.equal(pkg.main, 'electron/out/main.js')
  assert.equal(pkg.scripts['electron:pack'], 'npm run build && node scripts/electron-pack.mjs')
  assert.match(pkg.repository.url, /github\.com\/helloooooooooooooo97\/biu/)

  const yml = await readFile(resolve(root, 'electron-builder.yml'), 'utf8')
  const source = await readFile(resolve(root, 'scripts/electron-pack.mjs'), 'utf8')
  assert.match(yml, /app: pack-app/)
  assert.match(yml, /asar: false/)
  assert.match(source, /stagePackApp/)
  assert.match(yml, /identity: '-'/)
  assert.match(yml, /notarize: false/)
  assert.match(yml, /target: dmg/)
  assert.match(yml, /target: nsis/)
  assert.match(yml, /from: pack-host/)
  assert.match(yml, /from: pack-host\/node_modules/)
  assert.match(yml, /to: biu\/node_modules/)
  assert.doesNotMatch(yml.split('extraResources:')[1] ?? '', /^\s*- package\.json\s*$/m)
  assert.match(source, /stagePackHost/)
  assert.match(yml, /beforeBuild: scripts\/electron-builder-before-build\.cjs/)
  assert.match(yml, /provider: github/)

  const wf = await readFile(resolve(root, '.github/workflows/desktop-release.yml'), 'utf8')
  assert.match(wf, /tags:\s*\n\s+- 'v\*'/)
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

  const host = await readFile(resolve(root, 'host/index.ts'), 'utf8')
  assert.match(host, /BIU_HOME/)

  const docs = await readFile(resolve(root, 'docs/desktop-install.md'), 'utf8')
  assert.match(docs, /xattr -dr com.apple.quarantine \/Applications\/Biu.app/)
  assert.match(docs, /ad-hoc/)
})
