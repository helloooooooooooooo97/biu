import { mkdir, unlink } from 'node:fs/promises'
import { basename, join } from 'node:path'
import type { DbRecord, SchemaFieldValue } from '@biu/type-file-system'
import { emptySchemaValue, isAssetFileName, normalizeSchemaValue } from '@biu/type-file-system'
import {
  DATA_DIR_NAME,
  adoptCasAssets,
  assetsRootPath,
  dataHome,
  migrateLegacyPageDir,
  openAndMigrateBiu,
  PAGE_DB,
  PAGE_ROOT,
  readDocument,
  writeDocument,
  AssetConflictError,
  upsertAttachmentRow,
  writeEditorContent,
  readEditorContent,
  gcCasAssets,
  ASSET_GC_GRACE_MS as SHARED_ASSET_GC_GRACE_MS,
  workspaceFromSqlite,
} from '@biu/host-plugin-loader/data-dir'
import { splitMarkdown } from './markdown.ts'

export { PAGE_ROOT, PAGE_DB, PAGE_ASSETS } from '@biu/host-plugin-loader/data-dir'
export { AssetConflictError as PageAssetConflictError } from '@biu/host-plugin-loader/data-dir'
export const ASSET_GC_GRACE_MS = SHARED_ASSET_GC_GRACE_MS

const ID_RE = /^[A-Za-z0-9._-]+$/

export function isPageAssetFileName(name: string) {
  return isAssetFileName(name)
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
    const db = openAndMigrateBiu(this.fs.resolve(PAGE_DB), { foreignKeys: false })
    this.db = db
    await this.migrateMarkdown()
    adoptCasAssets(this.fs.resolve(DATA_DIR_NAME))
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
        const hit = this.db.prepare('SELECT id FROM pages WHERE id = ?').get(id) as { id?: string } | undefined
        if (!hit) this.upsert(row)
        else if (!readEditorContent(this.db, '/pages', id).trim() && row.notes) this.upsert(row)
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
        id, title, parent_id,
        depends_on_json, emoji, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        title=excluded.title,
        parent_id=excluded.parent_id, depends_on_json=excluded.depends_on_json, emoji=excluded.emoji,
        updated_at=excluded.updated_at
    `).run(row.id, row.title, row.parentId, JSON.stringify(row.dependsOn), row.emoji, row.createdAt, row.updatedAt)
    writeEditorContent(this.db, '/pages', row.id, row.notes, { transaction: false })
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
      SELECT id, title, parent_id,
        depends_on_json, emoji, created_at, updated_at
      FROM pages WHERE id = ?
    `).get(id) as SqlPage | undefined
    if (!hit) return null
    const row = rowFromSql(hit)
    row.notes = readEditorContent(db, '/pages', id)
    return row
  }

  async update(id: string, patch: Record<string, unknown>): Promise<PageRow> {
    const current = await this.get(id)
    if (!current) throw new Error(`unknown page: ${id}`)
    const next = applyPatch(current, patch)
    await this.write(next)
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
  }

  async writeAsset(name: string, content: string | Buffer | Uint8Array, opts?: { etag?: string }) {
    const file = basename(name)
    if (!file || file !== name.replace(/\\/g, '/') || !isPageAssetFileName(file)) throw new Error('invalid asset')
    const written = await writeDocument(join(this.assetsDir, 'name'), file, content, opts)
    const db = await this.openDb()
    upsertAttachmentRow(db, {
      name: written.name,
      etag: written.etag,
      mime: mimeOf(written.name),
      bytes: written.bytes.length,
      kind: 'asset',
      storage: 'name',
    })
    return { name: written.name, href: fileUrl(written.name), etag: written.etag }
  }

  async readAsset(name: string): Promise<{ bytes: Buffer; type: string; etag: string }> {
    const file = basename(name)
    if (!file || file !== name.replace(/\\/g, '/')) throw new Error('invalid asset')
    try {
      const { bytes, etag } = await readDocument(join(this.assetsDir, 'name'), file)
      return { bytes, type: mimeOf(file), etag }
    } catch {
      throw new Error('not found')
    }
  }

  private async runGc(opts?: { graceMs?: number; now?: number; candidateMs?: number }) {
    if (!this.db) return
    const sqlitePath = this.fs.resolve(PAGE_DB)
    await gcCasAssets({
      db: this.db,
      assetsDir: this.assetsDir,
      ...workspaceFromSqlite(sqlitePath),
      graceMs: opts?.graceMs,
      now: opts?.now,
      candidateMs: opts?.candidateMs,
    })
  }

  async gcAssets(opts?: { graceMs?: number; now?: number; candidateMs?: number }) {
    await this.openDb()
    adoptCasAssets(this.fs.resolve(DATA_DIR_NAME))
    await this.runGc(opts)
  }

  private async write(row: PageRow) {
    await this.openDb()
    this.upsert(row)
  }
}

type SqlPage = {
  id: string
  title: string
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

function rowFromSql(row: SqlPage): PageRow {
  return {
    id: row.id,
    title: row.title,
    tags: [],
    notes: '',
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
