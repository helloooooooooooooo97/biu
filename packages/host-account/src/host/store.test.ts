import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, test } from 'vitest'
import { openAndMigrateBiu } from '@biu/host-plugin-loader/data-dir'
import { CollabError, CollabStore } from './store.ts'
import { runWithAccount } from '@biu/host-plugin-loader/data-dir'

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

test('owner can add a member by email and a stranger cannot sync', () => {
  const collab = store()
  const ada = collab.register('', Date.now(), 'secret1', 'ada@example.com')
  const bob = collab.register('', Date.now(), 'secret1', 'bob@example.com')
  const cara = collab.register('', Date.now(), 'secret1', 'cara@example.com')
  const workspace = collab.createWorkspace(ada.id, 'Notes')
  collab.addMemberByEmail(ada.id, workspace.id, 'Bob@Example.com')
  assert.equal(collab.listWorkspaces(bob.id)[0]?.role, 'member')
  assert.throws(() => collab.addMemberByEmail(bob.id, workspace.id, 'cara@example.com'), CollabError)
  assert.throws(() => collab.addMemberByEmail(ada.id, workspace.id, 'missing@example.com'), /先注册/)
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
  assert.equal(collab.activeWorkspaceId(), first.workspace.id)
  assert.equal(collab.recordIds(first.workspace.id, '/pages').has('p1'), true)
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

test('login accepts the password set at register and rejects the rest', () => {
  const collab = store()
  const ada = collab.register('', Date.now(), 'secret1', 'Ada@Example.com')
  const signed = collab.login('ada@example.com', 'secret1')
  assert.equal(signed.id, ada.id)
  assert.equal(signed.email, 'ada@example.com')
  assert.equal(signed.token, ada.token)
  const workspaceId = collab.enter(ada.id)
  assert.equal(collab.activeWorkspaceId(), workspaceId)
  assert.equal(collab.listWorkspaces(ada.id)[0]?.name, '我的工作区')
  assert.equal(collab.enter(ada.id), workspaceId)
  const saved = collab.saveWorkspaceProfile(ada.id, { name: '蓝团', avatar: '' })
  assert.equal(saved.name, '蓝团')
  assert.equal(saved.email, 'ada@example.com')
  const bob = collab.register('', Date.now(), 'secret1', 'bob@example.com')
  const bobWorkspace = collab.createWorkspace(bob.id, 'Bob')
  collab.setActive(bob.id, bobWorkspace.id)
  assert.equal(collab.saveWorkspaceProfile(bob.id, { name: '蓝团', avatar: '' }).name, '蓝团')
  collab.setActive(ada.id, workspaceId)
  assert.equal(collab.workspaceProfile(ada.id).name, '蓝团')
  const other = collab.createWorkspace(ada.id, '另一区')
  collab.setActive(ada.id, other.id)
  assert.equal(collab.workspaceProfile(ada.id).name, '')
  collab.setActive(ada.id, workspaceId)
  assert.equal(collab.workspaceProfile(ada.id).name, '蓝团')
  assert.throws(() => collab.login('ada@example.com', 'wrong'), CollabError)
  assert.throws(() => collab.register('', Date.now(), 'secret2', 'ada@example.com'), CollabError)
  assert.throws(() => collab.register('', Date.now(), '123', 'short@example.com'), CollabError)
})

test('logged-in accounts only see records in their own workspace', () => {
  const collab = store()
  const ada = collab.register('', Date.now(), 'secret1', 'ada@example.com')
  const bob = collab.register('', Date.now(), 'secret1', 'bob@example.com')
  const adaWs = collab.enter(ada.id)
  const bobWs = collab.enter(bob.id)
  assert.notEqual(adaWs, bobWs)
  collab.attach(adaWs, '/pages', 'p-ada')
  collab.attach(bobWs, '/sessions', 's-bob')
  const adaView = runWithAccount(ada.id, () => collab.membership())
  const bobView = runWithAccount(bob.id, () => collab.membership())
  assert.equal(adaView.strict, true)
  assert.equal(adaView.mine.has('/pages\tp-ada'), true)
  assert.equal(adaView.mine.has('/sessions\ts-bob'), false)
  assert.equal(bobView.mine.has('/sessions\ts-bob'), true)
  assert.equal(bobView.mine.has('/pages\tp-ada'), false)
  assert.equal(runWithAccount(ada.id, () => collab.activeWorkspaceId()), adaWs)
  assert.equal(runWithAccount(bob.id, () => collab.activeWorkspaceId()), bobWs)
})

test('a private record stays hidden until the owner shares it with a workspace member', () => {
  const collab = store()
  const ada = collab.register('', Date.now(), 'secret1', 'ada@example.com')
  const bob = collab.register('', Date.now(), 'secret1', 'bob@example.com')
  const workspaceId = collab.enter(ada.id)
  collab.addMemberByEmail(ada.id, workspaceId, 'bob@example.com')
  collab.setActive(bob.id, workspaceId)
  runWithAccount(ada.id, () => collab.attach(workspaceId, '/pages', 'secret'))
  assert.equal(runWithAccount(ada.id, () => collab.canReadRecord('/pages', 'secret')), true)
  assert.equal(runWithAccount(bob.id, () => collab.canReadRecord('/pages', 'secret')), false)
  const shared = runWithAccount(ada.id, () => collab.shareWithEmail(ada.id, '/pages', 'secret', 'bob@example.com'))
  assert.equal(shared.people.some((row) => row.email === 'bob@example.com'), true)
  assert.equal(runWithAccount(bob.id, () => collab.canReadRecord('/pages', 'secret')), true)
  assert.throws(() => runWithAccount(bob.id, () => collab.shareWithEmail(bob.id, '/pages', 'other', 'ada@example.com')), CollabError)
})

test('sharing with a registered outsider adds an external member limited to explicit grants', () => {
  const collab = store()
  const ada = collab.register('', Date.now(), 'secret1', 'external-ada@example.com')
  const bob = collab.register('', Date.now(), 'secret1', 'external-bob@example.com')
  const workspaceId = collab.enter(ada.id)
  collab.enter(bob.id)
  runWithAccount(ada.id, () => collab.attach(workspaceId, '/pages', 'private-external'))
  runWithAccount(ada.id, () =>
    collab.shareWithEmail(ada.id, '/pages', 'private-external', bob.email, 'editor'),
  )
  const external = collab.members(ada.id, workspaceId).find((row) => row.id === bob.id)
  assert.equal(external?.member_kind, 'external')
  collab.setActive(bob.id, workspaceId)
  assert.equal(runWithAccount(bob.id, () => collab.canReadRecord('/pages', 'private-external')), true)
})

test('an account can join as an external member through a one-use workspace invite', () => {
  const collab = store()
  const ada = collab.register('', Date.now(), 'secret1', 'invite-ada@example.com')
  const bob = collab.register('', Date.now(), 'secret1', 'invite-bob@example.com')
  const workspaceId = collab.enter(ada.id)
  collab.enter(bob.id)
  const invite = collab.createWorkspaceInvite(ada.id, workspaceId, 'viewer')
  const accepted = collab.acceptWorkspaceInvite(bob.id, invite.token)
  assert.equal(accepted.workspaceId, workspaceId)
  const member = collab.members(ada.id, workspaceId).find((row) => row.id === bob.id)
  assert.equal(member?.role, 'viewer')
  assert.equal(member?.member_kind, 'external')
  assert.throws(() => collab.acceptWorkspaceInvite(bob.id, invite.token), /已过期或已使用/)
})

test('a temporary guest gets an expiring identity scoped to one record', () => {
  const collab = store()
  const now = Date.now()
  const ada = collab.register('', now, 'secret1', 'guest-ada@example.com')
  const workspaceId = collab.enter(ada.id)
  runWithAccount(ada.id, () => {
    collab.attach(workspaceId, '/pages', 'guest-page')
    collab.attach(workspaceId, '/pages', 'other-page', now, {
      ownership: 'workspace',
      accessMode: 'members',
    })
  })
  const invite = runWithAccount(ada.id, () =>
    collab.createGuestInvite(ada.id, '/pages', 'guest-page', 'viewer', 1, now),
  )
  const guest = collab.acceptGuestInvite(invite.token, '小访客', now + 1)
  assert.equal(collab.accountByToken(guest.token)?.name, '小访客')
  const member = collab.members(ada.id, workspaceId).find((row) => row.id === guest.id)
  assert.equal(member?.member_kind, 'guest')
  assert.equal(runWithAccount(guest.id, () => collab.canReadRecord('/pages', 'guest-page')), true)
  assert.equal(runWithAccount(guest.id, () => collab.canReadRecord('/pages', 'other-page')), false)
  assert.throws(() => collab.acceptGuestInvite(invite.token), /已过期或已使用/)
})
