import { test } from 'vitest'
import assert from 'node:assert/strict'
import { Context, Service } from 'cordis'
import * as tools from '@biu/host-tools'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseService, apply as applyFileSystem } from './index.ts'
import { FileSystemAssets } from './assets-store.ts'
import type { CollectionSpec } from '@biu/type-file-system'
import { REQUIRED_RECORD_FIELDS } from '@biu/type-file-system'
import { facetsCollection } from './facets-collection.ts'
import { runWithSession } from '@biu/host-sessions/scope'
import { builtinAllViewId } from '../catalog-views.ts'
import { savedViewRecordPath } from '../paths.ts'

function notesCollection(): CollectionSpec {
  const rows = new Map<string, { id: string; title: string; status: string; pinned: boolean }>()
  rows.set('n1', { id: 'n1', title: '草稿', status: 'open', pinned: false })
  rows.set('n2', { id: 'n2', title: '另一篇', status: 'open', pinned: false })
  return {
    id: 'notes',
    path: '/notes',
    label: '笔记',
    view: { moduleId: 'notes-2', route: '/notes-2', title: '笔记2号', order: 40 },
    schema: {
      labelField: 'title',
      fields: {
        ...REQUIRED_RECORD_FIELDS,
        title: { type: 'string', writable: true },
        status: { type: 'string', writable: true, enum: ['open', 'done'] },
        pinned: { type: 'boolean' },
      },
    },
    records: { update: true },
    list: () => [...rows.values()],
    get: (id) => rows.get(id) ?? null,
    update: (id, patch) => {
      const current = rows.get(id)
      if (!current) throw new Error('unknown note')
      const next = { ...current, ...patch, id }
      rows.set(id, next)
      return next
    },
    actions: [
      {
        id: 'pin',
        label: '钉住',
        when: { pinned: false },
        run: (id) => {
          const current = rows.get(id)
          if (!current) throw new Error('unknown note')
          rows.set(id, { ...current, pinned: true })
        },
      },
    ],
  }
}

test('root lists registered collections; record read/update follows schema', async () => {
  const ctx = new Context()
  const db = new DatabaseService(ctx)
  db.register(notesCollection())

  const root = await db.list('/')
  assert.equal(root.kind, 'root')
  assert.deepEqual(
    root.items.map((item) => item.path),
    ['/notes'],
  )
  assert.equal(root.items[0]?.view?.moduleId, 'notes-2')

  const listed = await db.list('/notes')
  assert.equal(listed.kind, 'collection')
  if (listed.kind !== 'collection') return
  assert.equal(listed.items.length, 2)
  assert.equal(listed.items[0]?.title, '草稿')

  const slim = await db.list('/notes', undefined, { columns: ['title'] })
  assert.equal(slim.kind, 'collection')
  if (slim.kind !== 'collection') return
  const row = slim.items[0]
  assert.equal(row?.id, 'n1')
  assert.equal(row?.title, '草稿')
  assert.equal(row?.path, '/notes/n1')
  assert.equal(row?.kind, 'record')
  assert.equal('status' in (row ?? {}), false)
  assert.equal('pinned' in (row ?? {}), false)
  const labeled = await db.list('/notes', undefined, { columns: ['label'] })
  assert.equal(labeled.kind, 'collection')
  if (labeled.kind !== 'collection') return
  assert.equal(labeled.items[0]?.title, '草稿')
  assert.equal('status' in (labeled.items[0] ?? {}), false)

  const read = await db.read('/notes/n1')
  assert.equal(read.kind, 'record')
  if (read.kind !== 'record') return
  assert.equal(read.value.status, 'open')

  const written = await db.update('/notes/n1', { status: 'done' })
  assert.equal(written.value.status, 'done')
  await assert.rejects(() => db.update('/notes/n1', { pinned: true }), /not writable/)
  await assert.rejects(() => db.update('/notes/n1', { nope: 1 }), /unknown field/)
})

test('html banner is stored by file system and never written as a table field', async () => {
  const ctx = new Context()
  const db = new DatabaseService(ctx)
  const notes = notesCollection()
  const seen: Record<string, unknown>[] = []
  const innerUpdate = notes.update!
  notes.update = async (id, patch) => {
    seen.push({ ...patch })
    return innerUpdate(id, patch)
  }
  db.register(notes)
  const written = await db.update('/notes/n1', { banner: { kind: 'html', html: '<div>cover</div>' } })
  assert.deepEqual(written.value.banner, { kind: 'html', html: '<div>cover</div>' })
  assert.equal(seen.length, 0)
  const read = await db.read('/notes/n1')
  if (read.kind !== 'record') return
  assert.deepEqual(read.value.banner, { kind: 'html', html: '<div>cover</div>' })
  assert.equal('banner' in (await notes.get!('n1') ?? {}), false)
  const listed = await db.list('/notes')
  if (listed.kind !== 'collection') return
  assert.equal('banner' in (listed.items.find((row) => row.id === 'n1') ?? {}), false)
  await db.update('/notes/n1', { banner: null })
  const cleared = await db.read('/notes/n1')
  if (cleared.kind !== 'record') return
  assert.equal('banner' in cleared.value, false)
})

test('each view keeps its own html banner outside list rows', async () => {
  const ctx = new Context()
  await ctx.plugin(tools)
  class HttpStub extends Service {
    constructor(c: Context) {
      super(c, 'http')
    }
    route() {}
    broadcast() {}
  }
  new HttpStub(ctx)
  await ctx.plugin({ inject: ['tools', 'http'], apply: applyFileSystem })
  const db = ctx.get('database') as DatabaseService
  db.register(notesCollection())
  const allPath = savedViewRecordPath('/notes', builtinAllViewId('/notes'))
  await db.update(allPath, { banner: { kind: 'html', html: '<div>all</div>' } })
  const all = await db.read(allPath)
  if (all.kind !== 'record') return
  assert.deepEqual(all.value.banner, { kind: 'html', html: '<div>all</div>' })
  const created = await db.create('/views', [{ title: '看板', tablePath: '/notes', mode: 'graph' }])
  const boardPath = created.items[0]?.path
  assert.equal(typeof boardPath, 'string')
  await db.update(boardPath!, { banner: { kind: 'htmlframe', html: '<div>board</div>' } })
  const board = await db.read(boardPath!)
  if (board.kind !== 'record') return
  assert.deepEqual(board.value.banner, { kind: 'htmlframe', html: '<div>board</div>' })
  const again = await db.read(allPath)
  if (again.kind !== 'record') return
  assert.deepEqual(again.value.banner, { kind: 'html', html: '<div>all</div>' })
  const listed = await db.list('/views')
  if (listed.kind !== 'collection') return
  assert.ok(listed.items.every((row) => !('banner' in row)))
})

test('computed fields come from list and cannot be written', async () => {
  const ctx = new Context()
  const db = new DatabaseService(ctx)
  db.register({
    id: 'stats',
    path: '/stats',
    schema: {
      fields: {
        ...REQUIRED_RECORD_FIELDS,
        title: { type: 'string', writable: true },
        score: { type: 'number', computed: true },
      },
    },
    list: () => [{ id: 'n1', title: 'a', score: 9 }],
    get: () => ({ id: 'n1', title: 'a', score: 9 }),
    records: { update: true },
    update: (id, patch) => ({ id, title: 'a', score: 9, ...patch }),
  })
  const listed = await db.list('/stats')
  assert.equal(listed.kind, 'collection')
  if (listed.kind !== 'collection') return
  assert.equal(listed.schema.fields.score?.computed, true)
  assert.equal(listed.schema.fields.score?.writable, false)
  assert.equal(listed.items[0]?.score, 9)
  await assert.rejects(() => db.update('/stats/n1', { score: 1 }), /not writable/)
})

