import { test } from 'vitest'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { httpRequest } from '@biu/type-http'
import { runWithSession } from '@biu/host-sessions/scope'
import { MembersStore } from './members-store.ts'
import { SharesStore } from './shares-store.ts'
import { MEMBER_COOKIE, signSession } from './session.ts'
import { createPageOwnership, createPageVisibility } from './page-visibility.ts'

function cookieFor(secret: string, memberId: string) {
  return `${MEMBER_COOKIE}=${signSession(secret, memberId)}`
}

test('owner sees every page; editor sees shared or owned pages; nested agent inherits the person', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'biu-vis-'))
  const members = new MembersStore(join(dir, 'm.sqlite'))
  const owner = members.ensureDefaultAdmin()
  const editor = members.add('同事', 'editor', 'pass')
  const shares = new SharesStore(join(dir, 's.sqlite'))
  const sessions = new Map<string, { config?: { ownerMemberId?: string; parentSessionId?: string } }>()
  const ownership = createPageOwnership(members, 'secret', () => ({
    peek: (id) => sessions.get(id),
    get: async (id) => sessions.get(id),
  }))
  const vis = createPageVisibility(members, shares, ownership)

  assert.equal(await vis.canSeePage('private'), true)

  await httpRequest.run({ cookie: cookieFor('secret', editor.id) }, async () => {
    assert.equal(await vis.canSeePage('private'), false)
    assert.equal(await vis.canSeePage('mine', editor.id), true)
  })

  shares.create('shared', 'editor', owner.id)
  await httpRequest.run({ cookie: cookieFor('secret', editor.id) }, async () => {
    assert.equal(await vis.canSeePage('shared'), true)
  })

  await httpRequest.run({ cookie: cookieFor('secret', owner.id) }, async () => {
    assert.equal(await vis.canSeePage('private'), true)
  })

  sessions.set('parent', { config: { ownerMemberId: editor.id } })
  sessions.set('child', { config: { ownerMemberId: editor.id, parentSessionId: 'parent' } })
  sessions.set('grandchild', { config: { parentSessionId: 'child' } })

  await runWithSession('grandchild', async () => {
    assert.equal(await ownership.resolveOwnerMemberId(), editor.id)
    assert.equal(await vis.canSeePage('mine', editor.id), true)
    assert.equal(await vis.canSeePage('private'), false)
  })
})
