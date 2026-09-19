import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, unlinkSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { createRequire } from 'node:module'
import { hashedAssetName, hashedAssetRel, isHashedAssetName } from './asset-cas.ts'

const HEX2 = /^[0-9a-f]{2}$/i
const ASSET_NAME_RE = /^[\p{L}\p{N}._-]+$/u

function isHex2(name: string) {
  return HEX2.test(name)
}

function isCasShardRoot(name: string) {
  return isHex2(name)
}

export function listCasAssetFiles(root: string): Array<{ name: string; path: string; mtimeMs: number }> {
  const out: Array<{ name: string; path: string; mtimeMs: number }> = []
  if (!existsSync(root)) return out
  for (const ab of readdirSync(root)) {
    if (!isHex2(ab)) continue
    const abDir = join(root, ab)
    if (!statSync(abDir).isDirectory()) continue
    for (const cd of readdirSync(abDir)) {
      if (!isHex2(cd)) continue
      const cdDir = join(abDir, cd)
      if (!statSync(cdDir).isDirectory()) continue
      for (const name of readdirSync(cdDir)) {
        if (!isHashedAssetName(name)) continue
        const path = join(cdDir, name)
        if (!statSync(path).isFile()) continue
        out.push({ name, path, mtimeMs: statSync(path).mtimeMs })
      }
    }
  }
  return out
}

function gatherTree(dir: string, out: string[]) {
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return
  for (const name of readdirSync(dir)) {
    if (name === '.gitkeep') continue
    const path = join(dir, name)
    const stat = statSync(path)
    if (stat.isDirectory()) gatherTree(path, out)
    else if (stat.isFile()) out.push(path)
  }
}

function collectLegacyFiles(biuDir: string) {
  const cas = join(biuDir, 'assets')
  const out: string[] = []
  gatherTree(join(cas, 'page'), out)
  const dbDir = join(cas, 'db')
  if (existsSync(dbDir) && statSync(dbDir).isDirectory()) {
    for (const name of readdirSync(dbDir)) {
      const path = join(dbDir, name)
      const stat = statSync(path)
      if (stat.isFile() && name !== '.gitkeep') out.push(path)
      else if (stat.isDirectory() && !isCasShardRoot(name)) gatherTree(path, out)
    }
  }
  if (existsSync(cas) && statSync(cas).isDirectory()) {
    for (const name of readdirSync(cas)) {
      if (name === 'page' || name === 'cas' || name === 'doc' || name === '.gitkeep') continue
      const path = join(cas, name)
      const stat = statSync(path)
      if (stat.isFile()) out.push(path)
    }
  }
  gatherTree(join(biuDir, 'page', 'assets'), out)
  return [...new Set(out)]
}

function moveToCas(casRoot: string, from: string) {
  const bytes = readFileSync(from)
  const logical = basename(from)
  const name = hashedAssetName(bytes, logical)
  const dest = join(casRoot, hashedAssetRel(name))
  mkdirSync(dirname(dest), { recursive: true })
  if (existsSync(dest)) {
    if (resolveSafe(from) !== resolveSafe(dest)) unlinkSync(from)
  } else if (dirname(from) === dirname(dest) && basename(from) === basename(dest)) {
    /* already there */
  } else {
    try {
      renameSync(from, dest)
    } catch {
      copyFileSync(from, dest)
      unlinkSync(from)
    }
  }
  return { logical, name }
}

function resolveSafe(path: string) {
  return path.replace(/\\/g, '/')
}

export function rewriteAssetText(text: string, map: Map<string, string>) {
  let out = text
  const keys = [...map.keys()].sort((a, b) => b.length - a.length)
  for (const from of keys) {
    const to = map.get(from)
    if (!to || from === to) continue
    if (!ASSET_NAME_RE.test(from)) continue
    out = out.split(`/api/page/file/${from}`).join(`/api/db/file/${to}`)
    out = out.split(`/api/db/file/${from}`).join(`/api/db/file/${to}`)
    out = out.split(`.page/assets/${from}`).join(`/api/db/file/${to}`)
    out = out.split(`assets/${from}`).join(`/api/db/file/${to}`)
  }
  return out
}