test('stat returns schema; list can filter by any field', async () => {
  const ctx = new Context()
  const db = new DatabaseService(ctx)
  db.register(notesCollection())
  const stat = await db.stat('/notes')
  assert.equal(stat.kind, 'collection')
  if (stat.kind !== 'collection') return
  assert.equal(stat.schema.fields.status?.enum?.[0], 'open')
  const filtered = await db.list('/notes', { status: 'open' })
  assert.equal(filtered.items.length, 2)
  const empty = await db.list('/notes', { status: 'done' })
  assert.equal(empty.items.length, 0)
})

test('every collection schema includes id, title, createdAt and updatedAt', async () => {
  const ctx = new Context()
  const db = new DatabaseService(ctx)
  db.register(notesCollection())
  const stat = await db.stat('/notes')
  if (stat.kind !== 'collection') return
  assert.equal(stat.schema.labelField, 'title')
  assert.ok(stat.schema.fields.title)
  assert.equal(stat.schema.fields.id?.type, 'string')
  assert.equal(stat.schema.fields.id?.writable, false)
  assert.equal(stat.schema.fields.createdAt?.type, 'datetime')
  assert.equal(stat.schema.fields.updatedAt?.label, '更新时间')
  assert.equal(stat.schema.fields.content?.type, 'file')
  assert.equal(stat.schema.fields.emoji?.writable, true)
  assert.equal(stat.schema.fields.tags?.type, 'multi-select')
  assert.equal(stat.schema.fields.tags?.writable, true)
  assert.equal(stat.schema.fields.facet?.type, 'facet')
  assert.equal(stat.schema.fields.facet?.label, '合集')
  assert.equal(stat.schema.fields.facet?.writable, true)
  assert.equal(stat.schema.fields.parentId?.type, 'ref')
  assert.equal(stat.schema.fields.parentId?.writable, true)
  assert.equal(stat.schema.fields.parentId?.label, '父级')
  assert.equal(stat.schema.fields.dependsOn?.type, 'multi-ref')
  assert.equal(stat.schema.fields.dependsOn?.writable, true)
  assert.equal(stat.schema.fields.dependsOn?.label, '依赖')
  assert.equal(stat.schema.fields.createdBy?.type, 'person')
  assert.equal(stat.schema.fields.createdBy?.writable, false)
  assert.equal(stat.schema.fields.createdBy?.label, '创建人')
  assert.equal(stat.schema.fields.updatedBy?.type, 'person')
  assert.equal(stat.schema.fields.updatedBy?.writable, false)
  assert.equal(stat.schema.fields.updatedBy?.multiple, true)
  assert.equal(stat.schema.fields.updatedBy?.label, '编辑人')
  assert.equal(stat.schema.contentField, 'content')
  const tagged = await db.update('/notes/n1', { facet: { tags: ['dp'], values: { dp: { complexity: 'O(n)' } } } })
  assert.deepEqual(tagged.value.facet, { tags: ['dp'], values: { dp: { complexity: 'O(n)' } } })
  db.facets.replace([{ id: 'dp', label: '动态规划', fields: [] }])
  const byLabel = await db.list('/notes', undefined, { q: '动态规划' })
  assert.equal(byLabel.items.length, 1)
  const byFilter = await db.list('/notes', { facet: 'dp' })
  assert.equal(byFilter.items.length, 1)
  await assert.rejects(() => db.update('/notes/n1', { createdAt: Date.now() }), /not writable/)
  await assert.rejects(() => db.update('/notes/n1', { createdBy: { kind: 'system', name: '系统' } }), /not writable/)
  await assert.rejects(() => db.update('/notes/n1', { updatedBy: { kind: 'system', name: '系统' } }), /not writable/)
  await assert.rejects(() => db.update('/notes/n1', { id: 'other' }), /not writable/)
})

test('parentId is a ref and dependsOn is a multi-ref within the same table', async () => {
  const ctx = new Context()
  const db = new DatabaseService(ctx)
  db.register(notesCollection())
  const parented = await db.update('/notes/n1', { parentId: 'n2' })
  assert.equal(parented.value.parentId, 'n2')
  const deps = await db.update('/notes/n1', { dependsOn: ['n2'] })
  assert.deepEqual(deps.value.dependsOn, ['n2'])
  await assert.rejects(() => db.update('/notes/n1', { parentId: 'missing' }), /unknown record/)
  await assert.rejects(() => db.update('/notes/n1', { dependsOn: ['missing'] }), /unknown record/)
  await assert.rejects(() => db.update('/notes/n1', { parentId: 'n1' }), /itself/)
  await assert.rejects(() => db.update('/notes/n1', { dependsOn: ['n1'] }), /itself/)
})

test('custom ref fields also stay inside the same table', async () => {
  const ctx = new Context()
  const db = new DatabaseService(ctx)
  const rows = new Map<string, Record<string, unknown>>([
    ['n1', { id: 'n1', title: 'a', related: '' }],
    ['n2', { id: 'n2', title: 'b', related: '' }],
  ])
  db.register({
    id: 'refs',
    path: '/notes',
    schema: {
      fields: {
        ...REQUIRED_RECORD_FIELDS,
        title: { type: 'string', writable: true },
        related: { type: 'ref', writable: true },
        also: { type: 'multi-ref', writable: true },
      },
    },
    list: () => [...rows.values()] as { id: string }[],
    get: (id) => rows.get(id) as { id: string } | undefined,
    records: { update: true },
    update: (id, patch) => {
      const next = { ...rows.get(id), ...patch, id }
      rows.set(id, next)
      return next as { id: string }
    },
  })
  const linked = await db.update('/notes/n1', { related: 'n2', also: ['n2'] })
  assert.equal(linked.value.related, 'n2')
  assert.deepEqual(linked.value.also, ['n2'])
  await assert.rejects(() => db.update('/notes/n1', { related: 'missing' }), /unknown record/)
})

test('stamps agent createdBy with the session title from /sessions', async () => {
  const ctx = new Context()
  const db = new DatabaseService(ctx)
  db.register(notesCollection())
  const sessions = new Map<string, { id: string; title: string }>([
    ['sess-agent-1', { id: 'sess-agent-1', title: '蓝团爱' }],
  ])
  db.register({
    id: 'sessions',
    path: '/sessions',
    schema: {
      labelField: 'title',
      fields: {
        ...REQUIRED_RECORD_FIELDS,
        title: { type: 'string', writable: true },
      },
    },
    list: () => [...sessions.values()],
    get: (id) => sessions.get(id) ?? null,
  })
  const written = await runWithSession('sess-agent-1', () => db.update('/notes/n1', { status: 'done' }))
  assert.deepEqual(written.value.createdBy, { kind: 'agent', name: '蓝团爱', sessionId: 'sess-agent-1' })
  assert.deepEqual(written.value.updatedBy, [{ kind: 'agent', name: '蓝团爱', sessionId: 'sess-agent-1' }])
})

test('updates stamp createdBy and updatedBy from the current actor', async () => {
  const ctx = new Context()
  const db = new DatabaseService(ctx)
  db.register(notesCollection())
  const written = await db.update('/notes/n1', { status: 'done' })
  assert.deepEqual(written.value.createdBy, { kind: 'user', name: '用户' })
  assert.deepEqual(written.value.updatedBy, [{ kind: 'user', name: '用户' }])
  await assert.rejects(() => db.update('/notes/n1', { updatedBy: { kind: 'system', name: '系统' } }), /not writable/)
  const again = await db.update('/notes/n1', { status: 'open' })
  assert.deepEqual(again.value.createdBy, { kind: 'user', name: '用户' })
  assert.deepEqual(again.value.updatedBy, [{ kind: 'user', name: '用户' }])
})

