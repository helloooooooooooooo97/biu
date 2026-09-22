/** @vitest-environment node */
import { test } from 'vitest'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { assetNoticeFiles } from './asset-gc-run.ts'

test('asset notice files are cards, not summary text', () => {
  const db = new DatabaseSync(':memory:')
  db.exec(`CREATE TABLE attachments (name TEXT PRIMARY KEY, mime TEXT NOT NULL)`)
  db.prepare('INSERT INTO attachments (name, mime) VALUES (?, ?)').run('cover.png', 'image/png')
  const files = assetNoticeFiles(db, ['cover.png', 'notes.pdf'])
  assert.deepEqual(files, [
    { name: 'cover.png', href: '/api/db/file/cover.png', image: true },
    { name: 'notes.pdf', href: '/api/db/file/notes.pdf', image: false },
  ])
  db.close()
})
