import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test } from 'vitest'
import assert from 'node:assert/strict'

test('fork action uses a fork glyph, not share', () => {
  const thread = readFileSync(resolve(import.meta.dirname, './thread.tsx'), 'utf8')
  const glyph = readFileSync(resolve(import.meta.dirname, './fork-glyph.tsx'), 'utf8')
  assert.match(thread, /ForkGlyph/)
  assert.doesNotMatch(thread, /ShareIcon/)
  assert.match(glyph, /viewBox="0 0 16 16"/)
  assert.match(glyph, /fill="currentColor"/)
})