test('later editors append to updatedBy and leave createdBy alone', async () => {
  const ctx = new Context()
  const db = new DatabaseService(ctx)
  db.register(notesCollection())
  db.register({
    id: 'sessions',
    path: '/sessions',
    schema: {
      labelField: 'title',
      fields: {
        ...REQUIRED_RECORD_FIELDS,
        title: { type: 'string', writable: true },
      },
    },
    list: () => [{ id: 'sess-a', title: '甲' }],
    get: (id) => (id === 'sess-a' ? { id: 'sess-a', title: '甲' } : null),
  })
  await db.update('/notes/n1', { status: 'done' })
  const second = await runWithSession('sess-a', () => db.update('/notes/n1', { status: 'open' }))
  assert.deepEqual(second.value.createdBy, { kind: 'user', name: '用户' })
  assert.deepEqual(second.value.updatedBy, [
    { kind: 'user', name: '用户' },
    { kind: 'agent', name: '甲', sessionId: 'sess-a' },
  ])
})

test('person fields accept user system and agent values', async () => {
  const ctx = new Context()
  const db = new DatabaseService(ctx)
  const rows = new Map<string, Record<string, unknown>>([['n1', { id: 'n1', title: 'a', owner: null }]])
  db.register({
    id: 'people',
    path: '/people',
    schema: {
      fields: {
        ...REQUIRED_RECORD_FIELDS,
        title: { type: 'string', writable: true },
        owner: { type: 'person', writable: true },
      },
    },
    list: () => [...rows.values()] as { id: string }[],
    get: (id) => rows.get(id) as { id: string } | undefined,
    records: { update: true },
    update: (id, patch) => {
      const next = { ...rows.get(id), ...patch, id }
      rows.set(id, next)
      return next as { id: string }
    },
  })
  const written = await db.update('/people/n1', { owner: { kind: 'agent', name: '指挥', sessionId: 'sess-1' } })
  assert.deepEqual(written.value.owner, { kind: 'agent', name: '指挥', sessionId: 'sess-1' })
  const system = await db.update('/people/n1', { owner: '系统' })
  assert.deepEqual(system.value.owner, { kind: 'system', name: '系统' })
})

test('update accepts url image and attachment values', async () => {
  const ctx = new Context()
  const db = new DatabaseService(ctx)
  const rows = new Map<string, Record<string, unknown>>([
    ['n1', { id: 'n1', title: 'a', link: '', cover: '', file: '' }],
  ])
  db.register({
    id: 'media',
    path: '/media',
    schema: {
      fields: {
        ...REQUIRED_RECORD_FIELDS,
        title: { type: 'string', writable: true },
        link: { type: 'url', writable: true },
        cover: { type: 'image', writable: true },
        file: { type: 'attachment', writable: true },
      },
    },
    list: () => [...rows.values()] as { id: string }[],
    get: (id) => rows.get(id) as { id: string } | undefined,
    records: { update: true },
    update: (id, patch) => {
      const next = { ...rows.get(id), ...patch, id }
      rows.set(id, next)
      return next as { id: string }
    },
  })
  const written = await db.update('/media/n1', {
    link: 'https://example.com',
    cover: 'https://example.com/a.png',
    file: { name: 'a.pdf', href: 'https://example.com/a.pdf' },
  })
  assert.equal(written.value.link, 'https://example.com')
  const bare = await db.update('/media/n1', { link: 'example.com/x' })
  assert.equal(bare.value.link, 'https://example.com/x')
  const emptied = await db.update('/media/n1', { link: '' })
  assert.equal(emptied.value.link, '')
  assert.equal(written.value.cover, 'https://example.com/a.png')
  assert.equal((written.value.file as { name: string }).name, 'a.pdf')
  const local = await db.update('/media/n1', { cover: '/page-covers/red.png' })
  assert.equal(local.value.cover, '/page-covers/red.png')
  const many = await db.update('/media/n1', { cover: ['/page-covers/red.png', 'https://example.com/b.png'] })
  assert.deepEqual(many.value.cover, ['/page-covers/red.png', 'https://example.com/b.png'])
  const manyFiles = await db.update('/media/n1', {
    file: [
      { name: 'a.pdf', href: 'https://cdn.example/a.pdf' },
      { name: 'b.pdf', href: 'https://cdn.example/b.pdf' },
    ],
  })
  assert.equal(Array.isArray(manyFiles.value.file), true)
  const emptyPack = await db.update('/media/n1', { file: '' })
  assert.equal(emptyPack.value.file, '')
  await assert.rejects(() => db.update('/media/n1', { link: 'javascript:alert(1)' }), /expected url/)
  await assert.rejects(() => db.update('/media/n1', { cover: 'javascript:alert(1)' }), /expected image/)
})

test('content is omitted from list/read and served on its own path', async () => {
  const ctx = new Context()
  const db = new DatabaseService(ctx)
  const rows = new Map<string, Record<string, unknown>>([
    ['n1', { id: 'n1', title: 'a', content: { kind: 'note', body: { a: 1 } } }],
  ])
  db.register({
    id: 'docs',
    path: '/docs',
    schema: {
      fields: {
        ...REQUIRED_RECORD_FIELDS,
        title: { type: 'string', writable: true },
        content: { type: 'file', writable: true },
      },
    },
    list: () => [...rows.values()] as { id: string }[],
    get: (id) => rows.get(id) as { id: string } | undefined,
    records: { update: true },
    update: (id, patch) => {
      const next = { ...rows.get(id), ...patch, id }
      rows.set(id, next)
      return next as { id: string }
    },
  })
  const listed = await db.list('/docs')
  assert.equal('content' in (listed as { items: Array<Record<string, unknown>> }).items[0]!, false)
  const read = await db.read('/docs/n1')
  assert.equal(read.kind, 'record')
  if (read.kind !== 'record') return
  assert.equal('content' in read.value, false)
  const body = await db.content('/docs/n1')
  assert.deepEqual(body.value, { kind: 'note', body: { a: 1 } })
  const written = await db.writeContent('/docs/n1', { kind: 'note', body: { a: 2 } })
  assert.deepEqual(written.value, { kind: 'note', body: { a: 2 } })
  const cleared = await db.writeContent('/docs/n1', '')
  assert.equal(cleared.value, '')
  assert.equal((await db.content('/docs/n1')).value, '')
})

test('writeContent string fields keep JSON objects instead of [object Object]', async () => {
  const ctx = new Context()
  const db = new DatabaseService(ctx)
  const rows = new Map<string, Record<string, unknown>>([
    ['b1', { id: 'b1', title: '块', data: '{"html":"old"}' }],
  ])
  db.register({
    id: 'page-blocks',
    path: '/page-blocks',
    schema: {
      contentField: 'data',
      fields: {
        ...REQUIRED_RECORD_FIELDS,
        title: { type: 'string' },
        data: { type: 'string', writable: true },
      },
    },
    records: { update: true },
    list: () => [...rows.values()] as { id: string }[],
    get: (id) => rows.get(id) as { id: string } | undefined,
    update: (id, patch) => {
      const next = { ...rows.get(id), ...patch, id }
      rows.set(id, next)
      return next as { id: string }
    },
  })
  const written = await db.writeContent('/page-blocks/b1', { html: '<p>new</p>', deck: false })
  assert.equal(written.field, 'data')
  assert.equal(written.value, '{"html":"<p>new</p>","deck":false}')
  const updated = await db.update('/page-blocks/b1', { data: { html: '<b>via update</b>' } })
  assert.equal(updated.value.data, '{"html":"<b>via update</b>"}')
})

