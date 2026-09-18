import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test } from 'vitest'
import assert from 'node:assert/strict'

test('production boot logs UI on the API port unless Vite proxy is set', () => {
  const src = readFileSync(resolve(import.meta.dirname, './index.ts'), 'utf8')
  assert.match(src, /SHARE_PROXY_UI/)
  assert.match(src, /ui \$\{ui\}/)
  assert.doesNotMatch(src, /ui http:\/\/127\.0\.0\.1:5173`/)
})
