import { mkdir, unlink } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { createRequire } from 'node:module'
import type { DbRecord, SchemaFieldValue } from '@biu/type-file-system'
import { emptySchemaValue, normalizeSchemaValue } from '@biu/type-file-system'
import {
  DATA_DIR_NAME,
  adoptCasAssets,
  assetsRootPath,
  dataHome,
  listCasAssetFiles,
  listDocAssetFiles,
  migrateLegacyPageDir,
  PAGE_DB,
  PAGE_ROOT,
  readDocument,
  writeDocument,
  AssetConflictError,
  upsertAttachmentRow,
} from '@biu/host-plugin-loader/data-dir'
import { splitMarkdown } from './markdown.ts'

export { PAGE_ROOT, PAGE_DB, PAGE_ASSETS } from '@biu/host-plugin-loader/data-dir'
export { AssetConflictError as PageAssetConflictError } from '@biu/host-plugin-loader/data-dir'
/** 正文不再引用后，附件再留一天，避免撤销/未落盘指针误删。 */
export const ASSET_GC_GRACE_MS = 24 * 60 * 60 * 1000

const ID_RE = /^[A-Za-z0-9._-]+$/
const ASSET_FILE_RE = /^[\p{L}\p{N}._-]+$/u
const ASSET_REF_RE = /(?:(?:\.page\/)?assets\/|\/api\/(?:page|db|doc)\/file\/)([\p{L}\p{N}._-]+)/gu

export function isPageAssetFileName(name: string) {
  return Boolean(name) && name === basename(name) && name !== '.gitkeep' && ASSET_FILE_RE.test(name)
}

export function collectPageAssetNames(...chunks: unknown[]): Set<string> {
  const names = new Set<string>()
  const eat = (text: string) => {
    for (const match of text.matchAll(ASSET_REF_RE)) {
      const name = basename(match[1] ?? '')
      if (isPageAssetFileName(name)) names.add(name)
    }
  }
  for (const chunk of chunks) {
    if (chunk == null) continue
    if (typeof chunk === 'string') eat(chunk)
    else eat(JSON.stringify(chunk))
  }
  return names
}

export type PageRow = DbRecord & {
  title: string
  tags: string[]
  notes: string
  parentId: string | null
  dependsOn: string[]
  facet: SchemaFieldValue
  emoji: string
  createdAt: number
  updatedAt: number
}

export type WorkspaceFs = {
  resolve: (rel: string) => string
  read: (rel: string) => Promise<string>
  write: (rel: string, content: string) => Promise<unknown>
  list: (rel?: string) => Promise<string[]>
}

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.map((item) => String(item)).filter(Boolean)
}

