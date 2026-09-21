import { test } from 'vitest'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

test('recycle bin is a registered /trash table with restore and delete actions', () => {
  const page = readFileSync(resolve(import.meta.dirname, './index.tsx'), 'utf8')
  const sidebar = readFileSync(resolve(import.meta.dirname, './data-sidebar.tsx'), 'utf8')
  const host = readFileSync(resolve(import.meta.dirname, '../host/index.ts'), 'utf8')
  const spec = readFileSync(resolve(import.meta.dirname, '../host/trash-collection.ts'), 'utf8')
  const paths = readFileSync(resolve(import.meta.dirname, './database-path.ts'), 'utf8')
  assert.doesNotMatch(sidebar, /sidebar-recycle-bin/)
  assert.doesNotMatch(sidebar, /RECYCLE_BIN_PATH/)
  assert.doesNotMatch(page, /isRecycleBinPath/)
  assert.doesNotMatch(page, /RECYCLE_BIN_PATH/)
  assert.match(host, /trashCollection\(db, gcHooks\)/)
  assert.doesNotMatch(host, /assetGcCollection/)
  assert.match(paths, /TRASH_COLLECTION_PATH = '\/trash'/)
  assert.doesNotMatch(paths, /USER_COLLECTION_ORDER = \[[^\]]*TRASH_COLLECTION_PATH/)
  assert.match(paths, /SYSTEM_COLLECTION_ORDER = \[[^\]]*TRASH_COLLECTION_PATH/)
  assert.match(spec, /path: '\/trash'/)
  assert.match(spec, /id: 'restore'/)
  assert.match(spec, /id: 'delete'/)
  assert.match(spec, /purge: true/)
})
