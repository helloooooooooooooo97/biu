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
})
