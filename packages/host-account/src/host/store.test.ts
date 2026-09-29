import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, test } from 'vitest'
import { openAndMigrateBiu, runWithAccount, runWithRequestWorkspace } from '@biu/host-plugin-loader/data-dir'
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

test('a record cannot be claimed by two workspaces', () => {
  const collab = store()
  const ada = collab.register('Ada')
  const bob = collab.register('Bob')
  const adaWorkspace = collab.createWorkspace(ada.id, 'A')
  const bobWorkspace = collab.createWorkspace(bob.id, 'B')
  collab.claim(ada.id, adaWorkspace.id, '/pages', 'shared-id')
  assert.throws(() => collab.claim(bob.id, bobWorkspace.id, '/pages', 'shared-id'), /另一个空间/)
  assert.throws(() => collab.attach(bobWorkspace.id, '/pages', 'shared-id'), /另一个空间/)
})

test('online mode denies record reads without an account context', () => {
  const previous = process.env.BIU_ONLINE
  process.env.BIU_ONLINE = '1'
  try {
    const collab = store()
    assert.equal(collab.canReadRecord('/pages', 'hidden'), false)
  } finally {
    if (previous === undefined) delete process.env.BIU_ONLINE
    else process.env.BIU_ONLINE = previous
  }
})

test('a fresh online instance seeds root as super admin and forces a password change', () => {
  const previous = process.env.BIU_ONLINE
  process.env.BIU_ONLINE = '1'
  try {
    const collab = store()
    const root = collab.login('root', '123456')
    assert.equal(root.name, 'root')
    assert.equal(root.mustChangePassword, true)
    assert.equal(collab.hasInstancePermission(root.id, 'instance.roles.manage'), true)
    assert.equal(collab.requiresPasswordChange(root.id), true)
    collab.changePassword(root.id, '123456', 'new-secret', root.token)
    assert.equal(collab.requiresPasswordChange(root.id), false)
    assert.throws(() => collab.login('root', '123456'), /邮箱或密码不对/)
    assert.equal(collab.login('root', 'new-secret').id, root.id)
  } finally {
    if (previous === undefined) delete process.env.BIU_ONLINE
    else process.env.BIU_ONLINE = previous
  }
})

test('owners and managers can rename a workspace but regular members cannot', () => {
  const collab = store()
  const ada = collab.register('Ada')
  const bob = collab.register('Bob')
  const cara = collab.register('Cara')
  const workspace = collab.createWorkspace(ada.id, 'Notes')
  collab.addMember(ada.id, workspace.id, bob.id)
  collab.addMember(ada.id, workspace.id, cara.id)
  collab.updateMemberRole(ada.id, workspace.id, bob.id, 'admin')

  assert.equal(collab.renameWorkspace(ada.id, workspace.id, '团队空间').name, '团队空间')
  assert.equal(collab.renameWorkspace(bob.id, workspace.id, '项目空间').name, '项目空间')
  assert.throws(() => collab.renameWorkspace(cara.id, workspace.id, '不能修改'), /管理员/)
  assert.throws(() => collab.renameWorkspace(ada.id, workspace.id, '  '), /不能为空/)
})

test('instance roles are independent, composable, and keep one super admin', () => {
  const collab = store()
  const ada = collab.register('Ada')
  const bob = collab.register('Bob')
  assert.equal(collab.hasInstancePermission(ada.id, 'instance.roles.manage'), true)
  assert.equal(collab.hasInstancePermission(bob.id, 'instance.roles.manage'), false)

  collab.assignInstanceRole(ada.id, bob.id, 'plugin-developer')
  collab.assignInstanceRole(ada.id, bob.id, 'plugin-reviewer')
  assert.equal(collab.hasInstancePermission(bob.id, 'plugin.drafts.create'), true)
  assert.equal(collab.hasInstancePermission(bob.id, 'plugin.reviews.approve'), true)
  assert.equal(collab.hasInstancePermission(bob.id, 'plugin.packages.install'), false)
  assert.throws(() => collab.removeInstanceRole(ada.id, ada.id, 'super-admin'), /最后一个超级管理员/)

  collab.assignInstanceRole(ada.id, bob.id, 'super-admin')
  collab.removeInstanceRole(ada.id, ada.id, 'super-admin')
  assert.equal(collab.hasInstancePermission(bob.id, 'instance.roles.manage'), true)
})

