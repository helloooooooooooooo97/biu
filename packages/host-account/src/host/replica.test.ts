import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, test } from 'vitest'
import { Context } from 'cordis'
import { openAndMigrateBiu } from '@biu/host-plugin-loader/data-dir'
import * as http from '@biu/host-http'
import * as account from './index.ts'
import { CollabStore } from './store.ts'
import { httpRemote, RecordReplica, storeRemote } from './replica.ts'

const dirs: string[] = []

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function sqlite() {
  const dir = mkdtempSync(join(tmpdir(), 'biu-replica-'))
  dirs.push(dir)
  return openAndMigrateBiu(join(dir, 'biu.sqlite'))
}

function pair() {
  const remote = new CollabStore(sqlite())
  const localDb = sqlite()
  const replica = new RecordReplica(localDb, storeRemote(remote))
  const ada = remote.register('', Date.now(), 'secret1', 'ada@example.com')
  const bob = remote.register('', Date.now(), 'secret1', 'bob@example.com')
  const cara = remote.register('', Date.now(), 'secret1', 'cara@example.com')
  const workspace = remote.createWorkspace(ada.id, 'Notes')
  remote.addMember(ada.id, workspace.id, bob.id)
  remote.addMember(ada.id, workspace.id, cara.id)
  replica.remember({ accountId: ada.id, workspaceId: workspace.id, token: ada.token })
  return { remote, replica, ada, bob, cara, workspace }
}

function page(workspaceId: string, recordId: string) {
  return { type: 'record' as const, workspaceId, collection: '/pages', recordId }
}

test('desktop push then matches the server version and body', async () => {
  const { remote, replica, ada, workspace } = pair()
  replica.enqueue({
    accountId: ada.id,
    workspaceId: workspace.id,
    collection: '/pages',
    recordId: 'p1',
    field: 'body',
    value: 'local',
  })
  assert.equal(remote.fieldValue(ada.id, workspace.id, '/pages', 'p1', 'body'), null)
  await replica.flush()
  const server = remote.fieldValue(ada.id, workspace.id, '/pages', 'p1', 'body')
  const local = replica.read(workspace.id, '/pages', 'p1', 'body')
  assert.equal(server?.value, 'local')
  assert.equal(local?.value, 'local')
  assert.equal(local?.version, server?.version)
  assert.equal(local?.dirty, false)
})

test('offline edits stay local until flush', async () => {
  const { remote, replica, ada, workspace } = pair()
  replica.enqueue({
    accountId: ada.id,
    workspaceId: workspace.id,
    collection: '/pages',
    recordId: 'p1',
    field: 'body',
    value: 'queued',
  })
  assert.equal(replica.read(workspace.id, '/pages', 'p1', 'body')?.dirty, true)
  assert.equal(remote.fieldValue(ada.id, workspace.id, '/pages', 'p1', 'body'), null)
  await replica.flush()
  assert.equal(remote.fieldValue(ada.id, workspace.id, '/pages', 'p1', 'body')?.value, 'queued')
})

test('server edit is pulled onto the desktop', async () => {
  const { remote, replica, ada, workspace } = pair()
  remote.sync({
    actorId: ada.id,
    workspaceId: workspace.id,
    collection: '/pages',
    recordId: 'p1',
    field: 'body',
    value: 'from-server',
    expectedVersion: 0,
  })
  await replica.pull()
  const local = replica.read(workspace.id, '/pages', 'p1', 'body')
  assert.equal(local?.value, 'from-server')
  assert.equal(local?.version, 1)
})

test('conflicting edits keep both copies', async () => {
  const { remote, replica, ada, workspace } = pair()
  remote.sync({
    actorId: ada.id,
    workspaceId: workspace.id,
    collection: '/pages',
    recordId: 'p1',
    field: 'body',
    value: 'server',
    expectedVersion: 0,
  })
  replica.enqueue({
    accountId: ada.id,
    workspaceId: workspace.id,
    collection: '/pages',
    recordId: 'p1',
    field: 'body',
    value: 'desktop',
  })
  await replica.flush()
  const local = replica.read(workspace.id, '/pages', 'p1', 'body')
  assert.equal(local?.value, 'desktop')
  assert.equal(local?.conflict, 'server')
  assert.equal(remote.fieldValue(ada.id, workspace.id, '/pages', 'p1', 'body')?.value, 'server')
})

test('pull does not cover an unpushed local edit', async () => {
  const { remote, replica, ada, workspace } = pair()
  replica.enqueue({
    accountId: ada.id,
    workspaceId: workspace.id,
    collection: '/pages',
    recordId: 'p1',
    field: 'body',
    value: 'desktop',
  })
  remote.sync({
    actorId: ada.id,
    workspaceId: workspace.id,
    collection: '/pages',
    recordId: 'p2',
    field: 'body',
    value: 'other',
    expectedVersion: 0,
  })
  remote.sync({
    actorId: ada.id,
    workspaceId: workspace.id,
    collection: '/pages',
    recordId: 'p1',
    field: 'title',
    value: 'remote-title',
    expectedVersion: 0,
  })
  await replica.pull()
  assert.equal(replica.read(workspace.id, '/pages', 'p1', 'body')?.value, 'desktop')
  assert.equal(replica.read(workspace.id, '/pages', 'p1', 'title')?.value, 'remote-title')
  assert.equal(replica.read(workspace.id, '/pages', 'p2', 'body')?.value, 'other')
})

