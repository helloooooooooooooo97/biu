import { test } from 'vitest'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync, readFileSync, existsSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DATA_DIR_NAME, LEGACY_DATA_DIR_NAME, LEGACY_PAGE_ROOT, PAGE_DB, PAGE_ROOT, adoptPackedUserData, dataDir, dataHome, dataPath, migrateDataDir, migrateLegacyPageDir } from './data-dir.ts'
import { adoptCasAssets } from './adopt-cas-assets.ts'
import { hashedAssetName, hashedAssetRel } from './asset-cas.ts'

test('migrateDataDir renames .cordis to .biu', () => {
  const root = mkdtempSync(join(tmpdir(), 'biu-dir-'))
  mkdirSync(join(root, LEGACY_DATA_DIR_NAME))
  writeFileSync(join(root, LEGACY_DATA_DIR_NAME, 'sessions.sqlite'), 'old')
  const dest = migrateDataDir(root)
  assert.equal(dest, join(root, DATA_DIR_NAME))
  assert.equal(existsSync(join(root, LEGACY_DATA_DIR_NAME)), false)
  assert.equal(readFileSync(join(dest, 'sessions.sqlite'), 'utf8'), 'old')
})

test('migrateDataDir merges leftover .cordis into existing .biu', () => {
  const root = mkdtempSync(join(tmpdir(), 'biu-merge-'))
  mkdirSync(join(root, DATA_DIR_NAME))
  mkdirSync(join(root, LEGACY_DATA_DIR_NAME, 'assets'), { recursive: true })
  writeFileSync(join(root, DATA_DIR_NAME, 'keep.txt'), 'keep')
  writeFileSync(join(root, LEGACY_DATA_DIR_NAME, 'assets', 'pic.png'), 'img')
  writeFileSync(join(root, LEGACY_DATA_DIR_NAME, 'keep.txt'), 'stale')
  migrateDataDir(root)
  assert.equal(readFileSync(join(root, DATA_DIR_NAME, 'keep.txt'), 'utf8'), 'keep')
  const pic = hashedAssetName(Buffer.from('img'), 'pic.png')
  assert.equal(readFileSync(join(root, DATA_DIR_NAME, 'assets', 'cas', hashedAssetRel(pic)), 'utf8'), 'img')
  assert.equal(existsSync(join(root, DATA_DIR_NAME, 'assets', 'pic.png')), false)
  assert.equal(existsSync(join(root, LEGACY_DATA_DIR_NAME)), false)
})

test('dataPath uses .biu after migrate', () => {
  const root = mkdtempSync(join(tmpdir(), 'biu-path-'))
  mkdirSync(join(root, LEGACY_DATA_DIR_NAME))
  writeFileSync(join(root, LEGACY_DATA_DIR_NAME, 'chat-config.json'), '{}')
  assert.equal(dataDir(root), join(root, DATA_DIR_NAME))
  assert.equal(dataPath(root, 'chat-config.json'), join(root, DATA_DIR_NAME, 'chat-config.json'))
})

test('migrateDataDir moves leftover .page into .biu', () => {
  const root = mkdtempSync(join(tmpdir(), 'biu-page-'))
  mkdirSync(join(root, LEGACY_PAGE_ROOT, 'assets'), { recursive: true })
  writeFileSync(join(root, LEGACY_PAGE_ROOT, 'home.md'), 'hello')
  writeFileSync(join(root, LEGACY_PAGE_ROOT, 'pages.sqlite'), 'db')
  writeFileSync(join(root, LEGACY_PAGE_ROOT, 'assets', 'board.json'), '{}')
  migrateDataDir(root)
  assert.equal(readFileSync(join(root, PAGE_ROOT, 'home.md'), 'utf8'), 'hello')
  assert.equal(readFileSync(join(root, PAGE_DB), 'utf8'), 'db')
  const board = hashedAssetName(Buffer.from('{}'), 'board.json')
  assert.equal(readFileSync(join(root, DATA_DIR_NAME, 'assets', 'cas', hashedAssetRel(board)), 'utf8'), '{}')
  assert.equal(existsSync(join(root, DATA_DIR_NAME, 'assets', 'page')), false)
  assert.equal(existsSync(join(root, DATA_DIR_NAME, 'page', 'assets')), false)
  assert.equal(existsSync(join(root, LEGACY_PAGE_ROOT)), false)
})

