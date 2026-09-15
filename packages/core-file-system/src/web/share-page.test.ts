import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test } from 'vitest'
import assert from 'node:assert/strict'

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
