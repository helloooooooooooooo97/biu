import { test } from 'vitest'
import assert from 'node:assert/strict'
import { normalizeUrl, searchUrl } from '../../../../.plugin-dev/page-browser/url.ts'

test('normalizeUrl keeps http(s) and turns other text into a search', () => {
  assert.equal(normalizeUrl('https://example.com/a'), 'https://example.com/a')
  assert.equal(normalizeUrl('example.com/docs'), 'https://example.com/docs')
  assert.equal(normalizeUrl('localhost:3141'), 'http://localhost:3141')
  assert.equal(normalizeUrl(''), '')
  assert.equal(normalizeUrl('typescript handbook'), searchUrl('typescript handbook'))
  assert.match(searchUrl('foo bar'), /q=foo%20bar/)
})
