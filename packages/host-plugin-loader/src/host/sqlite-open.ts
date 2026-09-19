import { createRequire } from 'node:module'

type DatabaseSync = import('node:sqlite').DatabaseSync

export const SQLITE_BUSY_TIMEOUT_MS = 5000

export function quoteSqlitePath(path: string) {
  return `'${path.replaceAll("'", "''")}'`
}

export function configureSqlite(db: DatabaseSync, opts?: { foreignKeys?: boolean; schema?: string }) {
  const prefix = opts?.schema ? `${opts.schema}.` : ''
  db.exec(`PRAGMA ${prefix}journal_mode = WAL`)
  db.exec(`PRAGMA ${prefix}synchronous = NORMAL`)
  if (opts?.schema) return
  db.exec(`PRAGMA busy_timeout = ${SQLITE_BUSY_TIMEOUT_MS}`)
  if (opts?.foreignKeys !== false) db.exec('PRAGMA foreign_keys = ON')
}

export function openSqlite(path: string, opts?: { foreignKeys?: boolean }) {
  const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite')
  const db = new DatabaseSync(path)
  configureSqlite(db, opts)
  return db
}
