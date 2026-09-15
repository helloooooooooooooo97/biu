import { test } from 'vitest'
import assert from 'node:assert/strict'
import { REQUIRED_RECORD_FIELDS, type CollectionSchema } from '@biu/type-file-system'
import { applyShareQuery, shareQueryFromView, shareQueryStorageKey } from './share-query.ts'

const schema: CollectionSchema = {
  labelField: 'title',
  contentField: 'notes',
  fields: {
    ...REQUIRED_RECORD_FIELDS,
    title: { type: 'string' },
    notes: { type: 'string' },
  },
}

test('share query key is per token', () => {
  assert.equal(shareQueryStorageKey('abc'), 'fsdb.share.query:abc')
})

test('applyShareQuery searches filters and sorts locally', () => {
  const rows = [
    { id: 'a', title: 'Alpha', notes: 'one' },
    { id: 'b', title: 'Beta', notes: 'two' },
    { id: 'c', title: 'Gamma', notes: 'one' },
  ]
  const base = shareQueryFromView({ query: '', sortField: 'title', sortDir: 'asc', filters: {} })
  const filtered = applyShareQuery(rows, schema, {
    ...base,
    q: 'one',
    sorts: [{ id: 's', field: 'title', dir: 'desc' }],
  })
  assert.deepEqual(filtered.map((row) => row.id), ['c', 'a'])
})
