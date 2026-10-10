import assert from 'node:assert/strict'
import { afterEach, test } from 'vitest'
import { clearWorkspaceId, readWorkspaceId, writeWorkspaceId } from './tenant-fetch.ts'

afterEach(() => {
  clearWorkspaceId()
  localStorage.clear()
})

test('the workspace from login is reused after this tab storage is cleared', () => {
  writeWorkspaceId('ws_1')
  sessionStorage.removeItem('biu.workspaceId')
  assert.equal(readWorkspaceId(), 'ws_1')
  clearWorkspaceId()
  assert.equal(readWorkspaceId(), '')
})
