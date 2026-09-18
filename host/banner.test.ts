import { test } from 'vitest'
import assert from 'node:assert/strict'
import { BIU_MARK, formatReadyBanner, hyperlink } from './banner.ts'

test('BIU mark is three block letters B I U', () => {
  const lines = BIU_MARK.split('\n').map((line) => line.trim()).filter(Boolean)
  assert.ok(lines.length >= 5)
  assert.match(BIU_MARK, /██████    ████    ██    ██/)
  assert.match(BIU_MARK, /██████    ████     ██████/)
})

test('ready banner prints OSC-8 clickable Local / API / Share links', () => {
  const text = formatReadyBanner({
    ui: 'http://127.0.0.1:3141/',
    api: 'http://127.0.0.1:3141/',
    share: 'http://192.168.1.8:3142/',
  })
  assert.match(text, /██████    ████    ██    ██/)
  assert.match(text, /\x1b\]8;;http:\/\/127\.0\.0\.1:3141\//)
  assert.match(text, /Local/)
  assert.match(text, /Share/)
  assert.equal(hyperlink('http://example.test/', 'ex').includes('http://example.test/'), true)
})
