import { test } from 'vitest'
import assert from 'node:assert/strict'
import { Editor } from '@tiptap/core'
import * as Y from 'yjs'
import { pageEditorExtensions } from './kit.ts'
import { collabCaretUser, loadOrCreateGuest } from './collab-user.ts'
import { PAGE_EDITOR_STYLE } from './style.ts'

test('guest id persists in localStorage and is the caret label', () => {
  localStorage.clear()
  const first = loadOrCreateGuest()
  assert.match(first.id, /^g_[a-f0-9]{12}$/)
  const again = loadOrCreateGuest()
  assert.equal(again.id, first.id)
  assert.equal(collabCaretUser(first).name, first.id)
  localStorage.clear()
  const other = loadOrCreateGuest()
  assert.notEqual(other.id, first.id)
})

test('two editors on one ydoc show each others edits', async () => {
  const ydoc = new Y.Doc()
  const a = new Editor({
    extensions: pageEditorExtensions({ ydoc }),
  })
  const b = new Editor({
    extensions: pageEditorExtensions({ ydoc }),
  })
  a.commands.setContent('甲写的一行', { contentType: 'markdown' })
  await new Promise((resolve) => setTimeout(resolve, 40))
  assert.match(b.getText(), /甲写的一行/)
  b.commands.insertContentAt(b.state.doc.content.size, '乙也写')
  await new Promise((resolve) => setTimeout(resolve, 40))
  assert.match(a.getText(), /乙也写/)
  a.destroy()
  b.destroy()
})

test('remote caret is a line with the label on the right, not a box', () => {
  assert.match(PAGE_EDITOR_STYLE, /collaboration-carets__caret\{[^}]*border-right:0/)
  assert.match(PAGE_EDITOR_STYLE, /collaboration-carets__label\{[^}]*left:6px/)
  assert.match(PAGE_EDITOR_STYLE, /\.page-editor \.tiptap:focus[^}]*outline:none/)
})
