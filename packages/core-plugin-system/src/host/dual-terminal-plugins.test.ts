/** @vitest-environment node */
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, it } from 'vitest'
import { bundleStoreEntry, parseStoreManifest } from './plugin-create.ts'

const root = resolve(import.meta.dirname, '../../../..')

function pluginFile(id: string, file: string) {
  return resolve(root, '.plugin-dev', id, file)
}

describe('terminal store plugins', () => {
  it('declares one headless page block and one resizable window', async () => {
    const page = parseStoreManifest(JSON.parse(await readFile(pluginFile('page-terminal', 'manifest.json'), 'utf8')))
    const global = parseStoreManifest(JSON.parse(await readFile(pluginFile('global-terminal', 'manifest.json'), 'utf8')))

    assert.equal(page.id, 'page-terminal')
    assert.equal(page.headless, true)
    assert.equal(page.shell, undefined)
    assert.equal(global.id, 'global-terminal')
    assert.equal(global.headless, undefined)
    assert.equal(global.shell?.resizable, true)
    assert.ok((global.shell?.width ?? 0) >= 560)
  })

  it('node-pty spawn-helper is executable so posix_spawnp can start a shell', async () => {
    if (process.platform === 'win32') return
    const { chmodSync, existsSync, statSync } = await import('node:fs')
    const helper = resolve(root, 'node_modules/node-pty/prebuilds', `${process.platform}-${process.arch}`, 'spawn-helper')
    if (!existsSync(helper)) return
    if ((statSync(helper).mode & 0o111) === 0) chmodSync(helper, 0o755)
    assert.ok(statSync(helper).mode & 0o111, 'spawn-helper must be executable')
    const pty = await import('node-pty')
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

  it('bundles both host and web entries as standalone store plugins', async () => {
    for (const id of ['page-terminal', 'global-terminal']) {
      const host = await bundleStoreEntry(pluginFile(id, 'host.ts'), 'host')
      const web = await bundleStoreEntry(pluginFile(id, 'web.tsx'), 'web')

      assert.match(host, new RegExp(`/ws/${id}`))
      assert.match(host, /node-pty/)
      if (id === 'global-terminal') {
        assert.match(host, /session/)
        assert.match(host, /socket=null/)
        assert.doesNotMatch(host, /socket\.on\('close', dispose\)/)
      }
      assert.match(web, new RegExp(`/ws/${id}`))
      assert.match(web, /type:"resize"/)
      assert.match(web, /FitAddon|addon-fit/)
      assert.doesNotMatch(web, /from"@biu\//)
    }
  })

  it('installs xterm from the plugin package.json instead of the host', async () => {
    const src = await readFile(resolve(import.meta.dirname, './plugin-create.ts'), 'utf8')
    const pagePkg = JSON.parse(await readFile(pluginFile('page-terminal', 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>
    }
    assert.match(src, /ensureSandboxNpm/)
    assert.doesNotMatch(src, /nodePaths/)
    assert.ok(pagePkg.dependencies?.['@xterm/xterm'])
    assert.ok(pagePkg.dependencies?.['@xterm/addon-fit'])
  })

  it('documents the complete page block fence', async () => {
    const readme = await readFile(pluginFile('page-terminal', 'README.md'), 'utf8')
    assert.match(readme, /:::pageBlock \{kind=terminal plugin=page-terminal\}/)
    assert.match(readme, /"height"/)
  })

  it('page terminal keeps the helper textarea focusable and hides the measurement nodes', async () => {
    for (const id of ['page-terminal', 'global-terminal'] as const) {
      const web = await readFile(pluginFile(id, 'web.tsx'), 'utf8')
      assert.match(web, /HELPER_TEXTAREA/)
      assert.match(web, /removeProperty\('display'\)/)
      assert.match(web, /setProperty\('opacity', '0'/)
      assert.match(web, /decodePtyChunk/)
      assert.match(web, /binaryType = 'arraybuffer'/)
      assert.doesNotMatch(web, /setProperty\('clip-path'/)
    }
  })

  it('page terminal persists history into block data and keeps sessions alive', async () => {
    const web = await readFile(pluginFile('page-terminal', 'web.tsx'), 'utf8')
    const host = await readFile(pluginFile('page-terminal', 'host.ts'), 'utf8')
    // 历史写回块数据的 history 字段
    assert.match(web, /update\(\{ history: next \}\)/)
    assert.match(web, /HISTORY_MAX/)
    assert.match(web, /function parseHistory/)
    assert.match(web, /pt-history-out/)
    assert.match(web, /className="pt-card"/)
    assert.match(web, /aria-label="清空"/)
    assert.doesNotMatch(web, />\s*清空\s*</)
    assert.doesNotMatch(web, /className="pt-dots"/)
    assert.doesNotMatch(web, /entry\.out \? \(\s*<pre/)
    // 后端会话池：按 session key 复用，断开不杀进程
    assert.match(host, /pool/)
    assert.match(host, /maxSessions/)
    assert.match(host, /session/)
    assert.match(host, /\/bin\/zsh/)
    assert.match(host, /\['-i'\]/)
    assert.doesNotMatch(host, /\['-il'\]/)
  })

  it('global terminal persists command history in localStorage with a stable session', async () => {
    const web = await readFile(pluginFile('global-terminal', 'web.tsx'), 'utf8')
    const host = await readFile(pluginFile('global-terminal', 'host.ts'), 'utf8')
    assert.match(web, /HISTORY_MAX/)
    assert.match(web, /biu:plugin:global-terminal:history/)
    assert.match(web, /biu:plugin:global-terminal:sid/)
    assert.match(web, /localStorage/)
    assert.match(web, /pt-history-out/)
    assert.match(web, /function parseHistory/)
    assert.match(web, /aria-label="清空"/)
    assert.doesNotMatch(web, />\s*清空\s*</)
    assert.doesNotMatch(web, /gt-dots/)
    assert.match(host, /session/)
    assert.match(host, /buffer/)
  })
})
