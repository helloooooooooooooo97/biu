import { test } from 'vitest'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { LATEST_EVENTS_SCHEMA, migrateEvents, openAndMigrateEvents } from './events-migrate.ts'
import { getSchemaVersion, openSqlite } from './sqlite-open.ts'

test('empty events database fast path sets user_version', () => {
  const dir = mkdtempSync(join(tmpdir(), 'events-mig-'))
  const db = openAndMigrateEvents(join(dir, 'events.sqlite'))
  assert.equal(getSchemaVersion(db), LATEST_EVENTS_SCHEMA)
  const names = (
    db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`).all() as Array<{
      name: string
    }>
  ).map((row) => row.name)
  assert.equal(names.includes('events'), true)
  db.close()
})

test('existing events table is stamped v1', () => {
  const dir = mkdtempSync(join(tmpdir(), 'events-old-'))
  const db = openSqlite(join(dir, 'events.sqlite'), { foreignKeys: false })
  db.exec(`CREATE TABLE events (session_id TEXT, seq INTEGER, ts INTEGER, type TEXT, event_json TEXT, PRIMARY KEY (session_id, seq))`)
  assert.equal(getSchemaVersion(db), 0)
  migrateEvents(db)
  assert.equal(getSchemaVersion(db), 1)
  db.close()
})
