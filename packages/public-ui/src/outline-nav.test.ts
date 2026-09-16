import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test } from 'vitest'
import assert from 'node:assert/strict'

test('OutlineNav is the shared tick rail and hover panel', () => {
  const src = readFileSync(resolve(import.meta.dirname, './outline-nav.tsx'), 'utf8')
  assert.match(src, /export function OutlineNav/)
  assert.match(src, /chat-outline-tick/)
  assert.match(src, /chat-outline-panel/)
  assert.match(src, /hoverTick/)
  assert.match(src, /hoverRail/)
  assert.match(src, /onMouseMove=\{hoverRail\}/)
  assert.match(src, /hitKeepsOutline/)
  assert.match(src, /pointermove/)
  assert.doesNotMatch(src, /scrollIntoView\(\{ block: 'nearest' \}\)/)
  assert.match(src, /level\?: 1 \| 2 \| 3/)
  assert.match(src, /is-h\$\{item\.level\}/)
  assert.doesNotMatch(src, /requestChatOutlineGo/)
})
