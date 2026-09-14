import { test } from 'vitest'
import assert from 'node:assert/strict'
import { shareTokenFromPath } from './session.ts'

test('share path is only the token segment', () => {
  assert.equal(shareTokenFromPath('/share/abc'), 'abc')
  assert.equal(shareTokenFromPath('/database/pages'), '')
})