test('desktop keeps only records the signed-in accounts can read', async () => {
  const { remote, replica, ada, bob, cara, workspace } = pair()
  remote.authorization.attach(
    { type: 'account', accountId: cara.id, workspaceId: workspace.id },
    page(workspace.id, 'cara-private'),
    { ownership: 'personal', accessMode: 'private' },
  )
  remote.sync({
    actorId: cara.id,
    workspaceId: workspace.id,
    collection: '/pages',
    recordId: 'cara-private',
    field: 'body',
    value: 'secret-cara',
    expectedVersion: 0,
  })
  remote.authorization.attach(
    { type: 'account', accountId: bob.id, workspaceId: workspace.id },
    page(workspace.id, 'shared'),
    { ownership: 'personal', accessMode: 'private' },
  )
  remote.authorization.grant(bob.id, page(workspace.id, 'shared'), 'account', ada.id, 'viewer')
  remote.sync({
    actorId: bob.id,
    workspaceId: workspace.id,
    collection: '/pages',
    recordId: 'shared',
    field: 'body',
    value: 'for-ada',
    expectedVersion: 0,
  })
  await replica.pull()
  assert.equal(replica.read(workspace.id, '/pages', 'cara-private', 'body'), null)
  assert.equal(replica.read(workspace.id, '/pages', 'shared', 'body')?.value, 'for-ada')

  replica.remember({ accountId: bob.id, workspaceId: workspace.id, token: bob.token })
  await replica.pull()
  assert.equal(replica.read(workspace.id, '/pages', 'cara-private', 'body'), null)
  assert.equal(replica.devices().map((item) => item.accountId).sort().join(), [ada.id, bob.id].sort().join())
})

test('secrets and plugin directories are not queued', async () => {
  const { replica, ada, workspace } = pair()
  assert.equal(
    replica.enqueue({
      accountId: ada.id,
      workspaceId: workspace.id,
      collection: '/pages',
      recordId: 'p1',
      field: 'secret',
      value: 'nope',
    }),
    null,
  )
  assert.equal(
    replica.enqueue({
      accountId: ada.id,
      workspaceId: workspace.id,
      collection: '/.plugin',
      recordId: 'page-terminal',
      field: 'body',
      value: 'nope',
    }),
    null,
  )
  assert.equal(replica.read(workspace.id, '/pages', 'p1', 'secret'), null)
})

test('a finished session is queued and a second account is not required', async () => {
  const { replica, ada, workspace } = pair()
  const queued = replica.enqueueFinishedSession({
    accountId: ada.id,
    workspaceId: workspace.id,
    sessionId: 's1',
    text: 'done',
  })
  assert.equal(queued?.value, 'done')
  assert.equal(queued?.dirty, true)
})

test('http sync keeps the desktop and server copies aligned', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'biu-replica-http-'))
  dirs.push(dir)
  const publicDir = join(dir, 'public')
  mkdirSync(publicDir)
  writeFileSync(join(publicDir, 'index.html'), '<html></html>')
  const ctx = new Context()
  const ready = new Promise<number>((resolve) => ctx.on('http/ready', ({ port }) => resolve(port)))
  const httpFiber = await ctx.plugin(http, { port: 0, host: '127.0.0.1', publicDir, sharePort: 0 })
  const accountFiber = await ctx.plugin(account, { sqlitePath: join(dir, 'server.sqlite') })
  const port = await ready
  try {
    const origin = `http://127.0.0.1:${port}`
    const registered = (await fetch(`${origin}/api/account/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'ada@example.com', password: 'secret1' }),
    }).then((res) => res.json())) as { id: string; token: string; workspaceId: string }
    const localDb = sqlite()
    const replica = new RecordReplica(localDb, httpRemote(origin))
    replica.remember({ accountId: registered.id, workspaceId: registered.workspaceId, token: registered.token })
    replica.enqueue({
      accountId: registered.id,
      workspaceId: registered.workspaceId,
      collection: '/pages',
      recordId: 'p1',
      field: 'body',
      value: 'over-http',
    })
    await replica.flush()
    const listed = (await fetch(
      `${origin}/api/account/sync?workspaceId=${registered.workspaceId}&after=0&visible=1`,
      { headers: { authorization: `Bearer ${registered.token}` } },
    ).then((res) => res.json())) as { ops: Array<{ value: unknown; version: number }> }
    await replica.pull()
    const local = replica.read(registered.workspaceId, '/pages', 'p1', 'body')
    assert.equal(listed.ops.at(-1)?.value, 'over-http')
    assert.equal(local?.value, 'over-http')
    assert.equal(local?.version, listed.ops.at(-1)?.version)
  } finally {
    await accountFiber.dispose()
    await httpFiber.dispose()
  }
})
