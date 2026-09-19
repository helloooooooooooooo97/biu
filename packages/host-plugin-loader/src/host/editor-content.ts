type DatabaseSync = import('node:sqlite').DatabaseSync

import { assetNamesFromHtml, assetNamesFromMarkdown } from '../../../type-file-system/src/asset-ref.ts'
import { tableColumnNames, tableNames } from './biu-schema.ts'

export const EDITOR_COLLECTIONS = ['/pages', '/tasks', '/facets', '/skills', '/plugins'] as const

const LEGACY_BODY: Record<string, { table: string; id: string; column: string }> = {
  '/pages': { table: 'pages', id: 'id', column: 'notes' },
  '/tasks': { table: 'tasks', id: 'id', column: 'description' },
  '/facets': { table: 'facets', id: 'id', column: 'notes' },
}

export function hasEditorContent(db: DatabaseSync) {
  return tableNames(db).includes('editor_content')
}

export function readEditorContent(db: DatabaseSync, collection: string, recordId: string) {
  if (hasEditorContent(db)) {
    const row = db
      .prepare('SELECT body FROM editor_content WHERE collection = ? AND record_id = ?')
      .get(collection, recordId) as { body?: string } | undefined
    if (row) return String(row.body ?? '')
  }
  const legacy = LEGACY_BODY[collection]
  if (!legacy || !tableNames(db).includes(legacy.table)) return ''
  if (!tableColumnNames(db, legacy.table).includes(legacy.column)) return ''
  const row = db
    .prepare(`SELECT ${legacy.column} AS body FROM ${legacy.table} WHERE ${legacy.id} = ?`)
    .get(recordId) as { body?: string } | undefined
  return String(row?.body ?? '')
}

export function replaceContentRefs(db: DatabaseSync, collection: string, recordId: string, names: Iterable<string>) {
  db.prepare('DELETE FROM content_refs WHERE collection = ? AND record_id = ? AND source = ?').run(
    collection,
    recordId,
    'content',
  )
  const insert = db.prepare(
    'INSERT OR IGNORE INTO content_refs (collection, record_id, name, source) VALUES (?, ?, ?, ?)',
  )
  for (const name of names) insert.run(collection, recordId, name, 'content')
}

function syncLegacyColumn(db: DatabaseSync, collection: string, recordId: string, body: string) {
  const legacy = LEGACY_BODY[collection]
  if (!legacy || !tableNames(db).includes(legacy.table)) return
  if (!tableColumnNames(db, legacy.table).includes(legacy.column)) return
  db.prepare(`UPDATE ${legacy.table} SET ${legacy.column} = ? WHERE ${legacy.id} = ?`).run(body, recordId)
}

export function writeEditorContent(
  db: DatabaseSync,
  collection: string,
  recordId: string,
  body: string,
  opts?: { transaction?: boolean },
) {
  const text = String(body ?? '')
  const names = assetNamesFromMarkdown(text)
  const run = () => {
    if (!hasEditorContent(db)) throw new Error('editor_content missing')
    db.prepare(
      `INSERT INTO editor_content (collection, record_id, body, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(collection, record_id) DO UPDATE SET body = excluded.body, updated_at = excluded.updated_at`,
    ).run(collection, recordId, text, Date.now())
    syncLegacyColumn(db, collection, recordId, text)
    replaceContentRefs(db, collection, recordId, names)
  }
  if (opts?.transaction === false) {
    run()
    return
  }
  db.exec('BEGIN IMMEDIATE')
  try {
    run()
    db.exec('COMMIT')
  } catch (error) {
    try {
      db.exec('ROLLBACK')
    } catch {
      /* ignore */
    }
    throw error
  }
}

export function copyLegacyBodies(db: DatabaseSync, collection: string) {
  const legacy = LEGACY_BODY[collection]
  if (!legacy || !tableNames(db).includes(legacy.table) || !hasEditorContent(db)) return
  if (!tableColumnNames(db, legacy.table).includes(legacy.column)) return
  const rows = db
    .prepare(`SELECT ${legacy.id} AS id, ${legacy.column} AS body FROM ${legacy.table}`)
    .all() as Array<{ id: string; body?: string }>
  const upsert = db.prepare(
    `INSERT INTO editor_content (collection, record_id, body, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(collection, record_id) DO UPDATE SET body = excluded.body, updated_at = excluded.updated_at`,
  )
  const now = Date.now()
  for (const row of rows) upsert.run(collection, row.id, String(row.body ?? ''), now)
}

export function rebuildContentRefs(db: DatabaseSync) {
  if (!tableNames(db).includes('content_refs')) return
  db.prepare('DELETE FROM content_refs').run()
  const insert = db.prepare(
    'INSERT OR IGNORE INTO content_refs (collection, record_id, name, source) VALUES (?, ?, ?, ?)',
  )
  if (hasEditorContent(db)) {
    const rows = db.prepare('SELECT collection, record_id, body FROM editor_content').all() as Array<{
      collection: string
      record_id: string
      body?: string
    }>
    for (const row of rows) {
      for (const name of assetNamesFromMarkdown(row.body ?? '')) {
        insert.run(row.collection, row.record_id, name, 'content')
      }
    }
  }
  if (tableNames(db).includes('record_banners')) {
    const rows = db.prepare('SELECT collection, record_id, html FROM record_banners').all() as Array<{
      collection: string
      record_id: string
      html?: string
    }>
    for (const row of rows) {
      for (const name of assetNamesFromHtml(row.html ?? '')) {
        insert.run(row.collection, row.record_id, name, 'banner')
      }
    }
  }
}
