import { test } from 'vitest'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

test('page more menu can copy a locked share link', () => {
  const src = readFileSync(resolve(import.meta.dirname, './source-toggle.tsx'), 'utf8')
  assert.match(src, /PagesDetailTools/)
  assert.match(src, /page-share-lock/)
  assert.match(src, /分享只读/)
  const web = readFileSync(resolve(import.meta.dirname, './index.ts'), 'utf8')
  assert.match(web, /PagesDetailTools/)
})