test('plugin grants are isolated by account and workspace', () => {
  const collab = store()
  const ada = collab.register('Ada')
  const bob = collab.register('Bob')
  const cara = collab.register('Cara')
  const workspaceA = collab.createWorkspace(ada.id, 'A')
  const workspaceB = collab.createWorkspace(bob.id, 'B')
  collab.addMember(ada.id, workspaceA.id, bob.id)
  collab.addMember(ada.id, workspaceA.id, cara.id)
  collab.recordPluginPackage(ada.id, {
    id: 'page-html-blocks',
    version: 'v1',
    packageHash: 'hash',
    packagePath: '/plugin/page-html-blocks',
    sourceKind: 'test',
    trustState: 'approved',
    tenantMode: 'assigned',
    hasWeb: true,
    hasHost: false,
    manifest: {},
  })

  collab.grantPluginAssignment(ada.id, workspaceA.id, 'page-html-blocks', { type: 'account', id: bob.id })
  assert.equal(collab.canAccessPlugin(bob.id, workspaceA.id, 'page-html-blocks'), true)
  assert.equal(collab.canAccessPlugin(cara.id, workspaceA.id, 'page-html-blocks'), false)
  assert.equal(collab.canAccessPlugin(bob.id, workspaceB.id, 'page-html-blocks'), false)

  collab.grantPluginAssignment(cara.id, workspaceA.id, 'page-html-blocks', { type: 'account', id: cara.id })
  assert.equal(collab.canAccessPlugin(cara.id, workspaceA.id, 'page-html-blocks'), true)
  assert.throws(
    () => collab.grantPluginAssignment(cara.id, workspaceA.id, 'page-html-blocks', { type: 'account', id: bob.id }),
    /只能为自己/,
  )
})

