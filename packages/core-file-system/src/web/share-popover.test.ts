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
  const host = readFileSync(resolve(import.meta.dirname, '../host/index.ts'), 'utf8')
  assert.match(src, /quiet: true/)
  assert.match(src, /flagsOnly: true/)
  const sharesPost = host.slice(host.indexOf("POST', '/api/db/shares'"), host.indexOf("GET', '/api/share/:token'"))
  assert.doesNotMatch(sharesPost, /database\/change/)
})

test('share panel uses a compact settings section and custom toggles', () => {
  const src = readFileSync(resolve(import.meta.dirname, './share-popover.tsx'), 'utf8')
  const css = readFileSync(resolve(import.meta.dirname, './fsdb-style.ts'), 'utf8')
  assert.match(src, /公开链接设置/)
  assert.match(src, /fsdb-share-toggle/)
  assert.match(css, /\.fsdb-share-panel\{[^}]*width:min\(380px/)
  assert.match(css, /\.fsdb-share-panel\.is-embedded\{position:static\}/)
  assert.match(css, /\.fsdb-share-toggle\.is-on/)
  assert.match(css, /\.fsdb-share-link-row/)
  assert.match(css, /\.fsdb-share-invite-row\{[^}]*grid-template-columns:minmax\(0,1fr\) 78px 52px/)
})

test('private records can grant access to a dynamic member view', () => {
  const src = readFileSync(resolve(import.meta.dirname, './share-popover.tsx'), 'utf8')
  assert.match(src, /memberViewId/)
  assert.match(src, /data-testid="fsdb-share-member-view"/)
  assert.match(src, /按成员视图批量授权/)
})

test('share panel no longer offers member-group grants', () => {
  const src = readFileSync(resolve(import.meta.dirname, './share-popover.tsx'), 'utf8')
  assert.doesNotMatch(src, /availableGroups|groupId|添加成员组/)
  assert.doesNotMatch(src, /\/groups`\)/)
})

test('share panel separates public sharing from internal and external collaboration', () => {
  const src = readFileSync(resolve(import.meta.dirname, './share-popover.tsx'), 'utf8')
  const accountHost = readFileSync(resolve(import.meta.dirname, '../../../host-account/src/host/index.ts'), 'utf8')
  const databaseHost = readFileSync(resolve(import.meta.dirname, '../host/index.ts'), 'utf8')
  assert.match(src, /公开分享/)
  assert.match(src, /邀请协作/)
  assert.match(src, /内部协作者/)
  assert.match(src, /外部协作者/)
  assert.match(src, /collaboratorKind/)
  assert.match(src, /method: 'DELETE'/)
  assert.match(accountHost, /DELETE', '\/api\/account\/access'/)
  assert.match(databaseHost, /externallySharedRecords/)
  assert.match(databaseHost, /collab:/)
})
