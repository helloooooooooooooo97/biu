import { test } from 'vitest'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

test('share list table reuses host cell chrome', () => {
  const table = readFileSync(resolve(import.meta.dirname, './share-table.tsx'), 'utf8')
  assert.match(table, /DefaultCell/)
  assert.match(table, /FieldGlyph/)
  assert.match(table, /SchemaChips/)
  assert.match(table, /PersonFace|DefaultCell/)
  assert.match(table, /fsdb-title-host/)
  assert.match(table, /className="fsdb-cell"/)
  assert.match(table, /tasks-th/)
  assert.doesNotMatch(table, /formatField\(schema\.fields/)
})
