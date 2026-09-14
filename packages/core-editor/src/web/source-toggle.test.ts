import { test } from 'vitest'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

test('page title row hosts the share button', () => {
  const src = readFileSync(resolve(import.meta.dirname, './source-toggle.tsx'), 'utf8')
  assert.match(src, /PagesDetailTools/)
  assert.match(src, /page-share-lock/)
  const web = readFileSync(resolve(import.meta.dirname, './index.ts'), 'utf8')
  assert.match(web, /DetailHeader: PageShareHeader/)
  const share = readFileSync(resolve(import.meta.dirname, './page-share.tsx'), 'utf8')
  assert.match(share, /PageShareHeader/)
  assert.match(share, /page-share-pop/)
  const detail = readFileSync(resolve(import.meta.dirname, '../../../core-file-system/src/web/record-detail.tsx'), 'utf8')
  assert.match(detail, /DetailHeader/)
  assert.match(detail, /fsdb-detail-header/)
})
