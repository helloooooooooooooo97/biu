import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test } from 'vitest'
import assert from 'node:assert/strict'

test('production boot prints a BIU mark and clickable Local URL', () => {
  const src = readFileSync(resolve(import.meta.dirname, './index.ts'), 'utf8')
  assert.match(src, /printReadyBanner/)
  assert.match(src, /SHARE_PROXY_UI/)
})