test('editContent view/str_replace/replace_lines/insert/write', async () => {
  const ctx = new Context()
  const db = new DatabaseService(ctx)
  const rows = new Map<string, Record<string, unknown>>([
    ['n1', { id: 'n1', title: 'a', content: 'one\ntwo\nthree\nfour' }],
  ])
  db.register({
    id: 'docs',
    path: '/docs',
    schema: {
      fields: {
        ...REQUIRED_RECORD_FIELDS,
        title: { type: 'string', writable: true },
        content: { type: 'file', writable: true },
      },
    },
    list: () => [...rows.values()] as { id: string }[],
    get: (id) => rows.get(id) as { id: string } | undefined,
    records: { update: true },
    update: (id, patch) => {
      const next = { ...rows.get(id), ...patch, id }
      rows.set(id, next)
      return next as { id: string }
    },
  })
  const viewed = await db.editContent('/docs/n1', { command: 'view', view_range: [2, 3] })
  assert.equal(viewed.command, 'view')
  assert.equal(viewed.truncated, true)
  assert.match(String(viewed.text), /2\ttwo/)
  assert.equal('value' in viewed, false)
  const replaced = await db.editContent('/docs/n1', { command: 'str_replace', old_str: 'two', new_str: 'TWO' })
  assert.equal(replaced.ok, true)
  assert.equal(replaced.start_line, 2)
  assert.equal(replaced.end_line, 2)
  assert.equal('value' in replaced, false)
  assert.equal((await db.content('/docs/n1')).value, 'one\nTWO\nthree\nfour')
  const lined = await db.editContent('/docs/n1', { command: 'replace_lines', start_line: 3, end_line: 4, new_str: 'C\nD' })
  assert.equal(lined.start_line, 3)
  assert.equal(lined.end_line, 4)
  assert.equal((await db.content('/docs/n1')).value, 'one\nTWO\nC\nD')
  const inserted = await db.editContent('/docs/n1', { command: 'insert', insert_line: 1, new_str: 'mid' })
  assert.equal(inserted.start_line, 2)
  assert.equal((await db.content('/docs/n1')).value, 'one\nmid\nTWO\nC\nD')
  const written = await db.editContent('/docs/n1', { command: 'write', value: 'done' })
  assert.equal(written.start_line, 1)
  assert.equal((await db.content('/docs/n1')).value, 'done')
})

test('editContent find_replace supports unique, all and regex modes', async () => {
  const ctx = new Context()
  const db = new DatabaseService(ctx)
  const rows = new Map<string, Record<string, unknown>>([
    ['n1', { id: 'n1', title: 'a', content: 'one two two\nthree two' }],
  ])
  db.register({
    id: 'docs',
    path: '/docs',
    schema: {
      fields: {
        ...REQUIRED_RECORD_FIELDS,
        title: { type: 'string', writable: true },
        content: { type: 'file', writable: true },
      },
    },
    list: () => [...rows.values()] as { id: string }[],
    get: (id) => rows.get(id) as { id: string } | undefined,
    records: { update: true },
    update: (id, patch) => {
      const next = { ...rows.get(id), ...patch, id }
      rows.set(id, next)
      return next as { id: string }
    },
  })
  // all=false still enforces uniqueness
  await assert.rejects(
    () => db.editContent('/docs/n1', { command: 'find_replace', old_str: 'two', new_str: 'X' }),
    /not unique/,
  )
  const all = await db.editContent('/docs/n1', { command: 'find_replace', old_str: 'two', new_str: 'X', all: true })
  assert.equal(all.ok, true)
  assert.equal(all.replaced, 3)
  assert.equal((await db.content('/docs/n1')).value, 'one X X\nthree X')
  const regex = await db.editContent('/docs/n1', {
    command: 'find_replace',
    old_str: '\\s+',
    new_str: ' ',
    regex: true,
    all: true,
  })
  assert.equal(regex.replaced, 4)
  assert.equal((await db.content('/docs/n1')).value, 'one X X three X')
})

test('editContent write accepts from a local file and rejects value+from together', async () => {
  const ctx = new Context()
  const db = new DatabaseService(ctx)
  const rows = new Map<string, Record<string, unknown>>([
    ['n1', { id: 'n1', title: 'a', content: 'old' }],
  ])
  db.register({
    id: 'docs',
    path: '/docs',
    schema: {
      fields: {
        ...REQUIRED_RECORD_FIELDS,
        title: { type: 'string', writable: true },
        content: { type: 'file', writable: true },
      },
    },
    list: () => [...rows.values()] as { id: string }[],
    get: (id) => rows.get(id) as { id: string } | undefined,
    records: { update: true },
    update: (id, patch) => {
      const next = { ...rows.get(id), ...patch, id }
      rows.set(id, next)
      return next as { id: string }
    },
  })
  const dir = await mkdtemp(join(tmpdir(), 'db-content-from-'))
  const file = join(dir, 'body.md')
  await writeFile(file, '# 来自文件\n\n正文内容\n')
  const written = await db.editContent('/docs/n1', { command: 'write', from: file })
  assert.equal(written.ok, true)
  assert.equal((await db.content('/docs/n1')).value, '# 来自文件\n\n正文内容\n')
  await assert.rejects(
    () => db.editContent('/docs/n1', { command: 'write', from: file, value: 'x' }),
    /either value or from/,
  )
  await assert.rejects(() => db.editContent('/docs/n1', { command: 'write', from: join(dir, 'nope.md') }), /cannot read from/)
})

test('editAsset views and writes referenced attachments with etag', async () => {
  const ctx = new Context()
  const db = new DatabaseService(ctx)
  db.assets = new FileSystemAssets(await mkdtemp(join(tmpdir(), 'db-asset-')))
  const rows = new Map<string, Record<string, unknown>>([
    ['p1', { id: 'p1', title: '页', notes: '{"file":"assets/board.json"}' }],
  ])
  db.register({
    id: 'pages',
    path: '/pages',
    schema: {
      fields: {
        ...REQUIRED_RECORD_FIELDS,
        title: { type: 'string', writable: true },
        notes: { type: 'file', writable: true },
      },
    },
    list: () => [...rows.values()] as { id: string }[],
    get: (id) => rows.get(id) as { id: string } | undefined,
    records: { update: true },
    update: (id, patch) => {
      const next = { ...rows.get(id), ...patch, id }
      rows.set(id, next)
      return next as { id: string }
    },
  })
  const listed = await db.editAsset('/pages/p1', { command: 'view' })
  assert.equal(listed.command, 'view')
  const missing = (listed as { assets: Array<{ name: string; missing?: boolean }> }).assets
  assert.equal(missing[0]?.name, 'board.json')
  assert.equal(missing[0]?.missing, true)
  await db.assets.write('board.json', '{"elements":[]}')
  const viewed = await db.editAsset('/pages/p1', { command: 'view', name: 'board.json' })
  assert.equal(typeof viewed.etag, 'string')
  assert.equal(String(viewed.etag).length, 16)
  await assert.rejects(() => db.editAsset('/pages/p1', { command: 'write', name: 'board.json', value: '{}' }))
  const written = await db.editAsset('/pages/p1', {
    command: 'write',
    name: 'board.json',
    value: '{}',
    etag: viewed.etag,
  })
  assert.equal(written.ok, true)
  const dump = join(await mkdtemp(join(tmpdir(), 'db-asset-from-')), 'scene.json')
  await writeFile(dump, '{"elements":[{"id":"a"}]}')
  const fromFile = await db.editAsset('/pages/p1', {
    command: 'write',
    name: 'board.json',
    from: dump,
    etag: written.etag,
  })
  assert.equal(fromFile.ok, true)
  const again = await db.editAsset('/pages/p1', { command: 'view', name: 'board.json' })
  assert.match(String((again as { text?: string }).text), /"id":"a"/)
  await assert.rejects(() => db.editAsset('/pages/p1', { command: 'write', name: 'board.json', etag: again.etag }), /value or from/)
  await assert.rejects(() => db.editAsset('/pages/p1', { command: 'view', name: 'nope.json' }), /not referenced/)
})

