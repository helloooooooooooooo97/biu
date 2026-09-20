import { test } from 'vitest'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ensureBiuAssetSchema } from './biu-schema.ts'
import { SQLITE_BUSY_TIMEOUT_MS, openSqlite } from './sqlite-open.ts'

test('openSqlite sets WAL and busy_timeout', () => {
  const dir = mkdtempSync(join(tmpdir(), 'biu-sqlite-open-'))
  const db = openSqlite(join(dir, 'biu.sqlite'))
  const journal = db.prepare('PRAGMA journal_mode').get() as { journal_mode?: string }
  const timeout = db.prepare('PRAGMA busy_timeout').get() as { timeout?: number; busy_timeout?: number }
  const auto = db.prepare('PRAGMA wal_autocheckpoint').get() as { wal_autocheckpoint?: number }
  db.close()
  assert.equal(String(journal.journal_mode ?? '').toLowerCase(), 'wal')
  assert.equal(Number(timeout.timeout ?? timeout.busy_timeout), SQLITE_BUSY_TIMEOUT_MS)
  assert.equal(Number(auto.wal_autocheckpoint), 256)
})

test('ensureBiuAssetSchema creates attachments and banner tables once', () => {
  const dir = mkdtempSync(join(tmpdir(), 'biu-schema-'))
  const db = openSqlite(join(dir, 'biu.sqlite'))
  ensureBiuAssetSchema(db)
  ensureBiuAssetSchema(db)
  const names = (
    db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`).all() as Array<{ name: string }>
  ).map((row) => row.name)
  db.close()
  assert.deepEqual(
    names.filter((name) =>
      ['attachments', 'banner_gallery', 'block_refs', 'content_refs', 'record_banners'].includes(name),
    ),
    ['attachments', 'banner_gallery', 'block_refs', 'content_refs', 'record_banners'],
  )
})
