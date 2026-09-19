import { mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import { configureSqlite, openAndMigrateBiu, quoteSqlitePath } from '@biu/host-plugin-loader/data-dir'
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
  private sessions!: DatabaseSync
  private splitEvents = false

  constructor(
    private path: string,
    private eventsPath?: string,
  ) {}

  private eventsTable() {
    return this.splitEvents ? 'eventsdb.events' : 'events'
  }

  /** 懒打开，便于 apply() 里先 mkdir 再 init。 */
  open() {
    this.sessions = openAndMigrateBiu(this.path)
    this.sessions.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        version INTEGER NOT NULL,
        project_json TEXT,
        event_count INTEGER NOT NULL DEFAULT 0,
        title TEXT NOT NULL DEFAULT '',
        updated_at INTEGER NOT NULL DEFAULT 0
      );
    `)
    this.splitEvents = Boolean(this.eventsPath && this.eventsPath !== this.path)
    if (this.splitEvents) {
      this.sessions.exec(`ATTACH DATABASE ${quoteSqlitePath(this.eventsPath!)} AS eventsdb`)
      configureSqlite(this.sessions, { schema: 'eventsdb' })
    }
    this.sessions.exec(`
      CREATE TABLE IF NOT EXISTS ${this.eventsTable()} (
        session_id TEXT NOT NULL${this.splitEvents ? '' : ' REFERENCES sessions(id) ON DELETE CASCADE'},
        seq INTEGER NOT NULL,
        ts INTEGER NOT NULL,
        type TEXT NOT NULL,
        event_json TEXT NOT NULL,
        PRIMARY KEY (session_id, seq)
      );
    `)
    this.sessions.exec(
      this.splitEvents
        ? 'CREATE INDEX IF NOT EXISTS eventsdb.events_session_seq ON events(session_id, seq)'
        : 'CREATE INDEX IF NOT EXISTS events_session_seq ON events(session_id, seq)',
    )
    try {
      this.sessions.exec('ALTER TABLE sessions ADD COLUMN mascot_json TEXT')
    } catch {
      /* column already exists */
    }
    try {
      this.sessions.exec('ALTER TABLE sessions ADD COLUMN config_json TEXT')
    } catch {
      /* column already exists */
    }
    if (tableColumns(this.sessions, 'sessions').includes('type')) {
      try {
        this.sessions.exec('ALTER TABLE sessions DROP COLUMN type')
      } catch {
        /* older sqlite without DROP COLUMN */
      }
    }
    return this
  }

  async load(id: string): Promise<SessionRecord | undefined> {
    const row = this.sessions
      .prepare('SELECT id, version, project_json, mascot_json, config_json FROM sessions WHERE id = ?')
      .get(id) as Pick<SessionRow, 'id' | 'version' | 'project_json' | 'mascot_json' | 'config_json'> | undefined
    if (!row) return undefined
    if (row.version !== SESSION_FORMAT_VERSION) {
      throw new Error(`unsupported session version ${row.version}`)
    }
    const eventRows = this.sessions
      .prepare(`SELECT event_json FROM ${this.eventsTable()} WHERE session_id = ? ORDER BY seq ASC`)
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
    const eventsTable = this.eventsTable()

    const insertEvent = this.sessions.prepare(
      `INSERT INTO ${eventsTable} (session_id, seq, ts, type, event_json) VALUES (?, ?, ?, ?, ?)`,
    )
    const upsertSession = this.sessions.prepare(`
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

    const existing = this.sessions.prepare('SELECT event_count FROM sessions WHERE id = ?').get(record.id) as
      | { event_count: number }
      | undefined
    const storedCount = existing?.event_count ?? 0

    const replaceAll = () => {
      this.sessions.prepare(`DELETE FROM ${eventsTable} WHERE session_id = ?`).run(record.id)
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

    this.sessions.exec('BEGIN IMMEDIATE')
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
        const last = this.sessions
          .prepare(`SELECT seq FROM ${eventsTable} WHERE session_id = ? ORDER BY seq DESC LIMIT 1`)
          .get(record.id) as { seq: number } | undefined
        const expected = record.events.at(-1)?.seq
        if (last && expected != null && last.seq !== expected) replaceAll()
      } else {
        const last = this.sessions
          .prepare(`SELECT seq FROM ${eventsTable} WHERE session_id = ? ORDER BY seq DESC LIMIT 1`)
          .get(record.id) as { seq: number } | undefined
        const prev = record.events[storedCount - 1]
        if (!last || !prev || last.seq !== prev.seq) {
          replaceAll()
        } else {
          appendTail(storedCount)
        }
      }
      this.sessions.exec('COMMIT')
    } catch (error) {
      try {
        this.sessions.exec('ROLLBACK')
      } catch {
        /* ignore */
      }
      throw error
    }
  }

  async list(): Promise<string[]> {
    const rows = this.sessions.prepare('SELECT id FROM sessions ORDER BY updated_at DESC').all() as Array<{ id: string }>
    return rows.map((row) => row.id)
  }

  async listSummaries(): Promise<SessionSummary[]> {
    const rows = this.sessions
      .prepare(
        'SELECT id, version, project_json, mascot_json, config_json, event_count, title, updated_at FROM sessions ORDER BY updated_at DESC',
      )
      .all() as SessionRow[]
    const firstBySession = new Map<string, number>()
    const mins = this.sessions
      .prepare(`SELECT session_id, MIN(ts) AS first_event_at FROM ${this.eventsTable()} GROUP BY session_id`)
      .all() as Array<{ session_id: string; first_event_at: number }>
    for (const row of mins) firstBySession.set(row.session_id, Number(row.first_event_at) || 0)
    return rows.map((row) => {
      const project = parseProject(row.project_json)
      const mascot = parseMascot(row.mascot_json)
      const config = parseConfig(row.config_json)
      const createdAt = Number(config?.createdAt)
      const firstEventAt = firstBySession.get(row.id) ?? 0
      const stamp =
        Number.isFinite(createdAt) && createdAt > 0
          ? createdAt
          : firstEventAt > 0
            ? firstEventAt
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
    this.sessions.exec('BEGIN IMMEDIATE')
    try {
      this.sessions.prepare(`DELETE FROM ${this.eventsTable()} WHERE session_id = ?`).run(id)
      const result = this.sessions.prepare('DELETE FROM sessions WHERE id = ?').run(id)
      this.sessions.exec('COMMIT')
      return Number(result.changes) > 0
    } catch (error) {
      try {
        this.sessions.exec('ROLLBACK')
      } catch {
        /* ignore */
      }
      throw error
    }
  }

  close() {
    if (this.splitEvents) {
      try {
        this.sessions.exec('DETACH DATABASE eventsdb')
      } catch {
        /* already closed */
      }
    }
    this.sessions.close()
  }
}

export async function ensureSqliteSessionStore(path: string, eventsPath?: string) {
  await mkdir(dirname(path), { recursive: true })
  if (eventsPath) await mkdir(dirname(eventsPath), { recursive: true })
  return new SqliteSessionStore(path, eventsPath).open()
}
