import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, test } from 'vitest'
import { openAndMigrateBiu } from '@biu/host-plugin-loader/data-dir'
import { CollabStore } from './store.ts'
import type { Actor, ResourceRef } from './authorization.ts'

const dirs: string[] = []

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'biu-authz-'))
  dirs.push(dir)
  const store = new CollabStore(openAndMigrateBiu(join(dir, 'biu.sqlite')))
  const ada = store.register('', Date.now(), 'secret1', 'ada@example.com')
  const bob = store.register('', Date.now(), 'secret1', 'bob@example.com')
  const cara = store.register('', Date.now(), 'secret1', 'cara@example.com')
  const workspace = store.createWorkspace(ada.id, 'Product')
  store.addMemberByEmail(ada.id, workspace.id, bob.email)
  store.addMemberByEmail(ada.id, workspace.id, cara.email)
  store.setActive(ada.id, workspace.id)
  store.setActive(bob.id, workspace.id)
  store.setActive(cara.id, workspace.id)
  const actor = (accountId: string): Actor => ({ type: 'account', accountId, workspaceId: workspace.id })
  const page = (recordId: string): Extract<ResourceRef, { type: 'record' }> => ({
    type: 'record',
    workspaceId: workspace.id,
    collection: '/pages',
    recordId,
  })
  return { store, auth: store.authorization, ada, bob, cara, workspace, actor, page }
}

test('private resources require a direct grant and roles gate actions', () => {
  const { auth, ada, bob, actor, page } = setup()
  auth.attach(actor(ada.id), page('private'), { ownership: 'personal', accessMode: 'private' })
  assert.equal(auth.authorize(actor(ada.id), 'resource:update', page('private')).allowed, true)
  assert.equal(auth.authorize(actor(bob.id), 'resource:read', page('private')).allowed, false)

  auth.grant(ada.id, page('private'), 'account', bob.id, 'viewer')
  assert.equal(auth.authorize(actor(bob.id), 'resource:read', page('private')).allowed, true)
  assert.equal(auth.authorize(actor(bob.id), 'resource:update', page('private')).allowed, false)
})

test('workspace member directory is readable by members and managed by owners or admins', () => {
  const { store, auth, ada, bob, workspace, actor } = setup()
  const member = {
    type: 'record' as const,
    workspaceId: workspace.id,
    collection: '/workspace-members',
    recordId: bob.id,
  }
  assert.equal(auth.authorize(actor(bob.id), 'resource:read', member).allowed, true)
  assert.equal(auth.authorize(actor(bob.id), 'resource:update', member).allowed, false)
  assert.equal(auth.authorize(actor(ada.id), 'resource:delete', member).allowed, true)
  store.updateMemberRole(ada.id, workspace.id, bob.id, 'admin')
  assert.equal(auth.authorize(actor(bob.id), 'resource:create', {
    type: 'collection',
    workspaceId: workspace.id,
    collection: '/workspace-members',
  }).allowed, true)
  assert.equal(auth.authorize(actor(bob.id), 'resource:delete', member).allowed, true)
})

test('saved views remain workspace system metadata for all members', () => {
  const { auth, bob, workspace, actor } = setup()
  const view = {
    type: 'record' as const,
    workspaceId: workspace.id,
    collection: '/views',
    recordId: 'sessions::recent',
  }
  assert.equal(auth.authorize(actor(bob.id), 'resource:read', view).allowed, true)
  assert.equal(auth.authorize(actor(bob.id), 'resource:update', view).allowed, true)
  assert.equal(auth.authorize(actor(bob.id), 'resource:delete', view).allowed, true)
})

test('a group grant applies dynamically to its workspace members', () => {
  const { store, auth, ada, bob, actor, page, workspace } = setup()
  auth.attach(actor(ada.id), page('roadmap'), { ownership: 'workspace', accessMode: 'restricted' })
  const product = store.createGroup(ada.id, workspace.id, '产品组')
  store.addGroupMemberByEmail(ada.id, workspace.id, product.id, bob.email)
  auth.grant(ada.id, page('roadmap'), 'group', product.id, 'editor')

  const decision = auth.authorize(actor(bob.id), 'resource:update', page('roadmap'))
  assert.equal(decision.allowed, true)
  if (decision.allowed) assert.equal(decision.source, 'group-grant')
})

test('nested pages inherit, while a restricted child cuts inheritance', () => {
  const { auth, ada, bob, actor, page } = setup()
  auth.attach(actor(ada.id), page('parent'), { ownership: 'personal', accessMode: 'private' })
  auth.grant(ada.id, page('parent'), 'account', bob.id, 'editor')
  auth.attach(actor(ada.id), page('child'), {
    ownership: 'workspace',
    accessMode: 'inherit',
    parentCollection: '/pages',
    parentRecordId: 'parent',
  })
  auth.attach(actor(ada.id), page('secret-child'), {
    ownership: 'workspace',
    accessMode: 'restricted',
    parentCollection: '/pages',
    parentRecordId: 'parent',
  })

  const inherited = auth.authorize(actor(bob.id), 'resource:update', page('child'))
  assert.equal(inherited.allowed, true)
  if (inherited.allowed) assert.equal(inherited.source, 'inherited')
  assert.equal(auth.authorize(actor(bob.id), 'resource:read', page('secret-child')).allowed, false)
})

test('a direct child grant overrides a stronger inherited grant', () => {
  const { auth, ada, bob, actor, page } = setup()
  auth.attach(actor(ada.id), page('parent'), { ownership: 'personal', accessMode: 'private' })
  auth.grant(ada.id, page('parent'), 'account', bob.id, 'editor')
  auth.attach(actor(ada.id), page('child'), {
    accessMode: 'inherit',
    parentCollection: '/pages',
    parentRecordId: 'parent',
  })
  auth.grant(ada.id, page('child'), 'account', bob.id, 'viewer')

  assert.equal(auth.authorize(actor(bob.id), 'resource:read', page('child')).allowed, true)
  assert.equal(auth.authorize(actor(bob.id), 'resource:update', page('child')).allowed, false)
})

test('an agent has exactly the delegating account permissions', () => {
  const { auth, ada, bob, actor, page, workspace } = setup()
  auth.attach(actor(ada.id), page('agent-page'), { accessMode: 'private' })
  auth.grant(ada.id, page('agent-page'), 'account', bob.id, 'editor')
  const agent: Actor = {
    type: 'agent',
    accountId: bob.id,
    delegatedBy: bob.id,
    workspaceId: workspace.id,
    sessionId: 's1',
  }
  assert.equal(auth.authorize(agent, 'resource:update', page('agent-page')).allowed, true)
  assert.equal(auth.authorize(agent, 'resource:manage-permissions', page('agent-page')).allowed, false)
})
