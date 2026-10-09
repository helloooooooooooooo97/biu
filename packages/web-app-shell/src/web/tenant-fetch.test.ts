import assert from 'node:assert/strict'
import { afterEach, test } from 'vitest'
import { clearWorkspaceId, readWorkspaceId, resolveWorkspaceId, writeWorkspaceId } from './tenant-fetch.ts'

afterEach(() => {
  clearWorkspaceId()
  localStorage.clear()
})

test('a logged-in request resolves the active workspace before other calls', async () => {
  let activeCalls = 0
  const fetchImpl = (async (path: string) => {
    activeCalls += 1
    assert.equal(path, '/api/account/active')
    return {
      ok: true,
      json: async () => ({ workspaceId: 'ws_1' }),
    }
  }) as unknown as typeof fetch
  const [left, right] = await Promise.all([
    resolveWorkspaceId(fetchImpl, 'tok'),
    resolveWorkspaceId(fetchImpl, 'tok'),
  ])
  assert.equal(left, 'ws_1')
  assert.equal(right, 'ws_1')
  assert.equal(activeCalls, 1)
  assert.equal(readWorkspaceId(), 'ws_1')
  sessionStorage.removeItem('biu.workspaceId')
  assert.equal(readWorkspaceId(), 'ws_1')
  writeWorkspaceId('ws_2')
  assert.equal(sessionStorage.getItem('biu.workspaceId'), 'ws_2')
})