function ensureRefTables(db: import('node:sqlite').DatabaseSync) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS attachments (
      name TEXT PRIMARY KEY,
      etag TEXT NOT NULL,
      mime TEXT NOT NULL,
      bytes INTEGER NOT NULL,
      kind TEXT NOT NULL DEFAULT 'asset',
      storage TEXT NOT NULL DEFAULT 'cas',
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS content_refs (
      collection TEXT NOT NULL,
      record_id TEXT NOT NULL,
      name TEXT NOT NULL,
      source TEXT NOT NULL,
      PRIMARY KEY (collection, record_id, name, source)
    );
    CREATE TABLE IF NOT EXISTS block_refs (
      collection TEXT NOT NULL,
      record_id TEXT NOT NULL,
      block_id TEXT NOT NULL,
      name TEXT NOT NULL,
      source TEXT NOT NULL,
      PRIMARY KEY (collection, record_id, block_id, name, source)
    );
  `)
  try {
    const cols = db.prepare('PRAGMA table_info(attachments)').all() as Array<{ name: string }>
    if (!cols.some((col) => col.name === 'storage')) {
      db.exec(`ALTER TABLE attachments ADD COLUMN storage TEXT NOT NULL DEFAULT 'cas'`)
    }
  } catch {
    /* dummy sqlite */
  }
}

function hasTable(db: import('node:sqlite').DatabaseSync, name: string) {
  const row = db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`).get(name) as { name?: string } | undefined
  return Boolean(row?.name)
}

function remapName(db: import('node:sqlite').DatabaseSync, from: string, to: string) {
  if (from === to) return
  const hit = db.prepare('SELECT name FROM attachments WHERE name = ?').get(to) as { name?: string } | undefined
  if (hit) db.prepare('DELETE FROM attachments WHERE name = ?').run(from)
  else db.prepare('UPDATE attachments SET name = ?, etag = ? WHERE name = ?').run(to, to, from)

  const content = db.prepare('SELECT collection, record_id, source FROM content_refs WHERE name = ?').all(from) as Array<{
    collection: string
    record_id: string
    source: string
  }>
  for (const row of content) {
    db.prepare('DELETE FROM content_refs WHERE collection = ? AND record_id = ? AND name = ? AND source = ?').run(
      row.collection,
      row.record_id,
      from,
      row.source,
    )
    db.prepare('INSERT OR IGNORE INTO content_refs (collection, record_id, name, source) VALUES (?, ?, ?, ?)').run(
      row.collection,
      row.record_id,
      to,
      row.source,
    )
  }

  const blocks = db.prepare('SELECT collection, record_id, block_id, source FROM block_refs WHERE name = ?').all(from) as Array<{
    collection: string
    record_id: string
    block_id: string
    source: string
  }>
  for (const row of blocks) {
    db.prepare('DELETE FROM block_refs WHERE collection = ? AND record_id = ? AND block_id = ? AND name = ? AND source = ?').run(
      row.collection,
      row.record_id,
      row.block_id,
      from,
      row.source,
    )
    db.prepare(
      'INSERT OR IGNORE INTO block_refs (collection, record_id, block_id, name, source) VALUES (?, ?, ?, ?, ?)',
    ).run(row.collection, row.record_id, row.block_id, to, row.source)
  }
}

function collectNames(text: string) {
  const names = new Set<string>()
  const re = /(?:(?:\.page\/)?assets\/|\/api\/(?:page|db|doc)\/file\/)([\p{L}\p{N}._-]+)/gu
  for (const match of text.matchAll(re)) {
    const name = match[1] ?? ''
    if (name && ASSET_NAME_RE.test(name)) names.add(name)
  }
  return names
}

function rescanContentRefs(db: import('node:sqlite').DatabaseSync) {
  if (!hasTable(db, 'content_refs')) return
  const grouped = new Map<string, { content: Set<string>; banner: Set<string> }>()
  const bucket = (collection: string, recordId: string) => {
    const key = `${collection}\0${recordId}`
    let hit = grouped.get(key)
    if (!hit) {
      hit = { content: new Set(), banner: new Set() }
      grouped.set(key, hit)
    }
    return hit
  }
  if (hasTable(db, 'pages')) {
    const rows = db.prepare('SELECT id, notes FROM pages').all() as Array<{ id: string; notes?: string }>
    for (const row of rows) {
      const names = collectNames(row.notes ?? '')
      const bucketed = bucket('/pages', row.id)
      for (const name of names) bucketed.content.add(name)
    }
  }
  if (hasTable(db, 'record_banners')) {
    const rows = db.prepare('SELECT collection, record_id, html FROM record_banners').all() as Array<{
      collection: string
      record_id: string
      html?: string
    }>
    for (const row of rows) {
      const names = collectNames(row.html ?? '')
      const bucketed = bucket(row.collection, row.record_id)
      for (const name of names) bucketed.banner.add(name)
    }
  }
  const insert = db.prepare('INSERT OR IGNORE INTO content_refs (collection, record_id, name, source) VALUES (?, ?, ?, ?)')
  for (const [key, sets] of grouped) {
    const at = key.indexOf('\0')
    const collection = key.slice(0, at)
    const recordId = key.slice(at + 1)
    db.prepare('DELETE FROM content_refs WHERE collection = ? AND record_id = ?').run(collection, recordId)
    for (const name of sets.content) insert.run(collection, recordId, name, 'content')
    for (const name of sets.banner) insert.run(collection, recordId, name, 'banner')
  }
}

