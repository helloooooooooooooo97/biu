import { getSchemaVersion, isEmptyDatabase, openSqlite, setSchemaVersion } from './sqlite-open.ts'

type DatabaseSync = import('node:sqlite').DatabaseSync

export const LATEST_EVENTS_SCHEMA = 1

const CREATE_EVENTS_SQL = `
CREATE TABLE IF NOT EXISTS events (
  session_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  ts INTEGER NOT NULL,
  type TEXT NOT NULL,
  event_json TEXT NOT NULL,
  PRIMARY KEY (session_id, seq)
);
CREATE INDEX IF NOT EXISTS events_session_seq ON events(session_id, seq);
`

export function migrateEvents(db: DatabaseSync, opts?: { schema?: string; target?: number }) {
  const schema = opts?.schema
  const target = opts?.target ?? LATEST_EVENTS_SCHEMA
  const from = getSchemaVersion(db, schema)
  if (from > target) throw new Error(`events schema v${from} 比代码 v${target} 新，请升级程序`)
  if (from === target) return
  if (!schema && isEmptyDatabase(db) && from === 0) {
    db.exec(CREATE_EVENTS_SQL)
    setSchemaVersion(db, target)
    return
  }
  const prefix = schema ? `${schema}.` : ''
  if (from < 1) {
    db.exec(`CREATE TABLE IF NOT EXISTS ${prefix}events (
      session_id TEXT NOT NULL,
      seq INTEGER NOT NULL,
      ts INTEGER NOT NULL,
      type TEXT NOT NULL,
      event_json TEXT NOT NULL,
      PRIMARY KEY (session_id, seq)
    )`)
    setSchemaVersion(db, 1, schema)
  }
}

export function openAndMigrateEvents(path: string) {
  const db = openSqlite(path, { foreignKeys: false, checkpointOnOpen: true })
  migrateEvents(db)
  return db
}
