import { test } from 'vitest'
import assert from 'node:assert/strict'
import { persistPageWidth, getPageWidth, persistPagePrefs, getPagePrefs } from './page-width.ts'

test('page width persists full and max', () => {
  persistPageWidth('max')
  assert.equal(getPageWidth(), 'max')
  persistPageWidth('full')
  assert.equal(getPageWidth(), 'full')
  persistPageWidth('max')
  assert.equal(getPageWidth(), 'max')
})

test('page prefs store reading chrome and body scale', () => {
  persistPagePrefs({
    wide: true,
    outlineExpand: false,
    outlinePin: true,
    navPin: true,
    bodySize: 'lg',
    bodyGap: 'sm',
  })
  assert.deepEqual(getPagePrefs(), {
    wide: true,
    outlineExpand: false,
    outlinePin: true,
    navPin: true,
    bodySize: 'lg',
    bodyGap: 'sm',
  })
  assert.equal(document.documentElement.dataset.outlinePin, '1')
  assert.equal(document.documentElement.dataset.bodySize, 'lg')
  persistPagePrefs({
    wide: false,
    outlineExpand: true,
    outlinePin: false,
    navPin: false,
    bodySize: 'md',
    bodyGap: 'md',
  })
})
