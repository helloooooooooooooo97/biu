import {
  DATA_DIR_NAME,
  openAndMigrateBiu,
  upsertAttachmentRow,
  writeEditorContent,
  readEditorContent,
  replaceContentRefs as replaceContentRefsRows,
} from '@biu/host-plugin-loader/data-dir'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import {
  asPerson,
  asPersonList,
  isEmptySchemaValue,
  normalizeSchemaPack,
  normalizeSchemaValue,
  type CollectionSchemaPack,
  type PersonValue,
  type SchemaFieldValue,
} from '@biu/type-file-system'
import { parsePageBanner, type PageBanner, type PageBannerKind } from '../page-banner.ts'
import { bannerGalleryId, isBannerPreset } from '../banner-presets.ts'

type DatabaseSync = import('node:sqlite').DatabaseSync

export const FILE_SYSTEM_SQLITE = `${DATA_DIR_NAME}/biu.sqlite`

export type FacetStamp = {
  collection: string
  id: string
  path: string
  title: string
}

type TagRow = {
  id: string
  label: string
  fields_json: string
  notes?: string
  created_at?: number
  updated_at?: number
}

export type FacetEntry = {
  pack: CollectionSchemaPack
  notes: string
  createdAt: number
  updatedAt: number
}
type StampRow = { facet_id: string; collection: string; record_id: string; title: string }

export function slugFacetId(label: string, used: Set<string>) {
  const base =
    label
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 24) || 'facet'
  let id = /^[a-z]/.test(base) ? base : `t-${base}`
  let n = 2
  while (used.has(id) || !/^[a-z][a-z0-9-]{0,31}$/.test(id)) {
    id = `${base.slice(0, 20)}-${n}`
    if (!/^[a-z]/.test(id)) id = `t-${id}`
    n += 1
  }
  return id
}

function packFromRow(row: TagRow): CollectionSchemaPack | null {
  let fields: unknown = []
  try {
    fields = JSON.parse(row.fields_json || '[]')
  } catch {
    fields = []
  }
  return normalizeSchemaPack({ id: row.id, label: row.label, fields })
}

function entryFromRow(db: DatabaseSync, row: TagRow): FacetEntry | null {
  const pack = packFromRow(row)
  if (!pack) return null
  const updated = Number(row.updated_at) || 0
  const created = Number(row.created_at) || 0
  const createdAt = created > 0 ? created : updated
  const updatedAt = updated > 0 ? updated : createdAt
  return {
    pack,
    notes: readEditorContent(db, '/facets', row.id),
    createdAt,
    updatedAt,
  }
}

const FACET_ROW_SQL = 'id, label, fields_json, created_at, updated_at'

/** 分面目录由 File System 用 SQLite 管：目录 + 跨表倒排，查询不扫全表。 */
export class FacetStore {
  private db: DatabaseSync | null = null

