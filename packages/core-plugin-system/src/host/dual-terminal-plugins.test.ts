/** @vitest-environment node */
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { describe, it } from 'vitest'
import {
  bundleStoreEntry,
  copyPluginRuntimeDependencies,
  ensureSandboxNpm,
  parseStoreManifest,
} from './plugin-create.ts'

const root = resolve(import.meta.dirname, '../../../..')

function pluginFile(id: string, file: string) {
  return resolve(root, '.plugin-dev', id, file)
}

describe('page terminal store plugin', () => {
  it('declares a headless page block and does not ship a global window terminal', async () => {
    const page = parseStoreManifest(JSON.parse(await readFile(pluginFile('page-terminal', 'manifest.json'), 'utf8')))

    assert.equal(page.id, 'page-terminal')
    assert.equal(page.headless, true)
    assert.equal(page.shell, undefined)
    assert.equal(existsSync(pluginFile('global-terminal', 'manifest.json')), false)
  })

  it('node-pty spawn-helper is executable so posix_spawnp can start a shell', async () => {
    if (process.platform === 'win32') return
    const { chmodSync, existsSync: exists, statSync } = await import('node:fs')
    const sandbox = resolve(root, '.plugin-dev', 'page-terminal')
    ensureSandboxNpm(sandbox)
    const helper = resolve(sandbox, 'node_modules/node-pty/prebuilds', `${process.platform}-${process.arch}`, 'spawn-helper')
    if (!exists(helper)) return
    if ((statSync(helper).mode & 0o111) === 0) chmodSync(helper, 0o755)
    assert.ok(statSync(helper).mode & 0o111, 'spawn-helper must be executable')
    const { createRequire } = await import('node:module')
    const pty = createRequire(resolve(sandbox, 'package.json'))('node-pty') as any
    const child = pty.spawn('/bin/sh', ['-c', 'echo pty-ok'], {
      name: 'xterm',
      cols: 80,
      rows: 24,
      cwd: root,
      env: process.env,
    })
    let buf = ''
    child.onData((chunk) => {
      buf += chunk
    })
    const deadline = Date.now() + 2000
    while (Date.now() < deadline && !buf.includes('pty-ok')) {
      await new Promise((resolve) => setTimeout(resolve, 30))
    }
    child.kill()
    assert.match(buf, /pty-ok/)
  })

  it('bundles host and web entries as a standalone store plugin', async () => {
    const host = await bundleStoreEntry(pluginFile('page-terminal', 'host.ts'), 'host')
    const web = await bundleStoreEntry(pluginFile('page-terminal', 'web.tsx'), 'web')

    assert.match(host, /\/ws\/page-terminal/)
    assert.match(host, /node-pty/)
    assert.match(web, /\/ws\/page-terminal/)
    assert.match(web, /type:"resize"/)
    assert.match(web, /FitAddon|addon-fit/)
    assert.doesNotMatch(web, /from"@biu\//)
  })

  it('installs xterm from the plugin package.json instead of the host', async () => {
    const src = await readFile(resolve(import.meta.dirname, './plugin-create.ts'), 'utf8')
    const pagePkg = JSON.parse(await readFile(pluginFile('page-terminal', 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>
    }
    assert.match(src, /ensureSandboxNpm/)
    assert.match(src, /shell: process\.platform === 'win32'/)
    assert.doesNotMatch(src, /nodePaths/)
    assert.ok(pagePkg.dependencies?.['@xterm/xterm'])
    assert.ok(pagePkg.dependencies?.['@xterm/addon-fit'])
    assert.ok(pagePkg.dependencies?.['node-pty'])
  })

  it('packs native dependencies inside the plugin and prunes other platforms', async () => {
    const sandbox = resolve(root, '.plugin-dev', 'page-terminal')
    ensureSandboxNpm(sandbox)
    const dest = await mkdtemp(resolve(tmpdir(), 'biu-plugin-pack-'))
    try {
      assert.deepEqual(copyPluginRuntimeDependencies(sandbox, dest), ['node-pty'])
      assert.ok(existsSync(resolve(dest, 'node_modules/node-pty/package.json')))
      const files = await readdir(resolve(dest, 'node_modules'), { recursive: true })
      assert.equal(files.some((file) => file.toLowerCase().endsWith('.pdb')), false)
      const prebuilds = resolve(dest, 'node_modules/node-pty/prebuilds')
      if (existsSync(prebuilds)) {
        const sourcePrebuild = resolve(sandbox, 'node_modules/node-pty/prebuilds', `${process.platform}-${process.arch}`)
        assert.deepEqual(await readdir(prebuilds), existsSync(sourcePrebuild) ? [`${process.platform}-${process.arch}`] : [])
      }
    } finally {
      await rm(dest, { recursive: true, force: true })
    }
  })

  it('documents the complete page block fence', async () => {
    const readme = await readFile(pluginFile('page-terminal', 'README.md'), 'utf8')
    assert.match(readme, /:::pageBlock \{kind=terminal plugin=page-terminal\}/)
    assert.match(readme, /"height"/)
  })

  it('page terminal keeps the helper textarea focusable and paints a custom scrollbar', async () => {
    const web = await readFile(pluginFile('page-terminal', 'web.tsx'), 'utf8')
    assert.match(web, /HELPER_TEXTAREA/)
    assert.match(web, /removeProperty\('display'\)/)
    assert.match(web, /setProperty\('opacity', '0'/)
    assert.match(web, /decodePtyChunk/)
    assert.match(web, /binaryType = 'arraybuffer'/)
    assert.doesNotMatch(web, /setProperty\('clip-path'/)
    assert.match(web, /pt-xterm-style-v5/)
    assert.match(web, /function attachScrollRail/)
    assert.match(web, /\.pt-scroll-rail/)
    assert.match(web, /term\.scrollToLine/)
    assert.doesNotMatch(web, /term\.clear\(\)/)
    assert.match(web, /function fitToVisibleBox/)
    assert.match(web, /getBoundingClientRect/)
    assert.match(web, /term\.scrollToBottom/)
    assert.match(web, /new IntersectionObserver\(scheduleFit\)/)
    assert.match(web, /Object\.assign\(term\.element\.style/)
    assert.match(web, /contain: 'layout paint'/)
    assert.match(web, /className="pt-mount"/)
    assert.match(web, /padding: '9px 8px 5px 10px'/)
  })

  it('page terminal persists history into block data and keeps sessions alive', async () => {
    const web = await readFile(pluginFile('page-terminal', 'web.tsx'), 'utf8')
    const host = await readFile(pluginFile('page-terminal', 'host.ts'), 'utf8')
    assert.match(web, /update\(\{ history: next \}\)/)
    assert.match(web, /HISTORY_MAX/)
    assert.match(web, /function parseHistory/)
    assert.match(web, /pt-history-out/)
    assert.match(web, /className="pt-card"/)
    assert.match(web, /aria-label="清空"/)
    assert.doesNotMatch(web, />\s*清空\s*</)
    assert.doesNotMatch(web, /className="pt-dots"/)
    assert.doesNotMatch(web, /entry\.out \? \(\s*<pre/)
    assert.match(host, /pool/)
    assert.match(host, /maxSessions/)
    assert.match(host, /session/)
    assert.match(host, /\/bin\/zsh/)
    assert.match(host, /\['-i'\]/)
    assert.doesNotMatch(host, /\['-il'\]/)
  })
})
