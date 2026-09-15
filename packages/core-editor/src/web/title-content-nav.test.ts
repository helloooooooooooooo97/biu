import { test } from 'vitest'
import assert from 'node:assert/strict'
import { Editor } from '@tiptap/core'
import { Selection } from '@tiptap/pm/state'
import { pageEditorExtensions } from './kit.ts'
import {
  FOCUS_RECORD_TITLE,
  focusRecordTitleNear,
  handleContentTitleNav,
  shouldLeaveContentForTitle,
} from './title-content-nav.ts'

const none = { shiftKey: false }

test('empty caret at doc start leaves for title on Backspace/Delete and ArrowUp', () => {
  assert.equal(shouldLeaveContentForTitle('Backspace', none, 1, true, 1), true)
  assert.equal(shouldLeaveContentForTitle('Delete', none, 1, true, 1), true)
  assert.equal(shouldLeaveContentForTitle('ArrowUp', none, 1, true, 1), true)
  assert.equal(shouldLeaveContentForTitle('Enter', none, 1, true, 1), false)
  assert.equal(shouldLeaveContentForTitle('Backspace', { shiftKey: true }, 1, true, 1), false)
  assert.equal(shouldLeaveContentForTitle('Backspace', none, 2, true, 1), false)
  assert.equal(shouldLeaveContentForTitle('Backspace', none, 1, false, 1), false)
  assert.equal(shouldLeaveContentForTitle('Backspace', none, 1, true, 1, true), false)
  assert.equal(shouldLeaveContentForTitle('Delete', none, 1, true, 1, true), false)
  assert.equal(shouldLeaveContentForTitle('ArrowUp', none, 1, true, 1, true), true)
})

function makeEditor(md: string) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const editor = new Editor({
    element: host,
    extensions: pageEditorExtensions(),
    content: md,
    contentType: 'markdown',
    editorProps: {
      handleKeyDown: handleContentTitleNav,
    },
  })
  return { editor, host }
}

function makeEmptyListEditor() {
  const { editor, host } = makeEditor('hello')
  editor.chain().focus().setContent('<ul><li><p></p></li></ul>').run()
  editor.chain().focus().setTextSelection(Selection.atStart(editor.state.doc)).run()
  return { editor, host }
}

function press(editor: Editor, key: string, extra: KeyboardEventInit = {}) {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...extra })
  editor.view.dom.dispatchEvent(event)
  return event
}

function listenTitle() {
  let hits = 0
  const onTitle = () => {
    hits += 1
  }
  window.addEventListener(FOCUS_RECORD_TITLE, onTitle)
  return {
    hits: () => hits,
    stop() {
      window.removeEventListener(FOCUS_RECORD_TITLE, onTitle)
    },
  }
}

test('Backspace at the start of TipTap focuses the title and does not delete the first character', () => {
  const { editor, host } = makeEditor('hello')
  editor.chain().focus().setTextSelection(Selection.atStart(editor.state.doc)).run()
  const title = listenTitle()
  const before = editor.getMarkdown()
  const event = press(editor, 'Backspace')
  title.stop()
  assert.equal(event.defaultPrevented, true)
  assert.equal(title.hits(), 1)
  assert.equal(editor.getMarkdown(), before)
  assert.match(editor.getHTML(), /hello/)
  editor.destroy()
  host.remove()
})

test('Delete at the start of TipTap also focuses the title', () => {
  const { editor, host } = makeEditor('hello')
  editor.chain().focus().setTextSelection(Selection.atStart(editor.state.doc)).run()
  const title = listenTitle()
  const before = editor.getMarkdown()
  press(editor, 'Delete')
  title.stop()
  assert.equal(title.hits(), 1)
  assert.equal(editor.getMarkdown(), before)
  editor.destroy()
  host.remove()
})

test('select-all then Backspace deletes the document instead of jumping to the title', () => {
  const { editor, host } = makeEditor('hello')
  editor.chain().focus().selectAll().run()
  const title = listenTitle()
  press(editor, 'Backspace')
  title.stop()
  assert.equal(title.hits(), 0)
  assert.doesNotMatch(editor.getHTML(), /hello/)
  editor.destroy()
  host.remove()
})

