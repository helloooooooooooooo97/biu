import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test } from 'vitest'
import assert from 'node:assert/strict'

test('headless dismiss uses radix dismissable layer', () => {
  const dismiss = readFileSync(resolve(import.meta.dirname, './headless-dismiss.tsx'), 'utf8')
  const pop = readFileSync(resolve(import.meta.dirname, './headless-popover.tsx'), 'utf8')
  const menu = readFileSync(resolve(import.meta.dirname, './anchor-menu.tsx'), 'utf8')
  assert.match(dismiss, /@radix-ui\/react-dismissable-layer/)
  assert.match(dismiss, /DismissableLayer/)
  assert.match(pop, /@radix-ui\/react-popover/)
  assert.match(menu, /HeadlessDismiss/)
  assert.match(menu, /zIndex = 200/)
  assert.match(menu, /minWidth = 220/)
  assert.match(menu, /overlayZ/)
  assert.match(menu, /overlayPortalRoot/)
})

test('share overlay portal helper lifts z-index', () => {
  const overlay = readFileSync(resolve(import.meta.dirname, './overlay-portal.ts'), 'utf8')
  assert.match(overlay, /SHARE_OVERLAY_Z = 360/)
  assert.match(overlay, /\.fsdb-share-page/)
  assert.match(overlay, /classList\.contains\('share'\)/)
})
