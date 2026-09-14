import { test } from 'vitest'
import assert from 'node:assert/strict'
import { Editor } from '@tiptap/core'
import * as Y from 'yjs'
import { pageEditorExtensions } from './kit.ts'
import { collabCaretUser } from './collab-user.ts'
import { PAGE_EDITOR_STYLE } from './style.ts'

test('unknown identity still gets a caret name', () => {
  assert.equal(collabCaretUser(null).name, '你')
  assert.equal(collabCaretUser({ name: '  ' }).name, '你')
  assert.equal(collabCaretUser({ name: '甲' }).name, '甲')
  assert.notEqual(collabCaretUser({ id: 'a' }).color, collabCaretUser({ id: 'b' }).color)
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
