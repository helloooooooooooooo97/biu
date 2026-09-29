import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, test } from 'vitest'
import { openAndMigrateBiu, runWithAccount } from '@biu/host-plugin-loader/data-dir'
import { CollabStore } from './store.ts'
import { workspaceMembersCollection } from './workspace-members-collection.ts'

const dirs: string[] = []

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

test('workspace members collection lists and manages only the active workspace', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'biu-members-collection-'))
  dirs.push(dir)
  const store = new CollabStore(openAndMigrateBiu(join(dir, 'biu.sqlite')))
  const ada = store.register('', Date.now(), 'secret1', 'ada@example.com')
  const bob = store.register('', Date.now(), 'secret1', 'bob@example.com')
  const cara = store.register('', Date.now(), 'secret1', 'cara@example.com')
  const workspace = store.createWorkspace(ada.id, 'Product')
  store.addMemberByEmail(ada.id, workspace.id, bob.email)
  store.setActive(ada.id, workspace.id)
  store.setActive(bob.id, workspace.id)
  const collection = workspaceMembersCollection(store)
  assert.equal(collection.records?.update, true)
  assert.equal(typeof collection.update, 'function')
  assert.deepEqual(collection.schema.fields.role.enumLabels, {
    owner: '所有者',
    admin: '管理者',
    member: '编辑者',
    viewer: '查看者',
  })
  assert.equal(collection.schema.fields.email.writable, undefined)

  const before = await runWithAccount(ada.id, () => collection.list())
  assert.deepEqual(before.map((row) => row.email).sort(), ['ada@example.com', 'bob@example.com'])

  const created = await runWithAccount(ada.id, () => collection.create!([{ email: cara.email }]))
  assert.equal(created[0]?.email, cara.email)
  store.setActive(cara.id, workspace.id)
  assert.deepEqual(
    (await runWithAccount(cara.id, () => collection.list())).map((row) => row.email).sort(),
    ['ada@example.com', 'bob@example.com', 'cara@example.com'],
  )

  const promoted = await runWithAccount(ada.id, () => collection.update!(bob.id, { role: 'admin' }))
  assert.equal(promoted.role, 'admin')
  const viewer = await runWithAccount(ada.id, () => collection.update!(bob.id, { role: 'viewer' }))
  assert.equal(viewer.role, 'viewer')
  await assert.rejects(
    () => runWithAccount(bob.id, () => collection.update!(cara.id, { role: 'admin' })),
    /只有所有者可以这样做/,
  )
  await assert.rejects(
    () => runWithAccount(bob.id, () => collection.remove!({ ids: [cara.id] })),
    /所有者或管理员/,
  )
  assert.notEqual(await runWithAccount(ada.id, () => collection.get(cara.id)), null)
})
