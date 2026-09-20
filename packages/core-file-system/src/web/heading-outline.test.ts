import { test } from 'vitest'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { blockElBySnippet, headingsFromRoot } from './heading-outline.ts'

test('headingsFromRoot extracts h1–h3 and skips chrome titles', () => {
  const root = document.createElement('div')
  root.innerHTML = `
    <h1 class="fsdb-detail-title">Record title</h1>
    <div class="page-editor">
      <h1>Intro</h1>
      <p>body</p>
      <h2>Section</h2>
      <h3>Detail</h3>
      <h2></h2>
      <h4>ignored</h4>
    </div>
    <h3 class="fsdb-detail-extra-title">Related</h3>
  `
  assert.deepEqual(
    headingsFromRoot(root).map((item) => [item.id, item.text, item.level]),
    [
      ['heading-0', 'Intro', 1],
      ['heading-1', 'Section', 2],
      ['heading-2', 'Detail', 3],
    ],
  )
})

test('headingsFromRoot is read-only so TipTap headings do not trip MutationObserver', () => {
  const root = document.createElement('div')
  root.innerHTML = '<div class="tiptap"><h1>A</h1><h2>B</h2><h3>C</h3></div>'
  let fires = 0
  const mo = new MutationObserver(() => {
    fires += 1
    headingsFromRoot(root)
  })
  mo.observe(root, { subtree: true, childList: true, characterData: true, attributes: true })
  const items = headingsFromRoot(root)
  assert.deepEqual(
    items.map((item) => [item.id, item.text, item.level]),
    [
      ['heading-0', 'A', 1],
      ['heading-1', 'B', 2],
      ['heading-2', 'C', 3],
    ],
  )
  assert.equal(fires, 0)
  mo.disconnect()
})

test('session outline is one tick per user bubble, never reply headings', () => {
  const root = document.createElement('div')
  root.innerHTML = `
    <h1 class="fsdb-detail-title">Session title</h1>
    <div data-testid="session-record-chat">
      <div data-chat-kind="user" data-node-id="u-1">
        <div data-testid="user-bubble">hello from me</div>
        <div>回复栏</div>
      </div>
      <div data-chat-kind="reply"><h2>Section in reply</h2></div>
      <div data-chat-kind="user" data-node-id="u-2">
        <div data-testid="user-bubble">second question</div>
      </div>
    </div>
  `
  assert.deepEqual(
    headingsFromRoot(root).map((item) => [item.id, item.text, item.level]),
    [
      ['u-1', 'hello from me', 2],
      ['u-2', 'second question', 2],
    ],
  )
})

test('page and task outlines still use headings when no session chat', () => {
  const root = document.createElement('div')
  root.innerHTML = `
    <h1 class="fsdb-detail-title">Task</h1>
    <div class="page-editor"><h1>Goal</h1><h2>Step</h2></div>
  `
  assert.deepEqual(
    headingsFromRoot(root).map((item) => [item.id, item.text, item.level]),
    [
      ['heading-0', 'Goal', 1],
      ['heading-1', 'Step', 2],
    ],
  )
})

test('blockElBySnippet prefers the rendered heading like the outline', () => {
  const root = document.createElement('div')
  root.innerHTML = `
    <div class="fsdb-detail-main">
      <h1 class="fsdb-detail-title">Record</h1>
      <div class="page-editor"><div class="tiptap"><h2>改动标题</h2><p>body</p></div></div>
    </div>
  `
  const found = blockElBySnippet(root, '改动标题')
  assert.equal(found?.tagName, 'H2')
  assert.equal(found?.textContent, '改动标题')
})

test('share phone outline is a tap button, not a side rail', () => {
  const src = readFileSync(resolve(import.meta.dirname, './heading-outline.tsx'), 'utf8')
  const css = readFileSync(resolve(import.meta.dirname, './fsdb-style.ts'), 'utf8')
  assert.match(src, /heading-outline-toggle/)
  assert.match(src, /is-sheet/)
  assert.match(src, /useSharePhone/)
  assert.match(src, /chat-outline-panel/)
  assert.match(src, /chat-outline-item/)
  assert.doesNotMatch(src, /fsdb-share-outline-item/)
  assert.doesNotMatch(css, /html\.share \.fsdb-detail-float-nav,html\.share \.heading-outline-host/)
})
