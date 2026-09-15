import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test } from 'vitest'
import assert from 'node:assert/strict'

test('make deploy builds then starts without the Vite share proxy', () => {
  const make = readFileSync(resolve(import.meta.dirname, './Makefile'), 'utf8')
  assert.match(make, /^deploy: stop build$/m)
  assert.match(make, /npm start/)
  assert.doesNotMatch(make, /deploy:[\s\S]*npm run dev/)
})