function asTime(value: unknown, fallback: number): number {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.getTime()
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const asNum = Number(value)
    if (Number.isFinite(asNum) && /^\d+(\.\d+)?$/.test(value.trim())) return asNum
    const parsed = Date.parse(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return fallback
}

function asNotes(value: unknown): string | undefined {
  if (value == null) return undefined
  if (typeof value === 'string') return value
  if (typeof value === 'object' && !Array.isArray(value)) {
    const rec = value as Record<string, unknown>
    if (typeof rec.body === 'string') return rec.body
    if (typeof rec.body === 'object') return JSON.stringify(rec.body, null, 2)
  }
  return String(value)
}

export function fileUrl(name: string) {
  return `/api/db/file/${encodeURIComponent(name)}`
}

function pageRel(id: string) {
  if (!ID_RE.test(id)) throw new Error(`invalid page id: ${id}`)
  return `${PAGE_ROOT}/${id}.md`
}

function rowFromFile(id: string, raw: string): PageRow {
  const { matter, body } = splitMarkdown(raw)
  const now = Date.now()
  const createdAt = asTime(matter.createdAt, now)
  const updatedAt = asTime(matter.updatedAt, createdAt)
  return {
    id,
    title: String(matter.title ?? id),
    tags: asStringList(matter.tags),
    notes: body,
    parentId: matter.parentId == null || matter.parentId === '' ? null : String(matter.parentId),
    dependsOn: asStringList(matter.dependsOn),
    facet: normalizeSchemaValue(matter.facet),
    emoji: String(matter.emoji ?? ''),
    createdAt,
    updatedAt,
  }
}

function emptyRow(id: string, ts: number): PageRow {
  return {
    id,
    title: '未命名页面',
    tags: [],
    notes: '',
    parentId: null,
    dependsOn: [],
    facet: emptySchemaValue(),
    emoji: '',
    createdAt: ts,
    updatedAt: ts,
  }
}

function applyPatch(current: PageRow, patch: Record<string, unknown>): PageRow {
  const notes = asNotes(patch.notes)
  return {
    ...current,
    id: current.id,
    title:
      typeof patch.title === 'string' && patch.title.trim()
        ? patch.title.trim()
        : current.title,
    notes: 'notes' in patch ? (notes ?? '') : current.notes,
    tags: current.tags,
    parentId: 'parentId' in patch
      ? patch.parentId == null || patch.parentId === '' ? null : String(patch.parentId)
      : current.parentId,
    dependsOn: 'dependsOn' in patch ? asStringList(patch.dependsOn) : current.dependsOn,
    facet: current.facet,
    emoji: 'emoji' in patch ? String(patch.emoji ?? '') : current.emoji,
    createdAt: current.createdAt,
    updatedAt: Date.now(),
  }
}

export class PagesStore {
  constructor(
    private fs: WorkspaceFs,
    private assetsDir = assetsRootPath(dataHome()),
  ) {}

  private db: import('node:sqlite').DatabaseSync | null = null

  private async ensureDirs() {
    migrateLegacyPageDir(this.fs.resolve('.'))
    await mkdir(this.assetsDir, { recursive: true })
  }

  private async openDb() {
    await this.ensureDirs()
    if (this.db) return this.db
    const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite')
    const db = new DatabaseSync(this.fs.resolve(PAGE_DB))
    db.exec('PRAGMA journal_mode = WAL')
    db.exec('PRAGMA synchronous = NORMAL')
    db.exec(`
      CREATE TABLE IF NOT EXISTS pages (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        notes TEXT NOT NULL DEFAULT '',
        parent_id TEXT,
        depends_on_json TEXT NOT NULL DEFAULT '[]',
        emoji TEXT NOT NULL DEFAULT '',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `)
    const cols = db.prepare('PRAGMA table_info(pages)').all() as Array<{ name: string }>
    if (!cols.some((col) => col.name === 'depends_on_json')) {
      db.exec(`ALTER TABLE pages ADD COLUMN depends_on_json TEXT NOT NULL DEFAULT '[]'`)
    }
    if (!cols.some((col) => col.name === 'notes')) {
      db.exec(`ALTER TABLE pages ADD COLUMN notes TEXT NOT NULL DEFAULT ''`)
    }
    const latest = db.prepare('PRAGMA table_info(pages)').all() as Array<{ name: string }>
    for (const name of ['tags_json', 'facet_json']) {
      if (latest.some((col) => col.name === name)) {
        try {
          db.exec(`ALTER TABLE pages DROP COLUMN ${name}`)
        } catch {
          /* older sqlite */
        }
      }
    }
    this.db = db
    await this.migrateMarkdown()
    adoptCasAssets(this.fs.resolve(DATA_DIR_NAME))
    await this.gcCasAssets()
    return db
  }

  async sqlite() {
    return this.openDb()
  }

  private async migrateMarkdown() {
    if (!this.db) return
    let names: string[] = []
    try {
      names = await this.fs.list(PAGE_ROOT)
    } catch {
      names = []
    }
    for (const name of names) {
      if (!name.endsWith('.md')) continue
      const id = name.slice(0, -3)
      if (!ID_RE.test(id)) continue
      try {
        const row = rowFromFile(id, await this.fs.read(pageRel(id)))
        const hit = this.db.prepare('SELECT notes FROM pages WHERE id = ?').get(id) as { notes?: string } | undefined
        if (!hit) this.upsert(row)
        else if (!String(hit.notes ?? '').trim() && row.notes) this.upsert(row)
        await unlink(this.fs.resolve(pageRel(id)))
      } catch {
        /* skip unreadable */
      }
    }
  }

  private upsert(row: PageRow) {
    if (!this.db) return
    this.db.prepare(`
      INSERT INTO pages (
        id, title, notes, parent_id,
        depends_on_json, emoji, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        title=excluded.title, notes=excluded.notes,
        parent_id=excluded.parent_id, depends_on_json=excluded.depends_on_json, emoji=excluded.emoji,
        updated_at=excluded.updated_at
    `).run(...sqlValues(row))
  }

  async list(ids?: string[]): Promise<PageRow[]> {
    const db = await this.openDb()
    await this.migrateMarkdown()
    if (ids) {
      const rows: PageRow[] = []
      for (const id of ids) {
        if (!ID_RE.test(id)) continue
        const row = await this.get(id)
        if (row) rows.push({ ...row, notes: '' })
      }
      return rows
    }
    const listed = db.prepare(`
      SELECT id, title, parent_id,
        depends_on_json, emoji, created_at, updated_at
      FROM pages ORDER BY id
    `).all() as SqlPage[]
    return listed.map(rowFromSql)
  }

  async get(id: string): Promise<PageRow | null> {
    if (!ID_RE.test(id)) return null
    const db = await this.openDb()
    await this.migrateMarkdown()
    const hit = db.prepare(`
      SELECT id, title, notes, parent_id,
        depends_on_json, emoji, created_at, updated_at
      FROM pages WHERE id = ?
    `).get(id) as SqlPage | undefined
    return hit ? rowFromSql(hit) : null
  }

  async update(id: string, patch: Record<string, unknown>): Promise<PageRow> {
    const current = await this.get(id)
    if (!current) throw new Error(`unknown page: ${id}`)
    const next = applyPatch(current, patch)
    await this.write(next)
    await this.gcAssets()
    return (await this.get(id))!
  }

  async create(fields: Record<string, unknown> = {}): Promise<PageRow> {
    const db = await this.openDb()
    const existing = new Set((db.prepare('SELECT id FROM pages').all() as Array<{ id: string }>).map((row) => row.id))
    let n = existing.size
    let id = `p${String(n).padStart(3, '0')}`
    while (existing.has(id) || !ID_RE.test(id)) {
      n += 1
      id = `p${String(n).padStart(3, '0')}`
    }
    if (typeof fields.id === 'string' && ID_RE.test(fields.id) && !existing.has(fields.id)) id = fields.id
    const ts = Date.now()
    const row = applyPatch(emptyRow(id, ts), { ...fields })
    row.id = id
    row.createdAt = ts
    row.updatedAt = ts
    if (typeof fields.title === 'string' && fields.title.trim()) row.title = fields.title.trim()
    await this.write(row)
    await this.gcAssets()
    return (await this.get(id))!
  }

  async remove(id: string) {
    if (!ID_RE.test(id)) throw new Error(`unknown page: ${id}`)
    const db = await this.openDb()
    const info = db.prepare('DELETE FROM pages WHERE id = ?').run(id)
    if (!info.changes) throw new Error(`unknown page: ${id}`)
    try {
      await unlink(this.fs.resolve(pageRel(id)))
    } catch {
      /* leftover markdown */
    }
    await this.gcAssets()
  }

  async writeAsset(name: string, content: string | Buffer | Uint8Array, opts?: { etag?: string }) {
    const file = basename(name)
    if (!file || file !== name.replace(/\\/g, '/') || !isPageAssetFileName(file)) throw new Error('invalid asset')
    const written = await writeDocument(join(this.assetsDir, 'doc'), file, content, opts)
    const db = await this.openDb()
    upsertAttachmentRow(db, {
      name: written.name,
      etag: written.etag,
      mime: mimeOf(written.name),
      bytes: written.bytes.length,
      kind: 'asset',
      storage: 'doc',
    })
    return { name: written.name, href: fileUrl(written.name), etag: written.etag }
  }

  async readAsset(name: string): Promise<{ bytes: Buffer; type: string; etag: string }> {
    const file = basename(name)
    if (!file || file !== name.replace(/\\/g, '/')) throw new Error('invalid asset')
    try {
      const { bytes, etag } = await readDocument(join(this.assetsDir, 'doc'), file)
      return { bytes, type: mimeOf(file), etag }
    } catch {
      throw new Error('not found')
    }
  }

  private liveAssetNames() {
    const live = new Set<string>()
    if (!this.db) return live
    const bodies = this.db.prepare('SELECT notes FROM pages').all() as Array<{ notes?: string }>
    for (const row of bodies) {
      for (const asset of collectPageAssetNames(row.notes ?? '')) live.add(asset)
    }
    const tables = this.db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`).all() as Array<{ name: string }>
    const names = new Set(tables.map((row) => row.name))
    if (names.has('record_banners')) {
      const banners = this.db.prepare('SELECT html FROM record_banners').all() as Array<{ html?: string }>
      for (const row of banners) {
        for (const asset of collectPageAssetNames(row.html ?? '')) live.add(asset)
      }
    }
    if (names.has('content_refs')) {
      for (const row of this.db.prepare('SELECT name FROM content_refs').all() as Array<{ name: string }>) live.add(row.name)
    }
    if (names.has('block_refs')) {
      for (const row of this.db.prepare('SELECT name FROM block_refs').all() as Array<{ name: string }>) live.add(row.name)
    }
    if (names.has('attachments')) {
      for (const row of this.db.prepare(`SELECT name FROM attachments WHERE kind = 'core'`).all() as Array<{ name: string }>) {
        live.add(row.name)
      }
    }
    return live
  }

  private async gcCasAssets(opts?: { graceMs?: number; now?: number }) {
    if (!this.db) return
    const graceMs = opts?.graceMs ?? ASSET_GC_GRACE_MS
    const now = opts?.now ?? Date.now()
    const live = this.liveAssetNames()
    const core = new Set<string>()
    const tables = this.db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`).all() as Array<{ name: string }>
    if (tables.some((row) => row.name === 'attachments')) {
      for (const row of this.db.prepare(`SELECT name FROM attachments WHERE kind = 'core'`).all() as Array<{ name: string }>) {
        core.add(row.name)
      }
    }
    for (const file of listCasAssetFiles(join(this.assetsDir, 'cas'))) {
      if (live.has(file.name) || core.has(file.name)) continue
      if (now - file.mtimeMs < graceMs) continue
      try {
        await unlink(file.path)
      } catch {
        /* gone */
      }
    }
    for (const file of listDocAssetFiles(join(this.assetsDir, 'doc'))) {
      if (live.has(file.name) || core.has(file.name)) continue
      if (now - file.mtimeMs < graceMs) continue
      try {
        await unlink(file.path)
      } catch {
        /* gone */
      }
    }
  }

  async gcAssets(opts?: { graceMs?: number; now?: number }) {
    await this.openDb()
    adoptCasAssets(this.fs.resolve(DATA_DIR_NAME))
    await this.gcCasAssets(opts)
  }

  private async write(row: PageRow) {
    await this.openDb()
    this.upsert(row)
  }
}