test('editAsset can create a new image then reference it from content', async () => {
  const ctx = new Context()
  const db = new DatabaseService(ctx)
  db.assets = new FileSystemAssets(await mkdtemp(join(tmpdir(), 'db-asset-img-')))
  const rows = new Map<string, Record<string, unknown>>([
    ['p1', { id: 'p1', title: '页', notes: 'hello' }],
  ])
  db.register({
    id: 'pages',
    path: '/pages',
    schema: {
      contentField: 'notes',
      fields: {
        ...REQUIRED_RECORD_FIELDS,
        title: { type: 'string', writable: true },
        notes: { type: 'file', writable: true },
      },
    },
    list: () => [...rows.values()] as { id: string }[],
    get: (id) => rows.get(id) as { id: string } | undefined,
    records: { update: true },
    update: (id, patch) => {
      const next = { ...rows.get(id), ...patch, id }
      rows.set(id, next)
      return next as { id: string }
    },
  })
  const dump = join(await mkdtemp(join(tmpdir(), 'db-img-from-')), 'hero.png')
  await writeFile(dump, Buffer.from([0x89, 0x50, 0x4e, 0x47]))
  const created = await db.editAsset('/pages/p1', {
    command: 'write',
    name: 'hero.png',
    from: dump,
  })
  assert.equal(created.ok, true)
  assert.equal(created.name, 'hero.png')
  await db.editContent('/pages/p1', {
    command: 'insert',
    insert_line: 1,
    new_str: '![封面](/api/db/file/hero.png)',
  })
  assert.match(String((await db.content('/pages/p1')).value), /\/api\/db\/file\/hero\.png/)
  const missingRef = await db.editContent('/pages/p1', {
    command: 'insert',
    insert_line: 2,
    new_str: '![缺](/api/db/file/soon.png)',
  })
  assert.equal(missingRef.ok, true)
  const viewed = await db.editAsset('/pages/p1', { command: 'view', name: 'soon.png' })
  assert.equal(viewed.missing, true)
  assert.equal(viewed.etag, '')
})

test('list paginates collection records and reports total', async () => {
  const ctx = new Context()
  const db = new DatabaseService(ctx)
  const rows = new Map<string, { id: string; title: string }>()
  for (let i = 0; i < 60; i++) rows.set(`n${i}`, { id: `n${i}`, title: `笔记 ${String(i).padStart(2, '0')}` })
  db.register({
    id: 'paged',
    path: '/paged',
    schema: { fields: { ...REQUIRED_RECORD_FIELDS, title: { type: 'string', writable: true } } },
    list: () => [...rows.values()],
    get: (id) => rows.get(id) ?? null,
  })
  const first = await db.list('/paged')
  assert.equal(first.kind, 'collection')
  if (first.kind !== 'collection') return
  assert.equal(first.total, 60)
  assert.equal(first.limit, 50)
  assert.equal(first.offset, 0)
  assert.equal(first.items.length, 50)
  const second = await db.list('/paged', undefined, { limit: 20, offset: 50, sortField: 'title', sortDir: 'asc' })
  assert.equal(second.kind, 'collection')
  if (second.kind !== 'collection') return
  assert.equal(second.items.length, 10)
  assert.equal(second.total, 60)
  const found = await db.list('/paged', undefined, { q: '笔记 07', limit: 20 })
  assert.equal(found.kind, 'collection')
  if (found.kind !== 'collection') return
  assert.equal(found.total, 1)
  assert.equal(found.items[0]?.id, 'n7')
})

test('list defaults to title so start/stop cannot reshuffle the table', async () => {
  const ctx = new Context()
  const db = new DatabaseService(ctx)
  db.register({
    id: 'plug',
    path: '/plug',
    schema: { fields: { ...REQUIRED_RECORD_FIELDS, title: { type: 'string' } } },
    list: () => [
      { id: 'b', title: 'Beta', updatedAt: 9 },
      { id: 'a', title: 'Alpha', updatedAt: 1 },
    ],
    get: () => null,
  })
  const listed = await db.list('/plug')
  assert.equal(listed.kind, 'collection')
  if (listed.kind !== 'collection') return
  assert.deepEqual(
    listed.items.map((item) => item.id),
    ['a', 'b'],
  )
})

