import { test } from 'vitest'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

test('recycle bin is a view over the same records, not a registered collection', () => {
  const page = readFileSync(resolve(import.meta.dirname, './index.tsx'), 'utf8')
  const sidebar = readFileSync(resolve(import.meta.dirname, './data-sidebar.tsx'), 'utf8')
  const host = readFileSync(resolve(import.meta.dirname, '../host/index.ts'), 'utf8')
  const bin = readFileSync(resolve(import.meta.dirname, './recycle-bin.tsx'), 'utf8')
  assert.match(sidebar, /sidebar-recycle-bin/)
  assert.match(sidebar, /RECYCLE_BIN_PATH/)
  assert.match(page, /isRecycleBinPath/)
  assert.match(bin, /\/api\/db\/restore/)
  assert.match(bin, /purge: true/)
  assert.doesNotMatch(host, /path: '\/trash'/)
  assert.doesNotMatch(host, /id: 'trash'/)
  assert.match(host, /markDeleted/)
  assert.match(host, /restoreDeleted/)
})
