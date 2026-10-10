import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test } from 'vitest'
import assert from 'node:assert/strict'

test('make rebuild stops, builds, and starts the host', () => {
  const make = readFileSync(resolve(import.meta.dirname, './Makefile'), 'utf8')
  assert.match(make, /^rebuild: stop build$/m)
  assert.match(make, /rebuild: stop build\n\tnpm start/m)
})

test('make dev starts the online host and the local host', () => {
  const make = readFileSync(resolve(import.meta.dirname, './Makefile'), 'utf8')
  const pkg = readFileSync(resolve(import.meta.dirname, './package.json'), 'utf8')
  assert.match(make, /3151/)
  assert.match(make, /5174/)
  assert.match(pkg, /dev:desktop:host/)
  assert.match(pkg, /BIU_ONLINE=0/)
  assert.match(pkg, /PORT=3151/)
  assert.match(pkg, /BIU_WEB_PORT=5174/)
})

test('make pack runs electron:pack', () => {
  const make = readFileSync(resolve(import.meta.dirname, './Makefile'), 'utf8')
  assert.match(make, /^pack:\n\tnpm run electron:pack/m)
})