test('Backspace in the middle of a paragraph does not jump to the title', () => {
  const { editor, host } = makeEditor('hello')
  editor.commands.setTextSelection(3)
  const title = listenTitle()
  press(editor, 'Backspace')
  title.stop()
  assert.equal(title.hits(), 0)
  editor.destroy()
  host.remove()
})

test('Enter at the start of TipTap stays in the document', () => {
  const { editor, host } = makeEditor('hello')
  editor.chain().focus().setTextSelection(Selection.atStart(editor.state.doc)).run()
  const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
  assert.equal(handleContentTitleNav(editor.view, event), false)
  editor.destroy()
  host.remove()
})

test('focusRecordTitleNear targets the title above properties in the same detail', () => {
  const decoy = document.createElement('textarea')
  decoy.className = 'fsdb-detail-title-input'
  decoy.value = 'wrong'
  document.body.appendChild(decoy)
  const main = document.createElement('div')
  main.className = 'fsdb-detail-main'
  const title = document.createElement('textarea')
  title.className = 'fsdb-detail-title-input'
  title.value = '页面标题'
  const editorHost = document.createElement('div')
  editorHost.className = 'page-editor'
  main.appendChild(title)
  main.appendChild(editorHost)
  document.body.appendChild(main)
  assert.equal(focusRecordTitleNear(editorHost), true)
  assert.equal(document.activeElement, title)
  assert.equal(title.selectionStart, '页面标题'.length)
  decoy.remove()
  main.remove()
})

test('Delete at doc start focuses the title above properties', () => {
  const main = document.createElement('div')
  main.className = 'fsdb-detail-main'
  const title = document.createElement('textarea')
  title.className = 'fsdb-detail-title-input'
  title.value = '页面标题'
  const host = document.createElement('div')
  main.appendChild(title)
  main.appendChild(host)
  document.body.appendChild(main)
  const editor = new Editor({
    element: host,
    extensions: pageEditorExtensions(),
    content: 'hello',
    contentType: 'markdown',
    editorProps: { handleKeyDown: handleContentTitleNav },
  })
  editor.chain().focus().setTextSelection(Selection.atStart(editor.state.doc)).run()
  press(editor, 'Delete')
  assert.equal(document.activeElement, title)
  assert.equal(title.selectionStart, '页面标题'.length)
  assert.match(editor.getHTML(), /hello/)
  editor.destroy()
  main.remove()
})

test('Backspace at doc start focuses the title above properties', () => {
  const main = document.createElement('div')
  main.className = 'fsdb-detail-main'
  const title = document.createElement('textarea')
  title.className = 'fsdb-detail-title-input'
  title.value = '页面标题'
  const host = document.createElement('div')
  main.appendChild(title)
  main.appendChild(host)
  document.body.appendChild(main)
  const editor = new Editor({
    element: host,
    extensions: pageEditorExtensions(),
    content: 'hello',
    contentType: 'markdown',
    editorProps: { handleKeyDown: handleContentTitleNav },
  })
  editor.chain().focus().setTextSelection(Selection.atStart(editor.state.doc)).run()
  press(editor, 'Backspace')
  assert.equal(document.activeElement, title)
  assert.equal(title.selectionStart, '页面标题'.length)
  assert.match(editor.getHTML(), /hello/)
  editor.destroy()
  main.remove()
})

test('Backspace in an empty list at doc start lifts the list instead of jumping to the title', () => {
  const { editor, host } = makeEmptyListEditor()
  assert.ok(editor.state.selection.$from.depth > 1)
  assert.equal(
    handleContentTitleNav(
      editor.view,
      new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true, cancelable: true }),
    ),
    false,
  )
  const title = listenTitle()
  press(editor, 'Backspace')
  title.stop()
  assert.equal(title.hits(), 0)
  editor.destroy()
  host.remove()
})

test('ArrowUp in an empty list at doc start still focuses the title', () => {
  const { editor, host } = makeEmptyListEditor()
  const title = listenTitle()
  const event = press(editor, 'ArrowUp')
  title.stop()
  assert.equal(event.defaultPrevented, true)
  assert.equal(title.hits(), 1)
  editor.destroy()
  host.remove()
})
