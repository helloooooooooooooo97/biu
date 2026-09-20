import { createRequire } from 'node:module'

type DatabaseSync = import('node:sqlite').DatabaseSync

export const SQLITE_BUSY_TIMEOUT_MS = 5000
export const SQLITE_WAL_AUTOCHECKPOINT = 256

export function quoteSqlitePath(path: string) {
  return `'${path.replaceAll("'", "''")}'`
}

export function configureSqlite(db: DatabaseSync, opts?: { foreignKeys?: boolean; schema?: string }) {
  const prefix = opts?.schema ? `${opts.schema}.` : ''
  db.exec(`PRAGMA ${prefix}journal_mode = WAL`)
  db.exec(`PRAGMA ${prefix}synchronous = NORMAL`)
  if (opts?.schema) return
  db.exec(`PRAGMA busy_timeout = ${SQLITE_BUSY_TIMEOUT_MS}`)
  db.exec(`PRAGMA wal_autocheckpoint = ${SQLITE_WAL_AUTOCHECKPOINT}`)
  if (opts?.foreignKeys !== false) db.exec('PRAGMA foreign_keys = ON')
}

export function openSqlite(path: string, opts?: { foreignKeys?: boolean; checkpointOnOpen?: boolean }) {
  const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite')
  const db = new DatabaseSync(path)
  configureSqlite(db, opts)
  if (opts?.checkpointOnOpen) {
    try {
      db.exec('PRAGMA wal_checkpoint(TRUNCATE)')
    } catch {
      /* concurrent writers */
    }
  }
  return db
}

export function getSchemaVersion(db: DatabaseSync, schema?: string) {
  const sql = schema ? `PRAGMA ${schema}.user_version` : 'PRAGMA user_version'
  const row = db.prepare(sql).get() as { user_version?: number } | undefined
  return Number(row?.user_version) || 0
}

export function setSchemaVersion(db: DatabaseSync, version: number, schema?: string) {
  const prefix = schema ? `${schema}.` : ''
  db.exec(`PRAGMA ${prefix}user_version = ${Number(version) || 0}`)
}

export function sqliteVersion(db: DatabaseSync) {
  const row = db.prepare('SELECT sqlite_version() AS v').get() as { v?: string } | undefined
  return String(row?.v ?? '')
}

export function assertSqliteVersion(db: DatabaseSync, min = '3.35.0') {
  const have = sqliteVersion(db).split('.').map((part) => Number(part) || 0)
  const want = min.split('.').map((part) => Number(part) || 0)
  for (let i = 0; i < 3; i += 1) {
    if ((have[i] ?? 0) > (want[i] ?? 0)) return
    if ((have[i] ?? 0) < (want[i] ?? 0)) {
      throw new Error(`需要 SQLite ${min}+，当前 ${sqliteVersion(db)}`)
    }
  }
}

export function isEmptyDatabase(db: DatabaseSync) {
  const row = db
    .prepare(`SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`)
    .get() as { n?: number }
  return Number(row?.n) === 0
}
