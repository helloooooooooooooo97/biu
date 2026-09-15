import { test } from 'vitest'
import assert from 'node:assert/strict'
import { Context } from 'cordis'
import { REQUIRED_RECORD_FIELDS, type CollectionSpec } from '@biu/type-file-system'
import { DatabaseService } from './index.ts'
import { SavedViewsStore, viewsCollection } from './saved-views.ts'
import { SharesStore, dropSharesForRemovedViews } from './shares-store.ts'
import { buildShareSnapshot } from './share-payload.ts'
import { parseSharePath } from '../share-snapshot.ts'
import { builtinAllViewId } from '../catalog-views.ts'

test('share tokens mint unique links and can set a password', () => {
  const store = new SharesStore().open(':memory:')
  const a = store.upsert({ kind: 'view', collection: '/pages', viewId: 'board' })
  const again = store.upsert({ kind: 'view', collection: '/pages', viewId: 'board' })
  assert.equal(a.token, again.token)
  assert.equal(a.hasPassword, false)
  const locked = store.upsert({ kind: 'view', collection: '/pages', viewId: 'board', password: 'secret' })
  assert.equal(locked.token, a.token)
  assert.equal(locked.hasPassword, true)
  assert.equal(locked.sharePlugins, false)
  assert.equal(locked.allowCopy, true)
  assert.equal(store.verifyPassword(a.token, 'secret'), true)
  assert.equal(store.verifyPassword(a.token, 'nope'), false)
})

test('record shares stay isolated from view shares', () => {
  const store = new SharesStore().open(':memory:')
  const view = store.upsert({ kind: 'view', collection: '/pages', viewId: 'all' })
  const rec = store.upsert({ kind: 'record', collection: '/pages', recordId: 'p001' })
  assert.notEqual(view.token, rec.token)
  assert.equal(store.find('record', '/pages', '', 'p001')?.token, rec.token)
  store.revokeTarget('record', '/pages', '', 'p001')
  assert.equal(store.find('record', '/pages', '', 'p001'), null)
  assert.ok(store.get(view.token))
})

test('share flags persist plugin source and copy', () => {
  const store = new SharesStore().open(':memory:')
  const share = store.upsert({ kind: 'record', collection: '/pages', recordId: 'p1', sharePlugins: true, allowCopy: false })
  assert.equal(share.sharePlugins, true)
  assert.equal(share.allowCopy, false)
  const again = store.upsert({ kind: 'record', collection: '/pages', recordId: 'p1' })
  assert.equal(again.sharePlugins, true)
  assert.equal(again.allowCopy, false)
  assert.equal(store.list().length, 1)
})

test('deleting a record revokes its share but keeps other shares', async () => {
  const ctx = new Context()
  const db = new DatabaseService(ctx)
  const rows = new Map([
    ['keep', { id: 'keep', title: '留下' }],
    ['gone', { id: 'gone', title: '删除' }],
  ])
  db.register({
    id: 'notes',
    path: '/notes',
    schema: { fields: { ...REQUIRED_RECORD_FIELDS, title: { type: 'string', writable: true } } },
    records: { delete: true },
    list: () => [...rows.values()],
    get: (id) => rows.get(id) ?? null,
    remove: (query) => {
      const ids = query.ids ?? []
      for (const id of ids) rows.delete(id)
      return ids
    },
  })
  const viewShare = db.shares.upsert({ kind: 'view', collection: '/notes', viewId: 'all' })
  const keepShare = db.shares.upsert({ kind: 'record', collection: '/notes', recordId: 'keep' })
  const goneShare = db.shares.upsert({ kind: 'record', collection: '/notes', recordId: 'gone' })
  await db.remove('/notes', { ids: ['gone'] })
  assert.equal(db.shares.get(goneShare.token), null)
  assert.equal(db.shares.find('record', '/notes', '', 'gone'), null)
  assert.equal(db.shares.get(keepShare.token)?.token, keepShare.token)
  assert.equal(db.shares.get(viewShare.token)?.token, viewShare.token)
})

test('dropping a saved view from replace revokes its share', () => {
  const store = new SharesStore().open(':memory:')
  const keep = store.upsert({ kind: 'view', collection: '/pages', viewId: 'keep' })
  const gone = store.upsert({ kind: 'view', collection: '/pages', viewId: 'gone' })
  dropSharesForRemovedViews(store, '/pages', [{ id: 'keep' }, { id: 'gone' }], [{ id: 'keep' }])
  assert.equal(store.get(gone.token), null)
  assert.equal(store.get(keep.token)?.token, keep.token)
})

test('deleting a saved view revokes that view share', async () => {
  const ctx = new Context()
  const db = new DatabaseService(ctx)
  const views = new SavedViewsStore().open(':memory:')
  db.register(viewsCollection(views, () => [{ id: 'pages', path: '/pages', kind: 'collection' as const, label: '页面', view: null }]))
  const created = views.create({ title: '看板', tablePath: '/pages', mode: 'board' }, [{ id: 'pages', path: '/pages', kind: 'collection', label: '页面', view: null }])
  const viewId = String(created.viewId)
  const share = db.shares.upsert({ kind: 'view', collection: '/pages', viewId })
  await db.remove('/views', { ids: [String(created.id)] })
  assert.equal(db.shares.get(share.token), null)
  assert.equal(db.shares.find('view', '/pages', viewId, ''), null)
})

