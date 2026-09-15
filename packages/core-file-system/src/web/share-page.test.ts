import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test } from 'vitest'
import assert from 'node:assert/strict'

test('share page uses tight side padding on small screens', () => {
  const css = readFileSync(resolve(import.meta.dirname, './fsdb-style.ts'), 'utf8')
  const src = readFileSync(resolve(import.meta.dirname, './share-page.tsx'), 'utf8')
  assert.match(src, /fsdb-share-list/)
  assert.match(css, /@media \(max-width:720px\)\{/)
  assert.match(css, /\.fsdb-share-page \.fsdb-detail-main > :not\(\.fsdb-page-banner\)\{padding-left:16px;padding-right:16px\}/)
  assert.match(css, /\.fsdb-share-list\{padding:16px\}/)
})

test('share header crumbs use collectionLabel not the path id', () => {
  const src = readFileSync(resolve(import.meta.dirname, './share-page.tsx'), 'utf8')
  assert.match(src, /snapshot\.collectionLabel/)
  assert.doesNotMatch(src, /snapshot\.collection\.replace/)
})

test('share header has no 只读 badge', () => {
  const src = readFileSync(resolve(import.meta.dirname, './share-page.tsx'), 'utf8')
  assert.doesNotMatch(src, /只读/)
  assert.doesNotMatch(src, /fsdb-share-badge/)
  assert.match(src, /chromeFor\?\.\(snapshot\.collection\)/)
})

test('share header has a theme toggle that writes biu.theme', () => {
  const src = readFileSync(resolve(import.meta.dirname, './share-page.tsx'), 'utf8')
  assert.match(src, /data-testid="fsdb-share-theme"/)
  assert.match(src, /SHARE_THEME_KEY = 'biu.theme'/)
  assert.match(src, /MoonIcon/)
  assert.match(src, /SunIcon/)
  assert.match(src, /夜间模式/)
  assert.match(src, /日间模式/)
  assert.match(src, /ShareOwnerCorner/)
})

test('share corner uses the owner photo when set, else the brand icon', () => {
  const src = readFileSync(resolve(import.meta.dirname, './share-owner-corner.tsx'), 'utf8')
  const css = readFileSync(resolve(import.meta.dirname, './fsdb-style.ts'), 'utf8')
  assert.match(src, /owner\?\.avatar/)
  assert.match(src, /fsdb-share-owner-face/)
  assert.match(src, /BrandMascot/)
  assert.match(src, /data-testid="fsdb-share-owner-toggle"/)
  assert.match(src, /data-dock-tip/)
  assert.match(src, /data-share-owner-extras/)
  assert.match(src, /registerShareOwnerExtra/)
  assert.match(css, /\.fsdb-share-owner-face\{/)
})