test('apply registers db_* tools', async () => {
  const ctx = new Context()
  await ctx.plugin(tools)
  class HttpStub extends Service {
    constructor(c: Context) {
      super(c, 'http')
    }
    route() {}
  }
  new HttpStub(ctx)
  await ctx.plugin({ inject: ['tools', 'http'], apply: applyFileSystem })
  const names = ctx.tools.names()
  for (const name of ['db_list', 'db_read', 'db_update', 'db_create', 'db_delete', 'db_stat', 'db_action', 'db_content', 'db_asset']) {
    assert.equal(names.includes(name), true, name)
  }
  for (const name of ['db_list', 'db_read', 'db_stat']) {
    assert.equal(ctx.tools.executionMode(name), 'parallel', name)
  }
  assert.equal(ctx.tools.executionMode('db_update'), 'exclusive')
  assert.equal(ctx.tools.executionMode('db_content', { path: '/pages/p1', command: 'view' }), 'parallel')
  assert.equal(ctx.tools.executionMode('db_content', { path: '/pages/p1', command: 'write', value: 'x' }), 'exclusive')
  assert.equal(ctx.tools.executionMode('db_asset', { path: '/pages/p1', command: 'view' }), 'parallel')
  assert.equal(ctx.tools.executionMode('db_asset', { path: '/pages/p1', command: 'write', value: 'x' }), 'exclusive')
  const listed = await ctx.tools.invoke('db_list', { path: '/' })
  assert.equal((listed as { kind: string }).kind, 'root')
  const items = ((listed as { items: Array<{ path: string; view?: { blurb?: string } }> }).items ?? [])
  const paths = items.map((item) => item.path)
  assert.equal(paths.includes('/views'), true)
  assert.equal(paths.includes('/facets'), true)
  assert.equal(paths.includes('/notices'), true)
  const notices = items.find((item) => item.path === '/notices')
  assert.match(String(notices?.view?.blurb ?? ''), /db_list \/notices/)
  const views = items.find((item) => item.path === '/views')
  assert.match(String(views?.view?.blurb ?? ''), /db_list \/views/)
  assert.match(String(views?.view?.blurb ?? ''), /filterTree/)
  assert.match(String(views?.view?.blurb ?? ''), /kind":"rule"/)
  const facets = items.find((item) => item.path === '/facets')
  assert.match(String(facets?.view?.blurb ?? ''), /db_list \/facets/)
})

test('db_create tool ignores empty companion records instead of creating blank rows', async () => {
  const ctx = new Context()
  await ctx.plugin(tools)
  class HttpStub extends Service {
    constructor(c: Context) {
      super(c, 'http')
    }
    route() {}
  }
  new HttpStub(ctx)
  await ctx.plugin({ inject: ['tools', 'http'], apply: applyFileSystem })
  const received: Array<Record<string, unknown>> = []
  const db = ctx.get('database') as DatabaseService
  db.register({
    id: 'drafts',
    path: '/drafts',
    schema: {
      labelField: 'title',
      fields: {
        ...REQUIRED_RECORD_FIELDS,
        title: { type: 'string', writable: true },
      },
    },
    records: { create: true },
    list: () => [],
    get: () => null,
    create: (rows) => {
      received.push(...rows)
      return rows.map((row, index) => ({ id: `draft-${index}`, ...row }))
    },
  })

  await ctx.tools.invoke('db_create', {
    path: '/drafts',
    records: [{ title: '目标技能' }, {}],
  })

  assert.deepEqual(received, [{ title: '目标技能' }])
  received.length = 0
  await db.create('/drafts', [{}, {}])
  assert.deepEqual(received, [{}])
})

test('db_list columns returns only those fields plus id', async () => {
  const ctx = new Context()
  await ctx.plugin(tools)
  class HttpStub extends Service {
    constructor(c: Context) {
      super(c, 'http')
    }
    route() {}
  }
  new HttpStub(ctx)
  await ctx.plugin({ inject: ['tools', 'http'], apply: applyFileSystem })
  const db = ctx.get('database') as DatabaseService
  db.register(notesCollection())
  const listed = await ctx.tools.invoke('db_list', { path: '/notes', columns: ['label'] }) as {
    columns: string[]
    rows: unknown[][]
  }
  assert.deepEqual(listed.columns, ['id', 'title'])
  assert.deepEqual(listed.rows[0], ['n1', '草稿'])
})

test('agent db_stat omits builtin fields; service stat and list still include them', async () => {
  const ctx = new Context()
  await ctx.plugin(tools)
  class HttpStub extends Service {
    constructor(c: Context) {
      super(c, 'http')
    }
    route() {}
  }
  new HttpStub(ctx)
  await ctx.plugin({ inject: ['tools', 'http'], apply: applyFileSystem })
  const db = ctx.get('database') as DatabaseService
  db.register(notesCollection())
  const serviceStat = await db.stat('/notes')
  if (serviceStat.kind !== 'collection') return
  assert.equal(serviceStat.schema.fields.id?.type, 'string')
  assert.equal(serviceStat.schema.fields.facet?.type, 'facet')
  const listed = await db.list('/notes')
  assert.ok(listed.schema.fields.status)
  const agentStat = (await ctx.tools.invoke('db_stat', { path: '/notes' })) as {
    schema?: { fields?: Record<string, unknown>; records?: unknown }
    caps?: string[]
  }
  assert.equal(agentStat.schema?.fields && 'id' in agentStat.schema.fields, false)
  assert.equal((agentStat.schema?.fields as { facet?: { type?: string } } | undefined)?.facet?.type, 'facet')
  assert.ok(agentStat.schema?.fields && 'status' in agentStat.schema.fields)
  assert.equal(agentStat.schema?.records, undefined)
  assert.ok(agentStat.caps?.includes('list'))
  const agentList = (await ctx.tools.invoke('db_list', { path: '/notes' })) as {
    schema?: unknown
    columns?: string[]
    rows?: unknown[][]
    items?: unknown
  }
  assert.equal(agentList.schema, undefined)
  assert.equal(agentList.items, undefined)
  assert.ok(agentList.columns?.includes('id'))
  assert.ok(agentList.columns?.includes('title'))
  assert.equal(agentList.columns?.includes('path'), false)
  assert.ok((agentList.rows?.length ?? 0) >= 1)
  const updated = (await ctx.tools.invoke('db_update', { path: '/notes/n1', content: { status: 'done' } })) as {
    ok?: boolean
    path?: string
    value?: unknown
  }
  assert.deepEqual(updated, { ok: true, path: '/notes/n1' })
})


test('db_list on a table broadcasts inspector working then done', async () => {
  const seen: Array<{ type: string; payload: unknown }> = []
  const ctx = new Context()
  await ctx.plugin(tools)
  class HttpStub extends Service {
    constructor(c: Context) {
      super(c, 'http')
    }
    route() {}
    broadcast(type: string, payload: unknown) {
      seen.push({ type, payload })
    }
  }
  new HttpStub(ctx)
  await ctx.plugin({ inject: ['tools', 'http'], apply: applyFileSystem })
  await runWithSession('s1', () => ctx.tools.invoke('db_list', { path: '/views' }))
  const reveals = seen.filter((item) => {
    const payload = item.payload as { reveal?: { collection?: string }; phase?: string }
    return item.type === 'database' && payload?.reveal?.collection === '/views'
  })
  assert.equal((reveals[0]?.payload as { phase?: string; sessionId?: string }).phase, 'working')
  assert.equal((reveals[0]?.payload as { sessionId?: string }).sessionId, 's1')
  assert.equal((reveals.at(-1)?.payload as { phase?: string; sessionId?: string }).phase, 'done')
  assert.equal((reveals.at(-1)?.payload as { sessionId?: string }).sessionId, 's1')
  const before = seen.length
  await ctx.tools.invoke('db_list', { path: '/' })
  const extra = seen.slice(before).filter((item) => {
    const payload = item.payload as { reveal?: unknown }
    return item.type === 'database' && payload?.reveal
  })
  assert.equal(extra.length, 0)
})

test('db_create /views reveals the source table and view', async () => {
  const seen: Array<{ type: string; payload: unknown }> = []
  const ctx = new Context()
  await ctx.plugin(tools)
  class HttpStub extends Service {
    constructor(c: Context) {
      super(c, 'http')
    }
    route() {}
    broadcast(type: string, payload: unknown) {
      seen.push({ type, payload })
    }
  }
  new HttpStub(ctx)
  await ctx.plugin({ inject: ['tools', 'http'], apply: applyFileSystem })
  const db = ctx.get('database') as DatabaseService
  db.register(notesCollection())
  const created = await runWithSession('s1', () =>
    ctx.tools.invoke('db_create', {
      path: '/views',
      records: [{ tablePath: '/notes', title: '看板', mode: 'graph' }],
    }),
  ) as { ids?: string[] }
  const id = created.ids?.[0]
  assert.equal(typeof id, 'string')
  const viewId = String(id).split('::')[1]
  assert.equal(typeof viewId, 'string')
  const done = [...seen].reverse().find((item) => {
    const payload = item.payload as { phase?: string; reveal?: { collection?: string; viewId?: string } }
    return item.type === 'database' && payload?.phase === 'done' && payload.reveal?.collection === '/notes'
  })
  const payload = done?.payload as {
    sessionId?: string
    reveal?: { collection?: string; viewId?: string }
    savedView?: { name?: string; mode?: string }
  }
  assert.equal(payload.sessionId, 's1')
  assert.equal(payload.reveal?.viewId, viewId)
  assert.equal(payload.savedView?.name, '看板')
  assert.equal(payload.savedView?.mode, 'graph')
})

test('register rejects duplicate view route and nav title', async () => {
  const ctx = new Context()
  const db = new DatabaseService(ctx)
  db.register(notesCollection())
  const dupRoute = notesCollection()
  dupRoute.id = 'notes-b'
  dupRoute.path = '/notes-b'
  dupRoute.view = { ...dupRoute.view!, moduleId: 'notes-b' }
  assert.throws(() => db.register(dupRoute), /路由重复/)
  const dupName = notesCollection()
  dupName.id = 'notes-c'
  dupName.path = '/notes-c'
  dupName.view = { moduleId: 'notes-c', route: '/notes-c', title: '笔记2号' }
  assert.throws(() => db.register(dupName), /名称重复/)
})

test('allowMissing actions can run before the record exists', async () => {
  const ctx = new Context()
  const db = new DatabaseService(ctx)
  const rows = new Map<string, { id: string; title: string }>()
  db.register({
    id: 'notes',
    path: '/notes',
    schema: { fields: { ...REQUIRED_RECORD_FIELDS, title: { type: 'string' } } },
    list: () => [...rows.values()],
    get: (id) => rows.get(id) ?? null,
    actions: [
      {
        id: 'seed',
        label: 'seed',
        allowMissing: true,
        run: (id) => {
          rows.set(id, { id, title: 'seeded' })
          return { id }
        },
      },
    ],
  })
  const done = await db.action('/notes/n9', 'seed')
  assert.deepEqual(done.result, { id: 'n9' })
  assert.equal((await db.read('/notes/n9')).kind, 'record')
})

test('registered actions run when when-clause matches', async () => {
  const ctx = new Context()
  const db = new DatabaseService(ctx)
  db.register(notesCollection())
  const stat = await db.stat('/notes')
  assert.equal(stat.kind, 'collection')
  if (stat.kind !== 'collection') return
  assert.equal(stat.schema.actions?.[0]?.id, 'pin')
  assert.equal('run' in (stat.schema.actions?.[0] ?? {}), false)
  const pinned = await db.action('/notes/n1', 'pin')
  assert.equal((pinned.value as unknown as { pinned: boolean }).pinned, true)
  await assert.rejects(() => db.action('/notes/n1', 'pin'), /not available/)
})

test('agent-only actions stay in schema but have empty placement', async () => {
  const ctx = new Context()
  const db = new DatabaseService(ctx)
  db.register({
    ...notesCollection(),
    actions: [
      { id: 'pin', label: '钉住', when: { pinned: false }, run: async () => ({}) },
      { id: 'progress', label: '进度', for: 'agent', run: async () => ({}) },
    ],
  })
  const stat = await db.stat('/notes')
  if (stat.kind !== 'collection') return
  const progress = stat.schema.actions?.find((item) => item.id === 'progress')
  assert.equal(progress?.for, 'agent')
  assert.deepEqual(progress?.placement, [])
  assert.equal(JSON.parse(JSON.stringify(progress)).for, 'agent')
})

test('create and delete follow records caps declared at register', async () => {
  const ctx = new Context()
  const db = new DatabaseService(ctx)
  const rows = new Map<string, { id: string; title: string }>()
  rows.set('n1', { id: 'n1', title: '草稿' })
  db.register({
    id: 'notes',
    path: '/notes',
    schema: { fields: { ...REQUIRED_RECORD_FIELDS, title: { type: 'string', writable: true } } },
    records: { create: true, delete: true },
    list: () => [...rows.values()],
    get: (id) => rows.get(id) ?? null,
    create: (incoming) =>
      incoming.map((fields) => {
        const id = `n${rows.size + 1}`
        const row = { id, title: typeof fields.title === 'string' ? fields.title : '未命名' }
        rows.set(id, row)
        return row
      }),
    remove: (query) => {
      const ids = query.ids ?? []
      for (const id of ids) {
        if (!rows.delete(id)) throw new Error('unknown')
      }
      return ids
    },
  })
  const stat = await db.stat('/notes')
  assert.equal(stat.kind, 'collection')
  if (stat.kind !== 'collection') return
  assert.equal(stat.schema.records?.create, true)
  assert.equal(stat.schema.records?.delete, true)
  assert.equal((stat.caps as string[]).includes('create'), true)
  assert.equal((stat.caps as string[]).includes('delete'), true)
  const created = await db.create('/notes', [{ title: '新笔记' }, { title: '第二篇' }])
  assert.equal(created.items.length, 2)
  assert.equal(created.items[0]?.value.title, '新笔记')
  const listed = await db.list('/notes')
  if (listed.kind !== 'collection') return
  assert.equal(listed.items.length, 3)
  await db.remove('/notes', { ids: [String(created.items[0]?.value.id)] })
  const afterOne = await db.list('/notes')
  if (afterOne.kind !== 'collection') return
  assert.equal(afterOne.items.length, 2)
  await db.remove('/notes', { q: '第二篇' })
  const after = await db.list('/notes')
  if (after.kind !== 'collection') return
  assert.equal(after.items.length, 1)
  await assert.rejects(() => db.remove('/notes', {}), /delete requires/)
})

test('facet catalog is workspace-wide and collect uses sqlite stamps', async () => {
  const ctx = new Context()
  const db = new DatabaseService(ctx)
  db.register(notesCollection())
  const pages = new Map<string, Record<string, unknown>>([['p1', { id: 'p1', title: '首页' }]])
  db.register({
    id: 'pages',
    path: '/pages',
    schema: { fields: { ...REQUIRED_RECORD_FIELDS, title: { type: 'string', writable: true } } },
    records: { update: true },
    list: () => [...pages.values()] as { id: string }[],
    get: (id) => pages.get(id) as { id: string } | undefined,
    update: (id, patch) => {
      const next = { ...pages.get(id), ...patch, id }
      pages.set(id, next)
      return next as { id: string }
    },
  })
  db.facets.replace([{ id: 'dp', label: '动态规划', fields: [] }])
  await db.update('/notes/n1', { facet: { tags: ['dp'], values: {} } })
  await db.update('/pages/p1', { facet: { tags: ['dp'], values: {} } })
  const collected = await db.collectFacet('动态规划')
  assert.equal(collected.facet?.id, 'dp')
  assert.equal(collected.items.length, 2)
  assert.deepEqual(collected.items.map((item) => item.path).sort(), ['/notes/n1', '/pages/p1'])
})

test('listing /facets with tag filter returns stamped records as a table', async () => {
  const ctx = new Context()
  const db = new DatabaseService(ctx)
  db.register(notesCollection())
  db.register(facetsCollection(db.facets, () => [{ id: 'notes', path: '/notes', label: '笔记' }]))
  db.facets.replace([{ id: 'dp', label: '动态规划', fields: [{ key: 'complexity', type: 'string', label: '复杂度' }] }])
  await db.update('/notes/n1', { facet: { tags: ['dp'], values: { dp: { complexity: 'O(n)' } } } })
  const listed = await db.list('/facets', { facetId: 'dp' })
  if (listed.kind !== 'collection') return
  assert.equal(listed.items.length, 1)
  assert.equal(listed.items[0]?.id, 'notes::n1')
  assert.equal(listed.items[0]?.table, '笔记')
  assert.equal(listed.items[0]?.sourceId, 'n1')
  assert.equal(listed.items[0]?.complexity, 'O(n)')
  assert.equal(listed.schema.fields.complexity?.label, '复杂度')
  assert.deepEqual(listed.schema.columns, ['title', 'table', 'complexity'])
})

test('facet list filter asks the collection only for stamped ids', async () => {
  const ctx = new Context()
  const db = new DatabaseService(ctx)
  const rows = new Map<string, Record<string, unknown>>([
    ['a', { id: 'a', title: 'A' }],
    ['b', { id: 'b', title: 'B' }],
  ])
  let listed: string[] | undefined
  db.register({
    id: 'notes',
    path: '/notes',
    schema: { fields: { ...REQUIRED_RECORD_FIELDS, title: { type: 'string', writable: true } } },
    records: { update: true },
    list: (query) => {
      listed = query?.ids
      if (query?.ids) return query.ids.map((id) => rows.get(id)).filter(Boolean) as { id: string }[]
      return [...rows.values()] as { id: string }[]
    },
    get: (id) => rows.get(id) as { id: string } | undefined,
    update: (id, patch) => {
      const next = { ...rows.get(id), ...patch, id }
      rows.set(id, next)
      return next as { id: string }
    },
  })
  const empty = await db.list('/notes', { facet: 'dp' })
  if (empty.kind !== 'collection') return
  assert.equal(empty.items.length, 0)
  assert.equal(listed, undefined)
  db.facets.replace([{ id: 'dp', label: '动态规划', fields: [] }])
  await db.update('/notes/a', { facet: { tags: ['dp'], values: {} } })
  listed = undefined
  const filtered = await db.list('/notes', { facet: 'dp' })
  if (filtered.kind !== 'collection') return
  assert.deepEqual(listed, ['a'])
  assert.equal(filtered.items.length, 1)
  assert.equal(filtered.items[0]?.id, 'a')
})

test('facet schema can be written on tables that cannot update other fields', async () => {
  const ctx = new Context()
  const db = new DatabaseService(ctx)
  const rows = new Map<string, Record<string, unknown>>([['p1', { id: 'p1', title: 'Demo' }]])
  db.register({
    id: 'plugins',
    path: '/plugins',
    label: '插件',
    schema: { fields: { ...REQUIRED_RECORD_FIELDS, title: { type: 'string' } } },
    records: { update: false, delete: true },
    list: () => [...rows.values()] as { id: string }[],
    get: (id) => (rows.get(id) as { id: string } | undefined) ?? null,
    remove: (query) => query.ids ?? [],
  })
  db.facets.replace([{ id: 'dp', label: '动态规划', fields: [{ key: 'complexity', type: 'string', label: '复杂度' }] }])
  await assert.rejects(() => db.update('/plugins/p1', { title: '改名' }), /cannot update/)
  const written = await db.update('/plugins/p1', { facet: { tags: ['dp'], values: { dp: { complexity: 'O(n)' } } } })
  assert.deepEqual((written.value as { facet?: { tags?: string[] } }).facet?.tags, ['dp'])
  const read = await db.read('/plugins/p1')
  if (read.kind !== 'record') return
  assert.equal((read.value.facet as { values?: { dp?: { complexity?: string } } }).values?.dp?.complexity, 'O(n)')
  const listed = await db.list('/plugins')
  if (listed.kind !== 'collection') return
  assert.deepEqual((listed.items[0]?.facet as { tags?: string[] })?.tags, ['dp'])
  const collected = await db.collectFacet('dp')
  assert.equal(collected.items.length, 1)
  assert.equal(collected.items[0]?.path, '/plugins/p1')
  await db.update('/plugins/p1', { emoji: '🔌' })
  const withEmoji = await db.read('/plugins/p1')
  if (withEmoji.kind !== 'record') return
  assert.equal(withEmoji.value.emoji, '🔌')
  assert.deepEqual((withEmoji.value.facet as { tags?: string[] })?.tags, ['dp'])
  await db.update('/plugins/p1', { tags: ['host-ui', 'lab'] })
  const withTags = await db.read('/plugins/p1')
  if (withTags.kind !== 'record') return
  assert.deepEqual(withTags.value.tags, ['host-ui', 'lab'])
  assert.equal(withTags.value.emoji, '🔌')
  await db.update('/plugins/p1', { banner: { kind: 'htmlframe', html: '<script></script>' } })
  const withBanner = await db.read('/plugins/p1')
  if (withBanner.kind !== 'record') return
  assert.deepEqual(withBanner.value.banner, { kind: 'htmlframe', html: '<script></script>' })
  assert.equal(withBanner.value.emoji, '🔌')
})

test('writeContent can persist intro on tables that cannot update other fields', async () => {
  const ctx = new Context()
  const db = new DatabaseService(ctx)
  const rows = new Map<string, Record<string, unknown>>([['p1', { id: 'p1', title: 'Demo', readme: '' }]])
  db.register({
    id: 'plugins',
    path: '/plugins',
    label: '插件',
    schema: {
      contentField: 'readme',
      fields: {
        ...REQUIRED_RECORD_FIELDS,
        title: { type: 'string' },
        readme: { type: 'file', label: '介绍', writable: true },
      },
    },
    records: { update: false, delete: true },
    list: () => [...rows.values()] as { id: string }[],
    get: (id) => (rows.get(id) as { id: string } | undefined) ?? null,
    update: async (id, patch) => {
      const extra = Object.keys(patch).filter((key) => key !== 'readme')
      if (extra.length) throw new Error(`plugin fields not writable: ${extra.join(', ')}`)
      const next = { ...rows.get(id), ...patch, id }
      rows.set(id, next)
      return next as { id: string }
    },
    remove: (query) => query.ids ?? [],
  })
  await assert.rejects(() => db.update('/plugins/p1', { title: '改名' }), /cannot update/)
  const written = await db.writeContent('/plugins/p1', '# Demo\n')
  assert.equal(written.field, 'readme')
  assert.equal(written.value, '# Demo\n')
  const body = await db.content('/plugins/p1')
  assert.equal(body.value, '# Demo\n')
})

test('db_update /facets writes facet field packs', async () => {
  const ctx = new Context()
  const db = new DatabaseService(ctx)
  db.register(facetsCollection(db.facets))
  const created = await db.create('/facets', [{ title: '动态规划' }])
  const id = String(created.items[0]?.value.id)
  const updated = await db.update(`/facets/${id}`, {
    fields: JSON.stringify([{ key: 'complexity', type: 'string', label: '复杂度' }]),
  })
  assert.equal(updated.value.fieldCount, 1)
  assert.equal(db.facets.get(id)?.fields[0]?.key, 'complexity')
  const body = await db.writeContent(`/facets/${id}`, '# 合集说明')
  assert.equal(body.field, 'notes')
  assert.equal(body.value, '# 合集说明')
  const listed = await db.list('/facets')
  if (listed.kind !== 'collection') return
  assert.equal('notes' in listed.items[0]!, false)
  const read = await db.content(`/facets/${id}`)
  assert.equal(read.value, '# 合集说明')
})

test('db_update page facet stores flat property values on the stamp', async () => {
  const ctx = new Context()
  const db = new DatabaseService(ctx)
  const pages = new Map<string, Record<string, unknown>>([['p1', { id: 'p1', title: '爱乐之城' }]])
  db.register({
    id: 'pages',
    path: '/pages',
    schema: { fields: { ...REQUIRED_RECORD_FIELDS, title: { type: 'string', writable: true } } },
    records: { update: true },
    list: () => [...pages.values()] as { id: string }[],
    get: (id) => pages.get(id) as { id: string } | undefined,
    update: (id, patch) => {
      const next = { ...pages.get(id), ...patch, id }
      pages.set(id, next)
      return next as { id: string }
    },
  })
  db.register(facetsCollection(db.facets))
  const created = await db.create('/facets', [{ title: '电影' }])
  const id = String(created.items[0]?.value.id)
  await db.update(`/facets/${id}`, {
    fields: JSON.stringify([
      { key: 'director', type: 'string', label: '导演' },
      { key: 'year', type: 'number', label: '年份' },
      { key: 'score', type: 'number', label: '评分' },
    ]),
  })
  const tagged = await db.update('/pages/p1', {
    facet: { tags: [id], values: { 导演: '查泽雷', 年份: 2016, 评分: 8.6 } },
  })
  assert.deepEqual(tagged.value.facet, {
    tags: [id],
    values: { [id]: { director: '查泽雷', year: 2016, score: 8.6 } },
  })
  assert.equal(db.facets.recordFacet('/pages', 'p1')?.values[id]?.director, '查泽雷')
  const merged = await db.update('/pages/p1', { facet: { values: { 导演: 'Damien Chazelle' } } })
  assert.equal(merged.value.facet.values[id].director, 'Damien Chazelle')
  assert.equal(merged.value.facet.values[id].year, 2016)

  const awards = await db.create('/facets', [{ title: '奖项' }])
  const awardId = String(awards.items[0]?.value.id)
  await db.update(`/facets/${awardId}`, {
    fields: JSON.stringify([{ key: 'oscar', type: 'boolean', label: '奥斯卡' }]),
  })
  const both = await db.update('/pages/p1', {
    facet: {
      tags: [id, awardId],
      values: {
        [id]: { 导演: '查泽雷' },
        [awardId]: { 奥斯卡: true },
      },
    },
  })
  assert.deepEqual(both.value.facet.tags, [id, awardId])
  assert.equal(both.value.facet.values[id].director, '查泽雷')
  assert.equal(both.value.facet.values[id].year, 2016)
  assert.equal(both.value.facet.values[awardId].oscar, true)
  const onlyAward = await db.update('/pages/p1', { facet: { values: { [awardId]: { oscar: false } } } })
  assert.equal(onlyAward.value.facet.values[awardId].oscar, false)
  assert.equal(onlyAward.value.facet.values[id].director, '查泽雷')
})

test('tables without records.create/delete reject create and delete', async () => {
  const ctx = new Context()
  const db = new DatabaseService(ctx)
  db.register(notesCollection())
  const stat = await db.stat('/notes')
  if (stat.kind !== 'collection') return
  assert.equal(stat.schema.records?.create, false)
  assert.equal(stat.schema.records?.delete, false)
  await assert.rejects(() => db.create('/notes'), /cannot create/)
  await assert.rejects(() => db.remove('/notes', { ids: ['n1'] }), /cannot delete/)
  assert.throws(
    () =>
      db.register({
        id: 'broken',
        path: '/broken',
        schema: { fields: { ...REQUIRED_RECORD_FIELDS } },
        records: { create: true },
        list: () => [],
        get: () => null,
      }),
    /必须提供 create/,
  )
})
