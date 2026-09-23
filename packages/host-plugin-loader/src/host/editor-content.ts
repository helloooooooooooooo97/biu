type DatabaseSync = import('node:sqlite').DatabaseSync

import { assetNamesFromHtml, assetNamesFromMarkdown } from '../../../type-file-system/src/asset-ref.ts'
import { tableColumnNames, tableNames } from './biu-schema.ts'

const LEGACY_BODY: Record<string, { table: string; id: string; column: string }> = {
  '/pages': { table: 'pages', id: 'id', column: 'notes' },
  '/tasks': { table: 'tasks', id: 'id', column: 'description' },
  '/facets': { table: 'facets', id: 'id', column: 'notes' },
}

export function hasEditorContent(db: DatabaseSync) {
  return tableNames(db).includes('editor_content')
}

export type EditorContentRecord = {
  body: string
  version: number
}

export class EditorContentConflictError extends Error {
  code = 'EDITOR_CONTENT_CONFLICT' as const

  constructor(
    public expectedVersion: number,
    public actualVersion: number,
  ) {
    super(`正文版本冲突：期望 v${expectedVersion}，当前为 v${actualVersion}`)
    this.name = 'EditorContentConflictError'
  }
}

export function readEditorContentRecord(
  db: DatabaseSync,
  collection: string,
  recordId: string,
): EditorContentRecord {
  if (hasEditorContent(db)) {
    const row = db
      .prepare('SELECT body, version FROM editor_content WHERE collection = ? AND record_id = ?')
      .get(collection, recordId) as { body?: string; version?: number } | undefined
    if (row) return { body: String(row.body ?? ''), version: Math.max(1, Number(row.version) || 1) }
  }
  const legacy = LEGACY_BODY[collection]
  if (!legacy || !tableNames(db).includes(legacy.table)) return { body: '', version: 0 }
  if (!tableColumnNames(db, legacy.table).includes(legacy.column)) return { body: '', version: 0 }
  const row = db
    .prepare(`SELECT ${legacy.column} AS body FROM ${legacy.table} WHERE ${legacy.id} = ?`)
    .get(recordId) as { body?: string } | undefined
  return { body: String(row?.body ?? ''), version: 0 }
}

export function readEditorContent(db: DatabaseSync, collection: string, recordId: string) {
  return readEditorContentRecord(db, collection, recordId).body
}

function bannerHtml(db: DatabaseSync, collection: string, recordId: string) {
  if (!tableNames(db).includes('record_banners')) return ''
  const row = db
    .prepare('SELECT html FROM record_banners WHERE collection = ? AND record_id = ?')
    .get(collection, recordId) as { html?: string } | undefined
  return String(row?.html ?? '')
}

/** Per-source replace. Never deletes a source that is not being rewritten. */
export function replaceContentRefs(
  db: DatabaseSync,
  collection: string,
  recordId: string,
  content: Iterable<string>,
  banner: Iterable<string> = [],
) {
  db.prepare('DELETE FROM content_refs WHERE collection = ? AND record_id = ? AND source = ?').run(
    collection,
    recordId,
    'content',
  )
  db.prepare('DELETE FROM content_refs WHERE collection = ? AND record_id = ? AND source = ?').run(
    collection,
    recordId,
    'banner',
  )
  const insert = db.prepare(
    'INSERT OR IGNORE INTO content_refs (collection, record_id, name, source) VALUES (?, ?, ?, ?)',
  )
  for (const name of content) insert.run(collection, recordId, name, 'content')
  for (const name of banner) insert.run(collection, recordId, name, 'banner')
}

export function writeEditorContent(
  db: DatabaseSync,
  collection: string,
  recordId: string,
  body: string,
  opts?: { transaction?: boolean; expectedVersion?: number },
) {
  const text = String(body ?? '')
  const names = assetNamesFromMarkdown(text)
  const run = () => {
    if (!hasEditorContent(db)) throw new Error('editor_content missing')
    const current = readEditorContentRecord(db, collection, recordId)
    if (opts?.expectedVersion != null && current.version !== opts.expectedVersion) {
      throw new EditorContentConflictError(opts.expectedVersion, current.version)
    }
    const now = Date.now()
    if (current.version === 0) {
      db.prepare(
        `INSERT INTO editor_content (collection, record_id, body, updated_at, version)
         VALUES (?, ?, ?, ?, 1)`,
      ).run(collection, recordId, text, now)
    } else if (current.body === text) {
      db.prepare(
        'UPDATE editor_content SET updated_at = ? WHERE collection = ? AND record_id = ?',
      ).run(now, collection, recordId)
    } else {
      db.prepare(
        `UPDATE editor_content
         SET body = ?, updated_at = ?, version = version + 1
         WHERE collection = ? AND record_id = ?`,
      ).run(text, now, collection, recordId)
    }
    replaceContentRefs(db, collection, recordId, names, assetNamesFromHtml(bannerHtml(db, collection, recordId)))
    return readEditorContentRecord(db, collection, recordId)
  }
  if (opts?.transaction === false) {
    return run()
  }
  db.exec('BEGIN IMMEDIATE')
  try {
    const written = run()
    db.exec('COMMIT')
    return written
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
