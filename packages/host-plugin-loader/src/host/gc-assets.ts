import { unlink } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { assetNamesFromHtml, assetNamesFromMarkdown, collectAssetNamesLoose } from '../../../type-file-system/src/asset-ref.ts'
import { listCasAssetFiles, listDocAssetFiles } from './adopt-cas-assets.ts'
import { hasEditorContent } from './editor-content.ts'
import { tableColumnNames, tableNames } from './biu-schema.ts'

type DatabaseSync = import('node:sqlite').DatabaseSync

export const ASSET_GC_GRACE_MS = 24 * 60 * 60 * 1000
export const ASSET_GC_CANDIDATE_MS = 30 * 24 * 60 * 60 * 1000
export const ASSET_GC_FUSE_RATIO = 0.2
export const ASSET_GC_FUSE_MIN = 8

function parseFrontmatterBody(text: string) {
  const normalized = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n')
  if (!normalized.startsWith('---\n')) return normalized
  const end = normalized.indexOf('\n---', 3)
  if (end < 0) return normalized
  return normalized.slice(end + 4).replace(/^[^\n]*\n?/, '').trim()
}

function addPrecise(live: Set<string>, markdown: string) {
  for (const name of assetNamesFromMarkdown(markdown)) live.add(name)
}

function addLoose(maybe: Set<string>, text: string) {
  for (const name of collectAssetNamesLoose(text)) maybe.add(name)
}

function scanSkillFiles(dataDir: string | undefined, live: Set<string>, maybe: Set<string>) {
  const root = dataDir ? join(dataDir, 'skill') : ''
  if (!root || !existsSync(root)) return
  for (const name of readdirSync(root)) {
    if (!name.endsWith('.md')) continue
    const path = join(root, name)
    if (!statSync(path).isFile()) continue
    const body = parseFrontmatterBody(readFileSync(path, 'utf8'))
    addPrecise(live, body)
    addLoose(maybe, body)
  }
}

function scanPluginReadmes(workspace: string | undefined, live: Set<string>, maybe: Set<string>) {
  if (!workspace) return
  for (const tree of ['.plugin-dev', '.plugin']) {
    const root = join(workspace, tree)
    if (!existsSync(root) || !statSync(root).isDirectory()) continue
    for (const id of readdirSync(root)) {
      const readme = join(root, id, 'README.md')
      if (!existsSync(readme) || !statSync(readme).isFile()) continue
      const body = readFileSync(readme, 'utf8')
      addPrecise(live, body)
      addLoose(maybe, body)
    }
  }
}

function scanBodies(db: DatabaseSync, live: Set<string>, maybe: Set<string>) {
  const tables = new Set(tableNames(db))
  if (tables.has('content_refs')) {
    for (const row of db.prepare('SELECT name FROM content_refs').all() as Array<{ name: string }>) {
      live.add(row.name)
    }
  }
  if (hasEditorContent(db)) {
    for (const row of db.prepare('SELECT body FROM editor_content').all() as Array<{ body?: string }>) {
      addPrecise(live, row.body ?? '')
      addLoose(maybe, row.body ?? '')
    }
  }
  if (tables.has('pages') && tableColumnNames(db, 'pages').includes('notes')) {
    for (const row of db.prepare('SELECT notes FROM pages').all() as Array<{ notes?: string }>) {
      addPrecise(live, row.notes ?? '')
      addLoose(maybe, row.notes ?? '')
    }
  }
  if (tables.has('tasks') && tableColumnNames(db, 'tasks').includes('description')) {
    for (const row of db.prepare('SELECT description FROM tasks').all() as Array<{ description?: string }>) {
      addPrecise(live, row.description ?? '')
      addLoose(maybe, row.description ?? '')
    }
  }
  if (tables.has('facets') && tableColumnNames(db, 'facets').includes('notes')) {
    for (const row of db.prepare('SELECT notes FROM facets').all() as Array<{ notes?: string }>) {
      addPrecise(live, row.notes ?? '')
      addLoose(maybe, row.notes ?? '')
    }
  }
  if (tables.has('record_banners')) {
    for (const row of db.prepare('SELECT html FROM record_banners').all() as Array<{ html?: string }>) {
      for (const name of assetNamesFromHtml(row.html ?? '')) live.add(name)
      addLoose(maybe, row.html ?? '')
    }
  }
  if (tables.has('block_refs')) {
    for (const row of db.prepare('SELECT name FROM block_refs').all() as Array<{ name: string }>) live.add(row.name)
  }
  if (tables.has('attachments')) {
    for (const row of db.prepare(`SELECT name FROM attachments WHERE kind = 'core'`).all() as Array<{ name: string }>) {
      live.add(row.name)
    }
  }
}

