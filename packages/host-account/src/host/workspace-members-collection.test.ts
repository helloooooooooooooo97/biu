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

  const before = await runWithAccount(ada.id, () => collection.list())
  assert.deepEqual(before.map((row) => row.email), ['ada@example.com', 'bob@example.com'])

  const invite = collection.actions?.find((action) => action.id === 'invite')
  assert.ok(invite)
  await runWithAccount(ada.id, () => invite.run('invite', { id: 'invite' }, { email: cara.email }))
  store.setActive(cara.id, workspace.id)
  assert.deepEqual(
    (await runWithAccount(cara.id, () => collection.list())).map((row) => row.email),
    ['ada@example.com', 'bob@example.com', 'cara@example.com'],
  )

  const promoted = await runWithAccount(ada.id, () => collection.update!(bob.id, { role: 'admin' }))
  assert.equal(promoted.role, 'admin')
  await assert.rejects(
    () => runWithAccount(bob.id, () => collection.update!(cara.id, { role: 'admin' })),
    /只有所有者可以这样做/,
  )

  await runWithAccount(ada.id, () => collection.remove!({ ids: [cara.id] }))
  assert.equal(await runWithAccount(ada.id, () => collection.get(cara.id)), null)
})
