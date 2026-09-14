import { test } from 'vitest'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as Y from 'yjs'
import { createCollabServer } from './collab-server.ts'
import { membersCollection } from './members-collection.ts'
import { PresenceStore } from './presence.ts'
import { MembersStore } from './members-store.ts'
import { YjsStore } from './yjs-store.ts'
import { readSession, signSession } from './session.ts'

test('first member is owner; invite joins as editor once', () => {
  const store = new MembersStore(join(mkdtempSync(join(tmpdir(), 'biu-mem-')), 'm.sqlite'))
  const owner = store.bootstrap('甲')
  assert.equal(owner.role, 'owner')
  assert.throws(() => store.bootstrap('乙'))
  const invite = store.createInvite('editor')
  const editor = store.join(invite.token, '乙')
  assert.equal(editor.role, 'editor')
  assert.throws(() => store.join(invite.token, '丙'))
  assert.equal(store.list().length, 2)
})

test('session signature round-trips', () => {
  const token = signSession('secret', 'm_1')
  assert.equal(readSession('secret', token), 'm_1')
  assert.equal(readSession('other', token), '')
})

test('members collection lists created people', () => {
  const store = new MembersStore(join(mkdtempSync(join(tmpdir(), 'biu-mem-')), 'm.sqlite'))
  store.bootstrap('甲')
  store.add('乙', 'editor')
  const spec = membersCollection(store, (role) => ({ url: `http://x/join?role=${role}`, token: 't', role }))
  assert.equal(spec.path, '/members')
  const rows = spec.list() as Array<{ title: string; role: string }>
  assert.equal(rows.length, 2)
  assert.equal(rows[0]?.title, '甲')
  assert.equal(rows[1]?.role, 'editor')
})

test('invite action returns a join url', () => {
  const store = new MembersStore(join(mkdtempSync(join(tmpdir(), 'biu-mem-')), 'm.sqlite'))
  store.bootstrap('甲')
  const spec = membersCollection(store, (role) => {
    const invite = store.createInvite(role)
    return { ...invite, url: `http://x/join?token=${invite.token}` }
  })
  const action = spec.actions?.find((item) => item.id === 'invite')
  assert.ok(action)
  const result = action.run('', { id: '' } as never, { role: 'viewer' }) as { url: string; role: string }
  assert.equal(result.role, 'viewer')
  assert.match(result.url, /\/join\?token=/)
})

test('collab hooks persist yjs and mark viewers read-only', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'biu-col-'))
  const members = new MembersStore(join(dir, 'm.sqlite'))
  const owner = members.bootstrap('甲')
  members.add('乙', 'viewer')
  const viewer = members.list().find((row) => row.role === 'viewer')
  assert.ok(viewer)
  const yjs = new YjsStore(join(dir, 'yjs'))
  const secret = 'secret'
  const hp = createCollabServer(members, yjs, (token) => readSession(secret, token))
  const ownerConn = { readOnly: false }
  await hp.configuration.onAuthenticate?.({
    token: signSession(secret, owner.id),
    documentName: 'page.p1',
    connectionConfig: ownerConn,
  } as never)
  assert.equal(ownerConn.readOnly, false)
  const viewerConn = { readOnly: false }
  await hp.configuration.onAuthenticate?.({
    token: signSession(secret, viewer.id),
    documentName: 'page.p1',
    connectionConfig: viewerConn,
  } as never)
  assert.equal(viewerConn.readOnly, true)
  const doc = new Y.Doc()
  doc.getMap('meta').set('k', 1)
  await hp.configuration.onStoreDocument?.({ documentName: 'page.p1', document: doc } as never)
  const loaded = new Y.Doc()
  await hp.configuration.onLoadDocument?.({ documentName: 'page.p1', document: loaded } as never)
  assert.equal(loaded.getMap('meta').get('k'), 1)
})

test('presence lists distinct guests on one page', () => {
  const room = new PresenceStore()
  assert.equal(room.touch('p1', 'g_aaaaaaaaaaaa').length, 1)
  assert.equal(room.touch('p1', 'g_bbbbbbbbbbbb', undefined, 12).length, 2)
  assert.equal(room.list('p1').find((row) => row.id === 'g_bbbbbbbbbbbb')?.from, 12)
  assert.equal(room.list('p2').length, 0)
})

test('register then login with name and password', () => {
  const store = new MembersStore(join(mkdtempSync(join(tmpdir(), 'biu-mem-')), 'm.sqlite'))
  const owner = store.register('翠云安', 'secret')
  assert.equal(owner.role, 'owner')
  assert.equal(store.login('翠云安', 'secret').id, owner.id)
  assert.throws(() => store.login('翠云安', 'wrong'))
  const editor = store.register('同事', 'pass')
  assert.equal(editor.role, 'editor')
})

test('guest id is reused as an editor member', () => {
  const store = new MembersStore(join(mkdtempSync(join(tmpdir(), 'biu-mem-')), 'm.sqlite'))
  const a = store.ensureGuest('g_aaaaaaaaaaaa')
  assert.equal(a.role, 'owner')
  assert.equal(store.ensureGuest('g_aaaaaaaaaaaa').id, a.id)
  const b = store.ensureGuest('g_bbbbbbbbbbbb')
  assert.equal(b.role, 'editor')
  assert.throws(() => store.ensureGuest('not-a-guest'))
})

test('yjs store round-trips an update', () => {
  const store = new YjsStore(join(mkdtempSync(join(tmpdir(), 'biu-yjs-')), 'yjs'))
  const doc = new Y.Doc()
  doc.getMap('meta').set('title', 'hello')
  store.save('p1', store.encode(doc))
  const next = new Y.Doc()
  store.applyTo(next, 'p1')
  assert.equal(next.getMap('meta').get('title'), 'hello')
})
