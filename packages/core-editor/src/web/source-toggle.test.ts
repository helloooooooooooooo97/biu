import { test } from 'vitest'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

test('page more menu and editor chrome both expose share', () => {
  const src = readFileSync(resolve(import.meta.dirname, './source-toggle.tsx'), 'utf8')
  assert.match(src, /PagesDetailTools/)
  assert.match(src, /page-share-lock/)
  assert.match(src, /分享只读/)
  const web = readFileSync(resolve(import.meta.dirname, './index.ts'), 'utf8')
  assert.match(web, /PagesDetailTools/)
  const editor = readFileSync(resolve(import.meta.dirname, './page-editor.tsx'), 'utf8')
  assert.match(editor, /PageShareButton/)
  const share = readFileSync(resolve(import.meta.dirname, './page-share.tsx'), 'utf8')
  assert.match(share, /page-share-pop/)
  assert.match(share, /只能进这一页/)
  assert.match(share, /停止分享/)
})
