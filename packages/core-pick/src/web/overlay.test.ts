import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test } from 'vitest'
import assert from 'node:assert/strict'

const overlay = readFileSync(resolve(import.meta.dirname, './overlay.tsx'), 'utf8')

test('pick capture does not eat inspector chrome, chat overlay, or ignored nodes', () => {
  assert.match(overlay, /function ignorePickCapture/)
  assert.doesNotMatch(overlay, /\[data-biu-ignore\], \.app-side-bar/)
  assert.doesNotMatch(overlay, /data-os-dock/)
  assert.match(overlay, /data-biu-ignore/)
  assert.match(overlay, /chat-overlay-panel/)
  assert.doesNotMatch(overlay, /\.app-rail/)
  assert.doesNotMatch(overlay, /\.session-inspector/)
})

test('sidebar list content can start a pick drag; chrome stays ignored', async () => {
  const { ignorePickCapture } = await import('./overlay.tsx')
  const bar = document.createElement('aside')
  bar.className = 'app-side-bar'
  const row = document.createElement('div')
  row.setAttribute('data-biu-kind', 'session')
  row.setAttribute('data-biu-id', 's1')
  const head = document.createElement('div')
  head.className = 'app-side-bar-head'
  head.setAttribute('data-biu-ignore', '')
  bar.append(head, row)
  document.body.append(bar)
  assert.equal(ignorePickCapture(row), false)
  assert.equal(ignorePickCapture(head), true)
  bar.remove()
})

test('close button inside the chat overlay is not captured while picking', async () => {
  const { ignorePickCapture } = await import('./overlay.tsx')
  const panel = document.createElement('div')
  panel.setAttribute('data-testid', 'chat-overlay-panel')
  const close = document.createElement('button')
  close.setAttribute('data-testid', 'chat-overlay-close')
  panel.append(close)
  document.body.append(panel)
  assert.equal(ignorePickCapture(close), true)
  panel.remove()
})

test('Escape exits pick mode', () => {
  assert.match(overlay, /pick.exit\(\)/)
})

test('Escape blurs the focused control so the UA focus ring does not linger', () => {
  assert.match(overlay, /active.blur\(\)/)
})

test('pointerup prefers a text selection over object picks', () => {
  assert.match(overlay, /textPickFromSelection/)
  assert.match(overlay, /inReadable/)
  assert.match(overlay, /\.chat-stage/)
  assert.match(overlay, /\.page-bubble/)
})

test('pointerup in the editor does not treat a node selection as a text pick', () => {
  assert.doesNotMatch(overlay, /locusFromSelection/)
  assert.match(overlay, /resolvePickAtPoint/)
  assert.match(overlay, /started.boxed/)
})

test('pointerup does not attach picks after pick mode has exited', () => {
  assert.match(overlay, /if \(!pick.picking\) return/)
})

test('Command/Ctrl+Q toggles pick mode', () => {
  assert.match(overlay, /event.metaKey \|\| event.ctrlKey/)
  assert.match(overlay, /key === 'q'/)
})

test('marquee inside inspector uses the inspector as the query root', () => {
  assert.match(overlay, /pickSurfaceAtPoint/)
})
