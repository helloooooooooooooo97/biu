import { existsSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import {
  assertSqliteVersion,
  getSchemaVersion,
  isEmptyDatabase,
  openSqlite,
  quoteSqlitePath,
  setSchemaVersion,
} from './sqlite-open.ts'
import { CREATE_CORE_SQL, LATEST_BIU_SCHEMA, createLatestSchema, dropLegacyEditorColumns, rebuildPageBlockCollectionKeys, tableColumnNames, tableNames } from './biu-schema.ts'
import { copyLegacyBodies, rebuildContentRefs } from './editor-content.ts'

type DatabaseSync = import('node:sqlite').DatabaseSync

export type Migration = {
  version: number
  module: string
  name: string
  up: (db: DatabaseSync, ctx: MigrateCtx) => void
}

export type MigrateCtx = {
  sqlitePath?: string
  dataDir?: string
  workspace?: string
}

function hasTable(db: DatabaseSync, name: string) {
  return tableNames(db).includes(name)
}

function addColumn(db: DatabaseSync, table: string, name: string, ddl: string) {
  if (!hasTable(db, table)) return
  if (tableColumnNames(db, table).includes(name)) return
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`)
}

function dropColumn(db: DatabaseSync, table: string, name: string) {
  if (!hasTable(db, table)) return
  if (!tableColumnNames(db, table).includes(name)) return
  db.exec(`ALTER TABLE ${table} DROP COLUMN ${name}`)
}

function baseline(db: DatabaseSync) {
  assertSqliteVersion(db)
  db.exec(CREATE_CORE_SQL)
  addColumn(db, 'pages', 'notes', `notes TEXT NOT NULL DEFAULT ''`)
  addColumn(db, 'pages', 'depends_on_json', `depends_on_json TEXT NOT NULL DEFAULT '[]'`)
  addColumn(db, 'pages', 'emoji', `emoji TEXT NOT NULL DEFAULT ''`)
  dropColumn(db, 'pages', 'tags_json')
  dropColumn(db, 'pages', 'facet_json')
  for (const [name, ddl] of [
    ['creator_json', 'creator_json TEXT'],
    ['assignee_json', 'assignee_json TEXT'],
    ['assigned_at', 'assigned_at INTEGER'],
    ['description', `description TEXT NOT NULL DEFAULT ''`],
    ['reports_json', `reports_json TEXT NOT NULL DEFAULT '[]'`],
    ['start_at', 'start_at INTEGER'],
    ['project', `project TEXT NOT NULL DEFAULT ''`],
    ['tags_json', `tags_json TEXT NOT NULL DEFAULT '[]'`],
    ['parent_id', `parent_id TEXT DEFAULT ''`],
    ['depends_on', `depends_on TEXT NOT NULL DEFAULT '[]'`],
    ['depth', 'depth INTEGER NOT NULL DEFAULT 0'],
    ['difficulty', `difficulty TEXT NOT NULL DEFAULT 'med'`],
    ['trigger_json', `trigger_json TEXT NOT NULL DEFAULT '{}'`],
    ['report_interval_sec', 'report_interval_sec INTEGER NOT NULL DEFAULT 60'],
    ['last_report_prompt_at', 'last_report_prompt_at INTEGER'],
    ['report_prompt_count', 'report_prompt_count INTEGER NOT NULL DEFAULT 0'],
    ['facet_json', `facet_json TEXT NOT NULL DEFAULT '{}'`],
    ['emoji', `emoji TEXT NOT NULL DEFAULT ''`],
  ] as Array<[string, string]>) {
    addColumn(db, 'tasks', name, ddl)
  }
  addColumn(db, 'facets', 'notes', `notes TEXT NOT NULL DEFAULT ''`)
  addColumn(db, 'facets', 'created_at', 'created_at INTEGER NOT NULL DEFAULT 0')
  addColumn(db, 'record_meta', 'created_by_json', 'created_by_json TEXT')
  addColumn(db, 'record_meta', 'updated_by_json', 'updated_by_json TEXT')
  addColumn(db, 'attachments', 'storage', `storage TEXT NOT NULL DEFAULT 'hash'`)
  addColumn(db, 'shares', 'share_plugins', 'share_plugins INTEGER NOT NULL DEFAULT 0')
  addColumn(db, 'shares', 'allow_copy', 'allow_copy INTEGER NOT NULL DEFAULT 1')
  addColumn(db, 'page_block_index', 'page_title', `page_title TEXT NOT NULL DEFAULT ''`)
  addColumn(db, 'sessions', 'mascot_json', 'mascot_json TEXT')
  addColumn(db, 'sessions', 'config_json', 'config_json TEXT')
  if (hasTable(db, 'sessions') && tableColumnNames(db, 'sessions').includes('type')) {
    dropColumn(db, 'sessions', 'type')
  }
  if (hasTable(db, 'attachments')) {
    db.exec(`UPDATE attachments SET storage = 'hash' WHERE storage IN ('cas', '')`)
    db.exec(`UPDATE attachments SET storage = 'name' WHERE storage = 'doc'`)
  }
  db.exec('DROP TABLE IF EXISTS task_views')
}

function parseFrontmatterBody(text: string) {
  const normalized = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n')
  if (!normalized.startsWith('---\n')) return normalized
  const end = normalized.indexOf('\n---', 3)
  if (end < 0) return normalized
  return normalized.slice(end + 4).replace(/^[^\n]*\n?/, '').trim()
}

function upsertBodies(db: DatabaseSync, collection: string, rows: Array<{ id: string; body: string }>) {
  const upsert = db.prepare(
    `INSERT INTO editor_content (collection, record_id, body, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(collection, record_id) DO UPDATE SET body = excluded.body, updated_at = excluded.updated_at`,
  )
  const now = Date.now()
  for (const row of rows) upsert.run(collection, row.id, row.body, now)
}

function skillBodies(ctx: MigrateCtx): Array<{ id: string; body: string }> {
  const root = ctx.dataDir ? join(ctx.dataDir, 'skill') : ''
  if (!root || !existsSync(root)) return []
  const out: Array<{ id: string; body: string }> = []
  for (const name of readdirSync(root)) {
    if (!name.endsWith('.md')) continue
    const path = join(root, name)
    if (!statSync(path).isFile()) continue
    out.push({ id: name.slice(0, -3), body: parseFrontmatterBody(readFileSync(path, 'utf8')) })
  }
  return out
}

function pluginReadmes(ctx: MigrateCtx): Array<{ id: string; body: string }> {
  const workspace = ctx.workspace ?? (ctx.dataDir ? dirname(ctx.dataDir) : '')
  if (!workspace) return []
  const out: Array<{ id: string; body: string }> = []
  for (const tree of ['.plugin-dev', '.plugin']) {
    const root = join(workspace, tree)
    if (!existsSync(root) || !statSync(root).isDirectory()) continue
    for (const id of readdirSync(root)) {
      const readme = join(root, id, 'README.md')
      if (!existsSync(readme) || !statSync(readme).isFile()) continue
      if (!out.some((row) => row.id === id)) out.push({ id, body: readFileSync(readme, 'utf8') })
    }
  }
  return out
}

function rewritePageBlockMentions(db: DatabaseSync) {
  if (!hasTable(db, 'editor_content') || !hasTable(db, 'page_block_index')) return
  if (!tableColumnNames(db, 'page_block_index').includes('collection')) return
  const rows = db.prepare('SELECT DISTINCT collection, page_id, block_id FROM page_block_index').all() as Array<{
    collection: string
    page_id: string
    block_id: string
  }>
  const bodies = db.prepare('SELECT collection, record_id, body FROM editor_content').all() as Array<{
    collection: string
    record_id: string
    body?: string
  }>
  const update = db.prepare('UPDATE editor_content SET body = ? WHERE collection = ? AND record_id = ?')
  for (const row of bodies) {
    let next = String(row.body ?? '')
    for (const block of rows) {
      const from = `/page-blocks/${block.page_id}::${block.block_id}`
      const to = `/page-blocks/${block.collection}::${block.page_id}::${block.block_id}`
      if (from !== to) next = next.split(from).join(to)
    }
    if (next !== (row.body ?? '')) update.run(next, row.collection, row.record_id)
  }
}

export const BIU_MIGRATIONS: Migration[] = [
  { version: 1, module: 'core', name: 'baseline', up: (db) => baseline(db) },
  { version: 2, module: 'tasks', name: 'drop.task_views', up: (db) => db.exec('DROP TABLE IF EXISTS task_views') },
  { version: 3, module: 'facets', name: 'ensure.facet.columns', up: (db) => {
    addColumn(db, 'facets', 'notes', `notes TEXT NOT NULL DEFAULT ''`)
    addColumn(db, 'facets', 'created_at', 'created_at INTEGER NOT NULL DEFAULT 0')
  } },
  { version: 4, module: 'core-page', name: 'ensure.page.columns', up: (db) => {
    addColumn(db, 'pages', 'depends_on_json', `depends_on_json TEXT NOT NULL DEFAULT '[]'`)
    dropColumn(db, 'pages', 'tags_json')
    dropColumn(db, 'pages', 'facet_json')
  } },
  { version: 5, module: 'core-file-system', name: 'create.editor_content', up: (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS editor_content (
        collection TEXT NOT NULL,
        record_id TEXT NOT NULL,
        body TEXT NOT NULL DEFAULT '',
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (collection, record_id)
      );
      CREATE INDEX IF NOT EXISTS editor_content_record ON editor_content(collection, record_id);
    `)
  } },
  { version: 6, module: 'core-file-system', name: 'copy.pages.notes', up: (db) => copyLegacyBodies(db, '/pages') },
  { version: 7, module: 'core-file-system', name: 'copy.tasks.description', up: (db) => copyLegacyBodies(db, '/tasks') },
  { version: 8, module: 'core-file-system', name: 'copy.facets.notes', up: (db) => copyLegacyBodies(db, '/facets') },
  { version: 9, module: 'host-skills', name: 'copy.skills.files', up: (db, ctx) => upsertBodies(db, '/skills', skillBodies(ctx)) },
  { version: 10, module: 'core-plugin-system', name: 'copy.plugins.readme', up: (db, ctx) => upsertBodies(db, '/plugins', pluginReadmes(ctx)) },
  { version: 11, module: 'core-file-system', name: 'rebuild.content_refs', up: (db) => rebuildContentRefs(db) },
  { version: 12, module: 'core-page', name: 'page.block.collection', up: (db) => {
    rebuildPageBlockCollectionKeys(db)
    rewritePageBlockMentions(db)
  } },
  { version: 13, module: 'core', name: 'drop.legacy.editor.columns', up: (db) => dropLegacyEditorColumns(db) },
  { version: 14, module: 'core-file-system', name: 'rebuild.content_refs.v2', up: (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS gc_candidates (
        name TEXT PRIMARY KEY,
        first_seen INTEGER NOT NULL,
        last_seen INTEGER NOT NULL
      );
    `)
    rebuildContentRefs(db)
  } },
  { version: 15, module: 'core-file-system', name: 'rebuild.content_refs.v3', up: (db) => rebuildContentRefs(db) },
  { version: 16, module: 'core-file-system', name: 'record.meta.deleted_at', up: (db) => {
    addColumn(db, 'record_meta', 'deleted_at', 'deleted_at INTEGER')
    db.exec('CREATE INDEX IF NOT EXISTS record_meta_deleted ON record_meta(collection, deleted_at)')
  } },
]

export function assertBiuMigrationLog(rows: Array<{ version: number }> = BIU_MIGRATIONS) {
  let prev = 0
  const seen = new Set<number>()
  for (const row of rows) {
    if (!Number.isInteger(row.version) || row.version <= 0) {
      throw new Error(`BIU_MIGRATIONS version 非法: ${row.version}`)
    }
    if (seen.has(row.version)) {
      throw new Error(`BIU_MIGRATIONS 重复 version ${row.version}`)
    }
    if (row.version <= prev) {
      throw new Error(`BIU_MIGRATIONS 必须单调递增，在 v${row.version} 处乱序`)
    }
    seen.add(row.version)
    prev = row.version
  }
}

assertBiuMigrationLog()

function skipMigrationSnapshot(path: string | undefined) {
  if (!path || path === ':memory:') return true
  if (path.includes('mode=memory')) return true
  try {
    return !existsSync(path) || statSync(path).size === 0
  } catch {
    return true
  }
}

function snapshotBefore(db: DatabaseSync, ctx: MigrateCtx, nextVersion: number) {
  const path = ctx.sqlitePath
  if (skipMigrationSnapshot(path)) return
  const dir = join(ctx.dataDir ?? dirname(path!), 'backup')
  const dest = join(dir, `pre-v${nextVersion}-${Date.now()}.sqlite`)
  try {
    mkdirSync(dir, { recursive: true })
    db.exec(`VACUUM INTO ${quoteSqlitePath(dest)}`)
  } catch (error) {
    throw new Error(`migration 前快照失败（v${nextVersion}）: ${error}`)
  }
}

export function migrateBiu(db: DatabaseSync, ctx: MigrateCtx = {}, target = LATEST_BIU_SCHEMA) {
  const from = getSchemaVersion(db)
  if (from > target) {
    throw new Error(`库 schema v${from} 比代码 v${target} 新，请升级程序`)
  }
  if (from === target) return
  if (isEmptyDatabase(db) && from === 0) {
    createLatestSchema(db)
    setSchemaVersion(db, target)
    vacuumIfNeeded(db, ctx, from, target)
    return
  }
  for (const migration of BIU_MIGRATIONS) {
    if (migration.version <= from || migration.version > target) continue
    snapshotBefore(db, ctx, migration.version)
    db.exec('BEGIN IMMEDIATE')
    try {
      migration.up(db, ctx)
      setSchemaVersion(db, migration.version)
      db.exec('COMMIT')
    } catch (error) {
      try {
        db.exec('ROLLBACK')
      } catch {
        /* ignore */
      }
      throw new Error(`migration v${migration.version} (${migration.module}/${migration.name}) 失败: ${error}`)
    }
  }
  vacuumIfNeeded(db, ctx, from, target)
}

function vacuumIfNeeded(db: DatabaseSync, ctx: MigrateCtx, from: number, target: number) {
  if (from >= target) return
  const path = ctx.sqlitePath
  if (!path || path === ':memory:') return
  try {
    db.exec('VACUUM')
  } catch {
    /* other connections may hold the file */
  }
}

export function openAndMigrateBiu(path: string, opts?: { foreignKeys?: boolean; checkpointOnOpen?: boolean } & MigrateCtx) {
  const db = openSqlite(path, { ...opts, checkpointOnOpen: opts?.checkpointOnOpen !== false })
  const dataDir = opts?.dataDir ?? (path !== ':memory:' && basename(path) === 'biu.sqlite' ? dirname(path) : undefined)
  const workspace = opts?.workspace ?? (dataDir ? dirname(dataDir) : undefined)
  migrateBiu(db, { sqlitePath: path, dataDir, workspace })
  return db
}
