import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test } from 'vitest'
import assert from 'node:assert/strict'

test('trash glyph uses the Heroicons solid can', () => {
  const src = readFileSync(resolve(import.meta.dirname, './trash-glyph.tsx'), 'utf8')
  assert.match(src, /@heroicons\/react\/24\/solid/)
  assert.match(src, /TrashIcon/)
})
