import { test } from 'vitest'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseSharePath } from '../packages/core-file-system/src/share-snapshot.ts'

test('share hrefs skip the full workstation boot', () => {
  assert.equal(Boolean(parseSharePath('/share/abc')), true)
  assert.equal(Boolean(parseSharePath('/share/abc/r/1')), true)
  assert.equal(parseSharePath('/database/pages'), null)
  assert.equal(parseSharePath('/'), null)
})

test('share mount uses TipTap PageEditor and downloads a file', () => {
  const mount = readFileSync(resolve(import.meta.dirname, './share-mount.tsx'), 'utf8')
  assert.match(mount, /PageEditor/)
  assert.match(mount, /chrome=\{\{ Content: PageEditor \}\}/)
  const page = readFileSync(resolve(import.meta.dirname, '../packages/core-file-system/src/web/share-page.tsx'), 'utf8')
  assert.match(page, /downloadShareFile/)
  assert.match(page, /fsdb-share-resources/)
  assert.doesNotMatch(page, /clipboard\.writeText/)
  const popover = readFileSync(resolve(import.meta.dirname, '../packages/core-file-system/src/web/share-popover.tsx'), 'utf8')
  assert.match(popover, /mintSharePin/)
  assert.match(popover, /sharePlugins/)
  const detail = readFileSync(resolve(import.meta.dirname, '../packages/core-file-system/src/web/record-detail.tsx'), 'utf8')
  assert.match(detail, /writable=\{Boolean\(spec\.writable\) && !readOnly\}/)
})
