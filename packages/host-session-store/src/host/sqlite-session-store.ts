import { mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import { createRequire } from 'node:module'
import {
  SESSION_FORMAT_VERSION,
  type SessionEvent,
  type SessionMascot,
  type SessionProject,
  type SessionRecord,
  type SessionStore,
  type SessionSummary,
  type SessionConfig,
  nameFromSessionMascot,
  normalizeSessionConfig,
  sessionDisplayTitle,
} from '@biu/type-session'
import { isSessionMascot, parseSessionMascot } from '@biu/host-sessions/mascot'

type DatabaseSync = import('node:sqlite').DatabaseSync

const require = createRequire(import.meta.url)

type SessionRow = {
  id: string
  version: number
  project_json: string | null
  mascot_json: string | null
  config_json: string | null
  event_count: number
  title: string
  updated_at: number
  first_event_at?: number
}

function tableColumns(db: DatabaseSync, table: string) {
  return (db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map((row) => row.name)
}

function parseProject(raw: string | null): SessionProject | undefined {
  if (!raw) return undefined
  try {
    return JSON.parse(raw) as SessionProject
  } catch {
    return undefined
  }
}

function parseMascot(raw: string | null): SessionMascot | undefined {
  const parsed = parseSessionMascot(raw)
  return parsed && isSessionMascot(parsed) ? parsed : undefined
}

function parseConfig(raw: string | null): SessionConfig | undefined {
  if (!raw) return undefined
  try {
    return normalizeSessionConfig(JSON.parse(raw))
  } catch {
    return undefined
  }
}

/** SQLite session store：事件分行增量写入，避免整包 JSON 反复落盘。 */
export class SqliteSessionStore implements SessionStore {
  private db!: DatabaseSync

  constructor(private path: string) {}

  /** 懒打开，便于 apply() 里先 mkdir 再 init。 */
  open() {
    const { DatabaseSync } = require('node:sqlite') as typeof import('node:sqlite')
    this.db = new DatabaseSync(this.path)
    this.db.exec('PRAGMA journal_mode = WAL')
    this.db.exec('PRAGMA synchronous = NORMAL')
    this.db.exec('PRAGMA foreign_keys = ON')
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        version INTEGER NOT NULL,
        project_json TEXT,
        event_count INTEGER NOT NULL DEFAULT 0,
        title TEXT NOT NULL DEFAULT '',
        updated_at INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS events (
        session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
        seq INTEGER NOT NULL,
        ts INTEGER NOT NULL,
        type TEXT NOT NULL,
        event_json TEXT NOT NULL,
        PRIMARY KEY (session_id, seq)
      );
      CREATE INDEX IF NOT EXISTS events_session_seq ON events(session_id, seq);
    `)
    try {
      this.db.exec('ALTER TABLE sessions ADD COLUMN mascot_json TEXT')
    } catch {
      /* column already exists */
    }
    try {
      this.db.exec('ALTER TABLE sessions ADD COLUMN config_json TEXT')
    } catch {
      /* column already exists */
    }
    if (tableColumns(this.db, 'sessions').includes('type')) {
      try {
        this.db.exec('ALTER TABLE sessions DROP COLUMN type')
      } catch {
        /* older sqlite without DROP COLUMN */
      }
    }
    return this
  }

  async load(id: string): Promise<SessionRecord | undefined> {
    const row = this.db
      .prepare('SELECT id, version, project_json, mascot_json, config_json FROM sessions WHERE id = ?')
      .get(id) as Pick<SessionRow, 'id' | 'version' | 'project_json' | 'mascot_json' | 'config_json'> | undefined
    if (!row) return undefined
    if (row.version !== SESSION_FORMAT_VERSION) {
      throw new Error(`unsupported session version ${row.version}`)
    }
    const eventRows = this.db
      .prepare('SELECT event_json FROM events WHERE session_id = ? ORDER BY seq ASC')
      .all(id) as Array<{ event_json: string }>
    const events = eventRows.map((item) => JSON.parse(item.event_json) as SessionEvent)
    const project = parseProject(row.project_json)
    const mascot = parseMascot(row.mascot_json)
    const config = parseConfig(row.config_json)
    return {
      id: row.id,
      version: row.version,
      events,
      ...(project ? { project } : {}),
      ...(mascot ? { mascot } : {}),
      ...(config ? { config } : {}),
    }
  }

  async save(record: SessionRecord): Promise<void> {
    if (record.version !== SESSION_FORMAT_VERSION) {
      throw new Error(`unsupported session version ${record.version}`)
    }
    const title = sessionDisplayTitle(record)
    const updatedAt = Date.now()
    const projectJson = record.project ? JSON.stringify(record.project) : null
    const mascotJson = record.mascot ? JSON.stringify(record.mascot) : null
    const configJson = record.config ? JSON.stringify(record.config) : null
    const eventCount = record.events.length

    const insertEvent = this.db.prepare(
      'INSERT INTO events (session_id, seq, ts, type, event_json) VALUES (?, ?, ?, ?, ?)',
    )
    const upsertSession = this.db.prepare(`
      INSERT INTO sessions (id, version, project_json, mascot_json, config_json, event_count, title, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        version = excluded.version,
        project_json = excluded.project_json,
        mascot_json = excluded.mascot_json,
        config_json = excluded.config_json,
        event_count = excluded.event_count,
        title = excluded.title,
        updated_at = excluded.updated_at
    `)

    const existing = this.db.prepare('SELECT event_count FROM sessions WHERE id = ?').get(record.id) as
      | { event_count: number }
      | undefined
    const storedCount = existing?.event_count ?? 0

    const replaceAll = () => {
      this.db.prepare('DELETE FROM events WHERE session_id = ?').run(record.id)
      for (const event of record.events) {
        insertEvent.run(record.id, event.seq, event.ts, event.type, JSON.stringify(event))
      }
    }

    const appendTail = (from: number) => {
      for (let i = from; i < record.events.length; i += 1) {
        const event = record.events[i]!
        insertEvent.run(record.id, event.seq, event.ts, event.type, JSON.stringify(event))
      }
    }

    this.db.exec('BEGIN IMMEDIATE')
    try {
      upsertSession.run(
        record.id,
        record.version,
        projectJson,
        mascotJson,
        configJson,
        eventCount,
        title,
        updatedAt,
      )

      if (storedCount === 0) {
        if (eventCount > 0) replaceAll()
      } else if (eventCount < storedCount) {
        replaceAll()
      } else if (eventCount === storedCount) {
        const last = this.db
          .prepare('SELECT seq FROM events WHERE session_id = ? ORDER BY seq DESC LIMIT 1')
          .get(record.id) as { seq: number } | undefined
        const expected = record.events.at(-1)?.seq
        if (last && expected != null && last.seq !== expected) replaceAll()
      } else {
        const last = this.db
          .prepare('SELECT seq FROM events WHERE session_id = ? ORDER BY seq DESC LIMIT 1')
          .get(record.id) as { seq: number } | undefined
        const prev = record.events[storedCount - 1]
        if (!last || !prev || last.seq !== prev.seq) {
          replaceAll()
        } else {
          appendTail(storedCount)
        }
      }
      this.db.exec('COMMIT')
    } catch (error) {
      try {
        this.db.exec('ROLLBACK')
      } catch {
        /* ignore */
      }
      throw error
    }
  }

  async list(): Promise<string[]> {
    const rows = this.db.prepare('SELECT id FROM sessions ORDER BY updated_at DESC').all() as Array<{ id: string }>
    return rows.map((row) => row.id)
  }

  async listSummaries(): Promise<SessionSummary[]> {
    const rows = this.db
      .prepare(
        'SELECT id, version, project_json, mascot_json, config_json, event_count, title, updated_at, (SELECT MIN(ts) FROM events WHERE session_id = sessions.id) AS first_event_at FROM sessions ORDER BY updated_at DESC',
      )
      .all() as SessionRow[]
    return rows.map((row) => {
      const project = parseProject(row.project_json)
      const mascot = parseMascot(row.mascot_json)
      const config = parseConfig(row.config_json)
      const createdAt = Number(config?.createdAt)
      const stamp =
        Number.isFinite(createdAt) && createdAt > 0
          ? createdAt
          : Number(row.first_event_at) > 0
            ? Number(row.first_event_at)
            : row.updated_at
      return {
        id: row.id,
        version: row.version,
        eventCount: row.event_count,
        title:
          row.title && row.title !== row.id.slice(0, 8)
            ? row.title
            : mascot
              ? nameFromSessionMascot(mascot)
              : row.title || row.id.slice(0, 8),
        updatedAt: row.updated_at,
        ...(project ? { project } : {}),
        ...(mascot ? { mascot } : {}),
        ...(config || stamp ? { config: { ...(config ?? {}), createdAt: stamp } } : {}),
      }
    })
  }

  async delete(id: string): Promise<boolean> {
    const result = this.db.prepare('DELETE FROM sessions WHERE id = ?').run(id)
    return Number(result.changes) > 0
  }

  close() {
    this.db.close()
  }
}

export async function ensureSqliteSessionStore(path: string) {
  await mkdir(dirname(path), { recursive: true })
  return new SqliteSessionStore(path).open()
}
