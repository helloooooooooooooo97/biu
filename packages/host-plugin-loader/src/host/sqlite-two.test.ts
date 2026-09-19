import { test } from 'vitest'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync } from 'node:fs'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { DATA_DIR_NAME } from './data-dir.ts'
import { adoptTwoSqlite } from './sqlite-two.ts'

test('adoptTwoSqlite merges module sqlite files into biu + events', () => {
  const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite')
  const root = mkdtempSync(join(tmpdir(), 'two-sqlite-'))
  const dir = join(root, DATA_DIR_NAME)
  mkdirSync(dir)
  const pages = join(dir, 'pages.sqlite')
  const sessions = join(dir, 'sessions.sqlite')
  const pageDb = new DatabaseSync(pages)
  pageDb.exec('CREATE TABLE pages (id TEXT PRIMARY KEY, title TEXT)')
  pageDb.prepare('INSERT INTO pages VALUES (?, ?)').run('p1', 'Home')
  pageDb.close()
  const sessionDb = new DatabaseSync(sessions)
  sessionDb.exec(`
    CREATE TABLE sessions (id TEXT PRIMARY KEY, title TEXT);
    CREATE TABLE events (session_id TEXT, seq INTEGER, ts INTEGER, type TEXT, event_json TEXT, PRIMARY KEY (session_id, seq));
  `)
  sessionDb.prepare('INSERT INTO sessions VALUES (?, ?)').run('s1', 'chat')
  sessionDb.prepare('INSERT INTO events VALUES (?, ?, ?, ?, ?)').run('s1', 1, 1, 'user', '{}')
  sessionDb.close()

  adoptTwoSqlite(dir)

  assert.equal(existsSync(pages), false)
  assert.equal(existsSync(sessions), false)
  const biu = new DatabaseSync(join(dir, 'biu.sqlite'))
  const page = biu.prepare('SELECT title FROM pages WHERE id = ?').get('p1') as { title: string }
  const session = biu.prepare('SELECT title FROM sessions WHERE id = ?').get('s1') as { title: string }
  biu.close()
  assert.equal(page.title, 'Home')
  assert.equal(session.title, 'chat')
  const events = new DatabaseSync(join(dir, 'events.sqlite'))
  const event = events.prepare('SELECT seq FROM events WHERE session_id = ?').get('s1') as { seq: number }
  events.close()
  assert.equal(event.seq, 1)
})
