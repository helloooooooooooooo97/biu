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

test('presence drops a heartbeat older than the stale window', () => {
  const collab = store()
  const ada = collab.register('Ada')
  const workspace = collab.createWorkspace(ada.id, 'Notes')
  collab.pulse(ada.id, workspace.id, '/pages', 'p1', 10_000)
  assert.equal(collab.presence(ada.id, workspace.id, 10_000).length, 1)
  assert.equal(collab.presence(ada.id, workspace.id, 10_000 + 30_001).length, 0)
})
