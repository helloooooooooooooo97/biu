import { test } from 'vitest'
import assert from 'node:assert/strict'
import { isShareApiPath, isSharePublicPath } from './share-gate.ts'

test('LAN share listener allows share API and SPA, not the workstation', () => {
  assert.equal(isShareApiPath('/api/share/abc'), true)
  assert.equal(isShareApiPath('/api/db/list'), false)
  assert.equal(isSharePublicPath('/share/abc'), true)
  assert.equal(isSharePublicPath('/share/abc/r/1'), true)
  assert.equal(isSharePublicPath('/assets/index.js'), true)
  assert.equal(isSharePublicPath('/@vite/client'), true)
  assert.equal(isSharePublicPath('/'), false)
  assert.equal(isSharePublicPath('/s/session'), false)
  assert.equal(isSharePublicPath('/api/db/list'), false)
  assert.equal(isSharePublicPath('/ws'), false)
})
