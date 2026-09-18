import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test } from 'vitest'
import assert from 'node:assert/strict'

test('make rebuild stops, builds, and starts the host', () => {
  const make = readFileSync(resolve(import.meta.dirname, './Makefile'), 'utf8')
  assert.match(make, /^rebuild: stop build$/m)
  assert.match(make, /rebuild: stop build\n\tnpm start/m)
})

test('make pack runs electron:pack', () => {
  const make = readFileSync(resolve(import.meta.dirname, './Makefile'), 'utf8')
  assert.match(make, /^pack:\n\tnpm run electron:pack/m)
})