type SqlPage = {
  id: string
  title: string
  notes?: string
  parent_id: string | null
  depends_on_json: string
  emoji: string
  created_at: number
  updated_at: number
}

function parseJson<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function sqlValues(row: PageRow) {
  return [
    row.id,
    row.title,
    row.notes ?? '',
    row.parentId,
    JSON.stringify(row.dependsOn),
    row.emoji,
    row.createdAt,
    row.updatedAt,
  ]
}

function rowFromSql(row: SqlPage): PageRow {
  return {
    id: row.id,
    title: row.title,
    tags: [],
    notes: row.notes ?? '',
    parentId: row.parent_id == null || row.parent_id === '' ? null : String(row.parent_id),
    dependsOn: asStringList(parseJson(row.depends_on_json ?? '[]', [])),
    facet: emptySchemaValue(),
    emoji: row.emoji ?? '',
    createdAt: Number(row.created_at) || 0,
    updatedAt: Number(row.updated_at) || 0,
  }
}

function mimeOf(name: string) {
  const ext = name.toLowerCase().slice(name.lastIndexOf('.'))
  if (ext === '.png') return 'image/png'
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg'
  if (ext === '.gif') return 'image/gif'
  if (ext === '.webp') return 'image/webp'
  if (ext === '.svg') return 'image/svg+xml'
  if (ext === '.avif') return 'image/avif'
  if (ext === '.bmp') return 'image/bmp'
  if (ext === '.json' || ext === '.excalidraw') return 'application/json; charset=utf-8'
  if (ext === '.zip') return 'application/zip'
  if (ext === '.pdf') return 'application/pdf'
  return 'application/octet-stream'
}