  open(path = ':memory:') {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })
    this.db = openAndMigrateBiu(path)
    this.ensureCreatedAtColumn()
    this.ensurePersonMetaColumns()
    this.ensureBannerTable()
    return this
  }

  private ensureCreatedAtColumn() {
    const db = this.db!
    const cols = db.prepare('PRAGMA table_info(facets)').all() as Array<{ name: string }>
    if (!cols.some((col) => col.name === 'created_at')) {
      db.exec(`ALTER TABLE facets ADD COLUMN created_at INTEGER NOT NULL DEFAULT 0`)
    }
    db.exec(`UPDATE facets SET created_at = updated_at WHERE created_at = 0 AND updated_at > 0`)
  }

  private ensurePersonMetaColumns() {
    const db = this.db!
    const cols = db.prepare('PRAGMA table_info(record_meta)').all() as Array<{ name: string }>
    const names = new Set(cols.map((col) => col.name))
    if (!names.has('created_by_json')) db.exec(`ALTER TABLE record_meta ADD COLUMN created_by_json TEXT`)
    if (!names.has('updated_by_json')) db.exec(`ALTER TABLE record_meta ADD COLUMN updated_by_json TEXT`)
  }

  private ensureBannerTable() {
    const db = this.db!
    const cols = db.prepare('PRAGMA table_info(record_meta)').all() as Array<{ name: string }>
    if (!cols.some((col) => col.name === 'banner_json')) return
    const rows = db
      .prepare('SELECT collection, record_id, banner_json FROM record_meta WHERE banner_json IS NOT NULL AND banner_json != \'\'')
      .all() as Array<{ collection: string; record_id: string; banner_json: string }>
    const put = db.prepare(
      `INSERT INTO record_banners (collection, record_id, kind, html)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(collection, record_id) DO UPDATE SET kind = excluded.kind, html = excluded.html`,
    )
    for (const row of rows) {
      let parsed: PageBanner | null = null
      try {
        parsed = parsePageBanner(JSON.parse(row.banner_json))
      } catch {
        parsed = parsePageBanner(row.banner_json)
      }
      if (!parsed) continue
      put.run(row.collection, row.record_id, parsed.kind, parsed.html)
    }
  }

  notes(id: string) {
    const want = String(id ?? '').trim()
    if (!want) return ''
    return readEditorContent(this.ensure(), '/facets', want)
  }

  private savePack(pack: CollectionSchemaPack, notes: string) {
    const now = Date.now()
    const db = this.ensure()
    db.prepare(
        `INSERT INTO facets (id, label, fields_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           label = excluded.label,
           fields_json = excluded.fields_json,
           updated_at = excluded.updated_at`,
      )
      .run(pack.id, pack.label, JSON.stringify(pack.fields), now, now)
    writeEditorContent(db, '/facets', pack.id, notes, { transaction: false })
  }

  ensure() {
    if (!this.db) this.open(':memory:')
    return this.db!
  }

  list(query = ''): CollectionSchemaPack[] {
    return this.entries(query).map((item) => item.pack)
  }

  entries(query = ''): FacetEntry[] {
    const db = this.ensure()
    const q = query.trim().toLowerCase()
    const rows = (
      q
        ? (db
            .prepare(
              `SELECT ${FACET_ROW_SQL} FROM facets
               WHERE instr(lower(id), ?) > 0 OR instr(lower(label), ?) > 0
               ORDER BY label`,
            )
            .all(q, q) as TagRow[])
        : (db.prepare(`SELECT ${FACET_ROW_SQL} FROM facets ORDER BY label`).all() as TagRow[])
    )
    return rows.map((row) => entryFromRow(db, row)).filter((item): item is FacetEntry => Boolean(item))
  }

  get(idOrLabel: string): CollectionSchemaPack | null {
    return this.entry(idOrLabel)?.pack ?? null
  }

  entry(idOrLabel: string): FacetEntry | null {
    const want = String(idOrLabel ?? '').trim()
    if (!want) return null
    const row = this.ensure()
      .prepare(`SELECT ${FACET_ROW_SQL} FROM facets WHERE id = ? OR label = ? LIMIT 1`)
      .get(want, want) as TagRow | undefined
    return row ? entryFromRow(this.ensure(), row) : null
  }

  replace(tags: unknown[]): CollectionSchemaPack[] {
    const db = this.ensure()
    const next = tags.map((item) => normalizeSchemaPack(item)).filter((item): item is CollectionSchemaPack => Boolean(item))
    const keep = new Set(next.map((tag) => tag.id))
    db.exec('BEGIN IMMEDIATE')
    try {
      for (const tag of next) {
        this.savePack(tag, this.notes(tag.id))
      }
      const existing = db.prepare('SELECT id FROM facets').all() as Array<{ id: string }>
      for (const row of existing) {
        if (keep.has(row.id)) continue
        db.prepare('DELETE FROM facet_stamps WHERE facet_id = ?').run(row.id)
        db.prepare('DELETE FROM facets WHERE id = ?').run(row.id)
      }
      db.exec('COMMIT')
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    }
    return this.list()
  }

  upsert(raw: unknown, notes?: string): CollectionSchemaPack {
    const pack = normalizeSchemaPack(raw)
    if (!pack) throw new Error('invalid 合集')
    const nextNotes = notes !== undefined ? String(notes) : this.notes(pack.id)
    this.savePack(pack, nextNotes)
    return pack
  }

  removeFacet(id: string): boolean {
    const db = this.ensure()
    const want = String(id ?? '').trim()
    if (!want) return false
    db.exec('BEGIN IMMEDIATE')
    try {
      db.prepare('DELETE FROM facet_stamps WHERE facet_id = ?').run(want)
      const result = db.prepare('DELETE FROM facets WHERE id = ?').run(want)
      db.exec('COMMIT')
      return Number(result.changes) > 0
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    }
  }

  stampCounts(): Record<string, number> {
    const rows = this.ensure()
      .prepare('SELECT facet_id, COUNT(*) AS n FROM facet_stamps GROUP BY facet_id')
      .all() as Array<{ facet_id: string; n: number | bigint }>
    const out: Record<string, number> = {}
    for (const row of rows) out[row.facet_id] = Number(row.n)
    return out
  }

  indexRecord(collection: string, recordId: string, title: string, tagIds: string[]) {
    const db = this.ensure()
    const ids = [...new Set(tagIds.map((id) => String(id).trim()).filter(Boolean))]
    db.exec('BEGIN IMMEDIATE')
    try {
      db.prepare('DELETE FROM facet_stamps WHERE collection = ? AND record_id = ?').run(collection, recordId)
      const insert = db.prepare(
        'INSERT INTO facet_stamps (facet_id, collection, record_id, title) VALUES (?, ?, ?, ?)',
      )
      for (const tagId of ids) insert.run(tagId, collection, recordId, title)
      db.exec('COMMIT')
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    }
  }

  recordFacet(collection: string, recordId: string): SchemaFieldValue | null {
    const row = this.ensure()
      .prepare('SELECT facet_json FROM facet_record_values WHERE collection = ? AND record_id = ?')
      .get(collection, recordId) as { facet_json: string } | undefined
    if (!row) return null
    return normalizeSchemaValue(row.facet_json)
  }

  writeRecordFacet(collection: string, recordId: string, facet: unknown, title: string) {
    const value = normalizeSchemaValue(facet)
    const db = this.ensure()
    if (isEmptySchemaValue(value)) {
      db.prepare('DELETE FROM facet_record_values WHERE collection = ? AND record_id = ?').run(collection, recordId)
      this.indexRecord(collection, recordId, title, [])
      return value
    }
    db.prepare(
      `INSERT INTO facet_record_values (collection, record_id, facet_json)
       VALUES (?, ?, ?)
       ON CONFLICT(collection, record_id) DO UPDATE SET facet_json = excluded.facet_json`,
    ).run(collection, recordId, JSON.stringify(value))
    this.indexRecord(collection, recordId, title, value.tags)
    return value
  }

  recordMeta(collection: string, recordId: string): {
    emoji: string | null
    tags: string[] | null
    createdBy: PersonValue | null
    updatedBy: PersonValue[]
  } | null {
    const row = this.ensure()
      .prepare('SELECT emoji, tags_json, created_by_json, updated_by_json FROM record_meta WHERE collection = ? AND record_id = ?')
      .get(collection, recordId) as {
        emoji: string | null
        tags_json: string | null
        created_by_json?: string | null
        updated_by_json?: string | null
      } | undefined
    if (!row) return null
    let tags: string[] | null = null
    if (row.tags_json != null) {
      try {
        const parsed = JSON.parse(row.tags_json) as unknown
        tags = Array.isArray(parsed)
          ? [...new Set(parsed.map((item) => String(item).trim()).filter(Boolean))]
          : []
      } catch {
        tags = []
      }
    }
    const parsePerson = (raw: string | null | undefined) => {
      if (raw == null || raw === '') return null
      try {
        return asPerson(JSON.parse(raw))
      } catch {
        return asPerson(raw)
      }
    }
    const parsePeople = (raw: string | null | undefined) => {
      if (raw == null || raw === '') return []
      try {
        return asPersonList(JSON.parse(raw))
      } catch {
        return asPersonList(raw)
      }
    }
    return {
      emoji: row.emoji != null ? String(row.emoji) : null,
      tags,
      createdBy: parsePerson(row.created_by_json),
      updatedBy: parsePeople(row.updated_by_json),
    }
  }

  recordBanner(collection: string, recordId: string): PageBanner | null {
    const row = this.ensure()
      .prepare('SELECT kind, html FROM record_banners WHERE collection = ? AND record_id = ?')
      .get(collection, recordId) as { kind?: string; html?: string } | undefined
    if (!row || typeof row.html !== 'string' || !row.html.trim()) return null
    return parsePageBanner({ kind: row.kind, html: row.html })
  }

  writeRecordBanner(collection: string, recordId: string, banner: PageBanner | null) {
    const db = this.ensure()
    if (!banner) {
      db.prepare('DELETE FROM record_banners WHERE collection = ? AND record_id = ?').run(collection, recordId)
      return null
    }
    db.prepare(
      `INSERT INTO record_banners (collection, record_id, kind, html)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(collection, record_id) DO UPDATE SET kind = excluded.kind, html = excluded.html`,
    ).run(collection, recordId, banner.kind, banner.html)
    if (!isBannerPreset(banner)) this.rememberBannerGallery(banner)
    return this.recordBanner(collection, recordId)
  }

  rememberBannerGallery(banner: PageBanner, title = '自定义') {
    if (isBannerPreset(banner)) return
    const html = banner.html.trim()
    if (!html) return
    const id = bannerGalleryId(banner.kind, html)
    this.ensure()
      .prepare(
        `INSERT INTO banner_gallery (id, kind, style, title, html, created_at)
         VALUES (?, ?, 'mine', ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET kind = excluded.kind, html = excluded.html`,
      )
      .run(id, banner.kind, title, html, Date.now())
  }

  listBannerGallery(): Array<{ id: string; kind: PageBannerKind; style: string; title: string; html: string }> {
    const rows = this.ensure()
      .prepare('SELECT id, kind, style, title, html FROM banner_gallery ORDER BY created_at DESC')
      .all() as Array<{ id: string; kind: string; style: string; title: string; html: string }>
    return rows.flatMap((row) => {
      const parsed = parsePageBanner({ kind: row.kind, html: row.html })
      if (!parsed || isBannerPreset(parsed)) return []
      return [{ id: row.id, kind: parsed.kind, style: row.style || 'mine', title: row.title || '自定义', html: parsed.html }]
    })
  }

  forgetBannerGallery(id: string) {
    const key = id.trim()
    if (!key) return false
    const result = this.ensure().prepare('DELETE FROM banner_gallery WHERE id = ?').run(key)
    return Number(result.changes) > 0
  }

  writeRecordMeta(
    collection: string,
    recordId: string,
    patch: {
      emoji?: string
      tags?: string[]
      createdBy?: PersonValue | null
      updatedBy?: PersonValue[] | PersonValue | null
    },
  ): { emoji: string | null; tags: string[] | null; createdBy: PersonValue | null; updatedBy: PersonValue[] } {
    this.ensure()
      .prepare(
        `INSERT INTO record_meta (collection, record_id, emoji, tags_json, created_by_json, updated_by_json)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(collection, record_id) DO UPDATE SET
           emoji = COALESCE(excluded.emoji, record_meta.emoji),
           tags_json = COALESCE(excluded.tags_json, record_meta.tags_json),
           created_by_json = COALESCE(excluded.created_by_json, record_meta.created_by_json),
           updated_by_json = COALESCE(excluded.updated_by_json, record_meta.updated_by_json)`,
      )
      .run(
        collection,
        recordId,
        patch.emoji !== undefined ? String(patch.emoji ?? '') : null,
        patch.tags !== undefined
          ? JSON.stringify([...new Set(patch.tags.map((item) => String(item).trim()).filter(Boolean))])
          : null,
        patch.createdBy !== undefined ? JSON.stringify(patch.createdBy) : null,
        patch.updatedBy !== undefined ? JSON.stringify(asPersonList(patch.updatedBy)) : null,
      )
    return this.recordMeta(collection, recordId) ?? { emoji: null, tags: null, createdBy: null, updatedBy: [] }
  }

  removeRecord(collection: string, recordId: string) {
    const db = this.ensure()
    db.prepare('DELETE FROM facet_stamps WHERE collection = ? AND record_id = ?').run(collection, recordId)
    db.prepare('DELETE FROM facet_record_values WHERE collection = ? AND record_id = ?').run(collection, recordId)
    db.prepare('DELETE FROM record_meta WHERE collection = ? AND record_id = ?').run(collection, recordId)
    db.prepare('DELETE FROM record_banners WHERE collection = ? AND record_id = ?').run(collection, recordId)
    db.prepare('DELETE FROM content_refs WHERE collection = ? AND record_id = ?').run(collection, recordId)
    db.prepare('DELETE FROM block_refs WHERE collection = ? AND record_id = ?').run(collection, recordId)
  }

  putAttachment(row: { name: string; etag: string; mime: string; bytes: number; kind?: string; storage?: string }) {
    upsertAttachmentRow(this.ensure(), row)
  }

  replaceContentRefs(collection: string, recordId: string, content: Iterable<string>, banner: Iterable<string> = []) {
    const db = this.ensure()
    db.exec('BEGIN IMMEDIATE')
    try {
      replaceContentRefsRows(db, collection, recordId, content, banner)
      db.exec('COMMIT')
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    }
  }

  upsertBlockRef(collection: string, recordId: string, blockId: string, name: string, source: string) {
    this.ensure()
      .prepare(
        `INSERT INTO block_refs (collection, record_id, block_id, name, source)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(collection, record_id, block_id, name, source) DO NOTHING`,
      )
      .run(collection, recordId, blockId, name, source)
  }

  replaceBlockRefs(
    collection: string,
    recordId: string,
    blockId: string,
    refs: Array<{ name: string; source: string }>,
  ) {
    const db = this.ensure()
    db.exec('BEGIN IMMEDIATE')
    try {
      db.prepare('DELETE FROM block_refs WHERE collection = ? AND record_id = ? AND block_id = ?').run(
        collection,
        recordId,
        blockId,
      )
      const insert = db.prepare(
        'INSERT INTO block_refs (collection, record_id, block_id, name, source) VALUES (?, ?, ?, ?, ?)',
      )
      for (const ref of refs) insert.run(collection, recordId, blockId, ref.name, ref.source)
      db.exec('COMMIT')
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    }
  }

  dropBlockRefs(collection: string, recordId: string, blockId?: string) {
    if (blockId) {
      this.ensure()
        .prepare('DELETE FROM block_refs WHERE collection = ? AND record_id = ? AND block_id = ?')
        .run(collection, recordId, blockId)
      return
    }
    this.ensure().prepare('DELETE FROM block_refs WHERE collection = ? AND record_id = ?').run(collection, recordId)
  }

  listedAttachmentNames(collection: string, recordId: string): string[] {
    const db = this.ensure()
    const names = new Set<string>()
    for (const row of db
      .prepare('SELECT name FROM content_refs WHERE collection = ? AND record_id = ?')
      .all(collection, recordId) as Array<{ name: string }>) {
      names.add(row.name)
    }
    for (const row of db
      .prepare('SELECT name FROM block_refs WHERE collection = ? AND record_id = ?')
      .all(collection, recordId) as Array<{ name: string }>) {
      names.add(row.name)
    }
    return [...names].sort()
  }

  stampedIds(collection: string, tagIdOrLabel: string): Set<string> {
    const tag = this.get(tagIdOrLabel)
    const tagId = tag?.id ?? tagIdOrLabel
    const rows = this.ensure()
      .prepare('SELECT record_id FROM facet_stamps WHERE collection = ? AND facet_id = ?')
      .all(collection, tagId) as Array<{ record_id: string }>
    return new Set(rows.map((row) => row.record_id))
  }

  collect(idOrLabel: string): { facet: CollectionSchemaPack | null; items: FacetStamp[] } {
    const tag = this.get(idOrLabel)
    const tagId = tag?.id ?? String(idOrLabel ?? '').trim()
    if (!tagId) return { facet: null, items: [] }
    const rows = this.ensure()
      .prepare(
        'SELECT facet_id, collection, record_id, title FROM facet_stamps WHERE facet_id = ? ORDER BY collection, record_id',
      )
      .all(tagId) as StampRow[]
    return {
      facet: tag,
      items: rows.map((row) => ({
        collection: row.collection,
        id: row.record_id,
        path: `${row.collection}/${row.record_id}`,
        title: row.title,
      })),
    }
  }
}
