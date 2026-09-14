import { test } from 'vitest'
import assert from 'node:assert/strict'
import { Context } from 'cordis'
import { REQUIRED_RECORD_FIELDS, type CollectionSpec } from '@biu/type-file-system'
import { DatabaseService } from './index.ts'
import { SavedViewsStore } from './saved-views.ts'
import { SharesStore } from './shares-store.ts'
import { buildShareSnapshot } from './share-payload.ts'
import { parseSharePath } from '../share-snapshot.ts'

test('share tokens mint unique links and can set a password', () => {
  const store = new SharesStore().open(':memory:')
  const a = store.upsert({ kind: 'view', collection: '/pages', viewId: 'board' })
  const again = store.upsert({ kind: 'view', collection: '/pages', viewId: 'board' })
  assert.equal(a.token, again.token)
  assert.equal(a.hasPassword, false)
  const locked = store.upsert({ kind: 'view', collection: '/pages', viewId: 'board', password: 'secret' })
  assert.equal(locked.token, a.token)
  assert.equal(locked.hasPassword, true)
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
})
