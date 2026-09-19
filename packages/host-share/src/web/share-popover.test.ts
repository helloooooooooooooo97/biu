import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test } from 'vitest'
import assert from 'node:assert/strict'

test('share panel copies link and password together, without a separate pin copy', () => {
  const src = readFileSync(resolve(import.meta.dirname, './share-popover.tsx'), 'utf8')
  assert.match(src, /shareClipboardText/)
  assert.match(src, /生成并复制链接/)
  assert.match(src, /复制时会同时包含链接和密码/)
  assert.match(src, /换一组后即可连同链接一起复制/)
  assert.match(src, /role="switch"/)
  assert.doesNotMatch(src, /copyText\(pin/)
  assert.doesNotMatch(src, /setCopied\('pin'\)/)
  assert.doesNotMatch(src, /复制链接和密码/)
})

test('share setting patches stay quiet and do not emit a database reload', () => {
  const src = readFileSync(resolve(import.meta.dirname, './share-popover.tsx'), 'utf8')
  const host = readFileSync(resolve(import.meta.dirname, '../../../core-file-system/src/host/index.ts'), 'utf8')
  assert.match(src, /quiet: true/)
  assert.match(src, /flagsOnly: true/)
  const sharesPost = host.slice(host.indexOf("POST', '/api/db/shares'"), host.indexOf("GET', '/api/share/:token'"))
  assert.doesNotMatch(sharesPost, /database\/change/)
})

test('share panel uses a settings section and custom toggles', () => {
  const src = readFileSync(resolve(import.meta.dirname, './share-popover.tsx'), 'utf8')
  const css = readFileSync(resolve(import.meta.dirname, '../../../core-file-system/src/web/fsdb-style.ts'), 'utf8')
  assert.match(src, /链接设置/)
  assert.match(src, /fsdb-share-toggle/)
  assert.match(css, /\.fsdb-share-panel\{[^}]*width:min\(420px/)
  assert.match(css, /\.fsdb-share-toggle\.is-on/)
  assert.match(css, /\.fsdb-share-link-row/)
})