test('plugin member-view grants are evaluated dynamically', () => {
  const collab = store()
  const ada = collab.register('Ada')
  const bob = collab.register('Bob')
  const workspace = collab.createWorkspace(ada.id, 'A')
  collab.addMember(ada.id, workspace.id, bob.id)
  collab.recordPluginPackage(ada.id, {
    id: 'page-excalidraw',
    version: 'v1',
    packageHash: 'hash',
    packagePath: '/plugin/page-excalidraw',
    sourceKind: 'test',
    trustState: 'approved',
    tenantMode: 'assigned',
    hasWeb: true,
    hasHost: false,
    manifest: {},
  })
  let included = true
  collab.authorization.setMemberViewMatcher(
    (workspaceId, viewId, accountId) =>
      included && workspaceId === workspace.id && viewId === 'designers' && accountId === bob.id,
  )
  collab.grantPluginAssignment(ada.id, workspace.id, 'page-excalidraw', {
    type: 'member_view',
    id: 'designers',
  })
  assert.equal(collab.canAccessPlugin(bob.id, workspace.id, 'page-excalidraw'), true)
  included = false
  assert.equal(collab.canAccessPlugin(bob.id, workspace.id, 'page-excalidraw'), false)
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
  assert.notEqual(signed.token, ada.token)
  assert.equal(collab.accountByToken(signed.token)?.id, ada.id)
  const workspaceId = collab.enter(ada.id)
  assert.equal(collab.activeWorkspaceId(), workspaceId)
  assert.equal(collab.listWorkspaces(ada.id)[0]?.name, '我的工作区')
  assert.equal(collab.enter(ada.id), workspaceId)
  const saved = collab.saveWorkspaceProfile(ada.id, { name: '蓝团', avatar: '' })
  assert.equal(saved.name, '蓝团')
  assert.equal(saved.email, 'ada@example.com')
  const directoryEntry = collab.members(ada.id, workspaceId).find((row) => row.id === ada.id)
  assert.equal(directoryEntry?.name, 'ada@example.com')
  assert.equal(directoryEntry?.display_name, '蓝团')
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

test('an account can join as a workspace member through a one-use invite link', () => {
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
  assert.equal(member?.member_kind, 'member')
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
  assert.equal(collab.accountByToken(guest.token, invite.expiresAt + 1), null)
  const member = collab.members(ada.id, workspaceId).find((row) => row.id === guest.id)
  assert.equal(member?.member_kind, 'guest')
  assert.equal(runWithAccount(guest.id, () => collab.canReadRecord('/pages', 'guest-page')), true)
  assert.equal(runWithAccount(guest.id, () => collab.canReadRecord('/pages', 'other-page')), false)
  assert.throws(() => collab.acceptGuestInvite(invite.token), /已过期或已使用/)
})

test('login sessions are hashed and can be revoked', () => {
  const collab = store()
  const registered = collab.register('', Date.now(), 'secret1', 'ada@example.com')
  const previous = process.env.BIU_ONLINE
  process.env.BIU_ONLINE = '1'
  assert.equal(collab.accountByToken(registered.token), null)
  if (previous === undefined) delete process.env.BIU_ONLINE
  else process.env.BIU_ONLINE = previous
  const loggedIn = collab.login('ada@example.com', 'secret1')
  assert.equal(collab.accountByToken(loggedIn.token)?.id, loggedIn.id)
  const active = collab.listSessions(loggedIn.id).find((row) => row.revoked_at == null)
  assert.ok(active?.expires_at && active.expires_at > Date.now())
  collab.revokeSession(loggedIn.token)
  assert.equal(collab.accountByToken(loggedIn.token), null)
})

test('mcp credentials stay inside one workspace and die with membership', () => {
  const collab = store()
  const ada = collab.register('', Date.now(), 'secret1', 'ada@example.com')
  const bob = collab.register('', Date.now(), 'secret1', 'bob@example.com')
  const spaceA = collab.createWorkspace(ada.id, 'A')
  const spaceB = collab.createWorkspace(bob.id, 'B')
  collab.addMemberByEmail(ada.id, spaceA.id, 'bob@example.com')
  collab.updateMemberRole(ada.id, spaceA.id, bob.id, 'viewer')
  const adaToken = collab.issueMcpCredential(ada.id, spaceA.id, { allowedTools: ['db_list'] })
  const bobToken = collab.issueMcpCredential(bob.id, spaceA.id)
  const issuedAt = Date.now()
  const shortLived = collab.issueMcpCredential(ada.id, spaceA.id, { expiresAt: issuedAt + 1_000 }, issuedAt)
  assert.equal(collab.resolveMcpCredential(adaToken.token)?.workspaceId, spaceA.id)
  assert.deepEqual(collab.resolveMcpCredential(adaToken.token)?.allowedTools, ['db_list'])
  assert.ok(adaToken.expiresAt > Date.now())
  assert.equal(collab.listMcpCredentials(ada.id, spaceA.id).length, 2)
  collab.auditMcp(collab.resolveMcpCredential(adaToken.token)!, 'db_list', true)
  assert.equal(collab.listMcpAudit(ada.id, spaceA.id)[0]?.tool_name, 'db_list')
  assert.equal(collab.resolveMcpCredential(bobToken.token)?.role, 'viewer')
  assert.equal(collab.resolveMcpCredential(shortLived.token, issuedAt + 1_001), null)
  assert.throws(() => collab.issueMcpCredential(ada.id, spaceB.id), CollabError)
  collab.removeMember(ada.id, spaceA.id, bob.id)
  assert.equal(collab.resolveMcpCredential(bobToken.token), null)
  assert.equal(collab.resolveMcpCredential(adaToken.token)?.accountId, ada.id)
  collab.revokeMcpCredential(ada.id, adaToken.id)
  assert.equal(collab.resolveMcpCredential(adaToken.token), null)
})

test('cross-workspace matrix denies strangers, viewers who write, and revoked sessions', () => {
  const previous = process.env.BIU_ONLINE
  process.env.BIU_ONLINE = '1'
  try {
    const collab = store()
    const now = Date.now()
    const ada = collab.register('', now, 'secret1', 'ada@example.com')
    const bob = collab.register('', now, 'secret1', 'bob@example.com')
    const cara = collab.register('', now, 'secret1', 'cara@example.com')
    const spaceA = collab.createWorkspace(ada.id, 'A')
    const spaceB = collab.createWorkspace(bob.id, 'B')
    collab.addMemberByEmail(ada.id, spaceA.id, 'bob@example.com')
    collab.updateMemberRole(ada.id, spaceA.id, bob.id, 'viewer')
    runWithAccount(ada.id, () =>
      runWithRequestWorkspace(spaceA.id, () => {
        collab.attach(spaceA.id, '/pages', 'shared-page', now, { ownership: 'workspace', accessMode: 'members' })
        collab.attach(spaceA.id, '/sessions', 'session-a', now)
      }),
    )
    assert.deepEqual(collab.tenantForRecord('/sessions', 'session-a'), { workspaceId: spaceA.id, accountId: ada.id })
    const read = (accountId: string, workspaceId: string) =>
      runWithAccount(accountId, () => runWithRequestWorkspace(workspaceId, () => collab.canReadRecord('/pages', 'shared-page')))
    const update = (accountId: string, workspaceId: string) =>
      runWithAccount(accountId, () =>
        runWithRequestWorkspace(workspaceId, () =>
          collab.authorization.authorize(
            { type: 'account', accountId, workspaceId },
            'resource:update',
            { type: 'record', workspaceId, collection: '/pages', recordId: 'shared-page' },
          ).allowed,
        ),
      )
    assert.equal(collab.canReadRecord('/pages', 'shared-page'), false)
    assert.equal(read(ada.id, spaceA.id), true)
    assert.equal(update(ada.id, spaceA.id), true)
    assert.equal(read(bob.id, spaceA.id), true)
    assert.equal(update(bob.id, spaceA.id), false)
    assert.equal(read(bob.id, spaceB.id), false)
    assert.equal(read(cara.id, spaceA.id), false)
    assert.throws(() => collab.claim(bob.id, spaceB.id, '/pages', 'shared-page'), /另一个空间/)
    const first = collab.openSession(ada.id, 'phone')
    const second = collab.openSession(ada.id, 'laptop', now - 1)
    assert.equal(collab.accountByToken(second.token), null)
    collab.changePassword(ada.id, 'secret1', 'secret2', first.token)
    assert.equal(collab.accountByToken(first.token)?.id, ada.id)
    assert.throws(() => collab.login('ada@example.com', 'secret1'), CollabError)
    assert.equal(collab.login('ada@example.com', 'secret2').id, ada.id)
  } finally {
    if (previous === undefined) delete process.env.BIU_ONLINE
    else process.env.BIU_ONLINE = previous
  }
})
