import { existsSync, rmSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import { openSqlite, quoteSqlitePath } from './sqlite-open.ts'
import { migrateEvents } from './events-migrate.ts'

const DATA_DIR_NAME = '.biu'

export const BIU_SQLITE = `${DATA_DIR_NAME}/biu.sqlite`
export const EVENTS_SQLITE = `${DATA_DIR_NAME}/events.sqlite`
export const LEGACY_PAGE_SQLITE = `${DATA_DIR_NAME}/pages.sqlite`
export const LEGACY_TASKS_SQLITE = `${DATA_DIR_NAME}/tasks.sqlite`
export const LEGACY_SESSIONS_SQLITE = `${DATA_DIR_NAME}/sessions.sqlite`
export const LEGACY_FILE_SYSTEM_SQLITE = `${DATA_DIR_NAME}/file-system.sqlite`

type DatabaseSync = import('node:sqlite').DatabaseSync

function checkpoint(path: string) {
  if (!existsSync(path)) return
  try {
    const db = openSqlite(path, { foreignKeys: false })
    db.exec('PRAGMA wal_checkpoint(TRUNCATE)')
    db.close()
  } catch {
    /* not a sqlite file */
  }
}

function dropSqliteFiles(path: string) {
  for (const extra of ['', '-wal', '-shm']) {
    try {
      rmSync(path + extra, { force: true })
    } catch {
      /* ignore */
    }
  }
}

function copyTables(dest: DatabaseSync, srcFile: string, destFile: string, opts: { skip?: string[]; only?: string[] } = {}) {
  if (!existsSync(srcFile)) return false
  if (resolve(srcFile) === resolve(destFile)) return false
  checkpoint(srcFile)
  try {
    dest.exec(`ATTACH DATABASE ${quoteSqlitePath(srcFile)} AS legacy`)
  } catch {
    return false
  }
  try {
    const tables = dest.prepare(
      `SELECT name, sql FROM legacy.sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`,
    ).all() as Array<{ name: string; sql: string | null }>
    for (const table of tables) {
      if (opts.only && !opts.only.includes(table.name)) continue
      if (opts.skip?.includes(table.name)) continue
      if (table.sql) {
        let create = table.sql.replace(/^\s*CREATE TABLE/i, 'CREATE TABLE IF NOT EXISTS')
        if (opts.only?.includes(table.name)) {
          create = create.replace(/\s+REFERENCES\s+\w+\s*\([^)]*\)(?:\s+ON DELETE CASCADE)?/gi, '')
        }
        dest.exec(create)
      }
      try {
        dest.exec(`INSERT OR IGNORE INTO "${table.name}" SELECT * FROM legacy."${table.name}"`)
      } catch {
        /* schema mismatch; leave source file */
      }
    }
    const indexes = dest.prepare(
      `SELECT sql FROM legacy.sqlite_master WHERE type = 'index' AND sql IS NOT NULL`,
    ).all() as Array<{ sql: string }>
    for (const index of indexes) {
      try {
        dest.exec(
          index.sql
            .replace(/^\s*CREATE UNIQUE INDEX/i, 'CREATE UNIQUE INDEX IF NOT EXISTS')
            .replace(/^\s*CREATE INDEX/i, 'CREATE INDEX IF NOT EXISTS'),
        )
      } catch {
        /* already exists or skip-list table */
      }
    }
    return true
  } finally {
    dest.exec('DETACH DATABASE legacy')
  }
}

/** Merge leftover per-module sqlite files into biu.sqlite + events.sqlite. */
export function adoptTwoSqlite(dataDirPath: string) {
  const biu = join(dataDirPath, basename(BIU_SQLITE))
  const events = join(dataDirPath, basename(EVENTS_SQLITE))
  const pages = join(dataDirPath, basename(LEGACY_PAGE_SQLITE))
  const tasks = join(dataDirPath, basename(LEGACY_TASKS_SQLITE))
  const sessions = join(dataDirPath, basename(LEGACY_SESSIONS_SQLITE))
  const fileSystem = join(dataDirPath, basename(LEGACY_FILE_SYSTEM_SQLITE))
  if (![pages, tasks, sessions, fileSystem].some((file) => existsSync(file))) return

  const copied: string[] = []
  const biuDb = openSqlite(biu, { foreignKeys: false })
  try {
    for (const file of [pages, tasks, fileSystem]) {
      if (copyTables(biuDb, file, biu)) copied.push(file)
    }
    if (copyTables(biuDb, sessions, biu, { skip: ['events'] })) copied.push(sessions)
    biuDb.exec('PRAGMA wal_checkpoint(TRUNCATE)')
  } finally {
    biuDb.close()
  }

  const eventsDb = openSqlite(events, { foreignKeys: false, checkpointOnOpen: true })
  try {
    migrateEvents(eventsDb)
    if (copyTables(eventsDb, sessions, events, { only: ['events'] })) {
      if (!copied.includes(sessions)) copied.push(sessions)
    }
    eventsDb.exec('PRAGMA wal_checkpoint(TRUNCATE)')
  } finally {
    eventsDb.close()
  }

  for (const file of copied) {
    if (file === biu || file === events) continue
    dropSqliteFiles(file)
  }
}
