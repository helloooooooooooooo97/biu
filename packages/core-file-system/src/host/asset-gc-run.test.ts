/** @vitest-environment node */
import { test } from 'vitest'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { assetNoticeBody } from './asset-gc-run.ts'

test('asset notice body lists each file and renders images', () => {
  const db = new DatabaseSync(':memory:')
  db.exec(`CREATE TABLE attachments (name TEXT PRIMARY KEY, mime TEXT NOT NULL)`)
  db.prepare('INSERT INTO attachments (name, mime) VALUES (?, ?)').run('cover.png', 'image/png')
  const body = assetNoticeBody(db, ['cover.png', 'notes.pdf'], '这些文件没人用了。')
  assert.match(body, /^这些文件没人用了。/)
  assert.match(body, /!\[cover\.png\]\(\/api\/db\/file\/cover\.png\)/)
  assert.match(body, /\[notes\.pdf\]\(\/api\/db\/file\/notes\.pdf\)/)
  db.close()
})