test('migrateLegacyPageDir can move between workspace roots', () => {
  const from = mkdtempSync(join(tmpdir(), 'page-from-'))
  const to = mkdtempSync(join(tmpdir(), 'page-to-'))
  mkdirSync(join(from, LEGACY_PAGE_ROOT), { recursive: true })
  writeFileSync(join(from, LEGACY_PAGE_ROOT, 'p001.md'), 'body')
  migrateLegacyPageDir(from, to)
  assert.equal(readFileSync(join(to, PAGE_ROOT, 'p001.md'), 'utf8'), 'body')
  assert.equal(existsSync(join(from, LEGACY_PAGE_ROOT)), false)
})

test('dataHome prefers BIU_HOME over cwd', () => {
  const prev = process.env.BIU_HOME
  const home = mkdtempSync(join(tmpdir(), 'biu-home-'))
  process.env.BIU_HOME = home
  try {
    assert.equal(dataHome(), home)
    assert.equal(dataDir(), join(home, DATA_DIR_NAME))
  } finally {
    if (prev === undefined) delete process.env.BIU_HOME
    else process.env.BIU_HOME = prev
  }
})

test('adoptPackedUserData moves pack-host leftovers into userData and keeps dest files', () => {
  const pack = mkdtempSync(join(tmpdir(), 'biu-pack-'))
  const home = mkdtempSync(join(tmpdir(), 'biu-ud-'))
  const workspace = join(home, 'workspace')
  mkdirSync(join(pack, DATA_DIR_NAME), { recursive: true })
  mkdirSync(join(home, DATA_DIR_NAME), { recursive: true })
  mkdirSync(join(pack, '.plugin-dev', 'demo'), { recursive: true })
  writeFileSync(join(pack, DATA_DIR_NAME, 'sessions.sqlite'), 'old-sessions')
  writeFileSync(join(pack, DATA_DIR_NAME, 'keep.txt'), 'stale')
  writeFileSync(join(home, DATA_DIR_NAME, 'keep.txt'), 'keep')
  writeFileSync(join(pack, '.plugin-dev', 'demo', 'manifest.json'), '{}')
  adoptPackedUserData(pack, home, workspace)
  assert.equal(readFileSync(join(home, DATA_DIR_NAME, 'sessions.sqlite'), 'utf8'), 'old-sessions')
  assert.equal(readFileSync(join(home, DATA_DIR_NAME, 'keep.txt'), 'utf8'), 'keep')
  assert.equal(readFileSync(join(workspace, '.plugin-dev', 'demo', 'manifest.json'), 'utf8'), '{}')
  assert.equal(existsSync(join(pack, '.plugin-dev', 'demo', 'manifest.json')), true)
  assert.equal(existsSync(join(pack, DATA_DIR_NAME)), false)
})

