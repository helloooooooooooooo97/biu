import { test } from 'vitest'
import assert from 'node:assert/strict'
import { applyTheme, persistTheme, readTheme, THEME_KEY } from './theme.ts'

test('readTheme defaults to light and remembers dark', () => {
  localStorage.removeItem(THEME_KEY)
  assert.equal(readTheme(), 'light')
  persistTheme('dark')
  assert.equal(readTheme(), 'dark')
  assert.equal(document.documentElement.classList.contains('dark'), true)
  assert.equal(document.documentElement.classList.contains('light'), false)
  applyTheme('light')
  assert.equal(document.documentElement.classList.contains('light'), true)
  assert.equal(document.documentElement.classList.contains('dark'), false)
})