function rewriteSqlite(biuDir: string, map: Map<string, string>) {
  const sqlitePath = join(biuDir, 'biu.sqlite')
  if (!existsSync(sqlitePath) || !map.size) return
  const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite')
  let db: import('node:sqlite').DatabaseSync
  try {
    db = new DatabaseSync(sqlitePath)
  } catch {
    return
  }
  try {
    try {
      ensureRefTables(db)
    } catch {
      return
    }
    db.exec('BEGIN IMMEDIATE')
    try {
      for (const [from, to] of map) remapName(db, from, to)
      if (hasTable(db, 'pages')) {
        const rows = db.prepare('SELECT id, notes FROM pages').all() as Array<{ id: string; notes?: string }>
        const update = db.prepare('UPDATE pages SET notes = ? WHERE id = ?')
        for (const row of rows) {
          const next = rewriteAssetText(row.notes ?? '', map)
          if (next !== (row.notes ?? '')) update.run(next, row.id)
        }
      }
      if (hasTable(db, 'record_banners')) {
        const rows = db.prepare('SELECT collection, record_id, html FROM record_banners').all() as Array<{
          collection: string
          record_id: string
          html?: string
        }>
        const update = db.prepare('UPDATE record_banners SET html = ? WHERE collection = ? AND record_id = ?')
        for (const row of rows) {
          const next = rewriteAssetText(row.html ?? '', map)
          if (next !== (row.html ?? '')) update.run(next, row.collection, row.record_id)
        }
      }
      rescanContentRefs(db)
      db.exec('COMMIT')
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    }
  } finally {
    db.close()
  }
}

function rmEmptyDir(dir: string) {
  if (!existsSync(dir)) return
  try {
    rmSync(dir, { recursive: true, force: true })
  } catch {
    /* busy */
  }
}

function cleanDbLayer(dbDir: string) {
  if (!existsSync(dbDir) || !statSync(dbDir).isDirectory()) return
  for (const name of readdirSync(dbDir)) {
    if (isCasShardRoot(name)) continue
    rmSync(join(dbDir, name), { recursive: true, force: true })
  }
}

function nestCasShards(assetsDir: string) {
  const casRoot = join(assetsDir, 'cas')
  mkdirSync(casRoot, { recursive: true })
  if (!existsSync(assetsDir)) return
  for (const name of readdirSync(assetsDir)) {
    if (name === 'cas' || name === 'doc' || name === 'page') continue
    if (!isHex2(name)) continue
    const from = join(assetsDir, name)
    if (!statSync(from).isDirectory()) continue
    const to = join(casRoot, name)
    if (!existsSync(to)) {
      renameSync(from, to)
      continue
    }
    const leftover: string[] = []
    gatherTree(from, leftover)
    for (const file of leftover) {
      const rel = file.slice(from.length + 1)
      const dest = join(to, rel)
      mkdirSync(dirname(dest), { recursive: true })
      if (!existsSync(dest)) {
        try {
          renameSync(file, dest)
        } catch {
          copyFileSync(file, dest)
          unlinkSync(file)
        }
      } else unlinkSync(file)
    }
    rmEmptyDir(from)
  }
}

export function listDocAssetFiles(root: string): Array<{ name: string; path: string; mtimeMs: number }> {
  const out: Array<{ name: string; path: string; mtimeMs: number }> = []
  if (!existsSync(root) || !statSync(root).isDirectory()) return out
  for (const name of readdirSync(root)) {
    if (name === '.gitkeep') continue
    const path = join(root, name)
    if (!statSync(path).isFile()) continue
    out.push({ name, path, mtimeMs: statSync(path).mtimeMs })
  }
  return out
}

/** Fold leftover page/db trees and root CAS shards into `.biu/assets/cas/<ab>/<cd>/<hash>.<ext>`. */
export function adoptCasAssets(biuDir: string) {
  if (!existsSync(biuDir)) return
  const assetsDir = join(biuDir, 'assets')
  const casRoot = join(assetsDir, 'cas')
  mkdirSync(casRoot, { recursive: true })
  mkdirSync(join(assetsDir, 'doc'), { recursive: true })
  const map = new Map<string, string>()
  for (const from of collectLegacyFiles(biuDir)) {
    try {
      const { logical, name } = moveToCas(casRoot, from)
      if (ASSET_NAME_RE.test(logical)) map.set(logical, name)
    } catch {
      /* skip unreadable */
    }
  }
  rewriteSqlite(biuDir, map)
  rmEmptyDir(join(assetsDir, 'page'))
  rmEmptyDir(join(biuDir, 'page', 'assets'))
  cleanDbLayer(join(assetsDir, 'db'))
  nestCasShards(assetsDir)
}
