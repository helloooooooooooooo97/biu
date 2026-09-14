import { test } from 'vitest'
import assert from 'node:assert/strict'
import { parseSharePath } from '../packages/core-file-system/src/share-snapshot.ts'

test('share hrefs skip the full workstation boot', () => {
  assert.equal(Boolean(parseSharePath('/share/abc')), true)
  assert.equal(Boolean(parseSharePath('/share/abc/r/1')), true)
  assert.equal(parseSharePath('/database/pages'), null)
  assert.equal(parseSharePath('/'), null)
})
