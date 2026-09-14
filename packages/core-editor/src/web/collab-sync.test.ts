import { test } from 'vitest'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { Editor } from '@tiptap/core'
import * as Y from 'yjs'
import { pageEditorExtensions } from './kit.ts'
import { collabCaretUser, loadOrCreateGuest } from './collab-user.ts'
import { PAGE_EDITOR_STYLE } from './style.ts'

test('caret label is the display name once', () => {
  assert.equal(collabCaretUser({ id: 'm_1', name: '翠云安', color: '#2563eb' }).name, '翠云安')
  const guest = loadOrCreateGuest()
  assert.equal(collabCaretUser(guest).name, guest.name || guest.id)
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

test('page editor stacks avatars and uses one official caret label', () => {
  const src = readFileSync(resolve(import.meta.dirname, './page-editor.tsx'), 'utf8')
  assert.match(src, /PresenceAvatars/)
  assert.doesNotMatch(src, /PresenceCarets/)
  assert.match(src, /usePagePresence\(record\.id, collab\.guest\)/)
})

test('presence stack styles are circular', () => {
  assert.match(PAGE_EDITOR_STYLE, /page-presence-dot\{[^}]*border-radius:50%/)
  assert.doesNotMatch(PAGE_EDITOR_STYLE, /page-presence-caret/)
})

test('remote caret is a line with the label on the right, not a box', () => {
  assert.match(PAGE_EDITOR_STYLE, /collaboration-carets__caret\{[^}]*border-right:0/)
  assert.match(PAGE_EDITOR_STYLE, /collaboration-carets__label\{[^}]*left:6px/)
  assert.match(PAGE_EDITOR_STYLE, /\.page-editor \.tiptap:focus[^}]*outline:none/)
})