test('migrateDataDir folds leftover asset layers into CAS and rewrites refs', () => {
  const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite')
  const root = mkdtempSync(join(tmpdir(), 'biu-cas-'))
  const biu = join(root, DATA_DIR_NAME)
  mkdirSync(join(biu, 'assets', 'page'), { recursive: true })
  mkdirSync(join(biu, 'assets', 'db'), { recursive: true })
  mkdirSync(join(biu, 'page', 'assets'), { recursive: true })
  writeFileSync(join(biu, 'assets', 'page', 'hero.png'), 'hero')
  writeFileSync(join(biu, 'assets', 'db', 'board.json'), '{}')
  writeFileSync(join(biu, 'page', 'assets', 'hero.png'), 'hero')
  const db = new DatabaseSync(join(biu, 'biu.sqlite'))
  db.exec(`
    CREATE TABLE pages (id TEXT PRIMARY KEY, title TEXT NOT NULL, notes TEXT NOT NULL DEFAULT '', parent_id TEXT, depends_on_json TEXT NOT NULL DEFAULT '[]', emoji TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
    CREATE TABLE attachments (name TEXT PRIMARY KEY, etag TEXT NOT NULL, mime TEXT NOT NULL, bytes INTEGER NOT NULL, kind TEXT NOT NULL DEFAULT 'asset', created_at INTEGER NOT NULL);
    CREATE TABLE content_refs (collection TEXT NOT NULL, record_id TEXT NOT NULL, name TEXT NOT NULL, source TEXT NOT NULL, PRIMARY KEY (collection, record_id, name, source));
    CREATE TABLE record_banners (collection TEXT NOT NULL, record_id TEXT NOT NULL, kind TEXT NOT NULL, html TEXT NOT NULL);
  `)
  db.prepare(`INSERT INTO pages (id, title, notes, created_at, updated_at) VALUES ('p1', '页', ?, 1, 1)`).run('![x](/api/db/file/hero.png)\n')
  db.prepare(`INSERT INTO attachments (name, etag, mime, bytes, kind, created_at) VALUES ('hero.png', 'hero.png', 'image/png', 4, 'asset', 1)`).run()
  db.prepare(`INSERT INTO content_refs (collection, record_id, name, source) VALUES ('/pages', 'p1', 'hero.png', 'content')`).run()
  db.prepare(`INSERT INTO record_banners (collection, record_id, kind, html) VALUES ('/pages', 'p1', 'html', '<img src="/api/page/file/hero.png">')`).run()
  db.close()
  migrateDataDir(root)
  const hashed = hashedAssetName(Buffer.from('hero'), 'hero.png')
  assert.equal(readFileSync(join(biu, 'assets', 'cas', hashedAssetRel(hashed)), 'utf8'), 'hero')
  assert.equal(existsSync(join(biu, 'assets', 'page')), false)
  assert.equal(existsSync(join(biu, 'page', 'assets')), false)
  const again = new DatabaseSync(join(biu, 'biu.sqlite'))
  const notes = (again.prepare('SELECT notes FROM pages WHERE id = ?').get('p1') as { notes: string }).notes
  assert.match(notes, new RegExp(`/api/db/file/${hashed}`))
  assert.equal(notes.includes('hero.png'), false)
  const banner = (again.prepare('SELECT html FROM record_banners WHERE record_id = ?').get('p1') as { html: string }).html
  assert.match(banner, new RegExp(hashed))
  const ref = again.prepare('SELECT name FROM content_refs WHERE record_id = ?').get('p1') as { name: string }
  assert.equal(ref.name, hashed)
  const att = again.prepare('SELECT name, storage, kind FROM attachments WHERE name = ?').get(hashed) as {
    name: string
    storage: string
    kind: string
  }
  assert.equal(att.name, hashed)
  assert.equal(att.storage, 'cas')
  again.close()
})

test('adoptCasAssets ledgers doc files and block_refs from page_block_index', () => {
  const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite')
  const root = mkdtempSync(join(tmpdir(), 'biu-doc-ledger-'))
  const biu = join(root, DATA_DIR_NAME)
  mkdirSync(join(biu, 'assets', 'doc'), { recursive: true })
  writeFileSync(join(biu, 'assets', 'doc', '画板-edd9.json'), '{"ok":1}')
  const db = new DatabaseSync(join(biu, 'biu.sqlite'))
  db.exec(`
    CREATE TABLE pages (id TEXT PRIMARY KEY, title TEXT NOT NULL, notes TEXT NOT NULL DEFAULT '', parent_id TEXT, depends_on_json TEXT NOT NULL DEFAULT '[]', emoji TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
    CREATE TABLE page_block_index (
      page_id TEXT NOT NULL, block_id TEXT NOT NULL, kind TEXT NOT NULL, plugin TEXT NOT NULL DEFAULT '',
      title TEXT NOT NULL, page_title TEXT NOT NULL DEFAULT '', data_json TEXT NOT NULL,
      page_created_at INTEGER NOT NULL DEFAULT 0, page_updated_at INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (page_id, block_id)
    );
  `)
  db.prepare(
    `INSERT INTO page_block_index(page_id, block_id, kind, plugin, title, page_title, data_json, page_created_at, page_updated_at)
     VALUES ('p000', 'edd9aaaa', 'excalidraw', 'page-excalidraw', '草图', '页', ?, 1, 1)`,
  ).run(JSON.stringify({ assets: ['画板-edd9.json'] }))
  db.close()
  adoptCasAssets(biu)
  const again = new DatabaseSync(join(biu, 'biu.sqlite'))
  const att = again.prepare('SELECT storage, kind, bytes FROM attachments WHERE name = ?').get('画板-edd9.json') as {
    storage: string
    kind: string
    bytes: number
  }
  assert.equal(att.storage, 'doc')
  assert.equal(att.kind, 'core')
  assert.ok(att.bytes > 0)
  const ref = again.prepare('SELECT source FROM block_refs WHERE name = ?').get('画板-edd9.json') as { source: string }
  assert.equal(ref.source, 'block:edd9aaaa:core')
  again.close()
})

