import { test } from 'vitest'
import assert from 'node:assert/strict'
import { BIU_MARK, formatReadyBanner, hyperlink } from './banner.ts'

test('BIU mark is wide IBM-inspired 8-bar letters B I U', () => {
  const bars = BIU_MARK.split('\n').filter((line) => line.includes('━'))
  assert.equal(bars.length, 8)
  assert.match(BIU_MARK, /━━━━━━━━━━━━━━━       ━━━━━━━━━━━━       ━━━          ━━━/)
  assert.match(BIU_MARK, /━━━━━━━━━━━━━━━       ━━━━━━━━━━━━           ━━━━━━━━━━/)
  assert.doesNotMatch(BIU_MARK, /[█▄]/)
})

test('ready banner prints OSC-8 clickable Local / API / Share links', () => {
  const text = formatReadyBanner({
    ui: 'http://127.0.0.1:3141/',
    api: 'http://127.0.0.1:3141/',
    share: 'http://192.168.1.8:3142/',
  })
  assert.match(text, /━━━━━━━━━━━━━━━       ━━━━━━━━━━━━/)
  assert.match(text, /\x1b\]8;;http:\/\/127\.0\.0\.1:3141\//)
  assert.match(text, /Local/)
  assert.match(text, /Share/)
  assert.equal(hyperlink('http://example.test/', 'ex').includes('http://example.test/'), true)
})
