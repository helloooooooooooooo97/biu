import { test } from 'vitest'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdtemp, mkdir, readFile, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context, Service } from 'cordis'
import type { CollectionSpec } from '@biu/type-file-system'
import * as tools from '@biu/host-tools'
import * as fsPlugin from '@biu/host-fs'
import * as page from './index.ts'
import { dumpMarkdown, splitMarkdown } from './markdown.ts'
import { ASSET_GC_GRACE_MS, PAGE_ASSETS, PAGE_ROOT, PageAssetConflictError, PagesStore, collectPageAssetNames } from './store.ts'
import { PageBlocksIndex } from './page-blocks-index.ts'

test('markdown frontmatter roundtrips YAML properties and body', () => {
  const raw = dumpMarkdown({ title: '首页', tags: ['red', 'prod'] }, '正文第一段\n')
  assert.match(raw, /^---\n/)
  const { matter, body } = splitMarkdown(raw)
  assert.equal(matter.title, '首页')
  assert.deepEqual(matter.tags, ['red', 'prod'])
  assert.equal(body, '正文第一段\n')
})

test('page plugin stores pages in SQLite under .page', async () => {
  const ctx = new Context()
  const registered: CollectionSpec[] = []
  class FakeDb extends Service {
    constructor(c: Context) {
      super(c, 'database')
    }
    register(spec: CollectionSpec) {
      registered.push(spec)
    }
  }
  new FakeDb(ctx)
  await ctx.plugin(tools)
  const root = await mkdtemp(join(tmpdir(), 'page-md-'))
  await ctx.plugin(fsPlugin, { root })
  await ctx.plugin(page)

  assert.equal(page.name, 'page')
  assert.equal(registered[0]?.path, '/pages')
  assert.equal(registered[0]?.view?.route, '/pages')
  assert.equal(registered[0]?.view?.moduleId, 'page')
  assert.equal(registered[0]?.view?.icon, 'document')
  const fields = registered[0]!.schema.fields
  assert.equal(fields.blurb, undefined)
  assert.equal(fields.count, undefined)
  assert.equal(fields.enabled, undefined)
  assert.equal(fields.status, undefined)
  assert.equal(fields.aliases, undefined)
  assert.equal(fields.size, undefined)
  assert.equal(fields.publishedAt, undefined)
  assert.equal(fields.homepage, undefined)
  assert.equal(fields.cover, undefined)
  assert.equal(fields.pack, undefined)
  assert.equal(fields.tags?.type, 'multi-select')
  assert.equal(fields.score, undefined)
  assert.equal(fields.notes?.type, 'file')
  assert.equal(registered[0]?.schema.fields.tags?.enum, undefined)
  assert.deepEqual(registered[0]?.schema.columns, ['title', 'tags', 'createdBy', 'updatedBy'])
  assert.deepEqual(registered[0]?.records, { update: true, create: true, delete: true })
  assert.equal(registered[1]?.path, '/page-blocks')
  assert.equal(registered[1]?.label, '组件')
  assert.equal(registered[1]?.view?.title, '组件')
  assert.equal(registered[1]?.view?.icon, 'rectangle-group')
  assert.equal(registered[1]?.view?.moduleId, 'page-blocks')
  assert.equal(registered[1]?.view?.route, '/page-blocks')
  assert.notEqual(registered[1]?.view?.moduleId, registered[0]?.view?.moduleId)
  assert.deepEqual(registered[1]?.records, { update: true })
  assert.equal(registered[1]?.schema.contentField, 'data')
  assert.equal(registered[1]?.schema.fields.title?.writable, true)
  assert.deepEqual(registered[1]?.schema.columns, ['title', 'blockKind', 'plugin', 'pageId'])

  const spec = registered[0]!
  assert.equal((await spec.list()).length, 0)

  const created = await spec.create!([{
    title: '新页面',
    notes: '# 标题\n内容',
    tags: ['docs', 'wip'],
  }])
  assert.deepEqual(created[0]?.tags, ['docs', 'wip'])
  assert.equal(created[0]?.title, '新页面')
  assert.equal(created[0]?.notes, '# 标题\n内容')
  const linked = await spec.update!(created[0]!.id, { parentId: 'p999', dependsOn: ['p001'] })
  assert.equal(linked.parentId, 'p999')
  assert.deepEqual(linked.dependsOn, ['p001'])
  assert.deepEqual((await spec.get!(created[0]!.id))?.dependsOn, ['p001'])
  const loaded = await spec.get!(created[0]!.id)
  assert.equal(loaded?.notes, '# 标题\n内容')
  assert.equal(loaded?.title, '新页面')
  const sqlite = await readFile(join(root, '.page/pages.sqlite'))
  assert.ok(sqlite.byteLength > 0)
  const mdFile = await readFile(join(root, `.page/${created[0]!.id}.md`), 'utf8')
  assert.match(mdFile, /^---\n/)
  assert.match(mdFile, /title: 新页面/)
  assert.match(mdFile, /# 标题\n内容/)

  const written = await spec.update!(created[0]!.id, {
    facet: { tags: ['dp'], values: { dp: { complexity: 'O(n)' } } },
  })
  assert.deepEqual(written.facet, { tags: ['dp'], values: { dp: { complexity: 'O(n)' } } })
  const again = await spec.get!(created[0]!.id)
  assert.equal(JSON.stringify(again?.facet), JSON.stringify({ tags: ['dp'], values: { dp: { complexity: 'O(n)' } } }))

  await spec.remove!({ ids: [created[0]!.id] })
  assert.equal((await spec.list()).length, 0)

  const assetsDir = join(root, '.biu/assets')
  const store = new PagesStore(ctx.fs.workspace as never, assetsDir)
  const asset = await store.writeAsset('board.json', '{\n  "elements": []\n}\n')
  assert.equal(asset.name, 'board.json')
  const diskAsset = await readFile(join(assetsDir, 'board.json'), 'utf8')
  assert.match(diskAsset, /elements/)
  const read = await store.readAsset('board.json')
  assert.equal(read.type, 'application/json; charset=utf-8')
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  await store.writeAsset('shot.png', png)
  const shot = await store.readAsset('shot.png')
  assert.equal(shot.type, 'image/png')
  assert.deepEqual([...shot.bytes], [...png])
  await assert.rejects(() => store.writeAsset('../secret.json', '{}'), /invalid asset/)
  await assert.rejects(() => store.writeAsset('board.json', '{}'), (error) => error instanceof PageAssetConflictError)
  const overwritten = await store.writeAsset('board.json', '{}', { etag: asset.etag })
  assert.equal(overwritten.etag.length, 16)
})

test('page-blocks collection updates one fence by page::block id', async () => {
  const ctx = new Context()
  const registered: CollectionSpec[] = []
  class FakeDb extends Service {
    constructor(c: Context) {
      super(c, 'database')
    }
    register(spec: CollectionSpec) {
      registered.push(spec)
    }
  }
  new FakeDb(ctx)
  await ctx.plugin(tools)
  const root = await mkdtemp(join(tmpdir(), 'page-blocks-'))
  await ctx.plugin(fsPlugin, { root })
  await ctx.plugin(page)
  const pages = registered.find((item) => item.path === '/pages')!
  const blocks = registered.find((item) => item.path === '/page-blocks')!
  const created = await pages.create!([{
    title: '海报',
    notes: `:::pageBlock {kind=html plugin=page-html-blocks id=ab12cd34 deck=true}
<div>旧</div>
:::
`,
  }])
  const pageId = created[0]!.id
  const listed = await blocks.list()
  assert.equal(listed.length, 1)
  assert.equal(listed[0]?.id, `${pageId}::ab12cd34`)
  assert.equal(listed[0]?.blockKind, 'html')
  assert.equal(listed[0]?.pageTitle, '海报')
  assert.equal(listed[0]?.title, '海报 html')
  const renamed = await blocks.update!(`${pageId}::ab12cd34`, { title: '刊头' })
  assert.equal(renamed.title, '刊头')
  const updated = await blocks.update!(`${pageId}::ab12cd34`, {
    data: { html: '<div>新</div>', deck: false },
  })
  assert.equal(updated.title, '刊头')
  const clobbered = await blocks.update!(`${pageId}::ab12cd34`, {
    data: { html: '<div>新</div>', title: '旧名', deck: false },
  })
  assert.equal(clobbered.title, '刊头')
  assert.match(String(updated.data), /新/)
  assert.match(String(updated.data), /"deck":false/)
  const md = await readFile(join(root, `.page/${pageId}.md`), 'utf8')
  assert.match(md, /id=ab12cd34 title="刊头" deck=false/)
  assert.match(md, /<div>新<\/div>/)
  assert.match(md, /刊头/)
  assert.equal(blocks.create, undefined)
  assert.equal(blocks.remove, undefined)
})

test('clearing the last pageBlock fence drops the index row immediately', async () => {
  const ctx = new Context()
  await ctx.plugin(tools)
  const root = await mkdtemp(join(tmpdir(), 'page-block-last-'))
  await ctx.plugin(fsPlugin, { root })
  const store = new PagesStore(ctx.fs.workspace as never, join(root, '.biu/assets'))
  const index = new PageBlocksIndex(store, { hotWindowMs: 60_000, hotLimit: 0, warmLimit: 0 })
  const pages = page.pagesCollection(store, index)
  const fence = (id: string) => `:::pageBlock {kind=html plugin=page-html-blocks id=${id}}\n<div>${id}</div>\n:::\n`
  const created = await pages.create!([{ title: '一页', notes: fence('aaaaaa11') + fence('bbbbbb22') }])
  const id = created[0]!.id
  assert.equal((await index.list()).length, 2)
  await pages.update!(id, { notes: fence('aaaaaa11') })
  assert.equal((await index.list()).length, 1)
  await pages.update!(id, { notes: '只剩正文\n' })
  assert.equal((await index.list()).length, 0)
  const idle = await index.sync()
  assert.equal(idle.scanned, 0)
  assert.equal((await index.list()).length, 0)
})

test('reindex rewrites duplicate pageBlock ids instead of crashing', async () => {
  const ctx = new Context()
  await ctx.plugin(tools)
  const root = await mkdtemp(join(tmpdir(), 'page-block-dup-'))
  await ctx.plugin(fsPlugin, { root })
  const store = new PagesStore(ctx.fs.workspace as never, join(root, '.biu/assets'))
  const index = new PageBlocksIndex(store, { hotWindowMs: 60_000, hotLimit: 8, warmLimit: 8 })
  const fence = (id: string, body: string) => `:::pageBlock {kind=html plugin=page-html-blocks id=${id}}\n<div>${body}</div>\n:::\n`
  const created = await store.create({ title: '粘贴崩了', notes: fence('ab12cd34', 'a') + fence('ab12cd34', 'b') })
  await index.reindexPage(created)
  const listed = await index.list()
  assert.equal(listed.length, 2)
  const ids = listed.map((row) => String(row.blockId)).sort()
  assert.equal(new Set(ids).size, 2)
  assert.equal(ids.includes('ab12cd34'), true)
  const md = await readFile(join(root, `.page/${created.id}.md`), 'utf8')
  const fences = md.match(/id=([a-z0-9]+)/gi) ?? []
  assert.equal(fences.length, 2)
  assert.notEqual(fences[0], fences[1])
})

test('page-block index scans a hot batch instead of every page', async () => {
  const ctx = new Context()
  await ctx.plugin(tools)
  const root = await mkdtemp(join(tmpdir(), 'page-block-index-'))
  await ctx.plugin(fsPlugin, { root })
  const store = new PagesStore(ctx.fs.workspace as never, join(root, '.biu/assets'))
  const index = new PageBlocksIndex(store, { hotWindowMs: 60_000, hotLimit: 1, warmLimit: 0 })
  const fence = (id: string) => `:::pageBlock {kind=html plugin=page-html-blocks id=${id}}\n<div>${id}</div>\n:::\n`
  await store.create({ title: 'a', notes: fence('aaaaaa11') })
  await store.create({ title: 'b', notes: fence('bbbbbb22') })
  await store.create({ title: 'c', notes: fence('cccccc33') })
  const first = await index.sync()
  assert.equal(first.scanned, 1)
  assert.equal(first.dirty, 3)
  assert.equal((await index.list()).length, 1)
  const second = await index.sync()
  assert.equal(second.scanned, 1)
  assert.equal((await index.list()).length, 2)
  await index.sync()
  assert.equal((await index.list()).length, 3)
  const idle = await index.sync()
  assert.equal(idle.scanned, 0)
  assert.equal(idle.dirty, 0)
  assert.ok((await index.lastRunAt()) > 0)
})


test('pages sqlite drops leftover notes column after flushing to markdown', async () => {
  const ctx = new Context()
  await ctx.plugin(tools)
  const root = await mkdtemp(join(tmpdir(), 'page-drop-notes-'))
  await ctx.plugin(fsPlugin, { root })
  await mkdir(join(root, PAGE_ROOT), { recursive: true })
  const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite')
  const db = new DatabaseSync(join(root, PAGE_ROOT, 'pages.sqlite'))
  db.exec(`
    CREATE TABLE pages (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      tags_json TEXT NOT NULL DEFAULT '[]',
      notes TEXT NOT NULL DEFAULT '',
      parent_id TEXT,
      depends_on_json TEXT NOT NULL DEFAULT '[]',
      facet_json TEXT NOT NULL DEFAULT '{}',
      emoji TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `)
  db.prepare(`
    INSERT INTO pages (id, title, tags_json, notes, parent_id, depends_on_json, facet_json, emoji, created_at, updated_at)
    VALUES (?, ?, '[]', ?, NULL, '[]', '{}', '', 1, 2)
  `).run('legacy', '旧页', '只在 sqlite 里的正文\n')
  db.close()
  const store = new PagesStore(ctx.fs.workspace as never, join(root, '.biu/assets'))
  const listed = await store.list()
  assert.equal(listed.length, 1)
  assert.equal(listed[0]?.id, 'legacy')
  assert.equal(listed[0]?.notes, '')
  const loaded = await store.get('legacy')
  assert.equal(loaded?.notes, '只在 sqlite 里的正文\n')
  const sqlite = await store.sqlite()
  const cols = (sqlite.prepare('PRAGMA table_info(pages)').all() as Array<{ name: string }>).map((col) => col.name)
  assert.equal(cols.includes('notes'), false)
})

test('PagesStore reads existing markdown files from .page', async () => {
  const ctx = new Context()
  await ctx.plugin(tools)
  const root = await mkdtemp(join(tmpdir(), 'page-store-'))
  await ctx.plugin(fsPlugin, { root })
  await mkdir(join(root, PAGE_ROOT), { recursive: true })
  await writeFile(
    join(root, PAGE_ROOT, 'home.md'),
    dumpMarkdown({ title: 'Home', parentId: null }, 'hello\n'),
    'utf8',
  )
  let reads = 0
  const inner = ctx.fs
  const store = new PagesStore({
    resolve: (rel) => inner.resolve(rel),
    read: async (rel) => {
      reads += 1
      return inner.read(rel)
    },
    write: (rel, content) => inner.write(rel, content),
    list: (rel) => inner.list(rel),
  })
  const listed = await store.list()
  assert.equal(listed.length, 1)
  assert.equal(listed[0]?.id, 'home')
  assert.equal(listed[0]?.title, 'Home')
  assert.equal(listed[0]?.notes, '')
  assert.equal(reads, 1)
  const afterListReads = reads
  await store.list()
  assert.equal(reads, afterListReads)
  const home = await store.get('home')
  assert.equal(home?.notes, 'hello\n')
  assert.equal(reads, afterListReads + 1)
  await writeFile(join(root, PAGE_ROOT, 'other.md'), dumpMarkdown({ title: 'Other' }, ''), 'utf8')
  const onlyHome = await store.list(['home'])
  assert.equal(onlyHome.length, 1)
  assert.equal(onlyHome[0]?.id, 'home')
  const all = await store.list()
  assert.equal(all.map((row) => row.id).sort().join(','), 'home,other')
  assert.equal(reads, afterListReads + 3)
})

test('collectPageAssetNames picks page asset pointers', () => {
  const names = collectPageAssetNames(
    'cover: assets/hero.png\n',
    ':::pageBlock {kind=excalidraw}\n{"file":"assets/excalidraw-aa.json"}\n:::\n',
    { href: '/api/page/file/pack.zip' },
    { href: '/api/db/file/shared.bin' },
  )
  assert.equal(names.has('hero.png'), true)
  assert.equal(names.has('excalidraw-aa.json'), true)
  assert.equal(names.has('pack.zip'), true)
  assert.equal(names.has('shared.bin'), true)
  assert.equal(collectPageAssetNames('assets/画板-ab.json').has('画板-ab.json'), true)
  assert.equal(ASSET_GC_GRACE_MS, 24 * 60 * 60 * 1000)
})

test('gcAssets deletes unreferenced files after one day', async () => {
  const ctx = new Context()
  await ctx.plugin(tools)
  const root = await mkdtemp(join(tmpdir(), 'page-gc-'))
  await ctx.plugin(fsPlugin, { root })
  const store = new PagesStore(ctx.fs.workspace as never, join(root, '.biu/assets'))
  const a = await store.create({
    title: 'A',
    notes: ':::pageBlock {kind=excalidraw}\n{"file":"assets/excalidraw-keep.json"}\n:::\n',
  })
  const b = await store.create({
    title: 'B',
    notes: ':::pageBlock {kind=excalidraw}\n{"file":"assets/excalidraw-drop.json"}\n:::\n',
  })
  await mkdir(join(root, PAGE_ASSETS), { recursive: true })
  await writeFile(join(root, PAGE_ASSETS, 'excalidraw-keep.json'), '{"ok":1}')
  await writeFile(join(root, PAGE_ASSETS, 'excalidraw-drop.json'), '{"ok":2}')
  await writeFile(join(root, PAGE_ASSETS, 'orphan.json'), '{"ok":3}')
  const stale = Date.now() / 1000 - 2 * 24 * 60 * 60
  await utimes(join(root, PAGE_ASSETS, 'excalidraw-drop.json'), stale, stale)
  await utimes(join(root, PAGE_ASSETS, 'orphan.json'), stale, stale)

  await store.update(b.id, { notes: 'gone\n' })
  await store.gcAssets({ now: Date.now() })

  const dropGone = await readFile(join(root, PAGE_ASSETS, 'excalidraw-drop.json'), 'utf8').then(
    () => false,
    () => true,
  )
  const orphanGone = await readFile(join(root, PAGE_ASSETS, 'orphan.json'), 'utf8').then(
    () => false,
    () => true,
  )
  const kept = await readFile(join(root, PAGE_ASSETS, 'excalidraw-keep.json'), 'utf8')
  assert.equal(dropGone, true)
  assert.equal(orphanGone, true)
  assert.match(kept, /ok/)

  await store.writeAsset('fresh-orphan.json', '{}')
  await store.gcAssets()
  const fresh = await readFile(join(root, '.biu/assets', 'fresh-orphan.json'), 'utf8')
  assert.equal(fresh, '{}')
  assert.equal(a.title, 'A')
})