export function collectAssetEvidence(db: DatabaseSync, opts?: { dataDir?: string; workspace?: string }) {
  const live = new Set<string>()
  const maybe = new Set<string>()
  scanBodies(db, live, maybe)
  scanSkillFiles(opts?.dataDir, live, maybe)
  scanPluginReadmes(opts?.workspace, live, maybe)
  for (const name of live) maybe.delete(name)
  return { live, maybe }
}

export function liveAssetNames(db: DatabaseSync, opts?: { dataDir?: string; workspace?: string }) {
  return collectAssetEvidence(db, opts).live
}

export function maybeAssetNames(db: DatabaseSync, opts?: { dataDir?: string; workspace?: string }) {
  return collectAssetEvidence(db, opts).maybe
}

function ensureCandidates(db: DatabaseSync) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS gc_candidates (
      name TEXT PRIMARY KEY,
      first_seen INTEGER NOT NULL,
      last_seen INTEGER NOT NULL
    )
  `)
}

type ListedFile = { name: string; path: string; mtimeMs: number; graceMs: number }

export async function gcCasAssets(opts: {
  db: DatabaseSync
  assetsDir: string
  dataDir?: string
  workspace?: string
  graceMs?: number
  now?: number
  candidateMs?: number
  fuseRatio?: number
  fuseMin?: number
}) {
  const graceMs = opts.graceMs ?? ASSET_GC_GRACE_MS
  const candidateMs = opts.candidateMs ?? ASSET_GC_CANDIDATE_MS
  const fuseRatio = opts.fuseRatio ?? ASSET_GC_FUSE_RATIO
  const fuseMin = opts.fuseMin ?? ASSET_GC_FUSE_MIN
  const now = opts.now ?? Date.now()
  const ctx = { dataDir: opts.dataDir, workspace: opts.workspace }
  const { live } = collectAssetEvidence(opts.db, ctx)
  ensureCandidates(opts.db)
  const get = opts.db.prepare('SELECT first_seen FROM gc_candidates WHERE name = ?')
  const upsert = opts.db.prepare(
    `INSERT INTO gc_candidates(name, first_seen, last_seen) VALUES(?, ?, ?)
     ON CONFLICT(name) DO UPDATE SET last_seen = excluded.last_seen`,
  )
  const drop = opts.db.prepare('DELETE FROM gc_candidates WHERE name = ?')
  const files: ListedFile[] = [
    ...listCasAssetFiles(join(opts.assetsDir, 'hash')).map((file) => ({ ...file, graceMs: 0 })),
    ...listDocAssetFiles(join(opts.assetsDir, 'name')).map((file) => ({ ...file, graceMs })),
  ]
  const doomed: ListedFile[] = []
  for (const file of files) {
    if (live.has(file.name)) {
      drop.run(file.name)
      continue
    }
    const row = get.get(file.name) as { first_seen?: number } | undefined
    const first = Number(row?.first_seen) || Math.max(now, file.mtimeMs + file.graceMs)
    if (first > now) continue
    upsert.run(file.name, first, now)
    if (now - first < candidateMs) continue
    doomed.push(file)
  }
  const fused = doomed.length > 0 && files.length >= fuseMin && doomed.length / files.length > fuseRatio
  if (fused) {
    console.warn(
      `[asset-gc] fuse: skip deleting ${doomed.length}/${files.length} files (${doomed.map((file) => file.name).join(', ')})`,
    )
    return { deleted: [] as string[], fused: true }
  }
  const deleted: string[] = []
  for (const file of doomed) {
    try {
      await unlink(file.path)
      drop.run(file.name)
      deleted.push(file.name)
      console.info(`[asset-gc] deleted ${file.name} path=${file.path}`)
    } catch {
      /* gone */
    }
  }
  return { deleted, fused: false }
}

export function workspaceFromSqlite(path: string) {
  if (!path || path === ':memory:') return { dataDir: undefined, workspace: undefined }
  const dataDir = dirname(path)
  return { dataDir, workspace: dirname(dataDir) }
}
