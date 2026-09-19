import { unlink } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { collectAssetNamesFromText } from './collect-asset-names.ts'
import { listCasAssetFiles, listDocAssetFiles } from './adopt-cas-assets.ts'
import { hasEditorContent } from './editor-content.ts'
import { tableColumnNames, tableNames } from './biu-schema.ts'

type DatabaseSync = import('node:sqlite').DatabaseSync

export const ASSET_GC_GRACE_MS = 24 * 60 * 60 * 1000

function parseFrontmatterBody(text: string) {
  const normalized = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n')
  if (!normalized.startsWith('---\n')) return normalized
  const end = normalized.indexOf('\n---', 3)
  if (end < 0) return normalized
  return normalized.slice(end + 4).replace(/^[^\n]*\n?/, '').trim()
}

function addNames(live: Set<string>, text: string) {
  for (const name of collectAssetNamesFromText(text)) live.add(name)
}

function scanSkillFiles(dataDir?: string) {
  const live = new Set<string>()
  const root = dataDir ? join(dataDir, 'skill') : ''
  if (!root || !existsSync(root)) return live
  for (const name of readdirSync(root)) {
    if (!name.endsWith('.md')) continue
    const path = join(root, name)
    if (!statSync(path).isFile()) continue
    addNames(live, parseFrontmatterBody(readFileSync(path, 'utf8')))
  }
  return live
}

function scanPluginReadmes(workspace?: string) {
  const live = new Set<string>()
  if (!workspace) return live
  for (const tree of ['.plugin-dev', '.plugin']) {
    const root = join(workspace, tree)
    if (!existsSync(root) || !statSync(root).isDirectory()) continue
    for (const id of readdirSync(root)) {
      const readme = join(root, id, 'README.md')
      if (!existsSync(readme) || !statSync(readme).isFile()) continue
      addNames(live, readFileSync(readme, 'utf8'))
    }
  }
  return live
}

export function liveAssetNames(db: DatabaseSync, opts?: { dataDir?: string; workspace?: string }) {
  const live = new Set<string>()
  const tables = new Set(tableNames(db))
  if (hasEditorContent(db)) {
    for (const row of db.prepare('SELECT body FROM editor_content').all() as Array<{ body?: string }>) {
      addNames(live, row.body ?? '')
    }
  }
  if (tables.has('pages') && tableColumnNames(db, 'pages').includes('notes')) {
    for (const row of db.prepare('SELECT notes FROM pages').all() as Array<{ notes?: string }>) addNames(live, row.notes ?? '')
  }
  if (tables.has('tasks') && tableColumnNames(db, 'tasks').includes('description')) {
    for (const row of db.prepare('SELECT description FROM tasks').all() as Array<{ description?: string }>) {
      addNames(live, row.description ?? '')
    }
  }
  if (tables.has('facets') && tableColumnNames(db, 'facets').includes('notes')) {
    for (const row of db.prepare('SELECT notes FROM facets').all() as Array<{ notes?: string }>) addNames(live, row.notes ?? '')
  }
  if (tables.has('record_banners')) {
    for (const row of db.prepare('SELECT html FROM record_banners').all() as Array<{ html?: string }>) {
      addNames(live, row.html ?? '')
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
  for (const name of scanSkillFiles(opts?.dataDir)) live.add(name)
  for (const name of scanPluginReadmes(opts?.workspace)) live.add(name)
  return live
}

export async function gcCasAssets(opts: {
  db: DatabaseSync
  assetsDir: string
  dataDir?: string
  workspace?: string
  graceMs?: number
  now?: number
}) {
  const graceMs = opts.graceMs ?? ASSET_GC_GRACE_MS
  const now = opts.now ?? Date.now()
  const live = liveAssetNames(opts.db, { dataDir: opts.dataDir, workspace: opts.workspace })
  for (const file of [...listCasAssetFiles(join(opts.assetsDir, 'hash')), ...listDocAssetFiles(join(opts.assetsDir, 'name'))]) {
    if (live.has(file.name)) continue
    if (now - file.mtimeMs < graceMs) continue
    try {
      await unlink(file.path)
    } catch {
      /* gone */
    }
  }
}

export function workspaceFromSqlite(path: string) {
  if (!path || path === ':memory:') return { dataDir: undefined, workspace: undefined }
  const dataDir = dirname(path)
  return { dataDir, workspace: dirname(dataDir) }
}
