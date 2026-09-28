import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, test } from 'vitest'
import { openAndMigrateBiu } from '@biu/host-plugin-loader/data-dir'
import { CollabError, CollabStore } from './store.ts'

const dirs: string[] = []

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function store() {
  const dir = mkdtempSync(join(tmpdir(), 'biu-account-'))
  dirs.push(dir)
  const db = openAndMigrateBiu(join(dir, 'biu.sqlite'))
  return new CollabStore(db)
}

test('owner can add a member and a stranger cannot sync', () => {
  const collab = store()
  const ada = collab.register('Ada')
  const bob = collab.register('Bob')
  const cara = collab.register('Cara')
  const workspace = collab.createWorkspace(ada.id, 'Notes')
  collab.addMember(ada.id, workspace.id, bob.id)
  assert.equal(collab.listWorkspaces(bob.id)[0]?.role, 'member')
  assert.throws(() => collab.addMember(bob.id, workspace.id, cara.id), CollabError)
  assert.throws(
    () =>
      collab.sync({
        actorId: cara.id,
        workspaceId: workspace.id,
        collection: '/pages',
        recordId: 'p1',
        field: 'title',
        value: 'nope',
        expectedVersion: 0,
      }),
    /成员/,
  )
})

test('sync bumps version and rejects a stale writer while a lock is held', () => {
  const collab = store()
  const ada = collab.register('Ada')
  const bob = collab.register('Bob')
  const workspace = collab.createWorkspace(ada.id, 'Notes')
  collab.addMember(ada.id, workspace.id, bob.id)
  const claimed = collab.claim(ada.id, workspace.id, '/pages', 'p1')
  assert.equal(claimed.ownerId, ada.id)
  assert.throws(() => collab.claim(bob.id, workspace.id, '/pages', 'p1'), /归属/)

  const first = collab.sync({
    actorId: ada.id,
    workspaceId: workspace.id,
    collection: '/pages',
    recordId: 'p1',
    field: 'title',
    value: 'one',
    expectedVersion: 0,
  })
  assert.equal(first.version, 1)
  assert.throws(
    () =>
      collab.sync({
        actorId: bob.id,
        workspaceId: workspace.id,
        collection: '/pages',
        recordId: 'p1',
        field: 'title',
        value: 'stale',
        expectedVersion: 0,
      }),
    /版本冲突/,
  )

  collab.acquireLock(ada.id, workspace.id, '/pages', 'p1', 60_000, 1_000)
  assert.throws(
    () =>
      collab.sync({
        actorId: bob.id,
        workspaceId: workspace.id,
        collection: '/pages',
        recordId: 'p1',
        field: 'title',
        value: 'locked',
        expectedVersion: 1,
        now: 1_500,
      }),
    /别人编辑/,
  )
  const second = collab.sync({
    actorId: ada.id,
    workspaceId: workspace.id,
    collection: '/pages',
    recordId: 'p1',
    field: 'title',
    value: 'two',
    expectedVersion: 1,
    now: 1_500,
  })
  assert.equal(second.version, 2)
  const ops = collab.opsSince(bob.id, workspace.id, first.id)
  assert.equal(ops.length, 1)
  assert.equal(ops[0]?.value, 'two')
})

test('bootstrap claims live records once and skips trash', () => {
  const collab = store()
  const db = (collab as unknown as { db: import('node:sqlite').DatabaseSync }).db
  db.prepare(`INSERT INTO pages (id, title, created_at, updated_at) VALUES ('p1', 'Home', 1, 1)`).run()
  db.prepare(`INSERT INTO tasks (id, title, created_at, updated_at) VALUES ('t1', 'Do', 1, 1), ('t2', 'Gone', 1, 1)`).run()
  db.prepare(`INSERT INTO sessions (id, version, title, updated_at) VALUES ('s1', 1, 'Chat', 1)`).run()
  db.prepare(
    `INSERT INTO editor_content (collection, record_id, body, updated_at, version) VALUES ('/skills', 'sk1', '#', 1, 1)`,
  ).run()
  db.prepare(
    `INSERT INTO record_meta (collection, record_id, deleted_at) VALUES ('/tasks', 't2', 9), ('/skills', 'old', 9)`,
  ).run()
  const first = collab.bootstrapLocal({ accountName: 'Ada', workspaceName: '本机', now: 20 })
  assert.equal(first.bootstrapped, false)
  assert.equal(first.account.name, 'Ada')
  assert.equal(first.workspace.name, '本机')
  assert.equal(first.imported, 4)
  const heads = (
    db.prepare('SELECT collection, record_id, version FROM record_owners ORDER BY collection, record_id').all() as Array<{
      collection: string
      record_id: string
      version: number
    }>
  ).map((row) => ({ collection: row.collection, record_id: row.record_id, version: row.version }))
  assert.deepEqual(heads, [
    { collection: '/pages', record_id: 'p1', version: 0 },
    { collection: '/sessions', record_id: 's1', version: 0 },
    { collection: '/skills', record_id: 'sk1', version: 0 },
    { collection: '/tasks', record_id: 't1', version: 0 },
  ])
  const again = collab.bootstrapLocal({ accountName: '其他', now: 30 })
  assert.equal(again.bootstrapped, true)
  assert.equal(again.account.id, first.account.id)
  assert.equal(again.imported, 0)
  db.prepare(`INSERT INTO pages (id, title, created_at, updated_at) VALUES ('p2', 'Later', 1, 1)`).run()
  collab.bootstrapLocal()
  const pages = db.prepare(`SELECT record_id FROM record_owners WHERE collection = '/pages' ORDER BY record_id`).all() as Array<{
    record_id: string
  }>
  assert.deepEqual(pages.map((row) => row.record_id), ['p1'])
})

test('an existing workspace is not filled with local records', () => {
  const collab = store()
  const ada = collab.register('Ada')
  collab.createWorkspace(ada.id, '已有')
  const db = (collab as unknown as { db: import('node:sqlite').DatabaseSync }).db
  db.prepare(`INSERT INTO pages (id, title, created_at, updated_at) VALUES ('p1', 'Home', 1, 1)`).run()
  const result = collab.bootstrapLocal({ accountName: '我' })
  assert.equal(result.workspace.name, '已有')
  assert.equal(result.imported, 0)
  const count = db.prepare('SELECT COUNT(*) AS n FROM record_owners').get() as { n: number }
  assert.equal(Number(count.n), 0)
})

test('presence drops a heartbeat older than the stale window', () => {
  const collab = store()
  const ada = collab.register('Ada')
  const workspace = collab.createWorkspace(ada.id, 'Notes')
  collab.pulse(ada.id, workspace.id, '/pages', 'p1', 10_000)
  assert.equal(collab.presence(ada.id, workspace.id, 10_000).length, 1)
  assert.equal(collab.presence(ada.id, workspace.id, 10_000 + 30_001).length, 0)
})
