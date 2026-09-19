import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, unlinkSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { contentAddressHash, hashedAssetName, hashedAssetRel, isHashedAssetName } from './asset-cas.ts'
import { ensureBiuAssetSchema, tableColumnNames } from './biu-schema.ts'
import { openSqlite } from './sqlite-open.ts'
import { rebuildContentRefs } from './editor-content.ts'

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
      if (name === 'page' || name === 'cas' || name === 'doc' || name === 'hash' || name === 'name' || name === '.gitkeep') continue
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

export function ensureRefTables(db: import('node:sqlite').DatabaseSync) {
  ensureBiuAssetSchema(db)
}

function hasTable(db: import('node:sqlite').DatabaseSync, name: string) {
  const row = db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`).get(name) as { name?: string } | undefined
  return Boolean(row?.name)
}

function mimeGuess(name: string) {
  const ext = name.toLowerCase().slice(name.lastIndexOf('.'))
  if (ext === '.png') return 'image/png'
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg'
  if (ext === '.gif') return 'image/gif'
  if (ext === '.webp') return 'image/webp'
  if (ext === '.svg') return 'image/svg+xml'
  if (ext === '.pdf') return 'application/pdf'
  if (ext === '.json' || ext === '.excalidraw' || ext === '.timeline') return 'application/json; charset=utf-8'
  if (ext === '.html' || ext === '.htm') return 'text/html; charset=utf-8'
  if (ext === '.txt' || ext === '.md') return 'text/plain; charset=utf-8'
  if (ext === '.mp3') return 'audio/mpeg'
  if (ext === '.mp4') return 'video/mp4'
  return 'application/octet-stream'
}

export function upsertAttachmentRow(
  db: import('node:sqlite').DatabaseSync,
  row: { name: string; etag: string; mime: string; bytes: number; kind?: string; storage?: string },
) {
  ensureRefTables(db)
  const kind = row.kind === 'core' ? 'core' : 'asset'
  const storage = row.storage === 'name' || row.storage === 'doc' ? 'name' : 'hash'
  db.prepare(
    `INSERT INTO attachments (name, etag, mime, bytes, kind, storage, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(name) DO UPDATE SET
       etag = excluded.etag,
       mime = excluded.mime,
       bytes = excluded.bytes,
       storage = excluded.storage,
       kind = CASE WHEN attachments.kind = 'core' OR excluded.kind = 'core' THEN 'core' ELSE excluded.kind END`,
  ).run(row.name, row.etag, row.mime, row.bytes, kind, storage, Date.now())
}

function parseIndexAssets(raw: string): string[] {
  try {
    const data = JSON.parse(raw) as { assets?: unknown }
    if (!Array.isArray(data.assets)) return []
    return data.assets.map((item) => String(item).replace(/^assets\//, '')).filter((name) => ASSET_NAME_RE.test(name))
  } catch {
    return []
  }
}

function rebuildBlockRefsFromIndex(db: import('node:sqlite').DatabaseSync) {
  ensureRefTables(db)
  if (!hasTable(db, 'page_block_index')) return
  db.prepare('DELETE FROM block_refs').run()
  const insert = db.prepare(
    'INSERT OR IGNORE INTO block_refs (collection, record_id, block_id, name, source) VALUES (?, ?, ?, ?, ?)',
  )
  const hasCollection = tableColumnNames(db, 'page_block_index').includes('collection')
  const rows = db
    .prepare(
      hasCollection
        ? 'SELECT collection, page_id, block_id, data_json FROM page_block_index'
        : 'SELECT page_id, block_id, data_json FROM page_block_index',
    )
    .all() as Array<{ collection?: string; page_id: string; block_id: string; data_json: string }>
  const core = new Set<string>()
  for (const row of rows) {
    const collection = row.collection || '/pages'
    for (const name of parseIndexAssets(row.data_json)) {
      insert.run(collection, row.page_id, row.block_id, name, `block:${row.block_id}:core`)
      core.add(name)
    }
  }
  for (const name of core) db.prepare(`UPDATE attachments SET kind = 'core' WHERE name = ?`).run(name)
}

export function replacePageBlockRefs(
  db: import('node:sqlite').DatabaseSync,
  collection: string,
  pageId: string,
  blocks: Array<{ blockId: string; names: Iterable<string> }>,
) {
  ensureRefTables(db)
  db.prepare(`DELETE FROM block_refs WHERE collection = ? AND record_id = ?`).run(collection, pageId)
  const insert = db.prepare(
    'INSERT INTO block_refs (collection, record_id, block_id, name, source) VALUES (?, ?, ?, ?, ?)',
  )
  const core = new Set<string>()
  for (const block of blocks) {
    for (const raw of block.names) {
      const name = String(raw).replace(/^assets\//, '')
      if (!ASSET_NAME_RE.test(name)) continue
      insert.run(collection, pageId, block.blockId, name, `block:${block.blockId}:core`)
      core.add(name)
    }
  }
  for (const name of core) db.prepare(`UPDATE attachments SET kind = 'core' WHERE name = ?`).run(name)
}

function ledgerFromDisk(biuDir: string) {
  const sqlitePath = join(biuDir, 'biu.sqlite')
  if (!existsSync(sqlitePath)) return
  let db: import('node:sqlite').DatabaseSync
  try {
    db = openSqlite(sqlitePath)
  } catch {
    return
  }
  try {
    try {
      ensureRefTables(db)
    } catch {
      return
    }
    for (const file of listCasAssetFiles(join(biuDir, 'assets', 'hash'))) {
      upsertAttachmentRow(db, {
        name: file.name,
        etag: file.name,
        mime: mimeGuess(file.name),
        bytes: statSync(file.path).size,
        kind: 'asset',
        storage: 'hash',
      })
    }
    for (const file of listDocAssetFiles(join(biuDir, 'assets', 'name'))) {
      const buf = readFileSync(file.path)
      upsertAttachmentRow(db, {
        name: file.name,
        etag: contentAddressHash(buf),
        mime: mimeGuess(file.name),
        bytes: buf.length,
        kind: 'asset',
        storage: 'name',
      })
    }
    rebuildBlockRefsFromIndex(db)
  } finally {
    db.close()
  }
}

function remapName(db: import('node:sqlite').DatabaseSync, from: string, to: string) {
  if (from === to) return
  const hit = db.prepare('SELECT name FROM attachments WHERE name = ?').get(to) as { name?: string } | undefined
  if (!hit) db.prepare('UPDATE attachments SET name = ?, etag = ? WHERE name = ?').run(to, to, from)

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

function rescanContentRefs(db: import('node:sqlite').DatabaseSync) {
  rebuildContentRefs(db)
}

function rewriteSqlite(biuDir: string, map: Map<string, string>) {
  const sqlitePath = join(biuDir, 'biu.sqlite')
  if (!existsSync(sqlitePath) || !map.size) return
  let db: import('node:sqlite').DatabaseSync
  try {
    db = openSqlite(sqlitePath)
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
      if (hasTable(db, 'editor_content')) {
        const rows = db.prepare('SELECT collection, record_id, body FROM editor_content').all() as Array<{
          collection: string
          record_id: string
          body?: string
        }>
        const update = db.prepare('UPDATE editor_content SET body = ? WHERE collection = ? AND record_id = ?')
        for (const row of rows) {
          const next = rewriteAssetText(row.body ?? '', map)
          if (next !== (row.body ?? '')) update.run(next, row.collection, row.record_id)
        }
      }
      if (hasTable(db, 'pages') && tableColumnNames(db, 'pages').includes('notes')) {
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

function takeTree(from: string, to: string) {
  if (!existsSync(from) || from === to) return
  mkdirSync(dirname(to), { recursive: true })
  if (!existsSync(to)) {
    renameSync(from, to)
    return
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

function nestCasShards(assetsDir: string) {
  const hashRoot = join(assetsDir, 'hash')
  mkdirSync(hashRoot, { recursive: true })
  if (!existsSync(assetsDir)) return
  for (const name of readdirSync(assetsDir)) {
    if (name === 'cas' || name === 'doc' || name === 'hash' || name === 'name' || name === 'page') continue
    if (!isHex2(name)) continue
    const from = join(assetsDir, name)
    if (!statSync(from).isDirectory()) continue
    const to = join(hashRoot, name)
    if (!existsSync(to)) {
      renameSync(from, to)
      continue
    }
    takeTree(from, to)
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

/** Fold leftover trees into `.biu/assets/hash/<ab>/<cd>/<hash>.<ext>` and `.biu/assets/name/<逻辑名>`. */
export function adoptCasAssets(biuDir: string) {
  if (!existsSync(biuDir)) return
  const assetsDir = join(biuDir, 'assets')
  mkdirSync(assetsDir, { recursive: true })
  takeTree(join(assetsDir, 'cas'), join(assetsDir, 'hash'))
  takeTree(join(assetsDir, 'doc'), join(assetsDir, 'name'))
  const hashRoot = join(assetsDir, 'hash')
  mkdirSync(hashRoot, { recursive: true })
  mkdirSync(join(assetsDir, 'name'), { recursive: true })
  const map = new Map<string, string>()
  for (const from of collectLegacyFiles(biuDir)) {
    try {
      const { logical, name } = moveToCas(hashRoot, from)
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
  ledgerFromDisk(biuDir)
}