test('list returns every share', () => {
  const store = new SharesStore().open(':memory:')
  store.upsert({ kind: 'view', collection: '/pages', viewId: 'older' })
  store.upsert({ kind: 'record', collection: '/pages', recordId: 'p1' })
  const keys = store.list().map((item) => item.kind + ':' + (item.viewId || item.recordId)).sort()
  assert.deepEqual(keys, ['record:p1', 'view:older'])
})

test('parseSharePath only accepts /share tokens', () => {
  assert.deepEqual(parseSharePath('/share/abc'), { token: 'abc', recordId: '' })
  assert.deepEqual(parseSharePath('/share/abc/r/p001'), { token: 'abc', recordId: 'p001' })
  assert.equal(parseSharePath('/s/abc'), null)
  assert.equal(parseSharePath('/database/pages'), null)
})

test('record snapshot only includes the shared row', async () => {
  const rows = new Map([
    ['secret', { id: 'secret', title: '机密', notes: 'nope' }],
    ['open', { id: 'open', title: '公开', notes: 'ok' }],
  ])
  const spec: CollectionSpec = {
    id: 'notes',
    path: '/notes',
    label: '笔记',
    schema: {
      labelField: 'title',
      contentField: 'notes',
      fields: { ...REQUIRED_RECORD_FIELDS, title: { type: 'string', writable: true }, notes: { type: 'file', writable: true } },
    },
    records: {},
    list: () => [...rows.values()],
    get: (id) => rows.get(id) ?? null,
  }
  const ctx = new Context()
  const db = new DatabaseService(ctx)
  db.register(spec)
  const views = new SavedViewsStore().open(':memory:')
  const shares = new SharesStore().open(':memory:')
  const share = shares.upsert({ kind: 'record', collection: '/notes', recordId: 'open' })
  const snap = await buildShareSnapshot(db, views, share)
  assert.deepEqual(snap.records.map((row) => row.id), ['open'])
  assert.equal(snap.contents.open, 'ok')
  assert.equal(snap.schema.fields.title?.writable, false)
  assert.equal(snap.allowCopy, true)
  assert.equal(snap.sharePlugins, false)
})

test('snapshot lists page plugins even when source zip is off', async () => {
  const fence = ':::pageBlock {kind=html plugin=page-html-blocks id=ab12}\n<div>x</div>\n:::\n'
  const spec: CollectionSpec = {
    id: 'notes',
    path: '/notes',
    label: '笔记',
    schema: {
      labelField: 'title',
      contentField: 'notes',
      fields: { ...REQUIRED_RECORD_FIELDS, title: { type: 'string', writable: true }, notes: { type: 'file', writable: true } },
    },
    records: {},
    list: () => [{ id: 'open', title: '公开', notes: fence }],
    get: (id) => (id === 'open' ? { id: 'open', title: '公开', notes: fence } : null),
  }
  const ctx = new Context()
  const db = new DatabaseService(ctx)
  db.register(spec)
  const views = new SavedViewsStore().open(':memory:')
  const shares = new SharesStore().open(':memory:')
  const share = shares.upsert({ kind: 'record', collection: '/notes', recordId: 'open' })
  const snap = await buildShareSnapshot(db, views, share)
  assert.equal(snap.sharePlugins, false)
  assert.deepEqual(snap.pluginIds, ['page-html-blocks'])
})

test('session snapshot uses db_content events, not page markdown', async () => {
  const events = [
    { type: 'user/message', text: 'hi', seq: 0, ts: 1, turn: 1, kind: 'user' },
    { type: 'assistant/message', text: 'hello', seq: 1, ts: 2, turn: 1 },
  ]
  const spec: CollectionSpec = {
    id: 'sessions',
    path: '/sessions',
    label: '会话',
    schema: {
      labelField: 'title',
      contentField: 'events',
      fields: {
        ...REQUIRED_RECORD_FIELDS,
        title: { type: 'string', writable: true },
        events: { type: 'file', writable: false },
      },
    },
    records: {},
    list: () => [{ id: 's1', title: '对话' }],
    get: async (id) => (id === 's1' ? { id: 's1', title: '对话', events } : null),
  }
  const ctx = new Context()
  const db = new DatabaseService(ctx)
  db.register(spec)
  const views = new SavedViewsStore().open(':memory:')
  const shares = new SharesStore().open(':memory:')
  const share = shares.upsert({ kind: 'record', collection: '/sessions', recordId: 's1' })
  const snap = await buildShareSnapshot(db, views, share)
  assert.equal(snap.contents.s1, events)
  assert.equal(snap.schema.contentField, 'events')
})

test('builtin view snapshot titles use 全部 plus the collection label', async () => {
  const spec: CollectionSpec = {
    id: 'pages',
    path: '/pages',
    label: '页面',
    view: { title: '页面', route: '/pages' },
    schema: {
      labelField: 'title',
      contentField: 'notes',
      fields: { ...REQUIRED_RECORD_FIELDS, title: { type: 'string', writable: true }, notes: { type: 'file', writable: true } },
    },
    records: {},
    list: () => [{ id: 'p1', title: '首页', notes: '' }],
    get: (id) => (id === 'p1' ? { id: 'p1', title: '首页', notes: '' } : null),
  }
  const ctx = new Context()
  const db = new DatabaseService(ctx)
  db.register(spec)
  const views = new SavedViewsStore().open(':memory:')
  const shares = new SharesStore().open(':memory:')
  const share = shares.upsert({ kind: 'view', collection: '/pages', viewId: builtinAllViewId('/pages') })
  const snap = await buildShareSnapshot(db, views, share)
  assert.equal(snap.title, '全部页面')
  assert.equal(snap.collectionLabel, '页面')
  assert.equal(snap.view?.name, '全部页面')
})
