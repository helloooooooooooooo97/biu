import { test } from 'vitest'
import assert from 'node:assert/strict'
import { clipFilterToCatalog } from './collection.ts'

test('clipFilterToCatalog only keeps listed tools and glob patterns', () => {
  const names = new Set(['read_file', 'write_file'])
  assert.deepEqual(clipFilterToCatalog(['read_file', 'hack', 'read_*'], names), ['read_file', 'read_*'])
  assert.deepEqual(clipFilterToCatalog(['made_up'], new Set()), ['made_up'])
})
