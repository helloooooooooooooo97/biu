import { test } from 'vitest'
import assert from 'node:assert/strict'
import { NoticesStore } from '@biu/core-notices'
import { noticesCollection } from './notices-collection.ts'

test('notices collection exposes an agent blurb and writable read flag', async () => {
  const store = new NoticesStore().open(':memory:')
  store.push({ kind: 'approval', title: '需要审批：bash', sourceKey: 'approval:1' })
  const spec = noticesCollection(store)
  assert.equal(spec.path, '/notices')
  assert.match(String(spec.view?.blurb), /db_list \/notices/)
  assert.doesNotMatch(String(spec.view?.blurb), /回合结束/)
  assert.doesNotMatch(String(spec.view?.blurb), /审批由系统写入/)
  assert.equal(spec.view?.inspector, false)
  const rows = await spec.list()
  assert.equal(rows[0]?.read, false)
  const updated = await spec.update!(String(rows[0]!.id), { read: true })
  assert.equal(updated.read, true)
})
