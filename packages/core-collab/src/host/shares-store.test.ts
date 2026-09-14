import { test } from 'vitest'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SharesStore } from './shares-store.ts'

test('creating a share again returns the same live token', () => {
  const store = new SharesStore(join(mkdtempSync(join(tmpdir(), 'biu-share-')), 's.sqlite'))
  const first = store.create('p1', 'editor', 'm1')
  const again = store.create('p1', 'editor', 'm1')
  assert.equal(again.token, first.token)
  const locked = store.create('p1', 'viewer', 'm1')
  assert.equal(locked.role, 'viewer')
  assert.notEqual(locked.token, first.token)
  assert.equal(store.getByToken(first.token), undefined)
  assert.equal(store.getByToken(locked.token)?.pageId, 'p1')
  store.revokePage('p1')
  assert.equal(store.isShared('p1'), false)
})
